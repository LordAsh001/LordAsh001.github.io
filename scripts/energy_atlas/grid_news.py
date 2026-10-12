"""News radar for possible national grid collapses -> energy-atlas/data/grid_news.json.

Uses the open GDELT 2.0 DOC API (machine-readable news index) to list recent articles that
mention a grid collapse/disturbance in Nigeria. Items are shown on the atlas as UNVERIFIED and
a GitHub issue is opened so a person can confirm against NERC/NISO before adding the event to
the official timeline. Runs every 6 hours.
"""
import datetime as dt
import json
import re
import sys

from common import add_issue_note, http_get, now_iso, q, read_json, write_json

QUERY = '("national grid" OR "power grid") (collapse OR collapsed OR disturbance OR blackout) (Nigeria OR TCN OR NISO OR NERC)'
URL = "https://api.gdeltproject.org/api/v2/doc/doc?query={q}&mode=artlist&format=json&maxrecords=75&timespan=3d&sort=datedesc"
KEEP_DAYS = 90
TITLE_RE = re.compile(r"grid", re.I)
EVENT_RE = re.compile(r"collaps|disturbance|blackout|outage|trip", re.I)
NG_RE = re.compile(r"nigeria|tcn|niso|nerc|disco|abuja|lagos|kano|ikeja|eko", re.I)


def parse_seen(s):
    try:
        return dt.datetime.strptime(s, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc)
    except Exception:  # noqa: BLE001
        return None


def main():
    try:
        raw = http_get(URL.format(q=q(QUERY)), retries=2)
        arts = json.loads(raw).get("articles", []) if raw.strip().startswith("{") else []
    except Exception as e:  # GDELT is occasionally unavailable; skip quietly
        print("WARN GDELT unavailable:", e, file=sys.stderr)
        return
    old = read_json("grid_news.json", {"items": []})
    known = {i["url"] for i in old.get("items", [])}
    items, new = list(old.get("items", [])), []
    for a in arts:
        t, u = a.get("title", ""), a.get("url", "")
        if not u or u in known:
            continue
        if not (TITLE_RE.search(t) and EVENT_RE.search(t) and (NG_RE.search(t) or a.get("sourcecountry") == "Nigeria")):
            continue
        seen = parse_seen(a.get("seendate", ""))
        it = {"title": t.strip(), "url": u, "domain": a.get("domain", ""),
              "seen": seen.isoformat() if seen else now_iso(), "status": "unverified"}
        items.append(it)
        known.add(u)
        new.append(it)
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=KEEP_DAYS)
    items = [i for i in items if dt.datetime.fromisoformat(i["seen"]) >= cutoff]
    items.sort(key=lambda i: i["seen"], reverse=True)
    write_json("grid_news.json", {"source": "GDELT 2.0 DOC API (news index)", "query": QUERY,
                                  "note": "Automatically collected headlines; not verified.",
                                  "checked": now_iso(), "items": items[:60]})
    add_issue_note("Possible grid event in the news — verify before adding to the timeline",
                   [f"- [ ] [{i['title']}]({i['url']}) ({i['domain']}, {i['seen'][:16]} UTC)" for i in new])


if __name__ == "__main__":
    main()
