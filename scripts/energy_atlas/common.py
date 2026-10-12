"""Shared helpers for the Nigeria Energy Atlas data bots (standard library only)."""
import datetime as _dt
import hashlib
import json
import os
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(os.environ.get("ATLAS_ROOT", pathlib.Path(__file__).resolve().parents[2]))
DATA = ROOT / "energy-atlas" / "data"
UA = "NigeriaEnergyAtlasBot/1.0 (+https://shagbaor.com/energy-atlas/; open-data refresh)"
FIXTURES = os.environ.get("ATLAS_FIXTURES")  # tests: directory of cached responses


def now_iso():
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()


def _fixture_path(url):
    return pathlib.Path(FIXTURES) / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt")


def http_get(url, retries=3, timeout=60):
    """GET a URL politely (identifying user agent, retries with backoff). Returns text."""
    if FIXTURES:
        p = _fixture_path(url)
        if not p.exists():
            raise RuntimeError(f"no fixture for {url} ({p.name})")
        return p.read_text(encoding="utf-8")
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"GET failed after {retries} tries: {url}: {last}")


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
    if p.exists():
        old = json.loads(p.read_text(encoding="utf-8"))
        if strip(old) == strip(obj):
            return False  # nothing new -> no file change, no commit
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    touch_manifest(name, changed=True)
    return True


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


def q(s):
    return urllib.parse.quote(s, safe="")
