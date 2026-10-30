"""UNESCO Institute for Statistics: Nigerian students in tertiary education abroad -> data/students.json.

Indicator 26458 = inbound internationally mobile students from Nigeria, reported by each host country.
Indicator OE.5T8.40510 = total outbound internationally mobile tertiary students from Nigeria.
UIS releases new data a few times a year; a monthly check is enough.
"""
import datetime
import json
import sys

from common import ISO3_TO_M49, add_issue_note, http_get, now_iso, read_json, write_json

API = "https://api.uis.unesco.org/api/public/data/indicators?indicator={ind}&start={y0}&end={y1}{geo}"
PAGE = "https://databrowser.uis.unesco.org/"


def records(ind, y0, y1, geo):
    js = json.loads(http_get(API.format(ind=ind, y0=y0, y1=y1, geo=geo)))
    return js.get("records", [])


def main():
    old = read_json("students.json", {})
    y1 = datetime.date.today().year
    y0 = y1 - 6
    try:
        hosts = records("26458", y0, y1, "&geoUnitType=NATIONAL")
        totals = records("OE.5T8.40510", y0, y1, "&geoUnit=NGA")
    except Exception as e:  # noqa: BLE001
        print("ERROR", e, file=sys.stderr)
        sys.exit(1)
    best = {}
    for r in hosts:
        m49 = ISO3_TO_M49.get(r.get("geoUnit"))
        v = r.get("value")
        if not m49 or v is None or r.get("magnitude") == "NIL" or float(v) <= 0:
            continue
        y = int(r["year"])
        if m49 not in best or y > best[m49][1]:
            best[m49] = [int(round(float(v))), y]
    tot = [(int(r["year"]), int(round(float(r["value"])))) for r in totals if r.get("value") is not None]
    if not best or not tot:
        print("ERROR: UIS returned no usable data", file=sys.stderr)
        sys.exit(1)
    oldc = old.get("c", {})
    if oldc and len(best) < 0.7 * len(oldc):
        add_issue_note("UNESCO student data looks incomplete", [
            f"- Only {len(best)} host countries returned, against {len(oldc)} last time. The previous file was kept."])
        sys.exit(0)
    ty, tv = max(tot)
    out = {"source": "UNESCO Institute for Statistics (indicators 26458 and OE.5T8.40510)", "url": PAGE,
           "licence": "CC BY-SA 3.0 IGO", "checked": now_iso(), "year": ty, "total": tv,
           "total_series": {str(y): v for y, v in sorted(tot)}, "c": dict(sorted(best.items()))}
    notes = []
    if old.get("year") and (old.get("year") != ty or old.get("total") != tv):
        notes.append(f"- Total abroad: {tv:,} in {ty} (was {old.get('total', 0):,} in {old.get('year')})")
    for m49, (v, y) in sorted(best.items(), key=lambda kv: -kv[1][0])[:15]:
        p = oldc.get(m49)
        if p and (p[0] != v or p[1] != y):
            notes.append(f"- {m49}: {v:,} in {y} (was {p[0]:,} in {p[1]})")
    write_json("students.json", out)
    add_issue_note("UNESCO student figures changed", notes)


if __name__ == "__main__":
    main()
