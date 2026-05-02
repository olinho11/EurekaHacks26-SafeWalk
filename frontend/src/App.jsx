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
import {
  CheckCircle2,
  Sparkles,
  MapPin,
  Navigation,
  Volume2,
  VolumeX,
  Crosshair,
  Map as MapIcon,
  XCircle,
  ChevronDown,
  LocateFixed,
  ExternalLink,
  AlertTriangle,
  Zap,
  Footprints,
  Send,
  Settings as SettingsIcon,
  X,
  Palette,
  Info,
  ShieldCheck,
  FileText,
  Heart,
  Clock,
  Building2,
  Ruler,
  Loader2,
} from "lucide-react";
import logo from "./assets/logo.png";
import Onboarding from "./Onboarding";

const APP_VERSION = "1.0.0";

const THEMES = [
  { id: "teal",   name: "Teal",   meta: "Default",   color: "#3ee6b0" },
  { id: "amber",  name: "Amber",  meta: "Lamplight", color: "#f0c350" },
  { id: "blue",   name: "Blue",   meta: "Cool",      color: "#6ea5ff" },
  { id: "purple", name: "Purple", meta: "Twilight",  color: "#b07cff" },
  { id: "rose",   name: "Rose",   meta: "Warm",      color: "#ff82a5" },
];

function SettingsModal({ open, onClose, theme, onThemeChange }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>
            <SettingsIcon size={18} strokeWidth={2.25} />
            Settings
            <span className="app-version">v{APP_VERSION}</span>
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close settings">
            <X size={18} strokeWidth={2.5} />
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-section">
            <div className="settings-section-header">
              <Palette size={14} strokeWidth={2.5} />
              Appearance
            </div>
            <p style={{ marginBottom: "var(--sp-3)" }}>
              Pick an accent color. Safety tier colors (green / amber / red) stay fixed for clarity.
            </p>
            <div className="theme-picker">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-swatch${theme === t.id ? " active" : ""}`}
                  onClick={() => onThemeChange(t.id)}
                >
                  <span
                    className="theme-swatch-dot"
                    style={{ background: t.color, color: t.color }}
                  />
                  <div>
                    <div className="theme-swatch-name">{t.name}</div>
                    <div className="theme-swatch-meta">{t.meta}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <Info size={14} strokeWidth={2.5} />
              About
            </div>
            <div className="about-block">
              <img src={logo} alt="SafeWalk" />
              <div className="about-block-text">
                <span className="about-block-name">SafeWalk</span>
                <span className="about-block-tag">Pedestrian Safety Navigation</span>
              </div>
            </div>
            <p>
              SafeWalk routes pedestrians by natural surveillance — lit streets,
              foot traffic, and open businesses — instead of just shortest time. Built on the principle that safety
              comes from <em>"eyes on the street"</em>, not from avoiding people.
            </p>
            <p>
              The app compares the fastest path against an alternative optimized for visibility, lighting, and
              activity. Crowdsourced reports adjust scores in real time so the community can flag dim corners and
              construction without waiting for OSM updates.
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <ShieldCheck size={14} strokeWidth={2.5} />
              Privacy Policy
            </div>
            <p>
              <strong>SafeWalk does not collect, store, or transmit personal information.</strong> Your location is
              used only on-device to draw your position on the map and snap to the route during walk mode. It is
              never sent to our servers or any third party.
            </p>
            <p>
              Address autocomplete queries are forwarded to OpenStreetMap's Nominatim service. Map tiles and routing
              come from OpenStreetMap. Voice guidance uses your browser's built-in speech synthesis — nothing is
              uploaded.
            </p>
            <p>
              Community safety reports include only the coordinates you tap, the issue type, and your optional note.
              No account, identifier, or device fingerprint is attached.
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <FileText size={14} strokeWidth={2.5} />
              Terms of Service
            </div>
            <p>
              SafeWalk is provided "as is" for informational purposes. Safety scores are heuristic estimates derived
              from open map data, not guarantees. <strong>Always trust your own judgment</strong> when walking,
              especially after dark.
            </p>
            <p>
              By using SafeWalk you agree not to submit false reports, abuse the routing service, or rely on the app
              as a substitute for emergency services. In an emergency, contact local authorities directly.
            </p>
            <p>
              Submitted reports become part of the public dataset that informs scores for all users. Do not include
              personal information in report notes.
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-section-header">
              <Heart size={14} strokeWidth={2.5} />
              Built With
            </div>
            <p>
              Open data and open source, all the way down. Massive thanks to the volunteers who maintain the maps the
              world depends on.
            </p>
            <div className="tech-list">
              <span className="tech-tag">React</span>
              <span className="tech-tag">Vite</span>
              <span className="tech-tag">Leaflet</span>
              <span className="tech-tag">Lucide Icons</span>
              <span className="tech-tag">Flask</span>
              <span className="tech-tag">OSRM</span>
              <span className="tech-tag">Overpass API</span>
              <span className="tech-tag">Nominatim</span>
              <span className="tech-tag">OpenStreetMap</span>
              <span className="tech-tag">Claude Haiku</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

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

const MAP_COLORS = {
  standard: "#ff5c6c",
  safewalk: "#38d39f",
  userRing: "#6eb7ff",
  userDot: "#1e5eff",
  reportFill: "#ffdc73",
  reportStroke: "#f0b429",
  pendingMark: "#3ee6b0",
};

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

function tierColor(tier) {
  if (tier === "green") return "var(--safe)";
  if (tier === "amber") return "var(--warn)";
  return "var(--danger)";
}

function tierNumColor(tier) {
  if (tier === "green") return "#8cf5d1";
  if (tier === "amber") return "#ffd875";
  return "#ff8f99";
}

function ScoreRing({ score, tier, description }) {
  const C = 138.23;
  const fill = score != null ? (score / 100) * C : 0;
  const stroke = tierColor(tier);
  const numColor = tierNumColor(tier);
  return (
    <div className="score-ring-wrap">
      <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
        <circle
          cx="30" cy="30" r="22"
          fill="none"
          stroke="var(--border)"
          strokeWidth="4"
        />
        <circle
          cx="30" cy="30" r="22"
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${C}`}
          transform="rotate(-90 30 30)"
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s ease", color: stroke }}
        />
      </svg>
      <span className="score-ring-num" style={{ color: numColor }}>
        {score != null ? score : "—"}
      </span>
      {description ? (
        <div className="score-ring-tooltip">{description}</div>
      ) : null}
    </div>
  );
}

