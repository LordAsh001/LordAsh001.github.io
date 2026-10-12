"""Offline tests for the Energy Atlas bots using fixture responses (no network)."""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
BOTS = REPO / "scripts" / "energy_atlas"
sys.path.insert(0, str(BOTS))


def fx_name(url):
    return hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt"


def make_fixtures(d, extra_doc=False, gdelt_titles=()):
    import fetch_wdi, fetch_generation, watch_nerc, grid_news
    from common import q
    gen = json.loads((REPO / "energy-atlas/data/generation.json").read_text())["years"]
    rows = ["entity,code,year,coal_generation__twh,gas_generation__twh,nuclear_generation__twh,hydro_generation__twh,solar_generation__twh,oil_generation__twh,wind_generation__twh,bioenergy_generation__twh,other_renewables_excluding_bioenergy_generation__twh",
            "Nigeria,NGA,1999,,,0,,,,,,"]
    for y, (g, h, s, b) in gen.items():
        rows.append(f"Nigeria,NGA,{y},0,{g},0,{h},{s},0,0,{b},0")
    rows.append("Nigeria,NGA,2026,0,29.1,0,13.4,0.2,0,0,0.06,0")  # pretend new year
    (d / fx_name(fetch_generation.URL)).write_text("\n".join(rows))
    wdi = json.loads((REPO / "energy-atlas/data/wdi.json").read_text())["series"]
    for key, (code, _) in fetch_wdi.INDICATORS.items():
        vals = dict(wdi[key]["values"]); vals["2025"] = 63.4 if key == "access" else None
        payload = [{"page": 1, "lastupdated": "2026-10-08"},
                   [{"indicator": {"id": code}, "date": y, "value": v} for y, v in sorted(vals.items(), reverse=True)]]
        (d / fx_name(fetch_wdi.URL.format(code=code))).write_text(json.dumps(payload))
    for slug in watch_nerc.CATEGORIES:
        links = [f'<a href="https://nerc.gov.ng/wp-content/uploads/2026/05/{slug}-April-2026.pdf">View</a>',
                 f'<a href="https://nerc.gov.ng/wp-content/uploads/2026/05/{slug}-April-2026.pdf" download>Download</a>']
        if extra_doc and slug == "nerc-reports":
            links.append('<a href="https://nerc.gov.ng/wp-content/uploads/2026/10/2026_Q2-Report.pdf">View</a>')
        (d / fx_name(watch_nerc.BASE.format(slug=slug))).write_text("<html>" + "".join(links) + "</html>")
    arts = [{"url": f"https://example.ng/{i}", "title": t, "seendate": "20261011T060000Z", "domain": "example.ng",
             "sourcecountry": "Nigeria"} for i, t in enumerate(gdelt_titles)]
    (d / fx_name(grid_news.URL.format(q=q(grid_news.QUERY)))).write_text(json.dumps({"articles": arts}))


def run(root, fixtures, script, issue):
    env = dict(os.environ, ATLAS_ROOT=str(root), ATLAS_FIXTURES=str(fixtures), ATLAS_ISSUE_FILE=str(issue))
    r = subprocess.run([sys.executable, str(BOTS / script)], env=env, capture_output=True, text=True)
    assert r.returncode == 0, (script, r.stdout, r.stderr)
    return r


def main():
    tmp = pathlib.Path(tempfile.mkdtemp())
    root = tmp / "repo"; (root / "energy-atlas").mkdir(parents=True)
    shutil.copytree(REPO / "energy-atlas" / "data", root / "energy-atlas" / "data")
    fx = tmp / "fx"; fx.mkdir()
    issue = tmp / "issue.md"
    make_fixtures(fx, gdelt_titles=["National grid collapses again, plunging Nigeria into darkness",
                                    "UK National Grid announces new tariff"])
    for s in ["fetch_generation.py", "fetch_wdi.py", "watch_nerc.py", "grid_news.py"]:
        run(root, fx, s, issue)
    D = root / "energy-atlas" / "data"
    gen = json.loads((D / "generation.json").read_text())
    assert "2026" in gen["years"] and gen["years"]["2000"][:2] == [9.1, 5.63], gen["years"].get("2000")
    wdi = json.loads((D / "wdi.json").read_text())
    assert wdi["series"]["access"]["values"]["2025"] == 63.4 and wdi["series"]["access"]["values"]["2024"] == 62.5
    docs = json.loads((D / "nerc_docs.json").read_text())["documents"]
    assert len(docs) == 6, len(docs)
    news = json.loads((D / "grid_news.json").read_text())["items"]
    assert len(news) == 1 and "Nigeria" in news[0]["title"], news
    body = issue.read_text()
    assert "generation" in body.lower() and "2026" in body and "Possible grid event" in body
    assert "New NERC publications" not in body, "first NERC run must not spam an issue"
    # second run: idempotent, no new commits needed, no new notes
    snap = {p.name: p.read_text() for p in D.glob("*.json") if p.name != "manifest.json"}
    issue.write_text("")
    for s in ["fetch_generation.py", "fetch_wdi.py", "watch_nerc.py", "grid_news.py"]:
        run(root, fx, s, issue)
    assert {p.name: p.read_text() for p in D.glob("*.json") if p.name != "manifest.json"} == snap, "second run changed data"
    assert issue.read_text() == "", issue.read_text()
    # third run: a new NERC report appears -> issue note
    shutil.rmtree(fx); fx.mkdir(); make_fixtures(fx, extra_doc=True)
    run(root, fx, "watch_nerc.py", issue)
    assert "2026 Q2 Report" in issue.read_text(), issue.read_text()
    # failure safety: OWID column rename -> bot exits non-zero and leaves data untouched
    import fetch_generation
    (fx / fx_name(fetch_generation.URL)).write_text("entity,code,year,gas_twh\nNigeria,NGA,2000,1")
    before = (D / "generation.json").read_text()
    env = dict(os.environ, ATLAS_ROOT=str(root), ATLAS_FIXTURES=str(fx))
    r = subprocess.run([sys.executable, str(BOTS / "fetch_generation.py")], env=env, capture_output=True, text=True)
    assert r.returncode != 0 and (D / "generation.json").read_text() == before
    print("manifest:", json.loads((D / "manifest.json").read_text()))
    print("ALL BOT TESTS PASSED")


if __name__ == "__main__":
    main()
