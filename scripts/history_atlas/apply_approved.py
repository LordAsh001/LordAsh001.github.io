"""Publish what a person approved in history-atlas/data/approved.txt, and drop what they rejected.

Line formats (one per line, # starts a comment):
  <id>                                  approve a creation date
  <id> | Full Name | elected            approve a chairman found in a headline; or caretaker
  reject <id>                           never suggest this again
"""
from common import DATA, read_json, today, write_json
from store import load_candidates


def main():
    p = DATA / "approved.txt"
    if not p.exists():
        return
    lines = p.read_text(encoding="utf-8").splitlines()
    items = {c["id"]: c for c in load_candidates()}
    data = read_json("records.json")
    rej = read_json("rejected.json", {"ids": []})
    keep = [l for l in lines if l.startswith("#")]
    done = 0
    for line in lines:
        line = line.split("#")[0].strip()
        if not line:
            continue
        if line.startswith("reject "):
            cid = line.split()[1]
            rej["ids"].append(cid)
            items.pop(cid, None)
            done += 1
            continue
        parts = [x.strip() for x in line.split("|")]
        c = items.get(parts[0])
        if not c:
            continue
        key = f"{c['state']}|{c['lga']}"
        if c["type"] == "creation":
            old = data["records"].get(key, {})
            data["records"][key] = {**old, "created": c["created"], "parent": c.get("parent") or old.get("parent"),
                                    "parent_status": "documented" if c.get("parent") else old.get("parent_status"),
                                    "source": c["source"], "source_type": c["source_type"], "quote": c.get("quote"),
                                    "status": "unconfirmed" if c["source_type"] == "directory" else "documented",
                                    "conflicts": old.get("conflicts", []), "reviewed": today()}
        elif len(parts) >= 2:
            data["chairs"].setdefault(key, []).insert(0, {"name": parts[1], "start": None, "end": None,
                                                         "kind": parts[2] if len(parts) > 2 else "unknown",
                                                         "as_of": c.get("found"), "source": c["source"], "status": "reported"})
        else:
            keep.append(line)
            continue
        items.pop(parts[0])
        done += 1
    if done:
        data["updated"] = today()
        write_json("records.json", data)
        write_json("rejected.json", rej)
        write_json("candidates.json", {"note": "Waiting for review. See history-atlas/BOTS.md.", "items": list(items.values())})
    p.write_text("\n".join(keep) + "\n", encoding="utf-8")
    print("applied", done)


if __name__ == "__main__":
    main()
