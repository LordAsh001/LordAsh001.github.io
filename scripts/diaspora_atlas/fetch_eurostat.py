"""Eurostat: people born in Nigeria and Nigerian citizens in EU/EFTA countries -> data/eurostat.json.

Datasets: migr_pop3ctb (population on 1 January by country of birth) and migr_pop1ctz (by citizenship).
Licence: Eurostat, CC BY 4.0. Eurostat publishes once a year (usually spring); a monthly check is plenty.
"""
import json
import sys

from common import ISO2_TO_M49, M49_NAME, add_issue_note, http_get, jsonstat_records, now_iso, read_json, write_json

API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{ds}?format=JSON&lang=EN&{dim}=NG&age=TOTAL&unit=NR&sex=T&sex=F&sinceTimePeriod=2010"
DATASETS = {"B": ("migr_pop3ctb", "c_birth"), "C": ("migr_pop1ctz", "citizen")}
SOURCE_PAGE = "https://ec.europa.eu/eurostat/databrowser/view/migr_pop3ctb/default/table"


def fetch(basis):
    ds, dim = DATASETS[basis]
    js = json.loads(http_get(API.format(ds=ds, dim=dim)))
    out = {}
    for r in jsonstat_records(js):
        m49 = ISO2_TO_M49.get(r.get("geo"))
        if not m49 or r.get("value") is None:
            continue  # skips EU27, EA, EFTA and other aggregates
        series = out.setdefault(m49, {"total": {}, "female": {}})
        key = "total" if r.get("sex") == "T" else "female" if r.get("sex") == "F" else None
        if key:
            series[key][str(r["time"])[:4]] = int(round(float(r["value"])))
    return out


def main():
    old = read_json("eurostat.json", {"countries": {}})
    got, failures = {}, []
    for basis in DATASETS:
        try:
            got[basis] = fetch(basis)
        except Exception as e:  # noqa: BLE001
            failures.append(f"{DATASETS[basis][0]}: {e}")
    if not got:
        for f in failures:
            print("ERROR", f, file=sys.stderr)
        sys.exit(1)
    countries = {}
    for basis, data in got.items():
        for m49, s in data.items():
            if not s["total"]:
                continue
            c = countries.setdefault(m49, {"name": M49_NAME.get(m49, m49), "series": {}})
            c["series"][basis] = {"total": dict(sorted(s["total"].items())), "female": dict(sorted(s["female"].items()))}
    # keep a basis that failed this run from the previous file
    for basis in DATASETS:
        if basis not in got:
            for m49, c in old.get("countries", {}).items():
                if basis in c.get("series", {}):
                    countries.setdefault(m49, {"name": c["name"], "series": {}})["series"][basis] = c["series"][basis]
    notes = []
    for m49, c in countries.items():
        # prefer people born in Nigeria; use citizens only where birthplace is not published
        basis = "B" if "B" in c["series"] else "C"
        s = c["series"][basis]
        year = max(s["total"])
        c["latest"] = {"value": s["total"][year], "year": int(year), "basis": basis, "female": s["female"].get(year)}
        prev = old.get("countries", {}).get(m49, {}).get("latest")
        if not prev or prev.get("year") != c["latest"]["year"] or prev.get("value") != c["latest"]["value"]:
            was = f" (was {prev['value']:,} in {prev['year']})" if prev else " (new country)"
            notes.append(f"- **{c['name']}**: {c['latest']['value']:,} on 1 Jan {year}, basis {basis}{was}")
    out = {"source": "Eurostat (migr_pop3ctb, migr_pop1ctz)", "source_url": SOURCE_PAGE, "licence": "CC BY 4.0",
           "reference": "1 January", "checked": now_iso(), "countries": dict(sorted(countries.items()))}
    write_json("eurostat.json", out)
    if old.get("countries"):
        add_issue_note("Eurostat figures changed", notes)
    for f in failures:
        print("WARN", f, file=sys.stderr)


if __name__ == "__main__":
    main()
