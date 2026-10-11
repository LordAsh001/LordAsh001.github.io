"""Run every collector, merge the results and write the atlas feed.

Usage:  python bots/collect.py [--out market-atlas/data] [--only kasuwa_api,lcfe]

Writes
  <out>/prices-latest.json   newest record per source × place × commodity × month (what the atlas loads)
  <out>/status.json          per-source health: ok, records, error, last success
  <out>/history/YYYY-MM.csv  append-only log of every record seen, deduplicated
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Blocked, now_iso  # noqa: E402
from sources import REGISTRY  # noqa: E402

FIELDS = ["src", "c", "price", "unit", "per", "date", "scope", "where", "name", "state", "undated", "series"]


def key(r):
    w = ",".join(r["where"]) if isinstance(r["where"], list) else r["where"]
    return (r["src"], r["c"], r["scope"], w, r["date"], r.get("series", ""), r["unit"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "market-atlas" / "data"))
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "history").mkdir(exist_ok=True)

    prev = {}
    if (out / "prices-latest.json").exists():
        for r in json.loads((out / "prices-latest.json").read_text()).get("records", []):
            prev.setdefault(r["src"], []).append(r)
    prev_status = json.loads((out / "status.json").read_text()).get("sources", {}) if (out / "status.json").exists() else {}

    only = {s for s in a.only.split(",") if s}
    records, status = [], {}
    for name, fn in REGISTRY.items():
        if only and name not in only:
            records += prev.get(name, [])
            if name in prev_status:
                status[name] = prev_status[name]
            continue
        try:
            got = fn()
            if not got:
                raise RuntimeError("page read, but no prices recognised (layout may have changed)")
            records += got
            status[name] = {"ok": True, "records": len(got), "checked": now_iso(), "last_success": now_iso()}
            print(f"[ok]   {name}: {len(got)} records")
        except Blocked as e:
            records += prev.get(name, [])
            status[name] = {"ok": False, "error": str(e), "checked": now_iso(),
                            "last_success": prev_status.get(name, {}).get("last_success")}
            print(f"[skip] {name}: {e}")
        except Exception as e:  # keep yesterday's data for this source and carry on
            records += prev.get(name, [])
            status[name] = {"ok": False, "error": f"{type(e).__name__}: {e}"[:300], "checked": now_iso(),
                            "last_success": prev_status.get(name, {}).get("last_success")}
            print(f"[fail] {name}: {e}")
            traceback.print_exc(limit=1)

    # deduplicate (last one wins)
    uniq = {}
    for r in records:
        uniq[key(r)] = r
    records = sorted(uniq.values(), key=lambda r: (r["src"], r["c"], r["date"]))

    stamp = now_iso()
    (out / "prices-latest.json").write_text(json.dumps({"generated": stamp, "records": records}, ensure_ascii=False, separators=(",", ":")))
    (out / "status.json").write_text(json.dumps({"generated": stamp, "sources": status}, indent=1))

    # history log, one file per month of collection
    hist = out / "history" / f"{stamp[:7]}.csv"
    seen = set()
    if hist.exists():
        with hist.open() as f:
            for row in csv.DictReader(f):
                seen.add((row["src"], row["c"], row["scope"], row["where"], row["date"], row["price"]))
    new = 0
    with hist.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["collected"] + FIELDS, extrasaction="ignore")
        if not seen:
            w.writeheader()
        for r in records:
            row = dict(r, where=",".join(r["where"]) if isinstance(r["where"], list) else r["where"], collected=stamp[:10])
            k = (row["src"], row["c"], row["scope"], row["where"], row["date"], str(row["price"]))
            if k not in seen:
                w.writerow(row)
                seen.add(k)
                new += 1
    ok = sum(1 for s in status.values() if s["ok"])
    print(f"\n{len(records)} records in feed, {new} new history rows, {ok}/{len(status)} sources ok")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
