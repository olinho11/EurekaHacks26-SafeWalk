"""
SafeWalk API: routes, geocode, AI narration, crowdsourced reports.
"""

from __future__ import annotations

import os
import time

from flask import Flask, jsonify, request
from flask_cors import CORS

from engine import compute_routes, geocode
from reports_store import append_report, load_reports

app = Flask(__name__)
CORS(app)

# Cache route results for 5 minutes so repeated clicks return consistent scores.
_routes_cache: dict = {}
_CACHE_TTL = 300


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "safewalk"})


@app.post("/api/routes")
def routes():
    body = request.get_json(force=True, silent=True) or {}
    try:
        s_lat = float(body["start"]["lat"])
        s_lon = float(body["start"]["lon"])
        e_lat = float(body["end"]["lat"])
        e_lon = float(body["end"]["lon"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "start and end must include lat/lon numbers"}), 400

    cache_key = f"{round(s_lat, 5)},{round(s_lon, 5)},{round(e_lat, 5)},{round(e_lon, 5)}"
    entry = _routes_cache.get(cache_key)
    if entry and time.time() - entry["ts"] < _CACHE_TTL:
        return jsonify(entry["result"])

    result = compute_routes(s_lat, s_lon, e_lat, e_lon)
    if not result.get("error"):
        _routes_cache[cache_key] = {"result": result, "ts": time.time()}
    if result.get("error"):
        return jsonify(result), 404
    return jsonify(result)


@app.get("/api/geocode")
def geocode_q():
    q = request.args.get("q", "")
    rows = geocode(q, limit=6)
    return jsonify({"results": rows})


@app.post("/api/narrate")
def narrate():
    body = request.get_json(force=True, silent=True) or {}
    standard = body.get("standard") or {}
    safewalk = body.get("safewalk") or {}
    same = body.get("same_route", False)

    def smart_summary() -> str:
        safe_safety = safewalk.get("safety", {})
        std_safety  = standard.get("safety", {})

        safe_s   = safe_safety.get("score")
        std_s    = std_safety.get("score")
        safe_lit = safe_safety.get("lit_coverage_pct")
        std_lit  = std_safety.get("lit_coverage_pct")
        safe_biz = safe_safety.get("active_business_proximity_hits")
        std_biz  = std_safety.get("active_business_proximity_hits")
        safe_iso = safe_safety.get("isolation_pct")
        safe_dm  = safewalk.get("duration_min")
        std_dm   = standard.get("duration_min")

        def fmt_min(m):
            if m is None:
                return "a few"
            m = round(float(m))
            return str(m) if m > 0 else "less than 1"

        if same:
            lit_note = f" {round(safe_lit)}% of the route is lit." if safe_lit is not None else ""
            biz_note = f" There are {safe_biz} active businesses nearby." if safe_biz is not None else ""
            return (
                f"Only one route exists for this trip, scoring {round(safe_s) if safe_s else '?'}/100.{lit_note}{biz_note} "
                f"It takes about {fmt_min(safe_dm)} minutes. Stay visible and keep to well-lit stretches."
            )

        score_gap = round(safe_s - std_s) if (safe_s is not None and std_s is not None) else None
        lit_gap   = round(safe_lit - std_lit) if (safe_lit is not None and std_lit is not None) else None
        biz_gap   = (safe_biz or 0) - (std_biz or 0)
        extra_min = round(float(safe_dm) - float(std_dm)) if (safe_dm is not None and std_dm is not None) else None

        lines = []

        routes_are_equal = score_gap is not None and score_gap == 0
        both_poor = safe_s is not None and std_s is not None and safe_s < 35 and std_s < 35
        gap_negligible = score_gap is not None and abs(score_gap) < 5

        # Advisory mode: poor coverage area or routes are effectively identical
        if both_poor or gap_negligible:
            if both_poor:
                lines.append(
                    f"This area has limited street lighting and few active businesses along either route "
                    f"(SafeWalk scores {round(safe_s)}/100, fastest scores {round(std_s)}/100). "
                    f"Natural surveillance is low regardless of which path you take."
                )
            else:
                lines.append(
                    f"Both routes are similar in safety ({round(safe_s)}/100 vs {round(std_s)}/100). "
                    f"The difference is too small to matter."
                )
            lines.append(
                "If you're walking at night: stick to the main road, let someone know your route, "
                "and consider travelling with a companion."
            )
            if extra_min is not None and extra_min > 0:
                lines.append(
                    f"The faster option saves {extra_min} {'minute' if extra_min == 1 else 'minutes'} "
                    f"and is the practical choice here. Less time outside means less exposure."
                )
            elif safe_dm is not None:
                lines.append(f"Total walk time is about {fmt_min(safe_dm)} minutes.")
            return " ".join(lines)

        # Normal comparison mode
        if score_gap is not None and score_gap > 0:
            lines.append(
                f"SafeWalk chose the {round(safe_s)}/100 route over the faster {round(std_s)}/100 option, "
                f"a {score_gap}-point safety advantage."
            )
        else:
            lines.append(f"The routes score similarly ({round(safe_s) if safe_s else '?'} vs {round(std_s) if std_s else '?'}/100).")

        # Lighting detail
        if safe_lit is not None:
            if lit_gap is not None and lit_gap >= 5:
                lines.append(
                    f"The SafeWalk route has {round(safe_lit)}% lit road coverage, "
                    f"{lit_gap} percentage points more than the fastest path."
                )
            else:
                lines.append(f"{round(safe_lit)}% of the SafeWalk route runs along lit roads.")

        # Business detail
        if safe_biz is not None:
            if biz_gap > 0:
                lines.append(
                    f"It passes {safe_biz} active {'business' if safe_biz == 1 else 'businesses'}, "
                    f"{biz_gap} more than the direct route, keeping natural surveillance high."
                )
            elif safe_biz > 0:
                lines.append(f"{safe_biz} active {'business' if safe_biz == 1 else 'businesses'} line the route, providing natural surveillance.")

        # Isolation note
        if safe_iso is not None and safe_iso > 20:
            lines.append(f"About {round(safe_iso)}% of the route has limited lighting and amenities. Stay alert in those stretches.")

        # Time cost
        if extra_min is not None and extra_min > 0:
            if score_gap is not None and score_gap > 0:
                lines.append(f"It adds {extra_min} {'minute' if extra_min == 1 else 'minutes'}, a worthwhile trade-off for {score_gap} points of extra safety.")
            else:
                lines.append(f"Walk time is about {fmt_min(safe_dm)} minutes.")
        elif safe_dm is not None:
            lines.append(f"Total walk time is about {fmt_min(safe_dm)} minutes.")

        return " ".join(lines)

    return jsonify({"text": smart_summary(), "source": "summary"})


@app.get("/api/reports")
def get_reports():
    return jsonify({"reports": load_reports()})


@app.post("/api/reports")
def post_report():
    body = request.get_json(force=True, silent=True) or {}
    try:
        lat = float(body["lat"])
        lon = float(body["lon"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "lat and lon required"}), 400
    kind = str(body.get("kind") or "other")[:64]
    message = str(body.get("message") or "")[:500]
    rec = append_report(lat, lon, kind, message)
    return jsonify(rec), 201


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    app.run(host="0.0.0.0", port=port, debug=False)
