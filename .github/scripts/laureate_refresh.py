#!/usr/bin/env python3
"""Keeps Laureate Lab fresh without manual input. Runs daily in GitHub Actions.

Writes three files the tool reads:
  laureate/live.json    - "Just announced": scholarship posts from public RSS feeds
                          and official funder news (title, link, date, source only).
  laureate/watch.json   - official-page watcher: notices when a scholarship's official
                          page changes and whether it now reads as open or closed.
  laureate/videos.json  - recent YouTube videos per scholarship (weekly; needs the
                          YT_API_KEY secret that the Via Scholaris numbers already use).

Polite by design: honours robots.txt, one request per page, a pause between sites,
a clear user agent, and nothing but titles and links is stored from other sites.
Standard library only.
"""
import hashlib, html, json, os, re, sys, time, urllib.parse, urllib.request, urllib.robotparser
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import xml.etree.ElementTree as ET

UA = "LaureateLabRefresher/1.0 (+https://shagbaor.com/laureate/)"
NOW = datetime.now(timezone.utc)
TODAY = NOW.strftime("%Y-%m-%d")
OUT = "laureate"
Y = NOW.year if NOW.month < 7 else NOW.year + 1          # the intake year people are applying for
YEARS = [str(Y), str(Y + 1)]

FEEDS = [
    ("Opportunities for Africans", "https://www.opportunitiesforafricans.com/category/scholarships/feed/"),
    ("Opportunity Desk", "https://opportunitydesk.org/feed/"),
    ("Opportunities Corners", "https://www.opportunitiescorners.com/feed/"),
    ("Scholarship Region", "https://www.scholarshipregion.com/feed/"),
    ("Opportunities for Youth", "https://opportunitiesforyouth.org/feed/"),
    ("Commonwealth Scholarship Commission", "https://cscuk.fcdo.gov.uk/feed/"),
    ("Erasmus Mundus catalogue (EACEA)", "https://www.eacea.ec.europa.eu/node/253/rss_en"),
    ("Schwarzman Scholars", "https://www.schwarzmanscholars.org/feed/"),
    ("Federal Ministry of Education, Nigeria", "https://education.gov.ng/feed/"),
]
GOVUK = [("GOV.UK", "https://www.gov.uk/api/search.json?q=chevening%20scholarship&count=10&fields=title,link,public_timestamp,description"),
         ("GOV.UK", "https://www.gov.uk/api/search.json?q=commonwealth%20scholarships&count=10&fields=title,link,public_timestamp,description")]
OFFICIAL = {"Commonwealth Scholarship Commission", "Erasmus Mundus catalogue (EACEA)", "Schwarzman Scholars", "Federal Ministry of Education, Nigeria", "GOV.UK"}

# words that tie a post to an award in the atlas
KEYS = {
    "chevening": ["chevening"], "csc-masters": ["commonwealth master", "commonwealth shared", "commonwealth scholarship"],
    "csc-phd": ["commonwealth phd", "commonwealth doctoral"], "gates": ["gates cambridge"], "knight": ["knight-hennessy", "knight hennessy"],
    "clarendon": ["clarendon"], "weidenfeld": ["weidenfeld"], "rhodes-wa": ["rhodes scholarship"], "schwarzman": ["schwarzman"],
    "erasmus": ["erasmus mundus"], "daad-epos": ["daad", "epos"], "si": ["swedish institute"], "kth": ["kth "],
    "delft": ["delft"], "radboud": ["radboud"], "eth": ["eth zurich", "eth zürich", "excellence scholarship & opportunity"],
    "eiffel": ["eiffel"], "ubc-isp": ["ubc international", "university of british columbia"], "reach-oxford": ["reach oxford"],
    "uopeople": ["university of the people"], "fulbright": ["fulbright"], "aauw": ["aauw"], "mext": ["mext", "japanese government scholarship"],
    "csc-china": ["chinese government scholarship", "csc scholarship"], "gks": ["global korea", "gks "], "turkiye": ["türkiye burs", "turkiye burs", "turkey scholarship", "türkiye scholarship"],
    "hungaricum": ["hungaricum"], "mastercard": ["mastercard foundation"], "mandela-rhodes": ["mandela rhodes"], "jjwbgsp": ["joint japan", "jj/wbgsp", "world bank graduate"],
    "ptdf": ["ptdf"], "nlng": ["nlng"], "total": ["totalenergies", "total energies"], "agbami": ["agbami"], "shell": ["snepco", "shell nigeria"],
    "seplat": ["seplat"], "mtn": ["mtn foundation", "mtn scholarship"], "ovia": ["jim ovia"], "nbplc": ["nigerian breweries"], "nddc": ["nddc"],
    "tetfund": ["tetfund"], "nelfund": ["nelfund", "student loan"], "fsb-bea": ["bilateral education", "bea scholarship", "federal scholarship board"],
}
FUNDING_WORDS = re.compile(r"scholarship|fellowship|fully[- ]funded|studentship|bursar|grant|funding|award", re.I)

