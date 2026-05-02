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
    hf_token = os.environ.get("HF_TOKEN")

    def fallback() -> str:
        same = body.get("same_route", False)
        safe_s = (safewalk or {}).get("safety", {}).get("score", "?")
        std_s = (standard or {}).get("safety", {}).get("score", "?")
        dm = (safewalk or {}).get("duration_min", "?")
        if same:
            return (
                f"There's only one viable route for this trip, scoring {safe_s}/100 "
                f"on our lighting and foot-traffic model. "
                f"It takes about {dm} minutes. Stay on well-lit sections and keep your route visible to others."
            )
        if safe_s == std_s:
            return (
                f"Both routes score similarly ({safe_s}/100) — the area has consistent "
                f"lighting and business density along both paths. "
                f"The SafeWalk route is slightly preferred. Walk takes about {dm} minutes."
            )
        return (
            f"SafeWalk chose the route scoring {safe_s}/100 over the faster option at {std_s}/100. "
            f"The difference comes down to more open businesses and better-lit streets along the SafeWalk path. "
            f"About {dm} minutes."
        )

    if not hf_token:
        return jsonify({"text": fallback(), "source": "fallback"})

    try:
        from huggingface_hub import InferenceClient

        client = InferenceClient(api_key=hf_token)
        messages = [
            {
                "role": "system",
                "content": "You are SafeWalk, a calm walking safety companion. Give 3-5 short sentences. Mention lighting, businesses, and route choice. No panic language; practical and reassuring.",
            },
            {
                "role": "user",
                "content": f"Compare routes for walking safety (JSON): {body}",
            },
        ]
        response = client.chat_completion(
            model="mistralai/Mistral-7B-Instruct-v0.3",
            messages=messages,
            max_tokens=280,
        )
        text = response.choices[0].message.content.strip() if response.choices else ""
        if not text:
            text = fallback()
        return jsonify({"text": text, "source": "huggingface"})
    except Exception as e:
        print(f"HF Error: {e}")
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
