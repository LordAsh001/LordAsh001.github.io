"""Offline tests for the Nigeria Diaspora Atlas bots, using fixture responses (no network).

Run: python tests/test_diaspora_bots.py
"""
import datetime
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
BOTS = REPO / "scripts" / "diaspora_atlas"
sys.path.insert(0, str(BOTS))
os.environ.pop("ATLAS_FIXTURES", None)
import common  # noqa: E402

FAILS = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def put(fx, url, text):
    (fx / common.fixture_name(url)).write_text(text if isinstance(text, str) else json.dumps(text), encoding="utf-8")


def jsonstat(dim):
    geos, times, sexes = ["DE", "EL", "EU27_2020"], ["2024", "2025"], ["F", "T"]
    ids = ["freq", "unit", "age", "sex", dim, "geo", "time"]
    size = [1, 1, 1, 2, 1, 3, 2]
    vals, n = {}, 0
    for si, s in enumerate(sexes):
        for gi, g in enumerate(geos):
            for ti, t in enumerate(times):
                base = {"DE": 90000, "EL": 3000, "EU27_2020": 400000}[g] + ti * 1000
                vals[str(si * 6 + gi * 2 + ti)] = base // 2 if s == "F" else base
    cat = lambda xs: {"category": {"index": {x: i for i, x in enumerate(xs)}}}
    return {"id": ids, "size": size, "value": vals,
            "dimension": {"freq": cat(["A"]), "unit": cat(["NR"]), "age": cat(["TOTAL"]), "sex": cat(sexes),
                          dim: cat(["NG"]), "geo": cat(geos), "time": cat(times)}}


def run(bot, root, fx):
    issue = root / "issue.md"
    issue.write_text("")
    env = dict(os.environ, ATLAS_ROOT=str(root), ATLAS_FIXTURES=str(fx), ATLAS_ISSUE_FILE=str(issue))
    p = subprocess.run([sys.executable, str(BOTS / bot)], env=env, capture_output=True, text=True)
    if p.returncode != 0:
        print(p.stdout, p.stderr)
    return p.returncode, issue.read_text()