_robots = {}
def allowed(url):
    p = urllib.parse.urlparse(url); base = f"{p.scheme}://{p.netloc}"
    if base not in _robots:
        rp = urllib.robotparser.RobotFileParser(); rp.set_url(base + "/robots.txt")
        try:
            req = urllib.request.Request(base + "/robots.txt", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=15) as r:
                rp.parse(r.read().decode("utf-8", "replace").splitlines())
        except Exception:
            rp.parse([])  # no robots.txt reachable: treat as allowed
        _robots[base] = rp
    return _robots[base].can_fetch(UA, url)

def fetch(url, headers=None, timeout=25):
    if not allowed(url):
        raise PermissionError("robots.txt disallows " + url)
    h = {"User-Agent": UA, "Accept-Language": "en"}; h.update(headers or {})
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, dict(r.headers), r.read()

def load(path, default):
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def save(path, data):
    with open(path, "w", encoding="utf-8") as f: json.dump(data, f, ensure_ascii=False, indent=1)

def clean(t, n=220):
    t = html.unescape(re.sub(r"<[^>]+>", " ", t or "")); t = re.sub(r"\s+", " ", t).strip()
    return (t[: n - 1] + "…") if len(t) > n else t

def match_ids(text):
    t = " " + text.lower() + " "
    return [k for k, words in KEYS.items() if any(w in t for w in words)]

def parse_date(s):
    for fn in (lambda x: parsedate_to_datetime(x), lambda x: datetime.fromisoformat(x.replace("Z", "+00:00"))):
        try:
            d = fn(s); return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except Exception: pass
    return None

