"""
SafeWalk routing: OSRM for geometry, Overpass for OSM context, heuristic safety scoring.
"""
from __future__ import annotations

import concurrent.futures
import datetime
import math
from typing import Any

import httpx

from reports_store import load_reports

OSRM_FOOT = "https://routing.openstreetmap.de/routed-foot/route/v1/foot"
OVERPASS = "https://overpass-api.de/api/interpreter"
NOMINATIM = "https://nominatim.openstreetmap.org"


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def offset_point(lat: float, lon: float, bearing_deg: float, dist_m: float) -> tuple[float, float]:
    """Return a point dist_m away from (lat, lon) at bearing_deg (degrees from north)."""
    R = 6371000.0
    b = math.radians(bearing_deg)
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    lat2 = math.asin(
        math.sin(lat_r) * math.cos(dist_m / R)
        + math.cos(lat_r) * math.sin(dist_m / R) * math.cos(b)
    )
    lon2 = lon_r + math.atan2(
        math.sin(b) * math.sin(dist_m / R) * math.cos(lat_r),
        math.cos(dist_m / R) - math.sin(lat_r) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


def bbox_pad(lat1: float, lon1: float, lat2: float, lon2: float, pad: float = 0.012) -> tuple[float, float, float, float]:
    south = min(lat1, lat2) - pad
    north = max(lat1, lat2) + pad
    west = min(lon1, lon2) - pad
    east = max(lon1, lon2) + pad
    return south, west, north, east


def _instruction_from_step(step: dict[str, Any]) -> str:
    m = step.get("maneuver") or {}
    typ = (m.get("type") or "").lower()
    mod = (m.get("modifier") or "").replace("_", " ").strip()
    name = (step.get("name") or "").strip()
    ref = (step.get("ref") or "").strip()

    def street() -> str:
        if name and ref:
            return f"{name} ({ref})"
        return name or "this segment"

    if typ == "depart":
        hint = mod if mod and mod != "straight" else ""
        base = f"Head {hint}".strip() if hint else "Start walking"
        return f"{base} on {street()}" if name else base
    if typ == "arrive":
        return "Arrive at destination"
    if typ in ("roundabout", "rotary"):
        return "Enter the roundabout" + (f", then exit toward {street()}" if name else "")
    if typ == "roundabout turn":
        turn = mod.title() if mod else "Continue"
        return f"At the roundabout, {turn.lower()}" + (f" onto {street()}" if name else "")
    if typ == "end of road":
        turn = mod.title() if mod else "Turn"
        return f"At end of road, {turn.lower()}" + (f" onto {street()}" if name else "")
    if typ == "new name":
        return f"Continue onto {street()}" if name else "Continue"
    if typ in ("continue", "notification"):
        return f"Continue on {street()}" if name else "Continue"
    if typ == "turn":
        turn = mod.title() if mod else "Turn"
        return f"{turn} onto {street()}" if name else turn

    lead = mod.title() if mod else "Continue"
    return f"{lead} onto {street()}" if name else lead


def _parse_osrm_steps(route: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for leg in route.get("legs") or []:
        for step in leg.get("steps") or []:
            m = step.get("maneuver") or {}
            loc = m.get("location")
            lat = lon = None
            if isinstance(loc, list) and len(loc) >= 2:
                lon, lat = float(loc[0]), float(loc[1])
            dist = float(step.get("distance", 0))
            dur = float(step.get("duration", 0))
            out.append(
                {
                    "instruction": _instruction_from_step(step),
                    "distance_m": round(dist, 1),
                    "duration_s": round(dur, 1),
                    "street": (step.get("name") or "").strip(),
                    "lat": lat,
                    "lon": lon,
                }
            )
    return out


def _decode_polyline_to_lonlat(geometry: dict | None) -> list[list[float]]:
    """OSRM returns GeoJSON coordinates [lon, lat]."""
    if not geometry or geometry.get("type") != "LineString":
        return []
    coords = geometry.get("coordinates") or []
    return [[float(c[0]), float(c[1])] for c in coords]


def fetch_osrm_route(
    coords_lonlat: list[tuple[float, float]],
    alternatives: bool = False,
    include_steps: bool = False,
) -> list[dict[str, Any]]:
    """
    coords_lonlat: sequence of (lon, lat) waypoints.
    """
    if len(coords_lonlat) < 2:
        return []
    coord_str = ";".join(f"{lon},{lat}" for lon, lat in coords_lonlat)
    params = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "true" if include_steps else "false",
    }
    if alternatives:
        params["alternatives"] = "true"

    url = f"{OSRM_FOOT}/{coord_str}"
    with httpx.Client(timeout=45.0, headers={"User-Agent": "SafeWalk/1.0 (hackathon demo)"}) as client:
        r = client.get(url, params=params)
        if alternatives and r.status_code != 200:
            params.pop("alternatives", None)
            r = client.get(url, params=params)
        r.raise_for_status()
        data = r.json()

    routes_out: list[dict[str, Any]] = []
    if data.get("code") != "Ok":
        return routes_out

    routes = data.get("routes") or []
    for rt in routes:
        geom = rt.get("geometry")
        entry: dict[str, Any] = {
            "geometry": _decode_polyline_to_lonlat(geom),
            "duration_s": float(rt.get("duration", 0)),
            "distance_m": float(rt.get("distance", 0)),
        }
        if include_steps:
            entry["steps"] = _parse_osrm_steps(rt)
        routes_out.append(entry)
    return routes_out


def sample_points_along_line(coords: list[list[float]], max_points: int = 40) -> list[tuple[float, float]]:
    if not coords:
        return []
    if len(coords) <= max_points:
        return [(c[1], c[0]) for c in coords]  # lat, lon
    step = max(1, len(coords) // max_points)
    return [(coords[i][1], coords[i][0]) for i in range(0, len(coords), step)]


def overpass_context(south: float, west: float, north: float, east: float) -> dict[str, Any]:
    """
    Pull OSM features relevant to natural surveillance & route character.
    """
    query = f"""
    [out:json][timeout:45];
    (
      node["amenity"~"^(cafe|restaurant|fast_food|bar|pub|pharmacy|fuel|bank)$"]({south},{west},{north},{east});
      node["shop"]({south},{west},{north},{east});
      way["lit"="yes"]({south},{west},{north},{east});
      way["lit"="automatic"]({south},{west},{north},{east});
      way["highway"="service"]({south},{west},{north},{east});
      way["highway"="footway"]({south},{west},{north},{east});
      way["highway"="path"]({south},{west},{north},{east});
      way["highway"="steps"]({south},{west},{north},{east});
      way["highway"~"^(primary|secondary|tertiary|residential)$"]({south},{west},{north},{east});
    );
    out center tags;
    """
    with httpx.Client(timeout=60.0, headers={"User-Agent": "SafeWalk/1.0 (hackathon demo)"}) as client:
        r = client.post(OVERPASS, content=query.encode("utf-8"))
        r.raise_for_status()
        data = r.json()

    elements = data.get("elements") or []
    amenities: list[tuple[float, float]] = []
    lit_way_centers: list[tuple[float, float]] = []
    lit_ways = 0
    alley_like = 0
    major_ways = 0

    for el in elements:
        tags = el.get("tags") or {}
        hw = tags.get("highway")
        amenity = tags.get("amenity")
        shop = tags.get("shop")

        lat = el.get("lat")
        lon = el.get("lon")
        if lat is None and el.get("center"):
            lat = el["center"]["lat"]
            lon = el["center"]["lon"]

        if lat is not None and lon is not None:
            if amenity or shop:
                amenities.append((float(lat), float(lon)))

        if hw:
            lit = tags.get("lit")
            if lit in ("yes", "automatic"):
                lit_ways += 1
                if lat is not None and lon is not None:
                    lit_way_centers.append((float(lat), float(lon)))
            if hw == "service":
                alley_like += 1
            if hw in ("primary", "secondary", "tertiary", "residential"):
                major_ways += 1
            if hw in ("footway", "path", "steps"):
                alley_like += 1

    return {
        "amenities": amenities,
        "lit_way_centers": lit_way_centers,
        "lit_ways_count": lit_ways,
        "alley_like_count": max(1, alley_like),
        "major_ways_count": max(1, major_ways),
    }


def geom_signature(geom: list[list[float]]) -> str:
    if len(geom) < 2:
        return ""
    n = len(geom)
    idxs = [int(i * (n - 1) / 6) for i in range(7)]
    parts: list[str] = []
    for i in idxs:
        lon, lat = geom[i]
        parts.append(f"{round(lon, 4)},{round(lat, 4)}")
    return "|".join(parts)


def finalize_safety_scores(
    scored: list[tuple[Any, dict[str, Any], Any]],
) -> None:
    pass  # score already set by score_route_against_context


def time_of_day_amenity_weight(hour: int) -> float:
    if 6 <= hour < 21:
        return 1.0
    elif 21 <= hour < 24:
        return 0.6
    else:
        return 0.15


def score_route_against_context(
    coords_lonlat: list[list[float]],
    ctx: dict[str, Any],
) -> dict[str, Any]:
    amenities = list(ctx.get("amenities") or [])
    if len(amenities) > 2000:
        amenities = amenities[:: max(1, len(amenities) // 2000)]
    lit_centers = list(ctx.get("lit_way_centers") or [])
    if len(lit_centers) > 1500:
        lit_centers = lit_centers[:: max(1, len(lit_centers) // 1500)]

    sample = sample_points_along_line(coords_lonlat)
    n = max(len(sample), 1)

    business_dists: list[float] = []
    lit_dists: list[float] = []

    for plat, plon in sample:
        b = min((haversine_m(plat, plon, a, b) for a, b in amenities), default=600.0)
        l = min((haversine_m(plat, plon, a, b) for a, b in lit_centers), default=600.0)
        business_dists.append(b)
        lit_dists.append(l)

    # --- Component 1: Business coverage (0-30 pts, time-scaled) ---
    # % of route within 80 m of an open business, tight enough to distinguish streets
    BUSI_CLOSE = 80.0
    business_hits = sum(1 for d in business_dists if d <= BUSI_CLOSE)
    business_coverage = business_hits / n

    # --- Component 2: Lit road coverage (0-45 pts, the main differentiator) ---
    # % of route within 100 m of a lit=yes road center.
    # Routes steered toward lit streets score much higher; dark alleys bottom out.
    LIT_CLOSE = 100.0
    lit_hits = sum(1 for d in lit_dists if d <= LIT_CLOSE)
    lit_coverage = lit_hits / n

    # --- Component 3: Isolation penalty (0-25 pts deducted) ---
    # A point is "dark & isolated" if no business within 150 m AND no lit road within 150 m.
    ISO_THRESH = 150.0
    isolated = sum(
        1 for b, l in zip(business_dists, lit_dists)
        if b > ISO_THRESH and l > ISO_THRESH
    )
    isolation_frac = isolated / n

    mean_nearest_biz = sum(business_dists) / n

    hour = datetime.datetime.now().hour
    time_weight = time_of_day_amenity_weight(hour)

    # Business coverage matters less at night (shops closed), scale by time_weight.
    # Lit coverage matters 24/7, streets are either lit or they're not.
    business_pts = 30.0 * business_coverage * time_weight
    lit_pts = 45.0 * lit_coverage
    isolation_penalty = 25.0 * isolation_frac

    # Base 20 pts for any walkable route
    raw = 20.0 + business_pts + lit_pts - isolation_penalty

    # Crowdsourced report penalties
    reports = list(ctx.get("reports") or [])
    if reports and sample:
        pen = 0.0
        for plat, plon in sample:
            for rep in reports:
                dist_m = haversine_m(plat, plon, rep["lat"], rep["lon"])
                if dist_m < 150.0:
                    kw = {"streetlight": 1.8, "harassment": 1.6, "construction": 1.2}.get(rep.get("kind", "other"), 1.0)
                    pen += kw * 12.0 * math.exp(-dist_m / 50.0)
        raw -= pen / max(1, len(sample))

    return {
        "score": max(1.0, min(100.0, round(raw, 1))),
        "active_business_proximity_hits": business_hits,
        "mean_nearest_amenity_m": round(mean_nearest_biz, 1),
        "lit_coverage_pct": round(lit_coverage * 100, 1),
        "isolation_pct": round(isolation_frac * 100, 1),
        "sample_points": n,
        "length_km": round(route_length_km(coords_lonlat), 2),
        "lit_osm_hint": ctx.get("lit_ways_count", 0),
    }


def route_length_km(coords_lonlat: list[list[float]]) -> float:
    if len(coords_lonlat) < 2:
        return 0.0
    total = 0.0
    for i in range(len(coords_lonlat) - 1):
        lo1, la1 = coords_lonlat[i]
        lo2, la2 = coords_lonlat[i + 1]
        total += haversine_m(la1, lo1, la2, lo2)
    return total / 1000.0


def find_candidate_via_points(lat1: float, lon1: float, lat2: float, lon2: float, ctx: dict[str, Any]) -> list[tuple[float, float]]:
    """
    Find via-points PERPENDICULAR to the A->B corridor so OSRM is forced to detour
    left or right of the direct path, producing genuinely different routes.
    """
    # Compute bearing A->B
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon)
    bearing = (math.degrees(math.atan2(y, x)) + 360) % 360

    mid_lat = (lat1 + lat2) / 2
    mid_lon = (lon1 + lon2) / 2

    # Quarter-point and three-quarter-point along the corridor
    q1_lat = lat1 + 0.25 * (lat2 - lat1)
    q1_lon = lon1 + 0.25 * (lon2 - lon1)
    q3_lat = lat1 + 0.75 * (lat2 - lat1)
    q3_lon = lon1 + 0.75 * (lon2 - lon1)

    straight_m = haversine_m(lat1, lon1, lat2, lon2)
    # Search offset: 15-20% of total distance, min 150m, max 400m
    offset_m = max(150.0, min(400.0, straight_m * 0.18))

    # Search left and right of the corridor at midpoint and quarter points
    search_origins = [
        offset_point(mid_lat, mid_lon, (bearing + 90) % 360, offset_m),   # left of mid
        offset_point(mid_lat, mid_lon, (bearing - 90) % 360, offset_m),   # right of mid
        offset_point(q1_lat, q1_lon, (bearing + 90) % 360, offset_m),     # left of Q1
        offset_point(q3_lat, q3_lon, (bearing - 90) % 360, offset_m),     # right of Q3
    ]

    points: list[tuple[float, float]] = []
    seen: set[str] = set()

    pool = ctx.get("amenities", []) + ctx.get("lit_way_centers", [])

    for slat, slon in search_origins:
        for lat, lon in pool:
            if haversine_m(slat, slon, lat, lon) > 280:
                continue
            
            # Must be genuinely off the direct corridor (> 80m perpendicular displacement)
            d_to_start = haversine_m(lat1, lon1, lat, lon)
            d_to_end = haversine_m(lat2, lon2, lat, lon)
            
            # Reject if point is too close to direct line (on-corridor points)
            excess = (d_to_start + d_to_end) - straight_m
            if excess < 80:
                continue
                
            key = f"{round(lat, 3)},{round(lon, 3)}"
            if key in seen:
                continue
            seen.add(key)
            points.append((lat, lon))

    # Sort by how far off the corridor they are (more detour = more different route)
    def off_corridor(p: tuple[float, float]) -> float:
        d1 = haversine_m(lat1, lon1, p[0], p[1])
        d2 = haversine_m(lat2, lon2, p[0], p[1])
        return (d1 + d2) - straight_m

    points.sort(key=off_corridor, reverse=True)
    return points[:4]


def compute_routes(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
) -> dict[str, Any]:
    straight_m = haversine_m(start_lat, start_lon, end_lat, end_lon)

    if straight_m < 50:
        return {"error": "Start and destination are the same place.", "standard": None, "safewalk": None}

    if straight_m > 10_000:
        km = round(straight_m / 1000, 1)
        return {
            "error": f"That's about {km} km away. Too far to walk safely. SafeWalk is designed for walks under 10 km. Try a closer destination or use transit.",
            "standard": None,
            "safewalk": None,
        }

    south, west, north, east = bbox_pad(start_lat, start_lon, end_lat, end_lon, pad=0.015)

    start = (start_lon, start_lat)
    end = (end_lon, end_lat)

    # Run Overpass and the direct OSRM call concurrently — these are the two slowest steps
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        ctx_future = ex.submit(overpass_context, south, west, north, east)
        direct_future = ex.submit(fetch_osrm_route, [start, end], True, True)
        ctx = ctx_future.result()
        direct_routes = direct_future.result()

    ctx["reports"] = load_reports()

    candidates: list[tuple[dict[str, Any], list[list[float]]]] = []
    seen: set[str] = set()

    def add_candidate(rt: dict[str, Any]) -> None:
        geom = rt.get("geometry") or []
        if len(geom) < 2:
            return
        key = geom_signature(geom)
        if not key or key in seen:
            return
        seen.add(key)
        candidates.append((rt, geom))

    for rt in direct_routes:
        add_candidate(rt)

    # Build via-point waypoint lists (perpendicular detours + chained pair)
    vias = find_candidate_via_points(start_lat, start_lon, end_lat, end_lon, ctx)
    via_coord_lists: list[list] = [
        [start, (via[1], via[0]), end] for via in vias[:4]
    ]
    if len(vias) >= 2:
        via_coord_lists.append([start, (vias[0][1], vias[0][0]), (vias[1][1], vias[1][0]), end])

    # Fetch all via-point routes in parallel
    if via_coord_lists:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(via_coord_lists)) as ex:
            futures = [ex.submit(fetch_osrm_route, coords, False, True) for coords in via_coord_lists]
            for f in concurrent.futures.as_completed(futures):
                try:
                    for rt in f.result():
                        add_candidate(rt)
                except Exception:
                    pass

    if not candidates:
        return {
            "error": "No route found. Try nearby streets or different endpoints.",
            "standard": None,
            "safewalk": None,
            "context": {"bbox": [south, west, north, east]},
        }

    # Drop any candidates that are unreasonably long to walk (> 90 min or > 15 km routed)
    candidates = [
        (rt, geom) for rt, geom in candidates
        if rt.get("duration_s", 0) <= 5400 and rt.get("distance_m", 0) <= 15_000
    ]
    if not candidates:
        return {
            "error": "The route found is too long to walk safely (over 90 minutes). Try a closer destination or use transit.",
            "standard": None,
            "safewalk": None,
        }

    scored: list[tuple[dict[str, Any], dict[str, Any], list[list[float]]]] = []
    for rt, geom in candidates:
        details = score_route_against_context(geom, ctx)
        scored.append((rt, details, geom))

    finalize_safety_scores(scored)

    # Standard = fastest route
    standard = min(scored, key=lambda x: x[0].get("duration_s", 1e18))
    std_sig = geom_signature(standard[2])

    # SafeWalk = best-scoring route that is GEOMETRICALLY DIFFERENT from standard.
    # If a distinct route exists (even with a slightly lower score), prefer it so
    # the user always sees a real alternative. Only fall back to standard when
    # OSRM could not produce any distinct geometry at all.
    different = [x for x in scored if geom_signature(x[2]) != std_sig]
    if different:
        # Among distinct routes: highest score first; tie-break by most detoured
        # (longer duration = further from direct path = maximally different)
        safewalk = max(different, key=lambda x: (x[1]["score"], x[0].get("duration_s", 0)))
    else:
        safewalk = standard

    def package(label: str, item: tuple) -> dict[str, Any]:
        rt, details, geom = item
        tier = (
            "green"
            if details["score"] >= 65
            else "amber"
            if details["score"] >= 35
            else "red"
        )
        dm = float(rt.get("distance_m", route_length_km(geom) * 1000.0))
        return {
            "label": label,
            "duration_min": round(rt.get("duration_s", 0) / 60.0, 1),
            "distance_km": round(dm / 1000.0, 2),
            "distance_m": round(dm, 1),
            "geometry": geom,
            "steps": rt.get("steps") or [],
            "safety": {**details, "tier": tier},
        }

    same_route = geom_signature(safewalk[2]) == std_sig

    std_pkg = package("standard", standard)
    safe_pkg = package("safewalk", safewalk)

    return {
        "standard": std_pkg,
        "safewalk": safe_pkg,
        "same_route": same_route,
        "context": {
            "bbox": [south, west, north, east],
            "osm_amenity_points": len(ctx.get("amenities") or []),
            "lit_ways_est": ctx.get("lit_ways_count"),
        },
    }


def geocode(q: str, limit: int = 5) -> list[dict[str, Any]]:
    q = (q or "").strip()
    if not q:
        return []
    params = {"q": q, "format": "json", "limit": str(limit)}
    with httpx.Client(timeout=20.0, headers={"User-Agent": "SafeWalk/1.0 (hackathon demo)"}) as client:
        r = client.get(f"{NOMINATIM}/search", params=params)
        r.raise_for_status()
        rows = r.json()
    out = []
    for row in rows:
        try:
            out.append(
                {
                    "display_name": row.get("display_name"),
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out
