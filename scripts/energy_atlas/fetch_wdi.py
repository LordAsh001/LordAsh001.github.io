"""Refresh World Bank WDI indicators for Nigeria -> energy-atlas/data/wdi.json.

Source: World Bank Indicators API (open, CC BY 4.0). The WDI updates a few times a year,
so a monthly run is standard.
"""
import json
import sys

from common import add_issue_note, http_get, now_iso, read_json, write_json

INDICATORS = {
    "access": ("EG.ELC.ACCS.ZS", "Access to electricity (% of population)"),
    "urban": ("EG.ELC.ACCS.UR.ZS", "Access to electricity, urban (%)"),
    "rural": ("EG.ELC.ACCS.RU.ZS", "Access to electricity, rural (%)"),
    "cooking": ("EG.CFT.ACCS.ZS", "Access to clean fuels and technologies for cooking (%)"),
    "kwhpc": ("EG.USE.ELEC.KH.PC", "Electric power consumption (kWh per capita)"),
    "renshare": ("EG.FEC.RNEW.ZS", "Renewable energy consumption (% of final energy)"),
    "tdloss": ("EG.ELC.LOSS.ZS", "Transmission & distribution losses (% of output)"),
}
URL = "https://api.worldbank.org/v2/country/NG/indicator/{code}?format=json&date=1990:2035&per_page=200"


def fetch(code):
    payload = json.loads(http_get(URL.format(code=code)))
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        raise ValueError(f"unexpected payload for {code}: {str(payload)[:200]}")
    meta, rows = payload[0], payload[1]
    values = {}
    for r in rows:
        if r.get("value") is None:
            continue
        values[str(int(r["date"]))] = round(float(r["value"]), 2)
    return dict(sorted(values.items())), meta.get("lastupdated")


def main():
    old = read_json("wdi.json", {"series": {}})
    out = {"source": "World Bank World Development Indicators API",
           "source_url": "https://data.worldbank.org/country/nigeria",
           "licence": "CC BY 4.0", "checked": now_iso(), "series": {}}
    notes, failures = [], []
    for key, (code, label) in INDICATORS.items():
        try:
            vals, last = fetch(code)
            prev = old.get("series", {}).get(key, {}).get("values", {})
            if prev and len(vals) < len(prev) * 0.8:
                raise ValueError(f"{code}: series shrank from {len(prev)} to {len(vals)} points; keeping old")
            out["series"][key] = {"indicator": code, "label": label, "wb_last_updated": last, "values": vals}
            new_years = sorted(set(vals) - set(prev))
            changed = [y for y in vals if y in prev and abs(vals[y] - prev[y]) > 0.05]
            if new_years or changed:
                notes.append(f"- **{label}**: new years {', '.join(new_years) or '—'}; revised {len(changed)} values")
        except Exception as e:  # keep the previous series if a fetch fails
            failures.append(f"{code}: {e}")
            if key in old.get("series", {}):
                out["series"][key] = old["series"][key]
    write_json("wdi.json", out)
    add_issue_note("World Bank WDI refreshed", notes)
    for f in failures:
        print("WARN", f, file=sys.stderr)
    if len(failures) == len(INDICATORS):
        sys.exit(1)


if __name__ == "__main__":
    main()
