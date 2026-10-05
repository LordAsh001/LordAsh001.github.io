#!/usr/bin/env python3
"""Fetch public numbers for the Via Scholaris YouTube channel and write youtube.json.

Runs in GitHub Actions once a day. Needs one secret, YT_API_KEY: a YouTube Data API
key from Google Cloud. Nothing here touches the website's words — only the numbers
shown on the Via Scholaris card.
"""
import json, os, sys, urllib.parse, urllib.request
from datetime import datetime, timezone

API = "https://www.googleapis.com/youtube/v3/"
KEY = os.environ.get("YT_API_KEY", "").strip()
CHANNEL = os.environ.get("CHANNEL_ID", "UCT7uDSjVcGoPUHdcY-vvmig").strip()
OUT = "youtube.json"


def get(endpoint, **params):
    params["key"] = KEY
    url = API + endpoint + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def main():
    if not KEY:
        print("No YT_API_KEY set — leaving youtube.json untouched.")
        return 0

    ch = get("channels", part="statistics,contentDetails,snippet", id=CHANNEL)
    items = ch.get("items") or []
    if not items:
        print("Channel not found:", CHANNEL)
        return 1
    stats = items[0]["statistics"]
    uploads = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

    latest = []
    pl = get("playlistItems", part="snippet", playlistId=uploads, maxResults=3)
    for it in pl.get("items", []):
        s = it["snippet"]
        vid = s["resourceId"]["videoId"]
        thumbs = s.get("thumbnails", {})
        thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url", "")
        latest.append({
            "id": vid,
            "title": s.get("title", ""),
            "published": s.get("publishedAt", "")[:10],
            "url": "https://www.youtube.com/watch?v=" + vid,
            "thumb": thumb,
        })

    data = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "channel": {
            "id": CHANNEL,
            "url": "https://www.youtube.com/@viascholaris",
            "subscribers": int(stats.get("subscriberCount", 0)),
            "videos": int(stats.get("videoCount", 0)),
            "views": int(stats.get("viewCount", 0)),
        },
        "latest": latest,
    }

    old = None
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT))
        except Exception:
            old = None
    if old and old.get("channel") == data["channel"] and old.get("latest") == data["latest"]:
        print("No change in the numbers.")
        return 0

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Wrote", OUT, data["channel"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
