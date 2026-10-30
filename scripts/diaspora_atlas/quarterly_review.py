"""Quarterly checklist issue for the hand-curated parts of the Diaspora Atlas (no network needed)."""
from common import add_issue_note, read_json

CHECKLIST = [
    "- [ ] **Ambassadors and heads of mission:** check State House and Ministry of Foreign Affairs news for new postings or credentials presented; update `head` in `data/directory.json`.",
    "- [ ] **Open suggestions:** review issues labelled `diaspora-atlas` sent from the page's \"Suggest a correction\" form.",
    "- [ ] **Countries without a data feed:** UK (ONS/NRS/NISRA), Canada (Statistics Canada, IRCC), Australia (ABS), Ireland (CSO), New Zealand, Gulf states, African hosts. Add any newer official figure to `data/manual.json`.",
    "- [ ] **Remittance sending costs:** World Bank Remittance Prices Worldwide publishes quarterly; update the corridor costs in the page if the source watcher flagged changes.",
    "- [ ] **City and heritage figures:** new ACS 1-year release (September), census releases.",
    "- [ ] **Associations:** add new national umbrella bodies or NIDO chapters; remove ones whose links failed twice.",
]


def main():
    man = read_json("manual.json", {"countries": {}})
    lines = list(CHECKLIST)
    entries = man.get("countries", {})
    if entries:
        lines.append("")
        lines.append("Figures currently entered by hand:")
        for m49, c in sorted(entries.items()):
            lines.append(f"- {c.get('name', m49)}: {c.get('value'):,} ({c.get('year')}, {c.get('source')})")
    add_issue_note("Quarterly review", lines)


if __name__ == "__main__":
    main()
