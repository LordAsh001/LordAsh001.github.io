"""Monthly: read state and LGA government sites (sources.json), following links that look like LGA or history pages.

robots.txt is respected. PDFs and Word files are skipped and listed for a person to open.
Sites that cannot be reached are recorded in site_status.json so the gaps stay visible.
"""
import json
import re
import sys
import time
import urllib.parse

from common import HERE, allowed_by_robots, domain, html_to_text, http_get, read_json, today, write_json
from extract import find_creation, name_pattern
from store import add_creation, finish, load_candidates

MAX_PAGES_PER_SITE = 40
LINK = re.compile(r'<a\s[^>]*href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', re.I | re.S)
USEFUL = re.compile(r"local.?gov|lga|council|history|about|facts|profile|digest", re.I)


def links(base, page, lga_names):
    out = []
    for href, label in LINK.findall(page):
        url = urllib.parse.urljoin(base, href.strip())
        if not url.startswith("http") or domain(url) != domain(base):
            continue
        hay = url + " " + re.sub(r"<[^>]+>", " ", label)
        if USEFUL.search(hay) or any(name_pattern(n).search(hay.replace("-", " ")) for n in lga_names):
            out.append(url.split("#")[0])
    return out


def scan_site(site, names, items, new, blocked_docs):
    state = site["state"]
    queue, seen, pages = [site["url"]], set(), 0
    only = site.get("lga")
    while queue and pages < MAX_PAGES_PER_SITE:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        if re.search(r"\.(pdf|docx?|xlsx?)($|\?)", url, re.I):
            blocked_docs.append(url)
            continue
        if not allowed_by_robots(url):
            continue
        page = http_get(url)
        pages += 1
        time.sleep(1)
        text = html_to_text(page)
        path = urllib.parse.urlsplit(url).path.replace("-", " ").replace("_", " ")
        for lga in ([only] if only else names):
            about = lga == only or bool(name_pattern(lga).search(path))
            found = find_creation(text, lga, page_is_about_lga=about)
            if found:
                c = add_creation(items, state, lga, found, url)
                if c:
                    new.append(c)
        queue += [u for u in links(url, page, names) if u not in seen]
    return pages


def main():
    lgas = json.loads((HERE / "lgas.json").read_text(encoding="utf-8"))
    sites = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))["sites"]
    items, new, docs, status = load_candidates(), [], [], {}
    for site in sites:
        try:
            n = scan_site(site, lgas[site["state"]], items, new, docs)
            status[site["url"]] = {"state": site["state"], "ok": True, "pages": n, "checked": today()}
        except Exception as e:  # noqa: BLE001
            status[site["url"]] = {"state": site["state"], "ok": False, "error": str(e)[:120], "checked": today()}
            print("WARN", site["url"], e, file=sys.stderr)
    write_json("site_status.json", status)
    finish(items, new, "Government site scan")
    if docs:
        from common import add_issue_note
        add_issue_note("Documents the bot cannot read: please open these", [f"- {u}" for u in sorted(set(docs))[:40]])


if __name__ == "__main__":
    main()
