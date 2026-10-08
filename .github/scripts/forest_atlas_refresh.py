"""Refresh data/atlas.json from live sources.

Run weekly by .github/workflows/forest-atlas.yml (or by hand: python3 .github/scripts/forest_atlas_refresh.py).
- WDPA: re-reads name, designation, IUCN category, status year and area for every WDPA-linked record
  from the public ArcGIS mirror of the WDPA terrestrial layer, and flags records that disappeared.
- GBIF: refreshes occurrence-record, species and threatened-species counts for each mapped site.
Site profiles, sources and field-report corrections are edited by hand in forest-atlas/data/atlas.json and are never overwritten.
"""
import json, time, datetime, urllib.request, urllib.parse, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
ATLAS = ROOT / "forest-atlas" / "data" / "atlas.json"
WDPA = "https://services9.arcgis.com/IkktFdUAcY3WrH25/arcgis/rest/services/WDPA_Terrestrial_Simplification50/FeatureServer/0/query"
GBIF = "https://api.gbif.org/v1/occurrence/search"

def get(url, params, tries=3):
    q = url + "?" + urllib.parse.urlencode(params, doseq=True)
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(q, headers={"User-Agent": "nigeria-forest-atlas"}), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(3 * (i + 1)); err = e
    raise err

def bbox(f):
    if f.get("g"):
        xs = [c[0] for p in f["g"] for r in p for c in r]; ys = [c[1] for p in f["g"] for r in p for c in r]
        b = [min(xs), min(ys), max(xs), max(ys)]
        if b[2] - b[0] < .04:
            cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2; b = [cx - .02, cy - .02, cx + .02, cy + .02]
        return b
    if f.get("la") is None: return None
    km = max(4, (f.get("a") or f.get("ar") or 400) / 100); h = max(.02, km ** .5 / 111 / 2)
    return [f["lo"] - h, f["la"] - h, f["lo"] + h, f["la"] + h]

def main():
    atlas = json.loads(ATLAS.read_text())
    sites = atlas["f"]
    # 1. WDPA attributes
    w = get(WDPA, {"where": "ISO3='NGA'", "outFields": "WDPAID,NAME,DESIG_E,IUCN_CA,STATUS_YR,AREA_KM2", "returnGeometry": "false", "f": "json", "resultRecordCount": 2000})
    rows = {a["attributes"]["WDPAID"]: a["attributes"] for a in w.get("features", [])}
    changed = missing = 0
    for f in sites:
        if not f.get("w"): continue
        r = rows.get(f["w"])
        if not r:
            missing += 1; f["wdpa_missing"] = True; continue
        a = round(float(r.get("AREA_KM2") or 0) * 100, 1)
        if a and abs(a - (f.get("a") or 0)) > 1: f["a"] = a; changed += 1
        iu = r.get("IUCN_CA")
        if iu and iu != "Not Reported": f["u"] = iu
    # 2. GBIF counts
    for i, f in enumerate(sites):
        b = bbox(f)
        if not b: continue
        wkt = f"POLYGON(({b[0]} {b[1]},{b[2]} {b[1]},{b[2]} {b[3]},{b[0]} {b[3]},{b[0]} {b[1]}))"
        try:
            d = get(GBIF, {"geometry": wkt, "limit": 0, "facet": ["speciesKey", "iucnRedListCategory"], "facetLimit": 3000}, )
        except Exception:
            continue
        fac = {x["field"]: x["counts"] for x in d.get("facets", [])}
        iu = {c["name"]: c["count"] for c in fac.get("IUCN_RED_LIST_CATEGORY", [])}
        f["gb"] = [d.get("count", 0), len(fac.get("SPECIES_KEY", [])), iu.get("CR", 0), iu.get("EN", 0), iu.get("VU", 0)]
        time.sleep(0.2)
    today = datetime.date.today().isoformat()
    atlas["meta"].update({"refreshed": today, "gbif_snapshot": today, "wdpa_access": today})
    ATLAS.write_text(json.dumps(atlas, separators=(",", ":")))
    print(f"WDPA areas updated: {changed}; WDPA records no longer found: {missing}; refreshed {today}")

if __name__ == "__main__":
    main()
