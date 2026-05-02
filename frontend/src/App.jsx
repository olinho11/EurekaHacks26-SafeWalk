import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import L from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import {
  computeWalkSnapshot,
  enrichStepsWithCumulative,
  projectAlongPolyline,
} from "./walkUtils.js";

// Fix default marker icons in bundlers (Vite)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const DEFAULT_CENTER = [43.6532, -79.3832];

/** Avoids "Unexpected end of JSON input" when the proxy/API returns an empty body (backend off). */
async function readJsonResponse(response) {
  const text = await response.text();
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    throw new Error(
      `Empty response (${response.status}). Start the API: safewalk/backend → python app.py (port 5050).`
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(
      `Invalid response (${response.status}). Is the backend running on port 5050?`
    );
  }
}

/**
 * Walking directions A→B only. Do not stuff our polyline with via points — Google
 * then zig-zags through dozens of forced corners and looks broken.
 * Users still see SafeWalk’s route on our map; Maps gets a sane pedestrian route.
 */
function buildGoogleMapsWalkingUrl(geometry) {
  if (!geometry?.length || geometry.length < 2) return null;
  const [oLon, oLat] = geometry[0];
  const [dLon, dLat] = geometry[geometry.length - 1];
  const params = new URLSearchParams({
    api: "1",
    travelmode: "walking",
    origin: `${oLat},${oLon}`,
    destination: `${dLat},${dLon}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function openRouteInGoogleMaps(route) {
  const url = buildGoogleMapsWalkingUrl(route?.geometry);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function FitBounds({ lines, enabled = true }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !lines || !lines.length) return;
    const fg = L.featureGroup(
      lines.map((pts) => L.polyline(pts, { noClip: true }))
    );
    const b = fg.getBounds();
    if (b?.isValid?.()) {
      map.fitBounds(b, { padding: [48, 48], maxZoom: 16 });
    }
  }, [lines, map, enabled]);
  return null;
}

function FollowUser({ position, enabled, zoom = 17 }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || !position) return;
    map.setView([position.lat, position.lng], zoom, { animate: true });
  }, [position, enabled, map, zoom]);
  return null;
}

function MapClickHandler({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng);
    },
  });
  return null;
}

function tierPill(tier) {
  if (tier === "green") return "pill green";
  if (tier === "amber") return "pill amber";
  return "pill red";
}

/** `durationMin` is decimal minutes from the API. */
function formatDurationMinutes(durationMin) {
  if (durationMin == null || Number.isNaN(Number(durationMin))) return "—";
  let total = Math.round(Number(durationMin));
  if (total < 1) total = 1;

  if (total < 60) {
    return `${total} min`;
  }

  const days = Math.floor(total / (24 * 60));
  let rem = total - days * 24 * 60;
  const hours = Math.floor(rem / 60);
  const mins = rem % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }
  if (hours > 0) {
    parts.push(`${hours} h`);
  }
  if (mins > 0 || parts.length === 0) {
    parts.push(`${mins} min`);
  }
  return parts.join(" ");
}

function formatDurationWithDetail(durationMin) {
  const primary = formatDurationMinutes(durationMin);
  if (primary === "—") return { primary, secondary: null };
  const raw =
    durationMin != null && !Number.isNaN(Number(durationMin))
      ? Number(durationMin)
      : null;
  if (raw == null || raw < 60) {
    return { primary, secondary: null };
  }
  const roundedMin = Math.round(raw);
  const secondary = `${roundedMin.toLocaleString()} min total`;
  return { primary, secondary };
}

function DurationLine({ durationMin }) {
  const { primary, secondary } = formatDurationWithDetail(durationMin);
  return (
    <>
      <span className="duration-primary">{primary}</span>
      {secondary ? (
        <span className="duration-secondary">{secondary}</span>
      ) : null}
    </>
  );
}

const GEOCODE_DEBOUNCE_MS = 420;
const MIN_QUERY_LEN = 3;

function LocationAutocomplete({
  id,
  label,
  value,
  onValueChange,
  resolved,
  onResolved,
  hint,
  apiBase = "",
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [emptyHint, setEmptyHint] = useState(false);
  const [fetchErr, setFetchErr] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setHighlight(-1);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const q = value.trim();
    if (q.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setLoading(false);
      setEmptyHint(false);
      setFetchErr("");
      return () => ctrl.abort();
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setEmptyHint(false);
      setFetchErr("");
      try {
        const r = await fetch(
          `${apiBase}/api/geocode?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        const data = await readJsonResponse(r);
        if (!r.ok) {
          throw new Error(data?.error || `Geocode failed (${r.status})`);
        }
        const rows = Array.isArray(data.results) ? data.results : [];
        setSuggestions(rows);
        setEmptyHint(rows.length === 0);
        setOpen(true);
        setHighlight(-1);
      } catch (e) {
        if (e.name === "AbortError") return;
        setSuggestions([]);
        setEmptyHint(false);
        setFetchErr(e.message || "Search failed");
        setOpen(true);
        setHighlight(-1);
      } finally {
        setLoading(false);
      }
    }, GEOCODE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value, apiBase]);

  const pick = (row) => {
    if (row.lat == null || row.lon == null) return;
    onResolved({
      lat: Number(row.lat),
      lon: Number(row.lon),
      label: row.display_name,
    });
    onValueChange(row.display_name);
    setOpen(false);
    setSuggestions([]);
    setHighlight(-1);
    setFetchErr("");
  };

  const onKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) =>
        h <= 0 ? suggestions.length - 1 : h - 1
      );
    } else if (e.key === "Enter" && suggestions.length > 0 && !fetchErr) {
      e.preventDefault();
      pick(suggestions[highlight >= 0 ? highlight : 0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="autocomplete-wrap" ref={wrapRef}>
        <input
          id={id}
          value={value}
          autoComplete="off"
          placeholder={
            label === "Start"
              ? `Starting place (${MIN_QUERY_LEN}+ characters)`
              : `Destination (${MIN_QUERY_LEN}+ characters)`
          }
          onChange={(e) => {
            onResolved(null);
            onValueChange(e.target.value);
            if (e.target.value.trim().length >= MIN_QUERY_LEN) {
              setOpen(true);
            }
          }}
          onFocus={() => {
            const q = value.trim();
            if (q.length >= MIN_QUERY_LEN) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {open &&
        value.trim().length >= MIN_QUERY_LEN &&
        (loading ||
          suggestions.length > 0 ||
          emptyHint ||
          fetchErr) ? (
          <div className="autocomplete-dropdown" role="listbox">
            {loading ? (
              <div className="autocomplete-status">Searching…</div>
            ) : null}
            {fetchErr ? (
              <div className="autocomplete-status autocomplete-error">
                {fetchErr}
              </div>
            ) : null}
            {!loading &&
              !fetchErr &&
              suggestions.map((row, i) => (
                <button
                  key={`${row.lat},${row.lon}-${i}`}
                  type="button"
                  role="option"
                  className={`autocomplete-item ${
                    i === highlight ? "active" : ""
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row)}
                >
                  {row.display_name}
                </button>
              ))}
            {!loading && !fetchErr && emptyHint && suggestions.length === 0 ? (
              <div className="autocomplete-status">No matches</div>
            ) : null}
          </div>
        ) : null}
      </div>
      {hint ? <span className="geo-hint">{hint}</span> : null}
      {resolved ? (
        <span className="geo-hint" style={{ color: "var(--accent)" }}>
          Location pinned — Compare routes will use this place.
        </span>
      ) : null}
    </div>
  );
}

export default function App() {
  const [startQ, setStartQ] = useState("");
  const [endQ, setEndQ] = useState("");
  const [startResolved, setStartResolved] = useState(null);
  const [endResolved, setEndResolved] = useState(null);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [standard, setStandard] = useState(null);
  const [safewalk, setSafewalk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [narration, setNarration] = useState("");
  const [narrateBusy, setNarrateBusy] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportMode, setReportMode] = useState(false);
  const [pendingReport, setPendingReport] = useState(null);
  const [reportKind, setReportKind] = useState("streetlight");
  const [reportMsg, setReportMsg] = useState("");
  const [walkMode, setWalkMode] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [geoError, setGeoError] = useState("");
  const [followUser, setFollowUser] = useState(true);
  const [voiceGuidance, setVoiceGuidance] = useState(true);
  const lastSpokenStep = useRef(-1);

  const apiBase = "";

  const activeWalkRoute =
    walkMode === "safewalk"
      ? safewalk
      : walkMode === "standard"
        ? standard
        : null;

  const walkGeometry = activeWalkRoute?.geometry;

  const walkDerived = useMemo(() => {
    if (!walkGeometry?.length || !userPos) {
      return {
        distanceAlongM: 0,
        crossTrackM: Infinity,
        totalM: activeWalkRoute?.distance_m || 0,
        snapshot: null,
        enrichedSteps: [],
      };
    }
    const proj = projectAlongPolyline(
      userPos.lat,
      userPos.lng,
      walkGeometry
    );
    const totalM =
      activeWalkRoute?.distance_m > 0
        ? activeWalkRoute.distance_m
        : proj.totalM;
    const enriched = enrichStepsWithCumulative(activeWalkRoute?.steps || []);
    const snapshot = computeWalkSnapshot(
      enriched,
      proj.distanceAlongM,
      totalM,
      activeWalkRoute?.duration_min || 0
    );
    return {
      ...proj,
      totalM,
      snapshot,
      enrichedSteps: enriched,
    };
  }, [
    walkGeometry,
    userPos,
    activeWalkRoute?.distance_m,
    activeWalkRoute?.duration_min,
    activeWalkRoute?.steps,
  ]);

  useEffect(() => {
    if (!walkMode) {
      setUserPos(null);
      setGeoError("");
      lastSpokenStep.current = -1;
      return;
    }
    if (!navigator.geolocation) {
      setGeoError("Location not supported in this browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError("");
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 25,
        });
      },
      (err) => {
        setGeoError(err.message || "Could not read your location.");
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [walkMode]);

  useEffect(() => {
    if (
      !walkMode ||
      !voiceGuidance ||
      !walkDerived.snapshot ||
      typeof window === "undefined" ||
      !window.speechSynthesis
    ) {
      return;
    }
    const idx = walkDerived.snapshot.stepIndex;
    if (idx === lastSpokenStep.current) return;
    lastSpokenStep.current = idx;
    const text = walkDerived.snapshot.nextInstruction;
    if (!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }, [
    walkMode,
    voiceGuidance,
    walkDerived.snapshot?.stepIndex,
    walkDerived.snapshot?.nextInstruction,
  ]);

  const runDemo = async () => {
    const demoStart = { lat: 43.6437, lon: -79.3799, label: "King & Simcoe, Toronto" };
    const demoEnd = { lat: 43.6750, lon: -79.3950, label: "Bloor & Avenue, Toronto" };
    setStart(demoStart);
    setEnd(demoEnd);
    setStartResolved(demoStart);
    setEndResolved(demoEnd);
    setStartQ(demoStart.label);
    setEndQ(demoEnd.label);
    setLoading(true);
    setError("");
    setNarration("");
    setWalkMode(null);
    try {
      const r = await fetch(`${apiBase}/api/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { lat: demoStart.lat, lon: demoStart.lon },
          end: { lat: demoEnd.lat, lon: demoEnd.lon },
        }),
      });
      const j = await readJsonResponse(r);
      if (!r.ok) throw new Error(j.error || "Routing failed.");
      setStandard(j.standard);
      setSafewalk(j.safewalk);
    } catch (err) {
      setStandard(null);
      setSafewalk(null);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchRoutes = async () => {
    setLoading(true);
    setError("");
    setNarration("");
    setWalkMode(null);
    try {
      if (!startResolved && startQ.trim().length < MIN_QUERY_LEN) {
        throw new Error(
          `Start: type at least ${MIN_QUERY_LEN} characters or pick an address from the list.`
        );
      }
      if (!endResolved && endQ.trim().length < MIN_QUERY_LEN) {
        throw new Error(
          `Destination: type at least ${MIN_QUERY_LEN} characters or pick an address from the list.`
        );
      }

      let s;
      if (startResolved) {
        s = startResolved;
      } else {
        const rs = await fetch(
          `${apiBase}/api/geocode?q=${encodeURIComponent(startQ.trim())}`
        );
        const js = await readJsonResponse(rs);
        if (!rs.ok) throw new Error(js.error || `Geocode failed (${rs.status})`);
        const fs = js.results?.[0];
        if (!fs) throw new Error(`Start not found: ${startQ.trim()}`);
        s = { lat: fs.lat, lon: fs.lon, label: fs.display_name };
      }

      let e;
      if (endResolved) {
        e = endResolved;
      } else {
        const re = await fetch(
          `${apiBase}/api/geocode?q=${encodeURIComponent(endQ.trim())}`
        );
        const je = await readJsonResponse(re);
        if (!re.ok) throw new Error(je.error || `Geocode failed (${re.status})`);
        const fe = je.results?.[0];
        if (!fe) throw new Error(`End not found: ${endQ.trim()}`);
        e = { lat: fe.lat, lon: fe.lon, label: fe.display_name };
      }

      setStart(s);
      setEnd(e);

      const r = await fetch(`${apiBase}/api/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { lat: s.lat, lon: s.lon },
          end: { lat: e.lat, lon: e.lon },
        }),
      });
      const j = await readJsonResponse(r);
      if (!r.ok) throw new Error(j.error || "Routing failed.");
      setStandard(j.standard);
      setSafewalk(j.safewalk);
    } catch (err) {
      setStandard(null);
      setSafewalk(null);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const linesForFit = useMemo(() => {
    const rows = [];
    if (standard?.geometry?.length)
      rows.push(standard.geometry.map(([lon, lat]) => [lat, lon]));
    if (safewalk?.geometry?.length)
      rows.push(safewalk.geometry.map(([lon, lat]) => [lat, lon]));
    return rows;
  }, [standard, safewalk]);

  const voiceEscort = async () => {
    if (!standard && !safewalk) return;
    setNarrateBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ standard, safewalk }),
      });
      const j = await readJsonResponse(r);
      setNarration(j.text || "");
    } catch {
      setNarration("SafeWalk could not reach the narration service.");
    } finally {
      setNarrateBusy(false);
    }
  };

  const loadReports = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/reports`);
      const j = await readJsonResponse(r);
      setReports(j.reports || []);
    } catch {
      setReports([]);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const submitReport = async () => {
    if (!pendingReport) return;
    await fetch(`${apiBase}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: pendingReport.lat,
        lon: pendingReport.lng,
        kind: reportKind,
        message: reportMsg,
      }),
    });
    setPendingReport(null);
    setReportMsg("");
    setReportMode(false);
    loadReports();
  };

  const onMapPick = (latlng) => {
    setPendingReport(latlng);
  };

  return (
    <div className="app-shell">
      <aside className="side-panel">
        <div className="brand">
          <div className="brand-header">
            <span className="brand-icon">🛡️</span>
            <h1>SafeWalk</h1>
          </div>
          <p className="brand-tagline">
            Navigation that favors natural surveillance — lit streets, foot
            traffic, and open businesses — so you can reclaim the night.
          </p>
          <div className="stat-line">
            <strong>60%</strong> of people feel more anxious walking home after
            9 PM. SafeWalk routes for presence, not just minutes.
          </div>
        </div>

        <LocationAutocomplete
          id="sw-start"
          label="Start"
          value={startQ}
          onValueChange={setStartQ}
          resolved={startResolved}
          onResolved={setStartResolved}
          hint="Type 3+ characters, wait for suggestions, then tap a row to pin. Requires the backend on port 5050."
          apiBase={apiBase}
        />
        <LocationAutocomplete
          id="sw-end"
          label="Destination"
          value={endQ}
          onValueChange={setEndQ}
          resolved={endResolved}
          onResolved={setEndResolved}
          apiBase={apiBase}
        />

        <div className="actions">
          <button
            className="btn-primary"
            type="button"
            disabled={loading}
            onClick={fetchRoutes}
          >
            {loading ? "Routing…" : "Compare routes"}
          </button>
          <div className="actions-row">
            <button
              className="btn-ghost"
              type="button"
              disabled={loading}
              onClick={runDemo}
            >
              {loading ? "Loading…" : "Try Demo"}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={voiceEscort}
              disabled={narrateBusy || (!standard && !safewalk)}
            >
              {narrateBusy ? "Thinking…" : "Reasoning"}
            </button>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {safewalk?.geometry?.length && !error ? (
          <p className="geo-hint maps-auto-hint">
            Green line = SafeWalk route · Red line = fastest route. Tap{" "}
            <strong>Walk here</strong> to start GPS navigation or{" "}
            <strong>Google Maps</strong> to open in browser.
          </p>
        ) : null}

        <div className="route-cards">
          <p className="route-cards-heading">Routes</p>

          {/* Fastest route card */}
          <div className={`route-card fast${walkMode === "standard" ? " route-card-walking" : ""}`}>
            <div className="route-card-top">
              <div>
                <div className="route-card-title-row">
                  <h3>Fastest Route</h3>
                  {standard?.safety?.tier ? (
                    <span className={tierPill(standard.safety.tier)}>
                      {standard.safety.tier}
                    </span>
                  ) : null}
                </div>
                <p className="route-card-subtitle">Optimized for speed</p>
              </div>
              <div className={`safety-badge ${standard?.safety?.tier === "green" ? "safe" : standard?.safety?.tier === "amber" ? "amber" : "danger"}`}>
                <span className="safety-score-num">
                  {standard?.safety?.score != null ? standard.safety.score : "—"}
                </span>
                <span className="safety-score-label">Safety</span>
                <div className="safety-tooltip">
                  Score out of 500 — measures lit streets, open businesses, and foot traffic along the route.
                  <br /><br />
                  <strong style={{color:"#8cf5d1"}}>Green</strong> ≥ 300 · <strong style={{color:"#ffd875"}}>Amber</strong> ≥ 150 · <strong style={{color:"#ff8f99"}}>Red</strong> = low surveillance
                </div>
              </div>
            </div>
            <div className="route-stats-grid">
              <div className="route-stat">
                <span className="route-stat-value">
                  <DurationLine durationMin={standard?.duration_min} />
                </span>
                <span className="route-stat-label">Time</span>
              </div>
              <div className="route-stat">
                <span className="route-stat-value">{standard ? `${standard.distance_km} km` : "—"}</span>
                <span className="route-stat-label">Distance</span>
              </div>
              <div className="route-stat">
                <span className="route-stat-value">{standard?.safety?.active_business_proximity_hits ?? "—"}</span>
                <span className="route-stat-label">Businesses</span>
              </div>
            </div>
            <div className="route-card-actions">
              <button
                className="btn-walk"
                type="button"
                disabled={!standard?.steps?.length}
                onClick={() => { setWalkMode("standard"); setFollowUser(true); setReportMode(false); }}
              >
                Walk here
              </button>
              <button
                className="btn-google-maps"
                type="button"
                disabled={!standard?.geometry?.length}
                onClick={() => openRouteInGoogleMaps(standard)}
              >
                Google Maps
              </button>
            </div>
            {standard?.steps?.length ? (
              <details className="turn-list">
                <summary>{standard.steps.length} turn-by-turn steps</summary>
                <ol>
                  {standard.steps.map((st, i) => <li key={`s-${i}`}>{st.instruction}</li>)}
                </ol>
              </details>
            ) : null}
          </div>

          {/* SafeWalk route card */}
          <div className={`route-card safe${walkMode === "safewalk" ? " route-card-walking" : ""}`}>
            <div className="route-card-top">
              <div>
                <div className="route-card-title-row">
                  <h3>SafeWalk Route</h3>
                  {safewalk?.safety?.tier ? (
                    <span className={tierPill(safewalk.safety.tier)}>
                      {safewalk.safety.tier}
                    </span>
                  ) : null}
                </div>
                <p className="route-card-subtitle">Optimized for safety</p>
              </div>
              <div className={`safety-badge ${safewalk?.safety?.tier === "green" ? "safe" : safewalk?.safety?.tier === "amber" ? "amber" : "danger"}`}>
                <span className="safety-score-num">
                  {safewalk?.safety?.score != null ? safewalk.safety.score : "—"}
                </span>
                <span className="safety-score-label">Safety</span>
                <div className="safety-tooltip">
                  Score out of 500 — measures lit streets, open businesses, and foot traffic along the route.
                  <br /><br />
                  <strong style={{color:"#8cf5d1"}}>Green</strong> ≥ 300 · <strong style={{color:"#ffd875"}}>Amber</strong> ≥ 150 · <strong style={{color:"#ff8f99"}}>Red</strong> = low surveillance
                </div>
              </div>
            </div>
            <div className="route-stats-grid">
              <div className="route-stat">
                <span className="route-stat-value">
                  <DurationLine durationMin={safewalk?.duration_min} />
                </span>
                <span className="route-stat-label">Time</span>
              </div>
              <div className="route-stat">
                <span className="route-stat-value">{safewalk ? `${safewalk.distance_km} km` : "—"}</span>
                <span className="route-stat-label">Distance</span>
              </div>
              <div className="route-stat">
                <span className="route-stat-value">{safewalk?.safety?.active_business_proximity_hits ?? "—"}</span>
                <span className="route-stat-label">Businesses</span>
              </div>
            </div>
            <div className="route-card-actions">
              <button
                className="btn-walk"
                type="button"
                disabled={!safewalk?.steps?.length}
                onClick={() => { setWalkMode("safewalk"); setFollowUser(true); setReportMode(false); }}
              >
                Walk here
              </button>
              <button
                className="btn-google-maps"
                type="button"
                disabled={!safewalk?.geometry?.length}
                onClick={() => openRouteInGoogleMaps(safewalk)}
              >
                Google Maps
              </button>
            </div>
            {safewalk?.steps?.length ? (
              <details className="turn-list">
                <summary>{safewalk.steps.length} turn-by-turn steps</summary>
                <ol>
                  {safewalk.steps.map((st, i) => <li key={`w-${i}`}>{st.instruction}</li>)}
                </ol>
              </details>
            ) : null}
          </div>
        </div>

        {narration ? (
          <div className="narration">
            <header>🤖 AI Safety Summary</header>
            {narration}
          </div>
        ) : null}

        <div className="report-section">
          <div className="actions-row">
            <button
              className={reportMode ? "btn-primary" : "btn-ghost"}
              type="button"
              onClick={() => {
                setReportMode((v) => !v);
                setPendingReport(null);
              }}
            >
              {reportMode ? "Cancel pin drop" : "📍 Report on map"}
            </button>
          </div>
          {reportMode ? (
            <p className="geo-hint" style={{ marginTop: "0.5rem" }}>
              Tap the map where the issue is. Reports affect safety scores for everyone.
            </p>
          ) : null}
          {pendingReport ? (
            <div className="report-form">
              <select
                value={reportKind}
                onChange={(e) => setReportKind(e.target.value)}
              >
                <option value="streetlight">Streetlight out</option>
                <option value="construction">Blocked sidewalk</option>
                <option value="harassment">Safety concern</option>
                <option value="other">Other</option>
              </select>
              <textarea
                value={reportMsg}
                onChange={(e) => setReportMsg(e.target.value)}
                placeholder="Short note (optional)"
              />
              <div className="actions-row">
                <button className="btn-primary" type="button" onClick={submitReport}>
                  Submit report
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => setPendingReport(null)}
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="map-wrap">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={13}
          style={{ height: "100%", minHeight: "100vh" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds lines={linesForFit} enabled={!walkMode} />
          <FollowUser
            position={
              userPos
                ? { lat: userPos.lat, lng: userPos.lng }
                : null
            }
            enabled={Boolean(walkMode && followUser && userPos)}
            zoom={17}
          />
          <MapClickHandler enabled={reportMode} onPick={onMapPick} />

          {start ? (
            <Marker position={[start.lat, start.lon]}>
              <Popup>Start</Popup>
            </Marker>
          ) : null}
          {end ? (
            <Marker position={[end.lat, end.lon]}>
              <Popup>End</Popup>
            </Marker>
          ) : null}

          {standard?.geometry?.length ? (
            <Polyline
              positions={standard.geometry.map(([lon, lat]) => [lat, lon])}
              pathOptions={
                walkMode === "safewalk"
                  ? { color: "#ff5c6c", weight: 5, opacity: 0.22 }
                  : { color: "#ff5c6c", weight: 7, opacity: 0.95 }
              }
            />
          ) : null}
          {safewalk?.geometry?.length ? (
            <Polyline
              positions={safewalk.geometry.map(([lon, lat]) => [lat, lon])}
              pathOptions={
                walkMode === "standard"
                  ? { color: "#38d39f", weight: 5, opacity: 0.22 }
                  : { color: "#38d39f", weight: 7, opacity: 0.95 }
              }
            />
          ) : null}

          {walkMode && userPos ? (
            <>
              <Circle
                center={[userPos.lat, userPos.lng]}
                radius={Math.min(Math.max(userPos.accuracy || 25, 12), 120)}
                pathOptions={{
                  color: "#6eb7ff",
                  fillColor: "#6eb7ff",
                  fillOpacity: 0.12,
                  weight: 1,
                }}
              />
              <CircleMarker
                center={[userPos.lat, userPos.lng]}
                radius={7}
                pathOptions={{
                  color: "#1e5eff",
                  fillColor: "#6eb7ff",
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Popup>You are here</Popup>
              </CircleMarker>
            </>
          ) : null}

          {reports.map((rep) => (
            <CircleMarker
              key={rep.id}
              center={[rep.lat, rep.lon]}
              radius={9}
              pathOptions={{
                color: "#f0b429",
                fillColor: "#ffdc73",
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <strong>{rep.kind}</strong>
                <div>{rep.message || "No details"}</div>
              </Popup>
            </CircleMarker>
          ))}

          {pendingReport ? (
            <CircleMarker
              center={[pendingReport.lat, pendingReport.lng]}
              radius={11}
              pathOptions={{
                color: "#3ee6b0",
                fillColor: "#3ee6b0",
                fillOpacity: 0.35,
                weight: 3,
              }}
            />
          ) : null}
        </MapContainer>

        {walkMode ? (
          <div className="walk-hud" aria-live="polite">
            <div className="walk-hud-top">
              <div>
                <strong>
                  {walkMode === "safewalk" ? "SafeWalk route" : "Fastest route"}
                </strong>
                <span className="walk-hud-sub">Live walk mode</span>
              </div>
              <button
                type="button"
                className="btn-ghost btn-hud-stop"
                onClick={() => {
                  setWalkMode(null);
                  if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                }}
              >
                End walk
              </button>
            </div>
            {geoError ? <p className="error walk-hud-msg">{geoError}</p> : null}
            {!userPos && !geoError ? (
              <p className="geo-hint walk-hud-msg">Acquiring GPS…</p>
            ) : null}
            {walkDerived.snapshot ? (
              <>
                <p className="walk-next-label">Next</p>
                <p className="walk-next-text">
                  {walkDerived.snapshot.nextInstruction}
                </p>
                <div className="walk-stats">
                  <span>
                    ~{Math.round(walkDerived.snapshot.remainingStepM)} m to
                    maneuver
                  </span>
                  <span className="walk-dot">·</span>
                  <span>
                    ETA ~
                    {Math.max(1, Math.round(walkDerived.snapshot.etaMin))}{" "}
                    min
                  </span>
                  <span className="walk-dot">·</span>
                  <span>
                    {Math.round(walkDerived.snapshot.remainingM)} m left
                  </span>
                </div>
                <div className="walk-progress-track">
                  <div
                    className="walk-progress-fill"
                    style={{
                      width: `${Math.min(100, walkDerived.snapshot.progressPct)}%`,
                    }}
                  />
                </div>
                {Number.isFinite(walkDerived.crossTrackM) &&
                walkDerived.crossTrackM > 48 ? (
                  <p className="walk-off-route">
                    Step back toward the line (~
                    {Math.round(walkDerived.crossTrackM)} m off route)
                  </p>
                ) : null}
                {walkDerived.snapshot.atDestination ? (
                  <p className="walk-arrived">
                    You’ve reached the destination area.
                  </p>
                ) : null}
              </>
            ) : null}
            <div className="walk-hud-actions">
              <button
                type="button"
                className={followUser ? "btn-primary" : "btn-ghost"}
                onClick={() => setFollowUser((v) => !v)}
              >
                {followUser ? "Following" : "Free map"}
              </button>
              <button
                type="button"
                className={voiceGuidance ? "btn-primary" : "btn-ghost"}
                onClick={() => setVoiceGuidance((v) => !v)}
              >
                {voiceGuidance ? "Voice on" : "Voice off"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setFollowUser(true)}
              >
                Recenter
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => openRouteInGoogleMaps(activeWalkRoute)}
              >
                Google Maps
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