# ---------------------------------------------------------------- live feed
def refresh_feed():
    old = load(f"{OUT}/live.json", {"items": []})
    items = {i["link"]: i for i in old.get("items", [])}
    status = []
    for name, url in FEEDS:
        try:
            _, _, body = fetch(url)
            root = ET.fromstring(body)
            entries = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
            n = 0
            for e in entries[:(8 if "EACEA" in name else 40)]:
                g = lambda tag: (e.findtext(tag) or e.findtext("{http://www.w3.org/2005/Atom}" + tag) or "")
                title = clean(g("title"), 180)
                link = g("link").strip()
                al = e.find("{http://www.w3.org/2005/Atom}link")
                if not link and al is not None: link = al.get("href", "")
                when = parse_date(g("pubDate") or g("updated") or g("published") or "")
                if not title or not link or not when: continue
                if "EACEA" not in name and not FUNDING_WORDS.search(title + " " + g("description")[:300]): continue
                summary = clean(g("description") or g("summary"), 200)
                ids = match_ids(title + " " + summary)
                if name in ("Opportunity Desk", "Opportunities for Youth") and not FUNDING_WORDS.search(title): continue
                if re.search(r"\b(job|vacanc|internship|recruit)", title, re.I) and not re.search(r"scholarship|fellowship", title, re.I): continue
                items.setdefault(link, {"title": title, "link": link, "date": when.strftime("%Y-%m-%d"), "source": name,
                                        "official": name in OFFICIAL, "ids": ids, "summary": summary, "seen": TODAY})
                n += 1
            status.append({"source": name, "ok": True, "items": n})
        except Exception as ex:
            status.append({"source": name, "ok": False, "error": str(ex)[:120]})
        time.sleep(3)
    for name, url in GOVUK:
        try:
            _, _, body = fetch(url)
            for r in json.loads(body).get("results", [])[:10]:
                when = parse_date(r.get("public_timestamp", "") or "")
                if not when: continue
                link = "https://www.gov.uk" + r.get("link", "")
                title = clean(r.get("title"), 180)
                items.setdefault(link, {"title": title, "link": link, "date": when.strftime("%Y-%m-%d"), "source": name, "official": True,
                                        "ids": match_ids(title + " " + (r.get("description") or "")), "summary": clean(r.get("description"), 200), "seen": TODAY})
            status.append({"source": name, "ok": True})
        except Exception as ex:
            status.append({"source": name, "ok": False, "error": str(ex)[:120]})
        time.sleep(2)
    cutoff = (NOW - timedelta(days=75)).strftime("%Y-%m-%d")
    keep = [i for i in items.values() if i["date"] >= cutoff and i["date"] <= TODAY]
    keep.sort(key=lambda i: (i["date"], i["official"]), reverse=True)
    save(f"{OUT}/live.json", {"updated": TODAY, "sources": status, "items": keep[:160]})
    print("live.json:", len(keep[:160]), "items")

# ---------------------------------------------------------------- official-page watcher
OPEN = ["applications are now open", "applications are open", "application portal is open", "now accepting applications",
        "the application window is open", "call for applications", "apply now", "applications open"]
CLOSED = ["applications are now closed", "applications have closed", "the application period has ended", "application window is closed",
          "applications will open", "applications will reopen", "register your interest", "sign up to be notified",
          "next call will open", "not currently accepting", "no longer accepting", "applications are closed"]

