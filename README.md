# 🛡️ SafeWalk

> Navigation that favors natural surveillance — lit streets, foot traffic, and open businesses — so you can reclaim the night.

SafeWalk is a pedestrian safety navigation app that routes you through streets with **natural surveillance** (Jane Jacobs' *"eyes on the street"* theory) rather than just the fastest path. It weighs lighting, nearby businesses, foot traffic, and real-time community reports to recommend the safest walking route.

---

## The Problem

**60% of people feel more anxious walking home after 9 PM.** Standard navigation apps optimize for speed. SafeWalk optimizes for presence — routes where open shops, lit streets, and other pedestrians naturally deter risk.

---

## Features

- **Dual-route comparison** — Side-by-side fastest vs. safest route with safety scores
- **Safety scoring algorithm** — Heuristic model scoring routes on lighting, active businesses, and foot traffic proximity using OpenStreetMap data
- **Time-of-day awareness** — Business proximity scores automatically reduce at night (businesses count for 15% of their daytime value between midnight–6 AM)
- **Crowdsourced reports** — Users pin safety concerns (streetlights out, blocked sidewalks, safety concerns) directly on the map; reports apply a distance-weighted penalty to safety scores
- **AI Safety Summary** — Claude (Haiku) narrates why SafeWalk chose the safer route in plain language
- **Live GPS walk mode** — Real-time turn-by-turn navigation with progress tracking and off-route detection
- **Google Maps handoff** — Open any route in Google Maps walking directions with one tap
- **Demo mode** — One-click preset route (King & Simcoe → Bloor & Avenue, Toronto) for instant demos

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite, Leaflet / react-leaflet |
| Backend | Python, Flask, Flask-CORS |
| Routing | OSRM (OpenStreetMap Routing Machine) |
| Amenity data | Overpass API (OpenStreetMap) |
| Geocoding | Nominatim (OpenStreetMap) |
| AI narration | Anthropic Claude (Haiku) |
| Reports store | JSON flat file |

---

## Safety Score

Scores are computed per route on a **0–500 scale**:

| Tier | Score | Meaning |
|---|---|---|
| 🟢 Green | ≥ 300 | Well-lit, high natural surveillance |
| 🟡 Amber | ≥ 150 | Moderate surveillance |
| 🔴 Red | < 150 | Low lighting and foot traffic |

The score rewards:
- Proximity to open businesses (cafes, restaurants, shops)
- Density of lit infrastructure
- Foot traffic indicators

It penalizes:
- Community-reported hazards (weighted by type: streetlights > harassment > construction)
- Late-night routes where businesses are closed

---

## Getting Started

### Requirements

- Python 3.10+
- Node.js 18+
- An Anthropic API key (optional — falls back to a static summary without it)

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

Open **http://localhost:5173** in your browser.

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
  "start": { "lat": 43.6437, "lon": -79.3799 },
  "end":   { "lat": 43.6750, "lon": -79.3950 }
}
```

---

## Project Structure

```
safewalk/
├── backend/
│   ├── app.py            # Flask API server
│   ├── engine.py         # Routing + safety scoring algorithm
│   ├── reports_store.py  # Crowdsourced report persistence
│   ├── requirements.txt
│   └── data/
│       └── reports.json  # Persisted community reports
└── frontend/
    └── src/
        ├── App.jsx        # Main React component
        ├── App.css        # Styles
        └── walkUtils.js   # GPS projection + walk snapshot logic
```

---

## The Science

SafeWalk is grounded in **Jane Jacobs' urban safety theory** from *The Death and Life of Great American Cities* (1961): safety in cities comes not from police but from the density of people going about their daily lives — the "eyes on the street." A route past open cafes and busy intersections is safer than a shortcut through a quiet alley, even if it takes two extra minutes.

---

Built for hackathon · Powered by OpenStreetMap + Anthropic Claude
