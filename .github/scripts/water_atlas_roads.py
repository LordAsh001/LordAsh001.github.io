"""Major roads layer for the Nigeria Water Resources Atlas.

Downloads Nigeria's motorways, trunk and primary roads from OpenStreetMap (Overpass API),
joins the pieces of each route, simplifies them for display and writes water-atlas/data/roads.json.
Run by .github/workflows/water-atlas.yml (or by hand: python3 .github/scripts/water_atlas_roads.py [RAW_DIR]).
If every Overpass server fails, the previous roads.json is left untouched.
Optional: WA_ROADS_FILE=path/to/overpass.json builds from a saved Overpass response instead of downloading.
"""
import os, sys, json, math, time, datetime, pathlib, urllib.request, urllib.parse, collections
from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge, unary_union

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "water-atlas" / "data" / "roads.json"
RAW = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
UA = {"User-Agent": "nigeria-water-atlas/1.0 (https://shagbaor.com/water-atlas/)",
      "Content-Type": "application/x-www-form-urlencoded"}
QUERY = ('[out:json][timeout:240];area["ISO3166-1"="NG"][admin_level=2]->.a;'
         'way["highway"~"^(motorway|trunk|primary)$"](area.a);out tags geom qt;')
SERVERS = ["https://overpass-api.de/api/interpreter",
           "https://overpass.private.coffee/api/interpreter",
           "https://overpass.kumi.systems/api/interpreter"]
CLASS = {"motorway": 0, "trunk": 1, "primary": 2}
TOL = {0: 0.0012, 1: 0.0015, 2: 0.002}   # simplification tolerance in degrees (~130-220 m)

def download():
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    for url in SERVERS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, data=body, headers=UA)
                with urllib.request.urlopen(req, timeout=300) as r:
                    j = json.loads(r.read())
                if j.get("elements"):
                    print(f"roads: {len(j['elements'])} ways from {url}", flush=True)
                    return j
                print(f"roads: empty answer from {url}: {j.get('remark', '')[:200]}", flush=True)
            except Exception as e:
                print(f"roads: {url} failed ({e!r})", flush=True)
            time.sleep(20)
    return None

def km(line):
    c = list(line.coords); s = 0.0
    for (x1, y1), (x2, y2) in zip(c, c[1:]):
        dx = (x2 - x1) * 111.32 * math.cos(math.radians((y1 + y2) / 2)); dy = (y2 - y1) * 110.57
        s += math.hypot(dx, dy)
    return s

def main():
    src = os.environ.get("WA_ROADS_FILE")
    j = json.loads(pathlib.Path(src).read_text()) if src else download()
    if not j:
        print("roads: no data downloaded; keeping the previous roads.json", flush=True)
        return
    if RAW:
        RAW.mkdir(parents=True, exist_ok=True)
        (RAW / "osm_roads.json").write_text(json.dumps(j, separators=(",", ":")))
    groups = collections.defaultdict(list)
    names = collections.defaultdict(collections.Counter)
    for w in j["elements"]:
        t = w.get("tags", {}); c = CLASS.get(t.get("highway"))
        g = w.get("geometry") or []
        if c is None or len(g) < 2: continue
        ln = LineString([(p["lon"], p["lat"]) for p in g])
        ref = (t.get("ref") or "").replace(";", " / ").strip()
        key = (c, ref, "" if ref else t.get("name", "").strip())
        groups[key].append(ln)
        if t.get("name"): names[key][t["name"].strip()] += max(1, round(km(ln)))
    roads, total = [], collections.Counter()
    for key, lines in groups.items():
        c, ref = key[0], key[1]
        merged = linemerge(unary_union(lines))
        parts = list(merged.geoms) if isinstance(merged, MultiLineString) else [merged]
        length = sum(km(p) for p in parts)
        total[c] += length
        geo = []
        for p in parts:
            s = p.simplify(TOL[c], preserve_topology=False)
            pts = []
            for x, y in s.coords:
                q = [round(x, 3), round(y, 3)]
                if not pts or pts[-1] != q: pts.append(q)
            if len(pts) >= 2: geo.append(pts)
        if not geo: continue
        top = [n for n, _ in names[key].most_common(3)]
        r = {"c": c, "km": round(length), "g": geo}
        if ref: r["ref"] = ref
        if top: r["n"] = top
        roads.append(r)
    roads.sort(key=lambda r: (-r["c"], r["km"]))   # draw primary first, motorways last (on top)
    out = {"src": "© OpenStreetMap contributors, ODbL 1.0 (motorway, trunk and primary roads)",
           "refreshed": datetime.date.today().isoformat(),
           "km": {"motorway": round(total[0]), "trunk": round(total[1]), "primary": round(total[2])},
           "r": roads}
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"roads: wrote {len(roads)} routes, {OUT.stat().st_size // 1024} kB, km by class {dict(out['km'])}", flush=True)

if __name__ == "__main__":
    main()
