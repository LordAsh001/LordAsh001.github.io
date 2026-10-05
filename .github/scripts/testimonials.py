#!/usr/bin/env python3
"""Pull approved testimonials from the Google Form responses sheet into content.json.

How it works
------------
People fill in the form; their answers land in a Google Sheet that is published to
the web as CSV. This script reads that CSV once a day and copies across ONLY the
rows that pass two gates:

  1. the person gave permission  -> the "May I publish this on my website?" answer
     starts with "Yes";
  2. you approved it             -> you typed "yes" in the "Publish?" column you
     added to the sheet yourself.

Nothing is published until both are true, so a new response never appears on the
website on its own. Email addresses are never copied anywhere.

Set the sheet URL in the workflow file (TESTIMONIALS_CSV). With no URL the script
does nothing and leaves the website exactly as it is.
"""
import csv, io, json, os, re, sys, urllib.request

CSV_URL = os.environ.get("TESTIMONIALS_CSV", "").strip()
CONTENT = os.environ.get("CONTENT_FILE", "content.json")
SECTION_ID = os.environ.get("SECTION_ID", "kind-words")

YES = {"yes", "y", "true", "ok", "approved", "publish", "x", "✓", "1"}
IMG = re.compile(r"^https://[^\s]+\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s]*)?$", re.I)


def column(row, *names):
    """Read a cell by any of several possible column headings (case/space tolerant)."""
    keys = {re.sub(r"[^a-z0-9]", "", (k or "").lower()): v for k, v in row.items()}
    for n in names:
        v = keys.get(re.sub(r"[^a-z0-9]", "", n.lower()))
        if v:
            return v.strip()
    return ""


def tidy(text):
    """One clean paragraph: no stray line breaks, no double spaces, no stray quotes."""
    t = re.sub(r"\s+", " ", (text or "").strip())
    if len(t) > 2 and t[0] in "“\"" and t[-1] in "”\"":
        t = t[1:-1].strip()
    return t


def fingerprint(quote):
    return re.sub(r"[^a-z0-9]", "", (quote or "").lower())[:60]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "testimonials-bot"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8-sig", "replace")


def rows_from_csv(text):
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        quote = tidy(column(row, "What would you like to say?", "quote", "testimonial"))
        if not quote:
            continue

        approved = column(row, "Publish?", "publish", "approved").lower().strip(" .!")
        if approved not in YES:
            continue

        consent = column(row, "May I publish this on my website?", "consent", "permission")
        if not consent.lower().startswith("yes"):
            continue

        name = tidy(column(row, "Your name", "name"))
        if "without my name" in consent.lower():
            name = "Anonymous"

        item = {"quote": quote, "name": name or "Anonymous"}

        role = tidy(column(row, "Your role and where you are", "role", "title"))
        if role:
            item["role"] = role

        photo = column(row, "A link to a photo of you", "photo", "picture")
        if IMG.match(photo):
            item["photo"] = photo

        out.append(item)
    return out


def main():
    if not CSV_URL:
        print("No TESTIMONIALS_CSV set — leaving the website untouched.")
        return 0
    if not os.path.exists(CONTENT):
        print("Cannot find", CONTENT)
        return 1

    raw = open(CONTENT, encoding="utf-8").read()
    data = json.loads(raw)

    section = next((s for s in data.get("sections", [])
                    if s.get("id") == SECTION_ID or s.get("type") == "testimonials"), None)
    if section is None:
        print("No testimonials section in", CONTENT)
        return 1

    try:
        fresh = rows_from_csv(fetch(CSV_URL))
    except Exception as e:                      # a bad sheet must never break the site
        print("Could not read the responses sheet:", e)
        return 0

    print("Approved rows in the sheet:", len(fresh))

    # Keep anything you wrote by hand in the editor; add the approved form answers after it.
    seen = {fingerprint(i["quote"]) for i in fresh}
    kept = [i for i in section.get("items") or [] if fingerprint(i.get("quote", "")) not in seen]
    items = kept + fresh

    section["items"] = items
    section["show"] = bool(items)

    out = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if out == raw:
        print("Nothing changed.")
        return 0
    with open(CONTENT, "w", encoding="utf-8") as f:
        f.write(out)
    print("Wrote", CONTENT, "with", len(items), "testimonial(s); section shown:", section["show"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