def page_text(body):
    t = body.decode("utf-8", "replace")
    t = re.sub(r"(?is)<(script|style|noscript|svg|header|footer|nav|form)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"(?is)<[^>]+>", " ", t); t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()

MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december"
UPCOMING = re.compile(r"(applications?|portal|call)[^.]{0,40}\b(will (re)?open|opens? (on|in|from)|open(s)? (on )?\d{1,2} (" + MONTHS + r")|open(s)? (in|from) (" + MONTHS + r"))", re.I)

def signal(text):
    low = text.lower(); score = 0; ev = ""
    up = UPCOMING.search(text)
    if up:  # "applications open on 9 March 2027" describes a future round, not an open one
        score -= 3; ev = text[max(0, up.start() - 60): up.end() + 100]
    for p in OPEN:
        for m in re.finditer(re.escape(p), low):
            win = low[max(0, m.start() - 160): m.end() + 160]
            if any(y in win for y in YEARS):
                score += 2; ev = ev or text[max(0, m.start() - 80): m.end() + 120]
    for p in CLOSED:
        if p in low:
            score -= 2; m = low.index(p); ev = ev or text[max(0, m - 80): m + 120]
    return ("open" if score >= 2 else "closed" if score <= -2 else "unclear"), clean(ev, 240)

def refresh_watch(entries):
    w = load(f"{OUT}/watch.json", {"pages": {}})
    pages = w.get("pages", {})
    hosts_done = {}
    for sid, url in entries:
        p = pages.get(sid, {"url": url})
        if p.get("url") != url: p = {"url": url}
        host = urllib.parse.urlparse(url).netloc
        if host in hosts_done: time.sleep(4)
        hosts_done[host] = 1
        hdr = {}
        if p.get("etag"): hdr["If-None-Match"] = p["etag"]
        if p.get("modified"): hdr["If-Modified-Since"] = p["modified"]
        try:
            code, headers, body = fetch(url, hdr)
            text = page_text(body)
            if len(text) < 200: raise ValueError("page too short to read")
            # hash only the parts that matter: sentences with years, dates or application words
            core = " ".join(s for s in re.split(r"(?<=[.!?])\s+", text) if re.search(r"20\d\d|deadline|apply|application|open|close", s, re.I))
            h = hashlib.sha256(core.encode()).hexdigest()[:16]
            sig, ev = signal(text)
            if p.get("hash") and p["hash"] != h: p["changed"] = TODAY
            p.update({"hash": h, "checked": TODAY, "ok": True, "error": None,
                      "etag": headers.get("ETag"), "modified": headers.get("Last-Modified")})
            # only change the shown status after two runs in a row agree
            if sig == p.get("pending"):
                if p.get("signal") != sig: p["since"] = TODAY
                p["signal"] = sig; p["evidence"] = ev
            p["pending"] = sig
        except urllib.error.HTTPError as ex:
            if ex.code == 304: p.update({"checked": TODAY, "ok": True})
            else: p.update({"checked": TODAY, "ok": False, "error": f"HTTP {ex.code}"})
        except Exception as ex:
            p.update({"checked": TODAY, "ok": False, "error": str(ex)[:120]})
        pages[sid] = p
        time.sleep(2)
    save(f"{OUT}/watch.json", {"updated": TODAY, "pages": pages})
    print("watch.json:", sum(1 for p in pages.values() if p.get("ok")), "of", len(pages), "pages read")

# ---------------------------------------------------------------- recent videos (weekly)
def refresh_videos(entries_all):
    key = os.environ.get("YT_API_KEY", "").strip()
    old = load(f"{OUT}/videos.json", {"updated": "2000-01-01", "items": {}})
    if not key:
        print("No YT_API_KEY: videos.json left as is."); return
    if (NOW - datetime.fromisoformat(old.get("updated", "2000-01-01")).replace(tzinfo=timezone.utc)).days < 6:
        print("videos.json refreshed this week already."); return
    after = (NOW - timedelta(days=150)).strftime("%Y-%m-%dT00:00:00Z")
    out = {}
    for sid, name in entries_all:
        q = re.sub(r"\(.*?\)", "", name).strip() + " scholarship"
        url = "https://www.googleapis.com/youtube/v3/search?" + urllib.parse.urlencode(
            {"part": "snippet", "type": "video", "q": q, "publishedAfter": after, "maxResults": 8, "order": "relevance",
             "relevanceLanguage": "en", "safeSearch": "strict", "videoEmbeddable": "true", "key": key})
        try:
            with urllib.request.urlopen(url, timeout=30) as r: data = json.load(r)
        except Exception as ex:
            print("YouTube search failed for", sid, ex); continue
        words = KEYS.get(sid, []) + [w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{4,}", name)[:2]]
        vids = []
        for it in data.get("items", []):
            s = it["snippet"]; title = html.unescape(s.get("title", ""))
            if not any(w.strip() in title.lower() for w in words): continue
            vids.append({"id": it["id"]["videoId"], "t": title, "by": html.unescape(s.get("channelTitle", "")), "date": s.get("publishedAt", "")[:10]})
        out[sid] = vids[:4]
    save(f"{OUT}/videos.json", {"updated": TODAY, "items": out})
    print("videos.json:", sum(len(v) for v in out.values()), "videos")

def main():
    entries = load(f"{OUT}/watchlist.json", {"pages": []})["pages"]
    refresh_feed()
    refresh_watch([(e["id"], e["url"]) for e in entries if e.get("url")])
    refresh_videos([(e["id"], e["name"]) for e in entries])
    return 0

if __name__ == "__main__":
    sys.exit(main())
