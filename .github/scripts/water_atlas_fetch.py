"""Download the open source data behind the Nigeria Water Resources Atlas.

Run by .github/workflows/water-atlas.yml (or by hand: python3 .github/scripts/water_atlas_fetch.py RAW_DIR).
Each source is saved as JSON in RAW_DIR. A source that fails is logged and skipped, so one
outage never blocks the rest; water_atlas_build.py then keeps the previous values for it.
"""
import json, sys, time, math, datetime, urllib.request, urllib.parse, pathlib, io, zipfile

RAW = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "raw")
RAW.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "nigeria-water-atlas/1.0 (https://shagbaor.com/water-atlas/)"}
BBOX = "2.6,4.2,14.7,13.95"
LOG = []

def log(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); LOG.append(s)

def http(url, params=None, data=None, tries=4, timeout=120, headers=None, raw=False):
    if params: url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    h = dict(UA); h.update(headers or {})
    err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data.encode() if isinstance(data, str) else data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b if raw else json.loads(b)
        except Exception as e:
            err = e; time.sleep(4 * (i + 1))
    raise err

def save(name, obj):
    (RAW / name).write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    log(f"saved {name}")

def arcgis(url, where="1=1", fields="*", geom=True, offset=None, extra=None, page=2000):
    out, start = [], 0
    while True:
        p = {"f": "json", "where": where, "outFields": fields, "returnGeometry": "true" if geom else "false",
             "outSR": 4326, "resultOffset": start, "resultRecordCount": page}
        if offset: p["maxAllowableOffset"] = offset
        if extra: p.update(extra)
        j = http(url + "/query", p)
        if "error" in j: raise RuntimeError(j["error"])
        fs = j.get("features", [])
        out += fs
        if not fs or (len(fs) < page and not j.get("exceededTransferLimit")): break
        start += len(fs)
    return out

def step(name, fn):
    try:
        fn()
    except Exception as e:
        log(f"FAILED {name}: {e!r}")

# ---------------------------------------------------------------- sources
GDW = "https://services8.arcgis.com/oTalEaSXAuyNT7xf/arcgis/rest/services/GDW_v1_epsilon_gdb/FeatureServer"
UNICEF = "https://services3.arcgis.com/7J7WB6yJX0pYke9q/arcgis/rest/services"
DIVA_ZIP = "https://biogeo.ucdavis.edu/data/diva/wat/NGA_wat.zip"
DIVA_MIRROR = "https://services1.arcgis.com/m9p5y180BqMf6JT7/arcgis/rest/services/Nigeria_inland_water_lines/FeatureServer"
GRID3_WP = "https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services/Water_points_in_Nigeria/FeatureServer/0"
HYBAS4 = "https://services.arcgis.com/hRUr1F8lE8Jq2uJo/arcgis/rest/services/HydroBASINS_Africa_Level_4/FeatureServer/0"

def gdw():
    save("gdw_dams.json", arcgis(GDW + "/0", "COUNTRY='Nigeria'"))
    save("gdw_reservoirs.json", arcgis(GDW + "/1", "COUNTRY='Nigeria'", offset=0.002, extra={"geometryPrecision": 4}))

def unicef():
    save("inventory_dams.json", arcgis(UNICEF + "/Nigeria_Dams_WFL1/FeatureServer/0", geom=False))
    save("flood_lga_2024.json", arcgis(UNICEF + "/2024_Nigeria_Flood_Risk_Analysis_WFL1/FeatureServer/7", offset=0.004,
                                       extra={"geometryPrecision": 3}, page=500))

def diva():
    # original DIVA-GIS download (Digital Chart of the World); falls back to an ArcGIS mirror of the same files
    try:
        b = http(DIVA_ZIP, raw=True, timeout=300)
        z = zipfile.ZipFile(io.BytesIO(b))
        import shapefile  # pyshp
        for kind in ("lines", "areas"):
            base = [n[:-4] for n in z.namelist() if n.lower().endswith(".shp") and kind in n.lower()][0]
            r = shapefile.Reader(shp=io.BytesIO(z.read(base + ".shp")), dbf=io.BytesIO(z.read(base + ".dbf")), shx=io.BytesIO(z.read(base + ".shx")))
            names = [f[0] for f in r.fields[1:]]
            feats = [{"properties": dict(zip(names, sr.record)), "geometry": sr.shape.__geo_interface__} for sr in r.shapeRecords()]
            save(f"diva_{kind}.json", {"source": DIVA_ZIP, "features": feats})
        return
    except Exception as e:
        log(f"DIVA zip failed ({e!r}); using ArcGIS mirror")
    save("diva_lines.json", {"source": DIVA_MIRROR, "esri": arcgis(DIVA_MIRROR + "/0", offset=0.001, extra={"geometryPrecision": 4})})
    save("diva_areas.json", {"source": DIVA_MIRROR, "esri": arcgis(DIVA_MIRROR + "/1", offset=0.001, extra={"geometryPrecision": 4})})

