"""World Bank/KNOMAD bilateral remittance estimates: money sent to Nigeria from each country -> data/remittances_bilateral.json.

Read from the World Bank Data360 API (database WB_KNOMAD, indicator WB_KNOMAD_BRE). Values are in US$ millions.
KNOMAD's last edition is for 2021; the bot keeps checking in case a newer edition is published.
"""
import json
import sys

from common import ISO3_TO_M49, add_issue_note, http_get, now_iso, read_json, write_json

API = "https://data360api.worldbank.org/data360/data?DATABASE_ID=WB_KNOMAD&INDICATOR=WB_KNOMAD_BRE&COMP_BREAKDOWN_1=WB_KNOMAD_NGA"
PAGE = "https://data360.worldbank.org/en/dataset/WB_KNOMAD"


def main():
    old = read_json("remittances_bilateral.json", {})
    try:
        js = json.loads(http_get(API))
    except Exception as e:  # noqa: BLE001
        print("ERROR", e, file=sys.stderr)
        sys.exit(1)
    rows = js.get("value", [])
    years = sorted({r.get("TIME_PERIOD") for r in rows if r.get("TIME_PERIOD")})
    if not years:
        print("ERROR: no data", file=sys.stderr)
        sys.exit(1)
    year = years[-1]
    c, total = {}, None
    for r in rows:
        if r.get("TIME_PERIOD") != year or r.get("OBS_VALUE") in (None, ""):
            continue
        v = float(r["OBS_VALUE"]) * 1e6
        if r.get("REF_AREA") == "WLD":
            total = round(v)
        elif r.get("REF_AREA") in ISO3_TO_M49 and v > 0:
            c[ISO3_TO_M49[r["REF_AREA"]]] = round(v)
    if not c:
        print("ERROR: no countries", file=sys.stderr)
        sys.exit(1)
    total = total or sum(c.values())
    out = {"source": "World Bank/KNOMAD bilateral remittance estimates", "year": int(year), "url": PAGE,
           "api_url": API, "unit": "US$", "checked": now_iso(), "total": total, "c": dict(sorted(c.items()))}
    if old.get("year") and int(year) > int(old["year"]):
        add_issue_note("New bilateral remittance estimates", [
            f"- KNOMAD/World Bank estimates now cover {year} (previously {old['year']}); {len(c)} sending countries, total US${total / 1e9:.2f}bn."])
    write_json("remittances_bilateral.json", out)


if __name__ == "__main__":
    main()
