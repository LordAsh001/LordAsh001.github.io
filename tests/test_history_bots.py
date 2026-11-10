"""Offline tests for the Nigeria History Atlas bots (no network). Run: python tests/test_history_bots.py"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent
BOTS = REPO / "scripts" / "history_atlas"
sys.path.insert(0, str(BOTS))
from extract import find_creation, promote  # noqa: E402

FAILS = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


t = "Ogo-Oluwa Local Government was created on the 3rd of May, 1989 by the then Military Regime."
r = find_creation(t, "Ogo Oluwa")
check(r and r["created"] == "1989-05-03", "full date with ordinal and hyphenated name")
r = find_creation("Ekiti LGA was carved out of the old Irepodun local government area in October 1991.", "Ekiti")
check(r and r["created"] == "1991-10" and r["parent"] == "Irepodun", "month, year and parent")
r = find_creation("Efon Local Government was created on December 4, 1996, out of Ekiti West.", "Efon")
check(r and r["created"] == "1996-12-04" and r["parent"] == "Ekiti West", "US date order and parent")
check(find_creation("Gboko has a population of 361,325 at the 2006 census.", "Gboko") is None, "census year is not a creation date")
check(find_creation("Gboko grew between 1976 and 1991 when councils were created nearby.", "Gboko") is None, "two years gives no date")
check(find_creation("The Benue Links company in Gboko was established in 1988.", "Gboko") is None, "a company is not an LGA")
check(find_creation("A school in the area was established in 1950.", "Tarka", page_is_about_lga=True) is None, "own page still needs LGA wording")
r = find_creation("This local government was created in 1996.", "Tarka", page_is_about_lga=True)
check(r and r["created"] == "1996", "own page, 'this local government'")
check(find_creation("Ado Local Government was created in 1289 by legend.", "Ado") is None, "implausible year")

c = lambda i, d, y, st="official": {"id": i, "type": "creation", "state": "Yobe", "lga": "Geidam", "created": y, "domain": d, "source": "https://" + d, "source_type": st, "parent": None}
rec, left, pr = promote({}, [c("1", "yobestate.gov.ng", "1976")], "2026-11-04")
check(not pr and len(left) == 1 and not rec, "one source waits for review")
rec, left, pr = promote({}, [c("1", "yobestate.gov.ng", "1976"), c("2", "en.wikipedia.org", "1976-05", "encyclopedia")], "2026-11-04")
check(pr == ["Yobe|Geidam"] and not left and rec["Yobe|Geidam"]["status"] == "documented", "two independent sources publish")
rec, left, pr = promote({}, [c("1", "facts.ng", "1976", "directory"), c("2", "soluap.com", "1976", "directory")], "2026-11-04")
check(not pr and len(left) == 2, "two directories do not publish")
rec, left, pr = promote({}, [c("1", "a.gov.ng", "1976"), c("2", "a.gov.ng", "1976")], "2026-11-04")
check(not pr, "one domain twice is not independent")
base = {"Yobe|Geidam": {"created": "1991", "status": "documented", "source": "https://x.gov.ng"}}
rec, left, pr = promote(base, [c("1", "a.gov.ng", "1976"), c("2", "b.org", "1976", "other")], "2026-11-04")
check(rec["Yobe|Geidam"]["created"] == "1991" and rec["Yobe|Geidam"]["conflicts"], "a documented date is never overwritten")

with tempfile.TemporaryDirectory() as tmp:
    d = pathlib.Path(tmp) / "history-atlas" / "data"
    d.mkdir(parents=True)
    (d / "records.json").write_text(json.dumps({"records": {}, "chairs": {}}))
    (d / "candidates.json").write_text(json.dumps({"items": [
        {"id": "aaa", "type": "creation", "state": "Yobe", "lga": "Geidam", "created": "1976", "parent": None, "source": "https://y.gov.ng", "domain": "y.gov.ng", "source_type": "official"},
        {"id": "bbb", "type": "chairman-news", "state": "Yobe", "lga": "Geidam", "title": "t", "source": "https://n.ng/a", "domain": "n.ng", "source_type": "news", "found": "2026-11-01"},
        {"id": "ccc", "type": "chairman-news", "state": "Yobe", "lga": "Fika", "title": "t", "source": "https://n.ng/b", "domain": "n.ng", "source_type": "news", "found": "2026-11-01"}]}))
    (d / "approved.txt").write_text("# comment\naaa\nbbb | Ada Musa | elected\nreject ccc\n")
    env = dict(os.environ, ATLAS_ROOT=tmp, PYTHONPATH=str(BOTS))
    subprocess.run([sys.executable, str(BOTS / "apply_approved.py")], env=env, check=True)
    out = json.loads((d / "records.json").read_text())
    check(out["records"]["Yobe|Geidam"]["status"] == "documented", "approved date published")
    check(out["chairs"]["Yobe|Geidam"][0]["name"] == "Ada Musa", "approved chairman published")
    check(json.loads((d / "candidates.json").read_text())["items"] == [], "queue emptied")
    check("ccc" in json.loads((d / "rejected.json").read_text())["ids"], "rejection remembered")
    check((d / "approved.txt").read_text().strip() == "# comment", "approved.txt cleared")

    (d / "candidates.json").write_text(json.dumps({"items": []}))
    (d / "records.json").write_text(json.dumps({"records": {}, "chairs": {}}))
    html = '<html><body><a href="/lga/geidam">Geidam LGA</a></body></html>'
    page = "<p>Geidam Local Government was created on 3 February 1976.</p>"
    fx = pathlib.Path(tmp) / "fx"
    fx.mkdir()
    from common import fixture_name
    (fx / fixture_name("https://y.gov.ng/")).write_text(html)
    (fx / fixture_name("https://y.gov.ng/lga/geidam")).write_text(page)
    code = f"""
import scan_sites, store
items, new, docs = [], [], []
scan_sites.scan_site({{'state':'Yobe','url':'https://y.gov.ng/','lga':None}}, ['Geidam','Fika'], items, new, docs)
store.finish(items, new, 'test')
"""
    subprocess.run([sys.executable, "-c", code], env=dict(env, ATLAS_FIXTURES=str(fx)), check=True, cwd=str(BOTS))
    items = json.loads((d / "candidates.json").read_text())["items"]
    check(len(items) == 1 and items[0]["created"] == "1976-02-03" and items[0]["source"].endswith("/lga/geidam"), "site scan follows an LGA link and finds the date")

print("FAILED" if FAILS else "all passed", len(FAILS))
sys.exit(1 if FAILS else 0)