def waterpoints():
    save("grid3_waterpoints.json", arcgis(GRID3_WP, fields="statename,lganame,water_typ,source,name,timestamp", extra={"geometryPrecision": 4}))

def basins():
    save("hydrobasins_l4.json", arcgis(HYBAS4, extra={"geometry": BBOX, "geometryType": "esriGeometryEnvelope", "inSR": 4326,
                                                     "spatialRel": "esriSpatialRelIntersects", "geometryPrecision": 3}, offset=0.01))

def naturalearth():
    base = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
    for n in ("ne_10m_rivers_lake_centerlines", "ne_10m_lakes"):
        save(n + ".json", http(base + n + ".geojson", timeout=300))

SPARQL = """SELECT ?i ?iLabel ?t ?coord ?img ?river ?riverLabel ?admin ?adminLabel ?inception ?height ?cap ?area ?vol ?len ?basinLabel ?mouthLabel ?enwiki ?commons WHERE {
 VALUES ?t {wd:Q12323 wd:Q131681 wd:Q23397 wd:Q34038 wd:Q177380 wd:Q124714 wd:Q187223 wd:Q4022 wd:Q1898470 wd:Q15324 wd:Q2367225}
 ?i wdt:P31 ?t; wdt:P17 wd:Q1033.
 OPTIONAL{?i wdt:P625 ?coord} OPTIONAL{?i wdt:P18 ?img} OPTIONAL{?i wdt:P177|wdt:P4614 ?river}
 OPTIONAL{?i wdt:P131 ?admin} OPTIONAL{?i wdt:P571 ?inception} OPTIONAL{?i wdt:P2048 ?height} OPTIONAL{?i wdt:P2109 ?cap}
 OPTIONAL{?i wdt:P2046 ?area} OPTIONAL{?i wdt:P2234 ?vol} OPTIONAL{?i wdt:P2043 ?len} OPTIONAL{?i wdt:P4614 ?basin}
 OPTIONAL{?i wdt:P403 ?mouth} OPTIONAL{?i wdt:P373 ?commons}
 OPTIONAL{?enwiki schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>}
 SERVICE wikibase:label{bd:serviceParam wikibase:language "en"}}"""

def wikidata():
    j = http("https://query.wikidata.org/sparql", {"query": SPARQL, "format": "json"}, headers={"Accept": "application/sparql-results+json"}, timeout=180)
    rows = [{k: v["value"] for k, v in b.items()} for b in j["results"]["bindings"]]
    save("wikidata.json", rows)
    # Wikipedia lead paragraphs for items with an English article
    titles = {r["enwiki"].split("/wiki/")[-1] for r in rows if r.get("enwiki")}
    try:
        cur = json.loads((pathlib.Path(__file__).resolve().parents[2] / "water-atlas" / "data" / "curated.json").read_text())
        titles |= set(cur.get("extra_titles", [])) | {r["wiki"] for r in cur.get("rivers", [])} | {d["wiki"] for d in cur.get("extra_dams", [])}
        titles |= set(cur.get("dam_wiki", {}).values()) | {e["title"] for e in cur.get("flood_events", [])}
    except Exception as e:
        log("curated.json not read", e)
    titles = sorted(titles)
    ext = {}
    for i in range(0, len(titles), 20):
        chunk = [urllib.parse.unquote(t).replace("_", " ") for t in titles[i:i + 20]]
        try:
            d = http("https://en.wikipedia.org/w/api.php", {"action": "query", "prop": "extracts|info|coordinates|pageimages", "exintro": 1, "piprop": "name", "colimit": "max", "explaintext": 1,
                                                             "inprop": "url", "redirects": 1, "format": "json", "titles": "|".join(chunk)})
            norm = {n["to"]: n["from"] for n in d["query"].get("redirects", []) + d["query"].get("normalized", [])}
            for p in d["query"]["pages"].values():
                if "extract" in p:
                    c = (p.get("coordinates") or [{}])[0]
                    ext[p["title"]] = {"text": p["extract"], "url": p.get("fullurl"), "rev": p.get("lastrevid"),
                                       "la": c.get("lat"), "lo": c.get("lon"), "img": p.get("pageimage")}
                    if p["title"] in norm: ext[norm[p["title"]]] = ext[p["title"]]
        except Exception as e:
            log("wikipedia chunk failed", e)
        time.sleep(0.5)
    save("wikipedia.json", ext)
    commons_meta([r["img"].split("FilePath/")[-1] for r in rows if r.get("img")] + [e["img"] for e in ext.values() if e.get("img")], "commons_wikidata.json")

