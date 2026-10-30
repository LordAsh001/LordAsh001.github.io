"""Rebuild sitemap.xml from content.json so every tool listed under Open resources is in it.

Lists the homepage, every visible resource with a site-relative link, and the legal pages, each with the
date its files last changed in git. Run by .github/workflows/sitemap.yml (needs full git history).
"""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = "https://shagbaor.com"
EXTRA_PAGES = ["/terms.html", "/privacy.html", "/lara/privacy.html"]


def last_changed(*paths):
    dates = []
    for p in paths:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", p], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        if out:
            dates.append(out)
    return max(dates) if dates else None


def main():
    content = json.loads((ROOT / "content.json").read_text(encoding="utf-8"))
    urls = ["/"]
    for section in content.get("sections", []):
        for item in section.get("items") or []:
            u = (item.get("url") or "").split("#")[0]
            if u.startswith("/") and not u.startswith("//") and not item.get("hidden") and not section.get("hidden"):
                if u not in urls and (ROOT / u.strip("/")).exists():
                    urls.append(u)
    urls += [u for u in EXTRA_PAGES if (ROOT / u.strip("/")).exists() and u not in urls]
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        paths = ["index.html", "content.json"] if u == "/" else [u.strip("/")]
        d = last_changed(*paths)
        lines.append(f"  <url><loc>{SITE}{u}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>")
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"sitemap.xml: {len(urls)} pages")


if __name__ == "__main__":
    main()
