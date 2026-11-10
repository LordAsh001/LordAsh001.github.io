"""Shared helpers for the Nigeria History Atlas bots (standard library only)."""
import datetime as _dt
import hashlib
import html
import json
import os
import pathlib
import re
import time
import urllib.parse
import urllib.request
import urllib.robotparser

HERE = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path(os.environ.get("ATLAS_ROOT", HERE.parents[1]))
DATA = ROOT / "history-atlas" / "data"
UA = "NigeriaHistoryAtlasBot/1.0 (+https://shagbaor.com/history-atlas/; open-data refresh)"
FIXTURES = os.environ.get("ATLAS_FIXTURES")  # tests: directory of cached responses
DIRECTORY_DOMAINS = ("soluap.com", "facts.ng", "naijadetails.com", "nigerianleaders.com", "androidpols.com.ng", "nigeriagalleria.com")


def today():
    return _dt.datetime.now(_dt.timezone.utc).date().isoformat()


def fixture_name(url):
    return hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt"


def http_get(url, retries=2, timeout=45):
    """GET politely with an identifying user agent. Returns text."""
    if FIXTURES:
        p = pathlib.Path(FIXTURES) / fixture_name(url)
        if not p.exists():
            raise RuntimeError(f"no fixture for {url}")
        return p.read_text(encoding="utf-8")
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                ctype = r.headers.get("Content-Type", "")
                if "pdf" in ctype or "officedocument" in ctype or "msword" in ctype:
                    raise RuntimeError("binary document skipped")
                return r.read(3_000_000).decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"GET failed: {url}: {last}")


_ROBOTS = {}


def allowed_by_robots(url):
    """Respect robots.txt. An unreadable robots.txt counts as allowed (standard behaviour)."""
    if FIXTURES:
        return True
    parts = urllib.parse.urlsplit(url)
    base = f"{parts.scheme}://{parts.netloc}"
    if base not in _ROBOTS:
        rp = urllib.robotparser.RobotFileParser()
        try:
            rp.parse(http_get(base + "/robots.txt", retries=1, timeout=20).splitlines())
        except Exception:  # noqa: BLE001
            rp = None
        _ROBOTS[base] = rp
    rp = _ROBOTS[base]
    return True if rp is None else rp.can_fetch(UA, url)


def read_json(name, default=None):
    p = DATA / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def write_json(name, obj):
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def domain(url):
    return re.sub(r"^www\.", "", urllib.parse.urlsplit(url or "").netloc.lower())


def source_type(url):
    d = domain(url)
    if any(d == x or d.endswith("." + x) for x in DIRECTORY_DOMAINS):
        return "directory"
    if d.endswith(".gov.ng"):
        return "official"
    if "wikipedia.org" in d:
        return "encyclopedia"
    if d.endswith(".edu.ng") or d.endswith(".ac.uk") or d.endswith(".edu"):
        return "academic"
    return "other"


def html_to_text(s):
    s = re.sub(r"(?is)<(script|style|nav|footer|noscript)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?i)</(p|div|li|h[1-6]|tr|br)\s*>|<br\s*/?>", "\n", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"[ \t]+", " ", s)


def add_issue_note(title, lines):
    """Add a section to the GitHub issue opened by run_bot.sh."""
    target = os.environ.get("ATLAS_ISSUE_FILE")
    if not target or not lines:
        return
    with open(target, "a", encoding="utf-8") as f:
        f.write(f"## {title}\n\n" + "\n".join(lines) + "\n\n")


def candidate_id(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:10]
