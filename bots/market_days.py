"""Build market-atlas/data/market-days.json from community reports sent through a Tally form.

The atlas page collects every field itself and opens the Tally form with them as hidden fields,
so the form only needs these hidden fields (names must match exactly):
  name, localName, state, lga, anchor, cycle, goods, notes, lat, lng, locMethod,
  reporterDistanceKm, updates, confirmDate
`updates` carries the id of an existing market when the report is a correction or confirmation.

Environment: TALLY_API_KEY (GitHub secret), TALLY_FORM_ID (e.g. abcd12). Without them the script exits quietly.
Moderation: put a submission id on its own line in bots/market_days_blocklist.txt to drop it.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import norm_state  # noqa: E402

HERE = Path(__file__).resolve().parent
API = "https://api.tally.so/forms/{form}/submissions"
FIELDS = ["name", "localName", "state", "lga", "anchor", "cycle", "goods", "notes", "lat", "lng", "locMethod",
          "reporterDistanceKm", "updates", "confirmDate"]


def fetch_submissions(form: str, key: str) -> tuple[list, list]:
    import requests
    subs, questions, page = [], [], 1
    while True:
        r = requests.get(API.format(form=form), params={"page": page, "filter": "completed"},
                         headers={"Authorization": f"Bearer {key}"}, timeout=40)
        r.raise_for_status()
        j = r.json()
        questions = j.get("questions") or questions
        subs += j.get("submissions") or []
        if not j.get("hasMore") or page > 50:
            break
        page += 1
    return subs, questions


def flatten(subs: list, questions: list) -> list[dict]:
    """Turn Tally submissions into flat dicts keyed by hidden-field name."""
    title = {q.get("id"): (q.get("title") or q.get("name") or "").strip() for q in questions}
    out = []
    for s in subs:
        row = {"_id": s.get("id"), "_at": s.get("submittedAt") or s.get("createdAt")}
        for resp in s.get("responses") or []:
            k = title.get(resp.get("questionId"), "")
            v = resp.get("value")
            if isinstance(v, list):
                v = ", ".join(map(str, v))
            if k in FIELDS and v not in (None, ""):
                row[k] = str(v).strip()
        out.append(row)
    return sorted(out, key=lambda r: r.get("_at") or "")


def _num(v, lo, hi):
    try:
        x = float(v)
        return x if lo <= x <= hi else None
    except (TypeError, ValueError):
        return None


def build(rows: list[dict], blocked: set[str]) -> list[dict]:
    today = date.today().isoformat()
    entries: dict[str, dict] = {}
    for r in rows:
        if r["_id"] in blocked:
            continue
        at = (r.get("_at") or today)[:19]
        target = r.get("updates")
        if target and target in entries:
            e = entries[target]
            if r.get("confirmDate") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", r["confirmDate"]) and r["confirmDate"] <= today:
                if r["confirmDate"] > e["anchor"]:
                    e["anchor"] = r["confirmDate"]
                e["reports"] += 1
                e["history"].append({"at": at, "what": f"confirmed held on {r['confirmDate']}"})
            else:
                changed = []
                for k in ("name", "localName", "lga", "anchor", "cycle", "goods", "notes"):
                    if r.get(k) and str(e.get(k)) != r[k]:
                        e[k] = int(r[k]) if k == "cycle" and r[k].isdigit() else r[k]
                        changed.append(k)
                lat, lng = _num(r.get("lat"), 3, 15), _num(r.get("lng"), 2, 15)
                if lat and lng:
                    e["lat"], e["lng"], e["locMethod"] = round(lat, 5), round(lng, 5), r.get("locMethod", "map")
                e["history"].append({"at": at, "what": "updated " + (", ".join(changed) or "details")})
            e["status"] = "confirmed" if e["reports"] >= 2 else e["status"]
            e["updatedAt"] = at
            continue
        # a new market report
        st = norm_state(r.get("state"))
        cyc = _num(r.get("cycle"), 1, 60)
        anchor = r.get("anchor", "")
        if not (r.get("name") and st and r.get("lga") and cyc and re.fullmatch(r"\d{4}-\d{2}-\d{2}", anchor) and anchor <= today):
            continue
        lat, lng = _num(r.get("lat"), 3, 15), _num(r.get("lng"), 2, 15)
        entries[r["_id"]] = {
            "id": r["_id"], "name": r["name"][:80], "localName": r.get("localName", "")[:60], "state": st, "lga": r["lga"][:60],
            "anchor": anchor, "cycle": int(cyc), "goods": r.get("goods", "")[:140], "notes": r.get("notes", "")[:200],
            "lat": round(lat, 5) if lat and lng else None, "lng": round(lng, 5) if lat and lng else None,
            "locMethod": r.get("locMethod", "lga") if lat and lng else "lga",
            "reporterDistanceKm": _num(r.get("reporterDistanceKm"), 0, 2000),
            "status": "reported", "reports": 1, "createdAt": at, "updatedAt": at,
            "history": [{"at": at, "what": "first reported"}],
        }
    for e in entries.values():
        e["history"] = e["history"][-25:]
    return sorted(entries.values(), key=lambda e: (e["state"], e["lga"], e["name"]))


def main():
    key, form = os.environ.get("TALLY_API_KEY"), os.environ.get("TALLY_FORM_ID")
    if not (key and form):
        print("market days: TALLY_API_KEY / TALLY_FORM_ID not set, skipping")
        return 0
    out = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / "market-atlas" / "data")
    out.mkdir(parents=True, exist_ok=True)
    bl = HERE / "market_days_blocklist.txt"
    blocked = {l.strip() for l in bl.read_text().splitlines() if l.strip() and not l.startswith("#")} if bl.exists() else set()
    subs, qs = fetch_submissions(form, key)
    entries = build(flatten(subs, qs), blocked)
    (out / "market-days.json").write_text(json.dumps({
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "entries": entries}, ensure_ascii=False, indent=1))
    print(f"market days: {len(entries)} markets from {len(subs)} submissions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
