"""Refresh Nigeria electricity generation by source -> energy-atlas/data/generation.json.

Source: Our World in Data grapher CSV (built from Ember and the Energy Institute Statistical
Review; CC BY 4.0). Ember revises yearly data a few times a year; a weekly check is standard.
"""
import csv
import io
import sys

from common import add_issue_note, http_get, now_iso, read_json, write_json

URL = ("https://ourworldindata.org/grapher/electricity-production-by-source.csv"
       "?country=~NGA&csvType=filtered&useColumnShortNames=true")
COLS = {"gas": "gas_generation__twh", "hydro": "hydro_generation__twh", "solar": "solar_generation__twh",
        "bioenergy": "bioenergy_generation__twh", "coal": "coal_generation__twh", "oil": "oil_generation__twh",
        "wind": "wind_generation__twh", "nuclear": "nuclear_generation__twh"}


def num(v):
    return float(v) if v not in ("", None) else None


def main():
    rows = list(csv.DictReader(io.StringIO(http_get(URL))))
    missing = [c for c in ("gas", "hydro", "solar", "bioenergy") if COLS[c] not in (rows[0].keys() if rows else [])]
    if missing:
        sys.exit(f"OWID column names changed; missing {missing}. Not updating.")
    years = {}
    for r in rows:
        if r.get("code") != "NGA":
            continue
        vals = {k: num(r.get(c)) for k, c in COLS.items()}
        if vals["gas"] is None and vals["hydro"] is None:
            continue  # pre-2000 rows are empty
        if any(v is not None and v < 0 for v in vals.values()):
            sys.exit(f"negative value in {r['year']}; refusing update")
        years[r["year"]] = [round(vals[k] or 0, 2) for k in ("gas", "hydro", "solar", "bioenergy")]
        others = {k: vals[k] for k in ("coal", "oil", "wind", "nuclear") if vals[k]}
        if others:
            years[r["year"]].append(others)
    old = read_json("generation.json", {"years": {}})
    if len(years) < len(old.get("years", {})):
        sys.exit("fewer years than before; refusing update")
    if not years:
        sys.exit("no Nigeria rows parsed")
    out = {"source": "Our World in Data — Ember & Energy Institute Statistical Review", "source_url": URL.split("?")[0],
           "licence": "CC BY 4.0", "units": "TWh", "columns": ["gas", "hydro", "solar", "bioenergy"],
           "checked": now_iso(), "years": dict(sorted(years.items()))}
    if write_json("generation.json", out):
        new = sorted(set(years) - set(old.get("years", {})))
        add_issue_note("Electricity generation (OWID/Ember) updated",
                       [f"- New years: {', '.join(new) or 'none (revisions only)'}"])


if __name__ == "__main__":
    main()
