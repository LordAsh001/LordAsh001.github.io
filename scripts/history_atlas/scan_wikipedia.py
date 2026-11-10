"""Monthly: look for creation statements on the Wikipedia page of every LGA still lacking a documented date."""
import json
import sys
import time
import urllib.parse

from common import HERE, http_get, read_json
from extract import find_creation
from store import add_creation, finish, load_candidates

API = "https://en.wikipedia.org/w/api.php?"


def api(**p):
    p.update(format="json", formatversion="2", redirects="1")
    return json.loads(http_get(API + urllib.parse.urlencode(p)))


def page_for(lga, state):
    hits = api(action="query", list="search", srsearch=f'"{lga}" {state} local government area Nigeria', srlimit="3")
    for h in hits.get("query", {}).get("search", []):
        pg = api(action="query", prop="extracts", explaintext="1", titles=h["title"])["query"]["pages"][0]
        text = pg.get("extract", "")
        intro = text.split("\n==")[0]
        if state.lower() in intro.lower() and "local government" in intro.lower() and lga.split("/")[0].lower() in intro.lower():
            return h["title"], text
    return None, None


def main():
    lgas = json.loads((HERE / "lgas.json").read_text(encoding="utf-8"))
    recs = read_json("records.json")["records"]
    items, new = load_candidates(), []
    for state, names in lgas.items():
        for lga in names:
            if recs.get(f"{state}|{lga}", {}).get("status") == "documented":
                continue
            try:
                title, text = page_for(lga, state)
                time.sleep(1)
                if not title:
                    continue
                found = find_creation(text, lga, page_is_about_lga=True)
                if found:
                    c = add_creation(items, state, lga, found, "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")))
                    if c:
                        new.append(c)
            except Exception as e:  # noqa: BLE001 - one page must not stop the run
                print("WARN", lga, state, e, file=sys.stderr)
    finish(items, new, "Wikipedia scan")


if __name__ == "__main__":
    main()