def commons_meta(files, name):
    files = sorted({urllib.parse.unquote(f) for f in files})
    meta = {}
    for i in range(0, len(files), 40):
        chunk = ["File:" + f for f in files[i:i + 40]]
        try:
            d = http("https://commons.wikimedia.org/w/api.php", {"action": "query", "prop": "imageinfo", "iiprop": "url|extmetadata|size",
                                                                 "iiurlwidth": 960, "format": "json", "titles": "|".join(chunk)})
            for p in d["query"]["pages"].values():
                ii = (p.get("imageinfo") or [{}])[0]
                m = ii.get("extmetadata", {})
                g = lambda k: (m.get(k) or {}).get("value", "")
                meta[p["title"][5:]] = {"url": ii.get("url"), "thumb": ii.get("thumburl"), "w": ii.get("width"), "h": ii.get("height"),
                                        "author": g("Artist"), "license": g("LicenseShortName"), "desc": g("ImageDescription")[:300]}
        except Exception as e:
            log("commons chunk failed", e)
        time.sleep(0.5)
    save(name, meta)

DHS_IND = ["WS_SRCE_P_IMP", "WS_SRCE_P_BAS", "WS_SRCE_P_LTD", "WS_SRCE_P_NIM", "WS_SRCE_P_SRF", "WS_SRCE_P_TUB", "WS_SRCE_P_SCH",
           "WS_SRCE_P_PIP", "WS_SRCE_P_PYD", "WS_SRCE_P_TAP", "WS_SRCE_P_BOT", "WS_TIME_P_ONP", "WS_TIME_P_M30",
           "WS_WTRT_P_APP", "WS_WTRT_P_NTR", "WS_TLET_P_BAS", "WS_TLET_P_NFC", "WS_HNDW_P_BAS"]

def dhs():
    base = "https://api.dhsprogram.com/rest/dhs/data"
    sub = http(base, {"countryIds": "NG", "indicatorIds": ",".join(DHS_IND), "surveyIds": "NG2024DHS,NG2018DHS",
                      "breakdown": "subnational", "perpage": 5000, "f": "json"})
    nat = http(base, {"countryIds": "NG", "indicatorIds": ",".join(DHS_IND), "breakdown": "national", "perpage": 5000, "f": "json"})
    ind = http("https://api.dhsprogram.com/rest/dhs/indicators", {"indicatorIds": ",".join(DHS_IND), "f": "json",
                                                                  "returnFields": "IndicatorId,Label,Definition,MeasurementType"})
    save("dhs.json", {"subnational": sub.get("Data", []), "national": nat.get("Data", []), "indicators": ind.get("Data", [])})

WDI = ["SH.H2O.BASW.ZS", "SH.H2O.BASW.RU.ZS", "SH.H2O.BASW.UR.ZS", "SH.H2O.SMDW.ZS", "SH.STA.BASS.ZS", "SH.STA.ODFC.ZS",
       "ER.H2O.INTR.K3", "ER.H2O.INTR.PC", "ER.H2O.FWTL.K3", "ER.H2O.FWST.ZS", "ER.H2O.FWAG.ZS", "ER.H2O.FWDM.ZS", "ER.H2O.FWIN.ZS",
       "AG.LND.IRIG.AG.ZS", "SP.POP.TOTL"]

def worldbank():
    out = {}
    for ind in WDI:
        try:
            j = http(f"https://api.worldbank.org/v2/country/NGA/indicator/{ind}", {"format": "json", "per_page": 100})
            meta = http(f"https://api.worldbank.org/v2/indicator/{ind}", {"format": "json"})
            m = meta[1][0] if len(meta) > 1 and meta[1] else {}
            out[ind] = {"name": m.get("name"), "source": (m.get("sourceOrganization") or "").strip(), "note": (m.get("sourceNote") or "")[:600],
                        "data": sorted([[int(r["date"]), r["value"]] for r in (j[1] or []) if r.get("value") is not None])}
        except Exception as e:
            log(f"WDI {ind} failed: {e!r}")
    save("worldbank.json", out)

