"""Shared helpers for the Nigeria Diaspora Atlas data bots (standard library only)."""
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
DATA = ROOT / "diaspora-atlas" / "data"
UA = "NigeriaDiasporaAtlasBot/1.0 (+https://shagbaor.com/diaspora-atlas/; open-data refresh)"
FIXTURES = os.environ.get("ATLAS_FIXTURES")  # tests: directory of cached responses

_COUNTRIES = json.loads((HERE / "countries.json").read_text(encoding="utf-8"))
ISO3_TO_M49 = {k: v["n"] for k, v in _COUNTRIES.items()}
ISO2_TO_M49 = {v["a2"]: v["n"] for v in _COUNTRIES.values()}
ISO2_TO_M49.update({"EL": "300", "UK": "826"})  # Eurostat's own codes for Greece and the UK
M49_NAME = {v["n"]: v["name"] for v in _COUNTRIES.values()}


def now_iso():
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()


def fixture_name(url):
    return hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt"


def http_get(url, retries=3, timeout=60, headers=None):
    """GET a URL politely (identifying user agent, retries with backoff). Returns text."""
    if FIXTURES:
        p = pathlib.Path(FIXTURES) / fixture_name(url)
        if not p.exists():
            raise RuntimeError(f"no fixture for {url} ({p.name})")
        return p.read_text(encoding="utf-8")
    last = None
    for i in range(retries):
        try:
            h = {"User-Agent": UA, "Accept": "*/*"}
            h.update(headers or {})
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"GET failed after {retries} tries: {url}: {last}")


def http_status(url, timeout=30):
    """Return (status_code or None, final_url, error) for a link check. HEAD first, then GET."""
    if FIXTURES:
        p = pathlib.Path(FIXTURES) / ("status-" + fixture_name(url))
        return (int(p.read_text()) if p.exists() else 200), url, None
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.geturl(), None
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (403, 405, 501):
                continue
            return e.code, url, None
        except Exception as e:  # noqa: BLE001
            err = str(e)
            if method == "GET":
                return None, url, err
    return None, url, "unreachable"


_ROBOTS = {}


def allowed_by_robots(url):
    """Respect robots.txt. Unreadable robots.txt counts as allowed (standard behaviour)."""
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
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return default


def write_json(name, obj):
    """Write only if the payload (ignoring timestamps) changed. Returns True if written."""
    DATA.mkdir(parents=True, exist_ok=True)
    p = DATA / name
    strip = lambda o: {k: v for k, v in o.items() if k not in ("checked", "updated")} if isinstance(o, dict) else o
    changed = True
    if p.exists():
        old = json.loads(p.read_text(encoding="utf-8"))
        changed = strip(old) != strip(obj)
    if changed:
        p.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    touch_manifest(name, changed)
    return changed


def touch_manifest(name, changed):
    p = DATA / "manifest.json"
    m = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"datasets": {}}
    d = m["datasets"].setdefault(name, {})
    d["checked"] = now_iso()
    if changed:
        d["updated"] = d["checked"]
    m["generated"] = now_iso()
    p.write_text(json.dumps(m, indent=1) + "\n", encoding="utf-8")


def add_issue_note(title, lines):
    """Append a section to the issue body file the workflow turns into a GitHub issue."""
    out = os.environ.get("ATLAS_ISSUE_FILE")
    if not out or not lines:
        return
    with open(out, "a", encoding="utf-8") as f:
        f.write(f"### {title}\n\n" + "\n".join(lines) + "\n\n")


def html_to_text(s):
    s = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?i)<br\s*/?>|</(p|li|h\d|div|tr|td|th)>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"[ \t\r\f\v]+", " ", s)


def sentences(text):
    out = []
    for block in text.split("\n"):
        for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9“\"])", block.strip()):
            sent = sent.strip()
            if 20 <= len(sent) <= 600:
                out.append(sent)
    return out


def digest(s):
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:16]


def jsonstat_records(js):
    """Flatten a JSON-stat 2.0 dataset into dicts {dim: category_code, ..., 'value': v}."""
    ids, sizes, dims = js["id"], js["size"], js["dimension"]
    cats = []
    for d in ids:
        idx = dims[d]["category"]["index"]
        if isinstance(idx, list):
            idx = {c: i for i, c in enumerate(idx)}
        cats.append(sorted(idx.items(), key=lambda kv: kv[1]))
    vals = js.get("value", {})
    items = vals.items() if isinstance(vals, dict) else ((str(i), v) for i, v in enumerate(vals))
    recs = []
    for k, v in items:
        if v is None:
            continue
        n = int(k)
        rec = {}
        for d, size, cs in reversed(list(zip(ids, sizes, cats))):
            rec[d] = cs[n % size][0]
            n //= size
        rec["value"] = v
        recs.append(rec)
    return recs