function scoreDescription(score, isSafewalk = false) {
  if (score == null) return null;
  if (score >= 75) return "Excellent — well-lit streets with lots of open businesses and foot traffic the whole way. Safe to walk at any hour.";
  if (score >= 55) return "Good — solid lighting and plenty of businesses nearby. Most people would feel comfortable on this route.";
  if (score >= 35) return "Moderate — some stretches are quieter or darker. Fine during the day; take extra care at night.";
  if (isSafewalk) return "Low — limited amenities and lighting near this route. This is still the safest available option for this trip.";
  return "Low — limited lighting and few open businesses along this path. Consider taking the SafeWalk route instead.";
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
        <span className="geo-hint geo-hint--accent">
          <CheckCircle2 size={14} strokeWidth={2.5} />
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
  const [showOnboarding, setShowOnboarding] = useState(() => {
    localStorage.removeItem("safewalk_onboarded");
    return true;
  });
  const [sameRoute, setSameRoute] = useState(false);
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "teal";
    return window.localStorage.getItem("safewalk-theme") || "teal";
  });
  const lastSpokenStep = useRef(-1);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (theme === "teal") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    try { window.localStorage.setItem("safewalk-theme", theme); } catch {}
  }, [theme]);

  const apiBase = import.meta.env.VITE_API_BASE || "";

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
    const demoStart = { lat: 43.6479, lon: -79.4503, label: "Roncesvalles & Howard Park, Toronto" };
    const demoEnd = { lat: 43.6592, lon: -79.4660, label: "Bloor & Keele, Toronto" };
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
      setSameRoute(j.same_route || false);
    } catch (err) {
      setStandard(null);
      setSafewalk(null);
      setSameRoute(false);
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
      setSameRoute(j.same_route || false);
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
        body: JSON.stringify({ standard, safewalk, same_route: sameRoute }),
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

  const completeOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem("safewalk_onboarded", "true");
  };

  return (
    <>
      {showOnboarding && <Onboarding onComplete={completeOnboarding} />}
      <div className="app-shell">
        <aside className="side-panel">
          <div className="brand">
            <div className="brand-header">
              <img
                src={logo}
                alt="SafeWalk"
                className="brand-logo-img"
                width="56"
                height="56"
              />
              <h1 className="brand-wordmark">SafeWalk</h1>
              <div className="brand-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Open settings"
                  title="Settings"
                >
                  <SettingsIcon size={18} strokeWidth={2.25} />
                </button>
              </div>
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
              {loading ? (
                <>
                  <Loader2 size={16} strokeWidth={2.5} className="spin" />
                  Routing…
                </>
              ) : (
                <>
                  <Navigation size={16} strokeWidth={2.5} />
                  Compare routes
                </>
              )}
            </button>
            <div className="actions-row">
              <button
                className="btn-ghost"
                type="button"
                disabled={loading}
                onClick={runDemo}
              >
                {loading ? (
                  <>
                    <Loader2 size={14} strokeWidth={2.25} className="spin" />
                    Loading…
                  </>
                ) : (
                  <>
                    <Zap size={14} strokeWidth={2.25} />
                    Try Demo
                  </>
                )}
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={voiceEscort}
                disabled={narrateBusy || (!standard && !safewalk)}
              >
                {narrateBusy ? (
                  <>
                    <Loader2 size={14} strokeWidth={2.25} className="spin" />
                    Thinking…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} strokeWidth={2.25} />
                    Reasoning
                  </>
                )}
              </button>
            </div>
          </div>

          {error ? (
            <p className="error">
              <AlertTriangle size={16} strokeWidth={2.25} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </p>
          ) : null}
          {safewalk?.geometry?.length && !error ? (
            <p className="geo-hint maps-auto-hint">
              Green line = SafeWalk route · Red line = fastest route. Tap{" "}
              <strong>Walk here</strong> to start GPS navigation or{" "}
              <strong>Google Maps</strong> to open in browser.
            </p>
          ) : null}

          <div className="route-cards">
            <p className="route-cards-heading">Routes</p>
            {sameRoute ? (
              <div className="same-route-banner">
                <CheckCircle2 size={16} strokeWidth={2.5} />
                Only one route exists here — this is already the safest path available.
              </div>
            ) : null}

            {loading && !standard && !safewalk ? (
              <>
                <div className="route-card-skeleton">
                  <div className="skel-header-row">
                    <div className="skel-header-text">
                      <div className="skeleton skel-title" />
                      <div className="skeleton skel-subtitle" />
                    </div>
                    <div className="skeleton skel-ring" />
                  </div>
                  <div className="skel-stats-row">
                    <div className="skeleton skel-stat" />
                    <div className="skeleton skel-stat" />
                    <div className="skeleton skel-stat" />
                  </div>
                </div>
              </>
            ) : standard || safewalk ? (
              <>
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
                    <ScoreRing
                      score={standard?.safety?.score}
                      tier={standard?.safety?.tier}
                      description={scoreDescription(standard?.safety?.score)}
                    />
                  </div>
                  <div className="route-stats-grid">
                    <div className="route-stat">
                      <span className="route-stat-value">
                        <DurationLine durationMin={standard?.duration_min} />
                      </span>
                      <span className="route-stat-label"><Clock size={10} strokeWidth={2.5} />Time</span>
                    </div>
                    <div className="route-stat">
                      <span className="route-stat-value">{standard ? `${standard.distance_km} km` : "—"}</span>
                      <span className="route-stat-label"><Ruler size={10} strokeWidth={2.5} />Distance</span>
                    </div>
                    <div className="route-stat">
                      <span className="route-stat-value">{standard?.safety?.active_business_proximity_hits ?? "—"}</span>
                      <span className="route-stat-label"><Building2 size={10} strokeWidth={2.5} />Businesses</span>
                    </div>
                  </div>
                  <div className="route-card-actions">
                    <button
                      className="btn-walk"
                      type="button"
                      disabled={!standard?.steps?.length}
                      onClick={() => { setWalkMode("standard"); setFollowUser(true); setReportMode(false); }}
                    >
                      <Footprints size={14} strokeWidth={2.25} />
                      Walk here
                    </button>
                    <button
                      className="btn-google-maps"
                      type="button"
                      disabled={!standard?.geometry?.length}
                      onClick={() => openRouteInGoogleMaps(standard)}
                    >
                      <ExternalLink size={14} strokeWidth={2.25} />
                      Google Maps
                    </button>
                  </div>
                </div>

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
                    <ScoreRing
                      score={safewalk?.safety?.score}
                      tier={safewalk?.safety?.tier}
                      description={scoreDescription(safewalk?.safety?.score, true)}
                    />
                  </div>
                  <div className="route-stats-grid">
                    <div className="route-stat">
                      <span className="route-stat-value">
                        <DurationLine durationMin={safewalk?.duration_min} />
                      </span>
                      <span className="route-stat-label"><Clock size={10} strokeWidth={2.5} />Time</span>
                    </div>
                    <div className="route-stat">
                      <span className="route-stat-value">{safewalk ? `${safewalk.distance_km} km` : "—"}</span>
                      <span className="route-stat-label"><Ruler size={10} strokeWidth={2.5} />Distance</span>
                    </div>
                    <div className="route-stat">
                      <span className="route-stat-value">{safewalk?.safety?.active_business_proximity_hits ?? "—"}</span>
                      <span className="route-stat-label"><Building2 size={10} strokeWidth={2.5} />Businesses</span>
                    </div>
                  </div>
                  <div className="route-card-actions">
                    <button
                      className="btn-walk"
                      type="button"
                      disabled={!safewalk?.steps?.length}
                      onClick={() => { setWalkMode("safewalk"); setFollowUser(true); setReportMode(false); }}
                    >
                      <Footprints size={14} strokeWidth={2.25} />
                      Walk here
                    </button>
                    <button
                      className="btn-google-maps"
                      type="button"
                      disabled={!safewalk?.geometry?.length}
                      onClick={() => openRouteInGoogleMaps(safewalk)}
                    >
                      <ExternalLink size={14} strokeWidth={2.25} />
                      Google Maps
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {narration ? (
            <div className="narration">
              <header className="narration-header">
                <Sparkles size={14} strokeWidth={2.5} />
                AI Safety Summary
              </header>
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
                {reportMode ? (
                  <>
                    <XCircle size={14} strokeWidth={2.25} />
                    Cancel pin drop
                  </>
                ) : (
                  <>
                    <MapPin size={14} strokeWidth={2.25} />
                    Report on map
                  </>
                )}
              </button>
            </div>
            {reportMode ? (
              <p className="geo-hint">
                Tap the map where the issue is. Reports affect safety scores for everyone.
              </p>
            ) : null}
            {pendingReport ? (
              <div className="report-form">
                <p className="report-form-label">What are you reporting?</p>
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
                    <Send size={14} strokeWidth={2.25} />
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
                    ? { color: MAP_COLORS.standard, weight: 5, opacity: 0.22 }
                    : { color: MAP_COLORS.standard, weight: 7, opacity: 0.95 }
                }
              />
            ) : null}
            {safewalk?.geometry?.length ? (
              <Polyline
                positions={safewalk.geometry.map(([lon, lat]) => [lat, lon])}
                pathOptions={
                  walkMode === "standard"
                    ? { color: MAP_COLORS.safewalk, weight: 5, opacity: 0.22 }
                    : { color: MAP_COLORS.safewalk, weight: 7, opacity: 0.95 }
                }
              />
            ) : null}

            {walkMode && userPos ? (
              <>
                <Circle
                  center={[userPos.lat, userPos.lng]}
                  radius={Math.min(Math.max(userPos.accuracy || 25, 12), 120)}
                  pathOptions={{
                    color: MAP_COLORS.userRing,
                    fillColor: MAP_COLORS.userRing,
                    fillOpacity: 0.12,
                    weight: 1,
                  }}
                />
                <CircleMarker
                  center={[userPos.lat, userPos.lng]}
                  radius={7}
                  pathOptions={{
                    color: MAP_COLORS.userDot,
                    fillColor: MAP_COLORS.userRing,
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
                  color: MAP_COLORS.reportStroke,
                  fillColor: MAP_COLORS.reportFill,
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
                  color: MAP_COLORS.pendingMark,
                  fillColor: MAP_COLORS.pendingMark,
                  fillOpacity: 0.35,
                  weight: 3,
                }}
              />
            ) : null}
          </MapContainer>

          {walkMode ? (
            <div className="walk-hud" aria-live="polite">
              <div className="walk-hud-header">
                <div className="walk-hud-route-info">
                  <div className="walk-hud-route-icon">
                    <Navigation size={18} strokeWidth={2.5} />
                  </div>
                  <div className="walk-hud-route-label">
                    <strong>
                      {walkMode === "safewalk" ? "SafeWalk Route" : "Fastest Route"}
                    </strong>
                    <span className="walk-hud-sub">Live navigation</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-hud-stop"
                  onClick={() => {
                    setWalkMode(null);
                    if (window.speechSynthesis) {
                      window.speechSynthesis.cancel();
                    }
                  }}
                >
                  <XCircle size={14} strokeWidth={2.5} />
                  End
                </button>
              </div>
              {geoError ? (
                <p className="error walk-hud-msg">
                  <AlertTriangle size={14} strokeWidth={2.25} style={{ flexShrink: 0 }} />
                  <span>{geoError}</span>
                </p>
              ) : null}
              {!userPos && !geoError ? (
                <p className="geo-hint walk-hud-msg">Acquiring GPS…</p>
              ) : null}
              {walkDerived.snapshot ? (
                <>
                  <div className="walk-hud-next-block">
                    <p className="walk-next-label">Next</p>
                    <p className="walk-next-text">
                      {walkDerived.snapshot.nextInstruction}
                    </p>
                    <div className="walk-stats">
                      <span>
                        <strong>~{Math.round(walkDerived.snapshot.remainingStepM)} m</strong> to maneuver
                      </span>
                      <span className="walk-dot">·</span>
                      <span>
                        ETA <strong>~{Math.max(1, Math.round(walkDerived.snapshot.etaMin))} min</strong>
                      </span>
                      <span className="walk-dot">·</span>
                      <span>
                        <strong>{Math.round(walkDerived.snapshot.remainingM)} m</strong> left
                      </span>
                    </div>
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
                      <AlertTriangle size={14} strokeWidth={2.5} />
                      Step back toward the line (~{Math.round(walkDerived.crossTrackM)} m off route)
                    </p>
                  ) : null}
                  {walkDerived.snapshot.atDestination ? (
                    <p className="walk-arrived">
                      <CheckCircle2 size={14} strokeWidth={2.5} />
                      You've reached the destination area.
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
                  {followUser ? (
                    <><Crosshair size={13} strokeWidth={2.5} /> Following</>
                  ) : (
                    <><MapIcon size={13} strokeWidth={2.5} /> Free map</>
                  )}
                </button>
                <button
                  type="button"
                  className={voiceGuidance ? "btn-primary" : "btn-ghost"}
                  onClick={() => setVoiceGuidance((v) => !v)}
                >
                  {voiceGuidance ? (
                    <><Volume2 size={13} strokeWidth={2.5} /> Voice on</>
                  ) : (
                    <><VolumeX size={13} strokeWidth={2.5} /> Voice off</>
                  )}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setFollowUser(true)}
                >
                  <LocateFixed size={13} strokeWidth={2.5} />
                  Recenter
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => openRouteInGoogleMaps(activeWalkRoute)}
                >
                  <ExternalLink size={13} strokeWidth={2.5} />
                  Maps
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          theme={theme}
          onThemeChange={setTheme}
        />
      </div>
    </>
  );
}