# flood-watch gauges: river, place, approximate channel position (lat, lon). Snapped to the GloFAS cell with most flow nearby.
GAUGES = [
    ("niger-lokoja", "Niger", "Lokoja (below the Benue confluence)", 7.79, 6.75),
    ("niger-onitsha", "Niger", "Onitsha", 6.13, 6.77),
    ("niger-aboh", "Niger", "Aboh (head of the Delta)", 5.55, 6.53),
    ("niger-baro", "Niger", "Baro", 8.60, 6.42),
    ("niger-jebba", "Niger", "Jebba (below the dam)", 9.12, 4.80),
    ("niger-border", "Niger", "Benin–Niger border (inflow to Nigeria)", 11.70, 3.62),
    ("benue-makurdi", "Benue", "Makurdi", 7.74, 8.53),
    ("benue-ibi", "Benue", "Ibi", 8.18, 9.74),
    ("benue-numan", "Benue", "Numan", 9.47, 12.03),
    ("benue-yola", "Benue", "Jimeta–Yola", 9.28, 12.43),
    ("benue-border", "Benue", "Cameroon border (below Lagdo)", 9.30, 12.80),
    ("kaduna-kaduna", "Kaduna", "Kaduna city", 10.53, 7.42),
    ("rima-sokoto", "Sokoto–Rima", "Sokoto", 13.06, 5.22),
    ("hadejia-hadejia", "Hadejia", "Hadejia", 12.46, 10.04),
    ("yobe-gashua", "Komadugu-Yobe", "Gashua", 12.87, 11.05),
    ("gongola-dadinkowa", "Gongola", "below Dadin Kowa Dam", 10.31, 11.48),
    ("katsinaala-town", "Katsina-Ala", "Katsina-Ala", 7.17, 9.28),
    ("cross-ikom", "Cross", "Ikom", 5.96, 8.72),
    ("ogun-abeokuta", "Ogun", "Abeokuta", 7.15, 3.35),
    ("anambra-otuocha", "Anambra", "Otuocha", 6.33, 6.83),
]
FLOOD = "https://flood-api.open-meteo.com/v1/flood"

def gauges():
    out = []
    end = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    for gid, river, place, la, lo in GAUGES:
        try:
            cand = [(round(la + dy, 3), round(lo + dx, 3)) for dy in (-0.05, 0, 0.05) for dx in (-0.05, 0, 0.05)]
            j = http(FLOOD, {"latitude": ",".join(str(c[0]) for c in cand), "longitude": ",".join(str(c[1]) for c in cand),
                             "daily": "river_discharge", "start_date": "2024-01-01", "end_date": "2024-12-31"})
            j = j if isinstance(j, list) else [j]
            means = [sum(x or 0 for x in r["daily"]["river_discharge"]) / max(1, len(r["daily"]["river_discharge"])) for r in j]
            k = max(range(len(means)), key=lambda i: means[i])
            sla, slo = j[k]["latitude"], j[k]["longitude"]
            h = http(FLOOD, {"latitude": sla, "longitude": slo, "daily": "river_discharge", "start_date": "1984-01-01", "end_date": end}, timeout=300)
            out.append({"id": gid, "river": river, "place": place, "la": la, "lo": lo, "sla": sla, "slo": slo,
                        "t0": h["daily"]["time"][0], "q": h["daily"]["river_discharge"]})
            log(f"gauge {gid}: cell {sla},{slo} mean2024={means[k]:.0f}")
        except Exception as e:
            log(f"gauge {gid} failed: {e!r}")
        time.sleep(1)
    save("glofas_gauges.json", out)

if __name__ == "__main__":
    for name, fn in [("GDW", gdw), ("UNICEF", unicef), ("DIVA-GIS", diva), ("GRID3", waterpoints), ("HydroBASINS", basins),
                     ("Natural Earth", naturalearth), ("Wikidata/Wikipedia/Commons", wikidata), ("DHS", dhs), ("World Bank", worldbank), ("GloFAS gauges", gauges)]:
        step(name, fn)
    (RAW / "fetch_log.txt").write_text("\n".join(LOG) + "\n")
