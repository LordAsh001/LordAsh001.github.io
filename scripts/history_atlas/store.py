"""Load and save candidates and records, and apply the promotion rule."""
from common import add_issue_note, candidate_id, domain, read_json, source_type, today, write_json
from extract import promote


def load_candidates():
    return read_json("candidates.json", {"items": []})["items"]


def rejected_ids():
    d = read_json("rejected.json", {"ids": []})
    return set(d["ids"])


def add_creation(items, state, lga, found, url):
    cid = candidate_id("creation", state, lga, found["created"], url)
    if cid in rejected_ids() or any(c["id"] == cid for c in items):
        return None
    c = {"id": cid, "type": "creation", "state": state, "lga": lga, "created": found["created"],
         "parent": found.get("parent"), "quote": found.get("quote"), "source": url, "domain": domain(url),
         "source_type": source_type(url), "found": today()}
    items.append(c)
    return c


def finish(items, new, title):
    """Apply the two-source rule, save, and list what needs a person in the issue."""
    data = read_json("records.json")
    data["records"], items, promoted = promote(data["records"], items, today())
    if promoted:
        data["updated"] = today()
    write_json("records.json", data)
    write_json("candidates.json", {"note": "Waiting for review. See history-atlas/BOTS.md.", "items": items})
    left = {c["id"] for c in items}
    add_issue_note(f"{title}: published automatically (two independent sources agree)", [f"- {k}" for k in promoted])
    lines = []
    for c in new:
        if c["id"] not in left:
            continue
        if c["type"] == "creation":
            lines.append(f"- `{c['id']}` **{c['lga']}, {c['state']}**: {c['created']}"
                         f"{' from ' + c['parent'] if c.get('parent') else ''} ({c['source_type']}) "
                         f"[{c['domain']}]({c['source']}): \"{c.get('quote', '')}\"")
        else:
            lines.append(f"- `{c['id']}` **{c['lga']}, {c['state']}**: [{c['title']}]({c['source']}) ({c['domain']})")
    add_issue_note(f"{title}: check these, then add the good ones to approved.txt", lines[:80])
    if len(lines) > 80:
        add_issue_note("More", [f"{len(lines) - 80} more are in history-atlas/data/candidates.json"])
    print(f"{title}: {len(new)} new, {len(promoted)} published, {len(items)} waiting")
