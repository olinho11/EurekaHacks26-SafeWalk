# SafeWalk

> Navigation that favors natural surveillance — lit streets, foot traffic, and open businesses — so you can reclaim the night.

**Live demo: [safewalk-eurekahacks.vercel.app](https://safewalk-eurekahacks.vercel.app)**

SafeWalk is a pedestrian safety navigation app that routes you through streets with **natural surveillance** (Jane Jacobs' *"eyes on the street"* theory) rather than just the fastest path. It compares the fastest route against a safety-optimized alternative, scoring each on lighting, active businesses, and real-time community reports.

---

## The Problem

**60% of people feel more anxious walking home after 9 PM.** Standard navigation apps optimize for speed. SafeWalk optimizes for presence — routes where open shops, lit streets, and other pedestrians naturally deter risk.

---

## Features

- **Dual-route comparison** — Side-by-side fastest vs. safest route with 0–100 safety scores
- **Safety scoring algorithm** — Three-component model: lit road coverage (45 pts), active business proximity (30 pts), isolation penalty (−25 pts)
- **Perpendicular via-point routing** — Searches 90° left and right of the direct corridor to force genuinely different route candidates through OSRM
- **Time-of-day awareness** — Business scores scale down at night (15% weight between midnight–6 AM); lit road coverage is constant since streets are lit regardless of hour
- **Crowdsourced reports** — Users pin safety concerns (streetlights out, blocked sidewalks, safety concerns) directly on the map; reports apply a distance-weighted penalty to safety scores
- **AI Safety Summary** — Claude narrates why SafeWalk chose the safer route in plain language
- **Live GPS walk mode** — Real-time turn-by-turn navigation with progress bar, off-route detection, and voice guidance
- **Google Maps handoff** — Open any route in Google Maps walking directions with one tap
- **Demo mode** — One-click preset (Roncesvalles → High Park → Bloor & Keele, Toronto) that shows a 30+ point score gap between the dark park shortcut and the lit street alternative
- **Theme picker** — Five accent color themes (Teal, Amber, Blue, Purple, Rose)
- **Settings modal** — About, Privacy Policy, Terms of Service, and built-with credits

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite, Leaflet / react-leaflet, Lucide Icons |
| Backend | Python, Flask, Flask-CORS |
| Routing | OSRM (OpenStreetMap Routing Machine, public foot profile) |
| Amenity + lighting data | Overpass API (OpenStreetMap) |
| Geocoding | Nominatim (OpenStreetMap) |
| AI narration | Anthropic Claude (Haiku) |
| Reports store | JSON flat file |

---

## Safety Score (0–100)

| Component | Max pts | What it measures |
|---|---|---|
| Lit road coverage | 45 | % of route within 100 m of a `lit=yes` road center |
| Business coverage | 30 | % of route within 80 m of an open business (time-scaled) |
| Isolation penalty | −25 | % of route with no business AND no lit road within 150 m |
| Base | 20 | Any walkable route |

| Tier | Score | Meaning |
|---|---|---|
| Green | ≥ 65 | Well-lit, high natural surveillance |
| Amber | ≥ 35 | Moderate — fine by day, take care at night |
| Red | < 35 | Low lighting and few businesses nearby |

---

## Getting Started

### Requirements

- Python 3.10+
- Node.js 18+
- Anthropic API key (optional — falls back to a static summary without it)

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export ANTHROPIC_API_KEY="your-key-here"   # optional
python app.py
# → running on http://localhost:5050
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → running on http://localhost:5173
```

Open **http://localhost:5173** and hit **Try Demo** to see the High Park route comparison immediately.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/geocode?q=...` | Address autocomplete (Nominatim) |
| `POST` | `/api/routes` | Compute fastest + safest route |
| `POST` | `/api/narrate` | AI summary of route comparison |
| `GET` | `/api/reports` | List all community reports |
| `POST` | `/api/reports` | Submit a new safety report |

### POST /api/routes

```json
{
  "start": { "lat": 43.6479, "lon": -79.4503 },
  "end":   { "lat": 43.6592, "lon": -79.4660 }
}
```

Response includes `standard`, `safewalk`, and `same_route` flag. Each route contains geometry, steps, duration, distance, and a full safety breakdown.

---

## Project Structure

```
safewalk/
├── backend/
│   ├── app.py            # Flask API server + Claude narration
│   ├── engine.py         # Routing, via-point search, safety scoring
│   ├── reports_store.py  # Crowdsourced report persistence
│   ├── requirements.txt
│   └── data/
│       └── reports.json  # Persisted community reports
└── frontend/
    └── src/
        ├── App.jsx        # Main React app (map, sidebar, walk mode, settings)
        ├── App.css        # Design system (tokens, glassmorphism, animations)
        ├── walkUtils.js   # GPS projection + walk snapshot logic
        └── assets/
            └── logo.png   # App icon
```

---

## The Science

SafeWalk is grounded in **Jane Jacobs' urban safety theory** from *The Death and Life of Great American Cities* (1961): safety in cities comes not from police but from the density of people going about their daily lives — the "eyes on the street." A route past open cafes and busy intersections is safer than a shortcut through a quiet park, even if it takes two extra minutes.

The demo makes this concrete: the direct path through High Park scores **34.7 / 100** (35% lit, red tier). The SafeWalk route around Roncesvalles and Bloor scores **65.5 / 100** (75% lit, green tier). One extra kilometre, thirty points safer.

---

Built for hackathon · Powered by OpenStreetMap + Anthropic Claude
