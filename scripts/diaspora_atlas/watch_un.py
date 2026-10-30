"""Watch for a new UN DESA International Migrant Stock revision (the atlas's base layer).

When the UN publishes a newer edition than the one built into the page, open an issue so the base data
can be rebuilt from the new Excel file (see BOTS.md). The page's numbers are not changed automatically.
"""
import re
import sys

from common import add_issue_note, html_to_text, http_get, now_iso, read_json, write_json

PAGE = "https://www.un.org/development/desa/pd/content/international-migrant-stock"
CURRENT = 2024  # edition built into diaspora-atlas/index.html


def main():
    state = read_json("un_watch.json", {"edition_in_page": CURRENT})
    try:
        text = html_to_text(http_get(PAGE))
    except Exception as e:  # noqa: BLE001
        print("ERROR", e, file=sys.stderr)
        sys.exit(1)
    seen = sorted({int(y) for y in re.findall(r"International Migrant Stock\s+(20\d\d)", text)})
    latest = seen[-1] if seen else None
    if latest and latest > state.get("edition_in_page", CURRENT) and latest != state.get("alerted"):
        add_issue_note(f"UN International Migrant Stock {latest} is out", [
            f"- The UN page now lists the {latest} edition; the atlas uses {state.get('edition_in_page', CURRENT)}.",
            f"- Source: {PAGE}",
            "- Rebuild the base data from the new 'Destination and origin' Excel file (see BOTS.md, 'New UN edition')."])
        state["alerted"] = latest
    state.update({"latest_seen": latest, "checked": now_iso()})
    write_json("un_watch.json", state)


if __name__ == "__main__":
    main()
