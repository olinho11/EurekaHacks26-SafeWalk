"""
SafeWalk API: routes, geocode, AI narration, crowdsourced reports.
"""

from __future__ import annotations

import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from engine import compute_routes, geocode
from reports_store import append_report, load_reports

app = Flask(__name__)
CORS(app)


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
    result = compute_routes(s_lat, s_lon, e_lat, e_lon)
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
    standard = body.get("standard")
    safewalk = body.get("safewalk")
    api_key = os.environ.get("ANTHROPIC_API_KEY")

    def fallback() -> str:
        std_s = (standard or {}).get("safety", {}).get("score", "?")
        safe_s = (safewalk or {}).get("safety", {}).get("score", "?")
        dm = (safewalk or {}).get("duration_min", "?")
        return (
            f"SafeWalk picked the greener route with safety score {safe_s} "
            f"(about {dm} minutes). The faster option scores around {std_s} on our "
            f"lighting and foot-traffic model—stick to the SafeWalk path when you "
            f"want natural surveillance from open shops and better-lit streets."
        )

    if not api_key:
        return jsonify({"text": fallback(), "source": "fallback"})

    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=280,
            system=(
                "You are SafeWalk, a calm walking safety companion. "
                "Give 3–5 short sentences. Mention lighting, businesses, and route choice. "
                "No panic language; practical and reassuring."
            ),
            messages=[
                {
                    "role": "user",
                    "content": f"Compare routes for walking safety (JSON): {body}",
                }
            ],
        )
        text = message.content[0].text.strip() if message.content else ""
        if not text:
            text = fallback()
        return jsonify({"text": text, "source": "claude"})
    except Exception:
        return jsonify({"text": fallback(), "source": "fallback"})


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
    app.run(host="0.0.0.0", port=port, debug=True)
