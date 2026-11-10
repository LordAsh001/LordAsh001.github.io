"""Weekly: news headlines about local government in each state, from the open GDELT index.

Stores only the headline, publisher, date and link: the articles stay on their publishers' sites.
A headline that names an LGA and a chairman becomes a candidate for a person to check.
"""
import datetime as dt
import json
import re
import sys
import time
import urllib.parse

from common import HERE, candidate_id, domain, read_json, source_type, write_json
from extract import name_pattern
from store import finish, load_candidates, rejected_ids

URL = "https://api.gdeltproject.org/api/v2/doc/doc?query={q}&mode=artlist&format=json&maxrecords=40&timespan=14d&sort=datedesc"
TOPIC = re.compile(r"chairman|chairperson|caretaker|local government|\bLGAs?\b|council (poll|election)|LCDA", re.I)
CHAIR = re.compile(r"chairman|chairperson|caretaker|sworn|inaugurat", re.I)
KEEP = 12


def seen_iso(s):
    try:
        return dt.datetime.strptime(s, "%Y%m%dT%H%M%SZ").date().isoformat()
    except Exception:  # noqa: BLE001
        return ""


def main():
    lgas = json.loads((HERE / "lgas.json").read_text(encoding="utf-8"))
    news = read_json("news.json", {"states": {}})
    items, new, gone = load_candidates(), [], rejected_ids()
    for state, names in lgas.items():
        q = f'"local government" "{state}" Nigeria'
        try:
            raw = http_get(URL.format(q=urllib.parse.quote(q)), retries=1)
            arts = json.loads(raw).get("articles", []) if raw.strip().startswith("{") else []
        except Exception as e:  # noqa: BLE001 - GDELT is sometimes unavailable
            print("WARN", state, e, file=sys.stderr)
            arts = []
        time.sleep(6)
        have = {n["url"]: n for n in news["states"].get(state, [])}
        for a in arts:
            title, url = (a.get("title") or "").strip(), a.get("url") or ""
            if not url or not TOPIC.search(title) or source_type(url) == "directory":
                continue
            if not (state.lower() in title.lower() or any(name_pattern(n).search(title) for n in names)):
                continue
            have.setdefault(url, {"title": title, "url": url, "domain": a.get("domain") or domain(url), "seen": seen_iso(a.get("seendate", ""))})
            if CHAIR.search(title):
                for lga in names:
                    if name_pattern(lga).search(title):
                        cid = candidate_id("chairman", state, lga, url)
                        if cid not in gone and not any(c["id"] == cid for c in items):
                            c = {"id": cid, "type": "chairman-news", "state": state, "lga": lga, "title": title,
                                 "source": url, "domain": domain(url), "source_type": "news", "found": seen_iso(a.get("seendate", ""))}
                            items.append(c)
                            new.append(c)
        news["states"][state] = sorted(have.values(), key=lambda n: n["seen"], reverse=True)[:KEEP]
    write_json("news.json", news)
    finish(items, new, "News scan")


if __name__ == "__main__":
    main()
