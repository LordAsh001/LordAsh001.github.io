"""Source watcher: checks the pages and sites in sources.json for new information about Nigerians abroad.

- page sources: new sentences matching the source's pattern (and containing a figure, where asked) are quoted
  in a GitHub issue with a link.
- sitemap sources: new pages whose address mentions Nigeria are listed.
The atlas is never changed automatically: a person confirms a figure and adds it to data/manual.json.
The first run records a baseline. robots.txt is respected; a blocked site is reported once.
"""
import json
import re
import sys

from common import (HERE, add_issue_note, allowed_by_robots, digest, html_to_text, http_get, now_iso,
                    read_json, sentences, write_json)

MAX_KEEP = 800
TRUST = {"official": "Official", "research": "Research", "community": "Community", "secondary": "Secondary (trace to the original)"}


def page_items(src):
    text = html_to_text(http_get(src["url"]))
    pat = re.compile(src.get("match") or "nigeria", re.I)
    out = {}
    for s in sentences(text):
        if pat.search(s) and (not src.get("number") or re.search(r"\d", s)):
            out[digest(s)] = s
    return out


def sitemap_urls(url, depth=0, budget=None):
    budget = budget if budget is not None else {"n": 0}
    if budget["n"] >= 40 or depth > 2:
        return set()
    budget["n"] += 1
    xml = http_get(url, retries=2)
    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)
    if "<sitemapindex" in xml:
        found = set()
        for child in locs[-25:]:  # newest sitemaps are usually listed last
            try:
                found |= sitemap_urls(child, depth + 1, budget)
            except Exception:  # noqa: BLE001
                pass
        return found
    return {u for u in locs if "nigeria" in u.lower()}


def main():
    cfg = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))["sources"]
    state = read_json("watch_state.json", {"sources": {}})
    first_run = not state["sources"]
    found, blocked, errors = [], [], []
    for src in cfg:
        st = state["sources"].setdefault(src["id"], {})
        try:
            if not allowed_by_robots(src["url"]):
                if not st.get("blocked"):
                    blocked.append(f"- {src['id']}: {src['url']} (robots.txt disallows automated access)")
                st["blocked"] = True
                continue
            st["blocked"] = False
            if src["kind"] == "page":
                items = page_items(src)
                known = set(st.get("hashes", []))
                new = [s for h, s in items.items() if h not in known]
                if st.get("hashes") is not None and new:
                    found.append((src, new[:8]))
                st["hashes"] = (list(items) + [h for h in st.get("hashes", []) if h not in items])[:MAX_KEEP]
            else:
                urls = sitemap_urls(src["url"])
                known = set(st.get("urls", []))
                new = sorted(urls - known)
                if st.get("urls") is not None and new:
                    found.append((src, new[:15]))
                st["urls"] = sorted(urls | known)[-MAX_KEEP:]
            st["checked"] = now_iso()
            st.pop("error", None)
        except Exception as e:  # noqa: BLE001
            errors.append(f"- {src['id']}: {e}")
            st["error"] = str(e)[:200]
    state["checked"] = now_iso()
    write_json("watch_state.json", state)
    if first_run:
        add_issue_note("Source watcher started", [
            f"- Baseline recorded for {len(cfg)} sources. From now on an issue opens only when something new appears.",
            "- Nothing on the atlas changes automatically: confirm a figure, then add it to `diaspora-atlas/data/manual.json`."])
        return
    for src, items in found:
        lines = [f"Trust: **{TRUST.get(src['trust'], src['trust'])}** · {src['url']}", ""]
        if src["kind"] == "page":
            lines += [f"> {s}" for s in items]
        else:
            lines += [f"- {u}" for u in items]
        add_issue_note(f"New on {src['id']}", lines)
    add_issue_note("Sites that block automated checks", blocked)
    if errors and len(errors) > len(cfg) // 2:
        add_issue_note("Sources that could not be read", errors)
    for e in errors:
        print("WARN", e, file=sys.stderr)


if __name__ == "__main__":
    main()