def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    root, fx = tmp / "repo", tmp / "fx"
    (root / "diaspora-atlas").mkdir(parents=True)
    fx.mkdir()
    data = root / "diaspora-atlas" / "data"
    data.mkdir()
    for name in ("directory.json", "emergency.json", "manual.json"):  # hand-curated inputs only
        shutil.copy(REPO / "diaspora-atlas" / "data" / name, data / name)
    import fetch_eurostat, fetch_us_acs, fetch_uis, fetch_worldbank, fetch_bilateral, watch_un  # noqa: E401

    # Eurostat
    for basis, (ds, dim) in fetch_eurostat.DATASETS.items():
        put(fx, fetch_eurostat.API.format(ds=ds, dim=dim), jsonstat(dim))
    code, _ = run("fetch_eurostat.py", root, fx)
    eu = json.loads((data / "eurostat.json").read_text())
    check(code == 0 and set(eu["countries"]) == {"276", "300"}, "eurostat: Germany and Greece parsed, EU aggregate skipped")
    de = eu["countries"]["276"]["latest"]
    check(de == {"value": 91000, "year": 2025, "basis": "B", "female": 45500}, f"eurostat: latest Germany figure {de}")

    # US ACS (newest year not yet released -> falls back)
    this = datetime.date.today().year
    for y in (this - 2, this - 3):
        put(fx, fetch_us_acs.GROUPS.format(y=y), {"variables": {"B05006_124E": {"label": "Estimate!!Total:!!Africa:!!Western Africa:!!Nigeria"},
                                                               "B05006_123E": {"label": "Estimate!!Total:!!Africa:!!Western Africa:!!Liberia"}}})
        put(fx, fetch_us_acs.DATA.format(y=y, v="B05006_124"), [["NAME", "B05006_124E", "B05006_124M", "us"],
                                                               ["United States", str(500000 + (y - this + 3) * 30000), "20000", "1"]])
    code, issue = run("fetch_us_acs.py", root, fx)
    us = json.loads((data / "us_acs.json").read_text())
    check(code == 0 and us["latest"] == {"value": 530000, "year": this - 2, "moe": 20000}, f"us_acs: latest {us['latest']}")
    check("New American Community Survey figure" in issue, "us_acs: issue note for new figures")

    # UNESCO UIS
    y1 = this; y0 = y1 - 6
    put(fx, fetch_uis.API.format(ind="26458", y0=y0, y1=y1, geo="&geoUnitType=NATIONAL"), {"records": [
        {"indicatorId": "26458", "geoUnit": "GBR", "year": 2023, "value": 71756, "magnitude": None},
        {"indicatorId": "26458", "geoUnit": "GBR", "year": 2022, "value": 60000, "magnitude": None},
        {"indicatorId": "26458", "geoUnit": "IRL", "year": 2022, "value": 539, "magnitude": None},
        {"indicatorId": "26458", "geoUnit": "ALB", "year": 2023, "value": 0, "magnitude": "NIL"}]})
    put(fx, fetch_uis.API.format(ind="OE.5T8.40510", y0=y0, y1=y1, geo="&geoUnit=NGA"), {"records": [
        {"geoUnit": "NGA", "year": 2022, "value": 112498}, {"geoUnit": "NGA", "year": 2023, "value": 146286}]})
    code, _ = run("fetch_uis.py", root, fx)
    st = json.loads((data / "students.json").read_text())
    check(code == 0 and st["c"] == {"826": [71756, 2023], "372": [539, 2022]} and st["total"] == 146286 and st["year"] == 2023,
          "uis: latest year per host, NIL skipped, total read")

    # World Bank
    wb = {"BX.TRF.PWKR.CD.DT": {"2024": 22126757545, "2025": 22789097830}, "BX.TRF.PWKR.DT.GD.ZS": {"2025": 7.84},
          "SI.RMT.COST.IB.ZS": {"2023": 4.64}}
    for code_, vals in wb.items():
        put(fx, fetch_worldbank.URL.format(code=code_), [{"page": 1}, [{"date": y, "value": v} for y, v in vals.items()]])
    code, _ = run("fetch_worldbank.py", root, fx)
    rm = json.loads((data / "remittances.json").read_text())
    check(code == 0 and rm["total"]["year"] == 2025 and rm["total"]["value_usd"] == 22789097830 and rm["gdp"]["value"] == 7.84
          and rm["avg"]["value_pct"] == 4.64 and "series" in rm["total"], "worldbank: remittances written in page format")

    # Data360 bilateral
    put(fx, fetch_bilateral.API, {"count": 3, "value": [
        {"REF_AREA": "USA", "TIME_PERIOD": "2021", "OBS_VALUE": "5710.916521"},
        {"REF_AREA": "GBR", "TIME_PERIOD": "2021", "OBS_VALUE": "2764.877191"},
        {"REF_AREA": "WLD", "TIME_PERIOD": "2021", "OBS_VALUE": "19483.402059"}]})
    code, _ = run("fetch_bilateral.py", root, fx)
    bl = json.loads((data / "remittances_bilateral.json").read_text())
    check(code == 0 and bl["c"] == {"826": 2764877191, "840": 5710916521} and bl["total"] == 19483402059 and bl["year"] == 2021,
          "bilateral: millions converted to US$, world total kept")

    # UN watch
    put(fx, watch_un.PAGE, "<html><h2>International Migrant Stock 2024</h2><p>International Migrant Stock 2026 released</p></html>")
    code, issue = run("watch_un.py", root, fx)
    check(code == 0 and "International Migrant Stock 2026 is out" in issue, "un watch: new edition flagged")
    code, issue = run("watch_un.py", root, fx)
    check(issue == "", "un watch: flagged only once")

    # Source watcher: baseline, then one new sentence
    cfg = json.loads((BOTS / "sources.json").read_text())["sources"]
    def sources_fx(extra):
        for s in cfg:
            if s["kind"] == "page":
                body = "<p>In 2021, 270,768 people born in Nigeria lived in England and Wales.</p>"
                if extra and s["id"] == "ons-migration":
                    body += "<p>New estimates show 310,000 Nigeria-born residents in 2025.</p>"
                put(fx, s["url"], f"<html><body>{body}<p>Ambassador presents credentials in Berlin in 2026.</p><p>Average total cost 2.72% for USD 200 to Nigeria.</p><p>Diaspora registry opens for Nigerians in Canada.</p></body></html>")
            else:
                urls = ["https://x.org/a", "https://x.org/nigeria-old"] + (["https://x.org/nigerians-new-2026"] if extra and s["id"] == "site-ons" else [])
                put(fx, s["url"], "<urlset>" + "".join(f"<url><loc>{u}</loc></url>" for u in urls) + "</urlset>")
    sources_fx(False)
    code, issue = run("watch_sources.py", root, fx)
    check(code == 0 and "Source watcher started" in issue, "sources: first run records baseline")
    code, issue = run("watch_sources.py", root, fx)
    check(code == 0 and issue == "", "sources: no issue when nothing changed")
    sources_fx(True)
    code, issue = run("watch_sources.py", root, fx)
    check("310,000 Nigeria-born" in issue and "nigerians-new-2026" in issue and issue.count("### New on") == 2,
          "sources: new sentence and new page reported")

    # Link checker: a link failing twice in a row is reported once
    d = json.loads((data / "directory.json").read_text())
    bad = next(m["w"] for c in d["countries"].values() for m in c["m"] if m.get("w"))
    (fx / ("status-" + common.fixture_name(bad))).write_text("404")
    code, issue = run("check_directory.py", root, fx)
    check(code == 0 and issue == "", "links: first failure not reported")
    code, issue = run("check_directory.py", root, fx)
    check(bad in issue, "links: second failure reported")
    code, issue = run("check_directory.py", root, fx)
    check(issue == "", "links: not reported again")

    # Emergency watcher
    import watch_emergency
    em = json.loads((data / "emergency.json").read_text())["countries"]
    def emg_fx(ghana_line):
        for m49, c in em.items():
            slug = watch_emergency.slug_for(m49, c["n"])
            if not slug:
                continue
            line = ghana_line if m49 == "288" else "In an emergency, call 112 and ask for an ambulance, the fire service or police."
            put(fx, watch_emergency.API.format(slug=slug), {"details": {"parts": [
                {"slug": "health", "body": "<p>Health</p>"}, {"slug": "getting-help", "body": f"<h2>Emergency services</h2><p>{line}</p>"}]}})
    emg_fx("Ambulance, fire, police: 999 or 112. Police: 192.")
    code, issue = run("watch_emergency.py", root, fx)
    check(code == 0 and "watcher started" in issue, "emergency: baseline recorded")
    emg_fx("Ambulance: 193. Fire: 192. Police: 191.")
    code, issue = run("watch_emergency.py", root, fx)
    check("**Ghana**" in issue and "Police: 191" in issue and issue.count("**") == 2, "emergency: only the changed country is reported")

    code, issue = run("quarterly_review.py", root, fx)
    check(code == 0 and "Ambassadors" in issue and "Australia: 12,883" in issue, "quarterly: checklist with hand-entered figures")

    mf = json.loads((data / "manifest.json").read_text())
    check({"eurostat.json", "students.json", "remittances.json", "remittances_bilateral.json"} <= set(mf["datasets"]), "manifest lists datasets")
    if os.environ.get("KEEP_TEST_DATA"):
        print("test data in", data)
    else:
        shutil.rmtree(tmp)
    print(f"\n{len(FAILS)} failure(s)")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
