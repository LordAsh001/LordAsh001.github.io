"""Shared helpers for the Nigeria Market Atlas collection bots.

Every bot is polite by design: one identified user agent, robots.txt respected,
a pause between requests to the same host, and one daily run.
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from urllib import robotparser
from urllib.parse import urlparse

import requests

USER_AGENT = "NigeriaMarketAtlasBot/1.0 (+https://shagbaor.com/market-atlas/; research, non-commercial)"
TIMEOUT = 40
PAUSE_SECONDS = 2.0
HERE = Path(__file__).resolve().parent

_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en"})
_robots: dict[str, robotparser.RobotFileParser | None] = {}
_last_hit: dict[str, float] = {}


class Blocked(Exception):
    """The site's robots.txt does not allow this bot to read the page."""


def allowed(url: str) -> bool:
    host = urlparse(url)
    base = f"{host.scheme}://{host.netloc}"
    if base not in _robots:
        rp = robotparser.RobotFileParser()
        try:
            r = _session.get(base + "/robots.txt", timeout=15)
            if r.status_code >= 400:
                _robots[base] = None  # no robots.txt: allowed
            else:
                rp.parse(r.text.splitlines())
                _robots[base] = rp
        except requests.RequestException:
            _robots[base] = None
    rp = _robots[base]
    return True if rp is None else rp.can_fetch(USER_AGENT, url)


def get(url: str, *, as_json: bool = False, binary: bool = False, params: dict | None = None):
    if not allowed(url):
        raise Blocked(f"robots.txt disallows {url}")
    host = urlparse(url).netloc
    wait = PAUSE_SECONDS - (time.time() - _last_hit.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    last_err = None
    for attempt in range(2):
        try:
            r = _session.get(url, params=params, timeout=TIMEOUT)
            _last_hit[host] = time.time()
            r.raise_for_status()
            if as_json:
                return r.json()
            return r.content if binary else r.text
        except requests.RequestException as e:  # retry once after a pause
            last_err = e
            time.sleep(5)
    raise last_err


# ---------- normalisation ----------
def load_markets():
    data = json.loads((HERE / "markets.json").read_text())
    return data["markets"], set(data["commodities"])


MARKETS, COMMODITY_KEYS = load_markets()
STATES = sorted({m["state"] for m in MARKETS} | {
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
    "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
    "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
    "Taraba", "Yobe", "Zamfara"})


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_state(s: str | None) -> str | None:
    if not s:
        return None
    t = slug(s).replace(" state", "").strip()
    if t in ("abuja", "fct", "federal capital territory", "fct abuja"):
        return "FCT"
    if t in ("adanawa",):
        t = "adamawa"
    if t in ("nassarawa",):
        t = "nasarawa"
    for st in STATES:
        if slug(st) == t:
            return st
    return None


_STOP = {"market", "markets", "main", "central", "international", "the", "modern", "state", "new", "grain", "yam",
         "cattle", "vegetable", "border", "fish", "rice", "tomato", "regional", "foodstuff", "and"}


def match_market(name: str, state: str | None = None) -> str | None:
    """Return the atlas market id for a free-text market name, or None."""
    words = [w for w in slug(name).split() if w not in _STOP]
    if not words:
        return None
    best, best_score = None, 0
    for m in MARKETS:
        if state and m["state"] != state:
            continue
        mw = [w for w in slug(m["name"]).split() if w not in _STOP]
        score = len(set(words) & set(mw))
        if score > best_score or (score == best_score and score and len(mw) < len(best["name"].split())):
            best, best_score = m, score
    return best["id"] if best and best_score >= 1 else None


COMMODITY_PATTERNS = [
    (r"paddy", "paddy"),
    (r"honey ?beans?|oloyin", "oloyin"),
    (r"brown (cowpea|beans?)|beans? \(?drum|red beans", "beansb"),
    (r"white (cowpea|beans?)|zapa|white black eye", "beansw"),
    (r"^(beans?|cowpea)$", "beansb"),
    (r"yellow maize|maize.*yellow", "maize"),
    (r"maize|corn$|^corn", "maize"),
    (r"guinea corn|dawa|sorghum", "sorghum"),
    (r"millet|gero|dauro", "millet"),
    (r"imported rice|rice.*imported|foreign rice", "ricei"),
    (r"processed rice|local rice|nigerian.*rice|rice \(local\)|milled rice|^rice$|eko rice", "ricel"),
    (r"soy", "soy"),
    (r"groundnut|peanut", "groundnut"),
    (r"sesame|beniseed", "sesame"),
    (r"hibiscus|zobo", "hibiscus"),
    (r"cocoa", "cocoa"),
    (r"cashew", "cashew"),
    (r"shea \(?dry|shea nut|^shea$", "shea"),
    (r"ginger.*dr|dried ginger", "gingerdry"),
    (r"ginger", "ginger"),
    (r"yellow garri|garri.*yellow|gari.*yellow", "garriy"),
    (r"garri|gari", "garriw"),
    (r"tomato", "tomato"),
    (r"onion", "onion"),
    (r"pepper|rodo|shombo|tatashe", "pepper"),
    (r"palm oil", "palmoil"),
    (r"vegetable oil", "vegoil"),
    (r"egusi|melon", "egusi"),
    (r"egg", "eggs"),
    (r"wheat", "wheat"),
    (r"yam", "yam"),
]


def match_commodity(name: str) -> str | None:
    t = slug(name)
    for pat, key in COMMODITY_PATTERNS:
        if re.search(pat, t):
            return key if key in COMMODITY_KEYS else None
    return None


def to_number(s) -> float | None:
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return float(s)
    t = str(s).replace("₦", "").replace("N", "").replace(",", "").strip()
    m = re.findall(r"\d+(?:\.\d+)?", t)
    if not m:
        return None
    nums = [float(x) for x in m]
    if "-" in t and len(nums) == 2:  # a range like 185-200 → midpoint
        return sum(nums) / 2
    return nums[0]


def kg_in_unit(unit: str) -> float | None:
    u = unit.lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*(kg|l\b|litre|liter|litres)", u)
    if m:
        return float(m.group(1))
    if re.fullmatch(r"\s*(kg|per kg|1 ?kg|litre|1-litre|liter)\s*", u):
        return 1.0
    if "mt" in u.split() or "tonne" in u or "ton" in u.split():
        return 1000.0
    return None


def today() -> str:
    return date.today().isoformat()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def record(src, c, price, unit, per, dt, scope, where, **extra):
    r = {"src": src, "c": c, "price": round(float(price), 2), "unit": unit, "per": per,
         "date": dt, "scope": scope, "where": where}
    r.update({k: v for k, v in extra.items() if v is not None})
    return r
