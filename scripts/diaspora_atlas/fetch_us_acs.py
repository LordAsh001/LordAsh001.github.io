"""US Census Bureau American Community Survey: people born in Nigeria -> data/us_acs.json.

Table B05006 (place of birth for the foreign-born population), 1-year estimates. The Nigeria variable is
found by its label each year, so a renumbered table does not break the bot. The Census API needs a free key:
set it as the repository secret CENSUS_API_KEY (https://api.census.gov/data/key_signup.html).
"""
import datetime
import json
import os
import sys

from common import add_issue_note, http_get, now_iso, read_json, write_json

GROUPS = "https://api.census.gov/data/{y}/acs/acs1/groups/B05006.json"
DATA = "https://api.census.gov/data/{y}/acs/acs1?get=NAME,{v}E,{v}M&for=us:1"
PAGE = "https://data.census.gov/table/ACSDT1Y{y}.B05006"


def find_var(year):
    groups = json.loads(http_get(GROUPS.format(y=year), retries=1))
    for name, meta in groups.get("variables", {}).items():
        label = meta.get("label", "")
        if name.endswith("E") and label.rstrip(":").endswith("!!Nigeria"):
            return name[:-1]
    raise ValueError(f"no Nigeria variable in B05006 for {year}")


def fetch(year):
    var = find_var(year)
    url = DATA.format(y=year, v=var)
    key = os.environ.get("CENSUS_API_KEY")
    rows = json.loads(http_get(url + (f"&key={key}" if key else ""), retries=1))
    head, row = rows[0], rows[1]
    rec = dict(zip(head, row))
    return var, int(rec[var + "E"]), int(rec[var + "M"])


def main():
    old = read_json("us_acs.json", {"years": {}})
    years = dict(old.get("years", {}))
    this = datetime.date.today().year
    found, errors = [], []
    for y in range(this - 1, this - 4, -1):
        if str(y) in years:
            break  # older years are already stored
        try:
            var, val, moe = fetch(y)
            years[str(y)] = {"value": val, "moe": moe, "variable": var}
            found.append(y)
        except Exception as e:  # noqa: BLE001 (not yet released, or API refused)
            errors.append(f"{y}: {e}")
    if not years:
        for e in errors:
            print("ERROR", e, file=sys.stderr)
        if not os.environ.get("CENSUS_API_KEY"):
            print("The Census API refused keyless requests. Add a free key as the repository secret CENSUS_API_KEY "
                  "(https://api.census.gov/data/key_signup.html); until then the page keeps its built-in US figure.")
            sys.exit(0)
        sys.exit(1)
    latest_year = max(years, key=int)
    latest = years[latest_year]
    out = {"m49": "840", "source": "US Census Bureau, American Community Survey 1-year, table B05006",
           "source_url": PAGE.format(y=latest_year), "licence": "Public domain (US government work)",
           "checked": now_iso(), "latest": {"value": latest["value"], "year": int(latest_year), "moe": latest["moe"]},
           "years": dict(sorted(years.items()))}
    write_json("us_acs.json", out)
    if found:
        add_issue_note("New American Community Survey figure", [
            f"- {y}: {years[str(y)]['value']:,} people born in Nigeria (± {years[str(y)]['moe']:,})" for y in sorted(found)])
    for e in errors:
        print("INFO", e, file=sys.stderr)


if __name__ == "__main__":
    main()
