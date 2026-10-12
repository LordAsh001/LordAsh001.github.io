"""Watch NERC resource pages for new publications -> energy-atlas/data/nerc_docs.json.

NERC publishes monthly operational/commercial factsheets, quarterly and annual reports and
orders (e.g. transfers of oversight to state regulators) as PDFs/images. Their layouts change,
so this bot does NOT extract numbers automatically: it lists new documents on the atlas and
opens a GitHub issue so the figures can be checked and entered by hand. nerc.gov.ng/robots.txt
only disallows /wp-admin/. Daily is enough (NERC publishes monthly/quarterly).
"""
import html
import re
import sys
import urllib.parse

from common import add_issue_note, http_get, now_iso, read_json, write_json

CATEGORIES = {
    "operational-performance-factsheet": "Operational performance factsheet",
    "commercial-performance-factsheet": "Commercial performance factsheet",
    "metering-factsheet": "Metering factsheet",
    "nerc-reports": "NERC report (quarterly/annual)",
    "orders": "Order",
    "statistics-and-performance-data": "Statistics & performance data",
}
BASE = "https://nerc.gov.ng/resource-category/{slug}/"
DOC_RE = re.compile(r'href="(https?://nerc\.gov\.ng/wp-content/uploads/[^"]+?\.(?:pdf|png|jpe?g|xlsx?|docx?))"', re.I)


def title_from_url(u):
    name = urllib.parse.unquote(u.rsplit("/", 1)[-1])
    name = re.sub(r"\.(pdf|png|jpe?g|xlsx?|docx?)(\.pdf)?$", "", name, flags=re.I)
    return re.sub(r"[_\-]+", " ", name).strip()


def main():
    old = read_json("nerc_docs.json", {"documents": []})
    known = {d["url"] for d in old.get("documents", [])}
    docs = list(old.get("documents", []))
    new, errors = [], []
    first_run = not known
    for slug, label in CATEGORIES.items():
        try:
            page = http_get(BASE.format(slug=slug))
        except Exception as e:  # noqa: BLE001
            errors.append(f"{slug}: {e}")
            continue
        for u in dict.fromkeys(html.unescape(m) for m in DOC_RE.findall(page)):
            if u in known:
                continue
            known.add(u)
            d = {"url": u, "title": title_from_url(u), "category": label, "first_seen": now_iso()[:10]}
            docs.append(d)
            new.append(d)
    if errors and len(errors) == len(CATEGORIES):
        sys.exit("all NERC category pages failed: " + "; ".join(errors))
    docs.sort(key=lambda d: (d["first_seen"], d["url"]), reverse=True)
    write_json("nerc_docs.json", {"source": "Nigerian Electricity Regulatory Commission (nerc.gov.ng)",
                                  "checked": now_iso(), "documents": docs[:400]})
    if new and not first_run:
        add_issue_note("New NERC publications — check and update the atlas", [
            f"- [ ] [{d['title']}]({d['url']}) — {d['category']}" for d in new] + [
            "", "Check for: available generation & energy (Grid watch), ATC&C losses (History), "
                "grid collapses with dates/causes (Grid watch), state regulator transfers (Map → regulator layer)."])
    for e in errors:
        print("WARN", e, file=sys.stderr)


if __name__ == "__main__":
    main()
