"""Link checker for the missions and associations directory (data/directory.json).

Checks each mission and association website/social link. A link is reported only after it fails on two
runs in a row, so a site that is briefly down does not raise an alarm.
"""
import time

from common import FIXTURES, add_issue_note, http_status, now_iso, read_json, write_json


def links(directory):
    for cid, c in directory.get("countries", {}).items():
        for m in c.get("m", []):
            if m.get("w"):
                yield m["w"], f"{c['n']}: {m['t']}, {m['c']}"
        for a in c.get("a", []):
            for key in ("w", "s"):
                if a.get(key):
                    yield a[key], f"{c['n']}: {a['n']}"


def main():
    directory = read_json("directory.json")
    if not directory:
        print("no directory.json; nothing to check")
        return
    state = read_json("links_state.json", {"links": {}})
    report, certs = [], []
    seen = set()
    for url, label in links(directory):
        if url in seen or not url.startswith("http"):
            continue
        seen.add(url)
        code, final, err = http_status(url)
        # 401/403/429: the site is up but refuses robots. Certificate errors: the site answers, but browsers warn.
        cert = bool(err) and "CERTIFICATE" in err.upper()
        ok = (code is not None and (code < 400 or code in (401, 403, 429))) or cert
        if cert:
            certs.append(f"- {label}: {url}")
        rec = state["links"].setdefault(url, {"fails": 0})
        rec.update({"label": label, "last": code if code is not None else (err or "error")[:120], "checked": now_iso()})
        rec["fails"] = 0 if ok else rec.get("fails", 0) + 1
        if rec["fails"] == 2:  # report once, on the second failure in a row
            report.append(f"- {label}: {url} → {rec['last']}")
        if not FIXTURES:
            time.sleep(0.5)
    state["links"] = {u: r for u, r in state["links"].items() if u in seen}
    state["checked"] = now_iso()
    write_json("links_state.json", state)
    if report:
        report.append("")
        report.append("Check each mission's or organisation's site; update or remove the link in `diaspora-atlas/data/directory.json`.")
    add_issue_note("Directory links that stopped working", report)
    first_cert_report = not state.get("cert_reported")
    if certs and first_cert_report:
        add_issue_note("Sites with security-certificate problems (visitors may see a browser warning)", certs + [
            "", "These sites answer, so they stay listed. Nothing to fix on the atlas; this is reported once."])
        state["cert_reported"] = now_iso()
        write_json("links_state.json", state)


if __name__ == "__main__":
    main()
