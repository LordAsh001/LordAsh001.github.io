"""Build market-atlas/data/fuel-reports.json from community fuel-price reports sent through a Tally form.

Hidden fields on the form: product, kind, price, state, lga, town, station, date
Environment: TALLY_API_KEY (secret) and TALLY_FUEL_FORM_ID (e.g. xXk2Zy). Without them the script exits quietly.
Moderation: put a submission id on its own line in bots/fuel_reports_blocklist.txt to drop it.
Only the last 90 days are kept; the atlas uses the median of recent reports per state.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import norm_state  # noqa: E402
from market_days import fetch_submissions  # noqa: E402

HERE = Path(__file__).resolve().parent
FIELDS = ["product", "kind", "price", "state", "lga", "town", "station", "date"]
LIMITS = {"pms": (300, 6000), "ago": (300, 8000), "dpk": (300, 8000), "lpg": (200, 6000)}


def flatten(subs, questions):
    title = {q.get("id"): (q.get("title") or q.get("name") or "").strip() for q in questions}
    out = []
    for s in subs:
        row = {"_id": s.get("id"), "_at": s.get("submittedAt") or s.get("createdAt")}
        for r in s.get("responses") or []:
            k, v = title.get(r.get("questionId"), ""), r.get("value")
            if isinstance(v, list):
                v = ", ".join(map(str, v))
            if k in FIELDS and v not in (None, ""):
                row[k] = str(v).strip()
        out.append(row)
    return out


def build(rows, blocked, days=90):
    today = date.today()
    cutoff = (today - timedelta(days=days)).isoformat()
    out = []
    for r in rows:
        if r["_id"] in blocked:
            continue
        p, kind, st = r.get("product"), r.get("kind"), norm_state(r.get("state"))
        d = r.get("date") or (r.get("_at") or "")[:10]
        try:
            price = float(r.get("price", ""))
        except ValueError:
            continue
        if p not in LIMITS or kind not in ("pump", "black") or not st:
            continue
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) or d > today.isoformat() or d < cutoff:
            continue
        lo, hi = LIMITS[p]
        if not lo <= price <= hi:
            continue
        out.append({"id": r["_id"], "product": p, "kind": kind, "price": round(price, 2), "state": st,
                    "lga": r.get("lga", "")[:60], "town": r.get("town", "")[:60], "station": r.get("station", "")[:60], "date": d})
    return sorted(out, key=lambda x: x["date"], reverse=True)


def main():
    key, form = os.environ.get("TALLY_API_KEY"), os.environ.get("TALLY_FUEL_FORM_ID")
    if not (key and form):
        print("fuel reports: TALLY_API_KEY / TALLY_FUEL_FORM_ID not set, skipping")
        return 0
    out = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / "market-atlas" / "data")
    out.mkdir(parents=True, exist_ok=True)
    bl = HERE / "fuel_reports_blocklist.txt"
    blocked = {l.strip() for l in bl.read_text().splitlines() if l.strip() and not l.startswith("#")} if bl.exists() else set()
    subs, qs = fetch_submissions(form, key)
    reports = build(flatten(subs, qs), blocked)
    (out / "fuel-reports.json").write_text(json.dumps({"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                                       "reports": reports}, ensure_ascii=False, indent=1))
    print(f"fuel reports: {len(reports)} kept from {len(subs)} submissions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
