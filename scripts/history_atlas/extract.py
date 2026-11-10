"""Find LGA creation statements in plain text. Pure functions, covered by offline tests.

Only short excerpts (under 15 words) are kept, as evidence for the person reviewing.
"""
import datetime as dt
import re

CREATE = r"(?:created|established|carved out|excised|came into being|came into existence|was formed|were formed|creation)"
MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
FULL_DATE = re.compile(rf"(\d{{1,2}})(?:st|nd|rd|th)?(?:\s+day\s+of|\s+of)?\s+({MONTHS}),?\s+((?:19|20)\d\d)", re.I)
MONTH_DATE = re.compile(rf"({MONTHS}),?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+((?:19|20)\d\d)", re.I)
MONTH_YEAR = re.compile(rf"({MONTHS}),?\s+((?:19|20)\d\d)", re.I)
YEAR = re.compile(r"\b((?:19|20)\d\d)\b")
PARENT = re.compile(r"(?:carved out of|carved from|excised from|created out of|created from|split from|out of)\s+(?:the\s+)?(?:old\s+|former\s+|defunct\s+|then\s+|erstwhile\s+)*([A-Z][\w'\-/]*(?:\s+[A-Z][\w'\-/]*){0,3})")
BAD_PARENT = re.compile(r"^(Local|State|Nigeria|Government|Military|The)\b")
NOT_LGA_EVENT = re.compile(r"\b(school|university|college|hospital|bank|ministry|emirate|chiefdom|kingdom|church|mosque|polytechnic|company)\b", re.I)
MONTH_NUM = {m.lower(): i + 1 for i, m in enumerate(MONTHS.split("|"))}


def _sentences(text):
    for block in re.split(r"\n+", text):
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", block):
            s = s.strip()
            if 20 <= len(s) <= 500:
                yield s


def _date(sentence):
    m = FULL_DATE.search(sentence)
    if m:
        return f"{m.group(3)}-{MONTH_NUM[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = MONTH_DATE.search(sentence)
    if m:
        return f"{m.group(3)}-{MONTH_NUM[m.group(1).lower()]:02d}-{int(m.group(2)):02d}"
    m = MONTH_YEAR.search(sentence)
    if m:
        return f"{m.group(2)}-{MONTH_NUM[m.group(1).lower()]:02d}"
    ys = YEAR.findall(sentence)
    return ys[0] if len(set(ys)) == 1 else None


def _excerpt(sentence, word_hit):
    words = sentence.split()
    idx = next((i for i, w in enumerate(words) if re.match(word_hit, w, re.I)), 0)
    start = max(0, idx - 5)
    return " ".join(words[start:start + 14])


def name_pattern(lga):
    parts = [re.escape(p) for p in re.split(r"[\s/\-]+", lga) if p]
    return re.compile(r"\b" + r"[\s/\-]+".join(parts) + r"\b", re.I)


def find_creation(text, lga, page_is_about_lga=False):
    """Return the first supported statement: {created, parent, quote}, or None.

    A sentence must name the LGA (or the page must be that LGA's own page and the sentence must
    speak of a local government), must use creation language, and must hold one clear date.
    """
    pat = name_pattern(lga)
    now = dt.date.today().year
    for s in _sentences(text):
        if not re.search(CREATE, s, re.I):
            continue
        names_it = bool(pat.search(s))
        lg_words = re.search(r"local government|\bLGA\b|\bcouncil\b", s, re.I)
        if not (names_it or (page_is_about_lga and lg_words)):
            continue
        if not names_it and not re.search(r"\b(this|the)\s+(local government|lga|council)\b", s, re.I):
            continue
        if NOT_LGA_EVENT.search(s) and not lg_words:
            continue
        when = _date(s)
        if not when or not 1950 <= int(when[:4]) <= now:
            continue
        parent = None
        m = PARENT.search(s)
        if m and not BAD_PARENT.match(m.group(1)) and not pat.fullmatch(m.group(1)):
            parent = re.sub(r"\s+(Local|LGA|Council).*$", "", m.group(1)).strip()
        return {"created": when, "parent": parent, "quote": _excerpt(s, CREATE)}
    return None


def promote(records, candidates, today):
    """Publish a date without review only when two independent non-directory sites agree.

    Never overwrites a documented date: a differing date is added to that record's conflicts.
    Returns (records, remaining candidates, list of promoted keys).
    """
    groups = {}
    for c in candidates:
        if c.get("type") == "creation" and c.get("source_type") != "directory":
            groups.setdefault((c["state"], c["lga"], c["created"][:4]), {})[c["domain"]] = c
    promoted, used = [], set()
    for (state, lga, year), by_domain in groups.items():
        key = f"{state}|{lga}"
        rec = records.get(key)
        if rec and rec.get("status") == "documented":
            if str(rec.get("created"))[:4] != year:
                first = next(iter(by_domain.values()))
                rec.setdefault("conflicts", [])
                if not any(x["source"] == first["source"] for x in rec["conflicts"]):
                    rec["conflicts"].append({"created": first["created"], "source": first["source"]})
            used.update(c["id"] for c in by_domain.values())
            continue
        if len(by_domain) < 2:
            continue
        best = sorted(by_domain.values(), key=lambda c: (c["source_type"] != "official", -len(c["created"])))[0]
        parent = next((c["parent"] for c in by_domain.values() if c.get("parent")), (rec or {}).get("parent"))
        records[key] = {"created": best["created"], "parent": parent, "parent_source": None,
                        "parent_status": "documented" if parent else None,
                        "note": "Added by the update bot: two independent sources agree. Also: "
                                + ", ".join(sorted(d for d in by_domain if d != best["domain"])),
                        "source": best["source"], "source_type": best["source_type"], "status": "documented",
                        "quote": best.get("quote"), "conflicts": [], "sources_agree": len(by_domain), "bot": today}
        promoted.append(key)
        used.update(c["id"] for c in by_domain.values())
    return records, [c for c in candidates if c["id"] not in used], promoted
