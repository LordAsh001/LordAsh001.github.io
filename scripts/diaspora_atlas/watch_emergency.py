"""Emergency-number watcher: compares GOV.UK foreign travel advice ('Getting help') with data/emergency.json.

GOV.UK publishes its travel advice through an open content API. When the emergency-number lines for a
country change, the bot opens an issue quoting the new text beside the numbers on the atlas. The atlas's
numbers are edited by a person after checking (they also draw on Australian travel advice).
"""
import json
import re
import sys
import time

from common import FIXTURES, add_issue_note, digest, html_to_text, http_get, now_iso, read_json, write_json

API = "https://www.gov.uk/api/content/foreign-travel-advice/{slug}"
SLUGS = {"384": "cote-d-ivoire", "180": "democratic-republic-of-the-congo", "178": "congo", "270": "the-gambia",
         "840": "usa", "784": "united-arab-emirates", "792": "turkey", "410": "south-korea", "728": "south-sudan",
         "678": "sao-tome-and-principe", "132": "cape-verde", "624": "guinea-bissau", "226": "equatorial-guinea",
         "140": "central-african-republic", "662": "st-lucia", "028": "antigua-and-barbuda", "214": "dominican-republic",
         "780": "trinidad-and-tobago", "336": None, "826": None, "136": "cayman-islands", "060": "bermuda",
         "703": "slovakia", "203": "czech-republic", "807": "north-macedonia", "643": "russia", "364": "iran",
         "704": "vietnam", "418": "laos", "498": "moldova", "275": "the-occupied-palestinian-territories",
         "158": "taiwan", "438": "liechtenstein"}
KEY = re.compile(r"emergenc|police|ambulance|fire|dial|call", re.I)


def slug_for(m49, name):
    if m49 in SLUGS:
        return SLUGS[m49]
    return re.sub(r"[^a-z]+", "-", name.lower()).strip("-")


def help_lines(slug):
    js = json.loads(http_get(API.format(slug=slug), retries=2))
    for part in js.get("details", {}).get("parts", []):
        if part.get("slug") == "getting-help":
            text = html_to_text(part.get("body", ""))
            lines = [l.strip() for l in text.split("\n") if KEY.search(l) and re.search(r"\b\d{2,}\b", l)]
            return lines[:12]
    return []


def main():
    em = read_json("emergency.json")
    if not em:
        print("no emergency.json")
        return
    state = read_json("emergency_watch.json", {"countries": {}})
    first = not state["countries"]
    changes, errors = [], []
    for m49, c in em.get("countries", {}).items():
        slug = slug_for(m49, c.get("n", ""))
        if not slug:
            continue
        try:
            lines = help_lines(slug)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{c.get('n')}: {e}")
            continue
        h = digest("\n".join(lines))
        prev = state["countries"].get(m49)
        if prev and prev.get("hash") != h and lines:
            ours = ", ".join(f"{k} {c[k]}" for k in ("general", "police", "ambulance", "fire") if c.get(k)) or "no number"
            changes.append(f"**{c.get('n')}** (atlas: {ours}) — https://www.gov.uk/foreign-travel-advice/{slug}/getting-help")
            changes += [f"> {l}" for l in lines[:6]] + [""]
        state["countries"][m49] = {"slug": slug, "hash": h, "lines": lines, "checked": now_iso()}
        if not FIXTURES:
            time.sleep(0.3)
    state["checked"] = now_iso()
    write_json("emergency_watch.json", state)
    if first:
        add_issue_note("Emergency-number watcher started", [f"- Baseline recorded for {len(state['countries'])} countries."])
    else:
        add_issue_note("GOV.UK emergency-number advice changed", changes)
    if len(errors) > 10:
        add_issue_note("Travel advice pages that could not be read", [f"- {e}" for e in errors[:30]])
    for e in errors:
        print("WARN", e, file=sys.stderr)


if __name__ == "__main__":
    main()
