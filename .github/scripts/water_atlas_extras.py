"""Extra reference datasets for the Nigeria Water Resources Atlas (run monthly from .github/workflows/water-atlas-extras.yml).

Writes to water-atlas/data/:
  aquifers.json   – Africa Groundwater Atlas hydrogeology map of Nigeria, 1:5 million (British Geological Survey, CC BY-SA)
  fao_dams.json   – FAO AQUASTAT dams database, Nigeria sheet, each record matched to the atlas dam it describes
  aqueduct.json   – WRI Aqueduct 4.0 country and state (province) rankings for Nigeria: water stress, drought and riverine flood risk
  ndcd_water.json – Nigeria Development Cooperation Dashboard: donor-funded water resources and sanitation projects, by state
Each source is independent: one failing leaves its previous file in place.
"""
import io, os, re, csv, json, time, zipfile, pathlib, datetime, urllib.request, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "water-atlas" / "data"
UA = {"User-Agent": "nigeria-water-atlas/1.0 (https://shagbaor.com/water-atlas/)"}
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")

def get(url, timeout=180):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r: return r.read()
        except Exception as e:
            err = e; time.sleep(5 * (i + 1))
    raise err

def save(name, obj):
    p = DATA / name
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    print(f"{name}: {p.stat().st_size // 1024} kB", flush=True)

def step(name, fn):
    try: fn()
    except Exception as e: print(f"FAILED {name}: {e!r}", flush=True)

# ---------------------------------------------------------------- BGS Africa Groundwater Atlas
AQ_CODES = {  # productivity code -> (aquifer type, productivity) from the Atlas user guide
    "U-H/VH": ("Unconsolidated, intergranular", "High to very high"), "U-H": ("Unconsolidated, intergranular", "High"),
    "CSI-M/H": ("Consolidated sedimentary, intergranular", "Moderate to high"), "CSI-L/M": ("Consolidated sedimentary, intergranular", "Low to moderate"),
    "CSIF-M (H)": ("Consolidated sedimentary, intergranular and fracture", "Moderate (locally high)"),
    "I-L/M": ("Igneous", "Low to moderate"), "B-L/M": ("Basement", "Low to moderate"), "n/a": ("Surface water", "n/a"),
}
def aquifers():
    import shapefile
    from shapely.geometry import shape, mapping
    z = zipfile.ZipFile(io.BytesIO(get("https://africagroundwateratlas.org/downloads/Nigeria.zip")))
    names = {n.rsplit("/", 1)[-1]: n for n in z.namelist()}
    r = shapefile.Reader(shp=io.BytesIO(z.read(names["Nigeria_HG.shp"])), dbf=io.BytesIO(z.read(names["Nigeria_HG.dbf"])),
                         shx=io.BytesIO(z.read(names["Nigeria_HG.shx"])), encoding="latin1")
    flds = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        a = dict(zip(flds, sr.record))
        g = shape(sr.shape.__geo_interface__).simplify(0.004, preserve_topology=True)
        if g.is_empty: continue
        gj = mapping(g)
        rnd = lambda c: [[round(x, 3), round(y, 3)] for x, y in c]
        if gj["type"] == "Polygon": coords = [rnd(ring) for ring in gj["coordinates"]]
        else: coords = [[rnd(ring) for ring in poly] for poly in gj["coordinates"]]
        code = (a.get("NigiaHGCom") or "").strip()
        out.append({"c": code, "geo": (a.get("NigiaGLG") or "").strip(), "t": gj["type"], "g": coords})
    save("aquifers.json", {"built": NOW, "src": "Africa Groundwater Atlas country hydrogeology map, Nigeria, v1.0 (British Geological Survey, CC BY-SA)",
                           "u": "https://africagroundwateratlas.org/downloadGIS.html", "codes": AQ_CODES, "f": out})

# ---------------------------------------------------------------- FAO AQUASTAT dams
def fao_dams():
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(get("https://storage.googleapis.com/fao-aquastat.appspot.com/Excel/dams/NGA-dams_eng.xlsx")), read_only=True, data_only=True)
    ws = wb["Dams"]; rows = list(ws.iter_rows(values_only=True))
    h = next(i for i, r in enumerate(rows) if any(re.search(r"name of dam", str(c or ""), re.I) for c in r))
    head = [re.sub(r"\s+", " ", str(c or "")).strip() for c in rows[h]]
    out = []
    for r in rows[h + 1:]:
        d = {k: v for k, v in zip(head, r) if k and v not in (None, "")}
        if d.get("Name of dam"): out.append(d)
    match_dams(out)
    save("fao_dams.json", {"built": NOW, "src": "FAO AQUASTAT dams database, Nigeria", "u": "https://www.fao.org/aquastat/en/databases/dams", "dams": out})

def match_dams(fao):
    """Attach the id of the atlas dam each FAO record describes: names that agree (allowing for spelling), or nearly agree within 15 km.
    Where FAO lists the same dam twice, the record closest to the atlas position keeps the match."""
    import difflib, math
    atlas = json.loads((DATA / "atlas.json").read_text())
    dams = [f for f in atlas.get("f", []) if f.get("c") in (0, 1)]
    norm = lambda s: re.sub(r"\s+", " ", re.sub(r"\b(dam|dams|reservoir|lake|gorge|barrage|polder)\b", "", re.sub(r"\(.*?\)", "", str(s or "").lower())).replace("-", " ")).strip()
    km = lambda a, b, c, d: 111 * math.hypot(a - c, (b - d) * math.cos(math.radians(a)))
    best = {}
    for k, d in enumerate(fao):
        names = [norm(d.get("Name of dam"))] + ([norm(d["Alternate dam name"])] if d.get("Alternate dam name") else [])
        la, lo = d.get("Decimal degree latitude"), d.get("Decimal degree longitude")
        top = None
        for f in dams:
            r = max(difflib.SequenceMatcher(None, n, norm(f["n"])).ratio() for n in names)
            dist = km(la, lo, f["la"], f["lo"]) if isinstance(la, (int, float)) and isinstance(lo, (int, float)) and f.get("la") is not None else None
            if (r >= 0.9 or (r >= 0.75 and dist is not None and dist < 15)) and (top is None or r > top[0]): top = (r, f["i"], dist)
        if not top: continue
        d["km"] = round(top[2]) if top[2] is not None else None
        prev = best.get(top[1])
        rank = (top[2] if top[2] is not None else 999, -len(d))
        if prev is None or rank < prev[0]: best[top[1]] = (rank, k)
    for aid, (_, k) in best.items(): fao[k]["atlas"] = aid
    print("FAO dams matched to atlas:", len(best), "of", len(fao), flush=True)

# ---------------------------------------------------------------- WRI Aqueduct 4.0 country and province rankings
def aqueduct():
    import openpyxl
    z = zipfile.ZipFile(io.BytesIO(get("https://aqueduct.wridata.org/Aqueduct40/aqueduct-4-0-country-rankings.zip", timeout=400)))
    sheets = {}
    for n in z.namelist():
        if not n.lower().endswith((".xlsx", ".xlsm")): continue
        wb = openpyxl.load_workbook(io.BytesIO(z.read(n)), read_only=True, data_only=True)
        for ws in wb.worksheets:
            it = ws.iter_rows(values_only=True); head = None; keep = []
            for r in it:
                if head is None:
                    if r and sum(1 for c in r if isinstance(c, str)) >= 3: head = [str(c) if c is not None else "" for c in r]
                    continue
                if any(c in ("Nigeria", "NGA") for c in r if isinstance(c, str)):
                    keep.append([round(c, 4) if isinstance(c, float) else c for c in r])
            sheets[f"{n.rsplit('/', 1)[-1]}::{ws.title}"] = {"head": head, "rows": keep}
            print("aqueduct sheet", n, ws.title, len(keep), flush=True)
    save("aqueduct.json", trim_aqueduct(sheets))

def trim_aqueduct(sheets):
    """Keep, for Nigeria and each state: baseline water stress (bws) and drought risk (drr) by sector weight, riverine flood risk (rfr),
    and future water stress (all sectors) for 2030, 2050 and 2080 under three scenarios. Each value is [score 0-5, category 0-4, label]."""
    fix = {"Federal Capital Territory": "FCT", "Nassarawa": "Nasarawa"}
    out = {"built": NOW, "src": "WRI Aqueduct 4.0 Current and Future Country Rankings (2023)", "u": "https://www.wri.org/data/aqueduct-40-country-rankings",
           "nga": {}, "st": {}}
    for key, sh in sheets.items():
        h = sh.get("head") or []; ix = {c: i for i, c in enumerate(h)}
        if "indicator_name" not in ix: continue
        for r in sh["rows"]:
            g = lambda c: r[ix[c]] if c in ix and ix[c] < len(r) else None
            val = [g("score"), g("cat"), g("label")]
            tgt = out["nga"] if "name_1" not in ix else out["st"].setdefault(fix.get(g("name_1"), g("name_1")), {})
            if "year" in ix:
                if g("weight") != "Tot": continue
                tgt.setdefault("fut", {})[f"{g('year')}_{g('scenario')}"] = val
            else:
                tgt.setdefault(g("indicator_name"), {})[g("weight")] = val
    return out

# ---------------------------------------------------------------- Nigeria Development Cooperation Dashboard
NDCD = "https://ndcd.ng/api/"
def ndcd():
    acts = {}
    for code, label in ((1, "Pipeline"), (2, "Implementation"), (3, "Finalisation"), (4, "Closed"), (5, "Cancelled"), (6, "Suspended")):
        j = json.loads(get(f"{NDCD}activities/?mtef-sector=22&activity_status_code={code}&per_page=1000&page=1&order_by=updated_date&order_dir=desc"))
        for a in j.get("activities") or []:
            acts[a["id"]] = {"id": a["id"], "t": a.get("title"), "funder": a.get("funding_org") or a.get("reporting_org"), "rep": a.get("reporting_org"),
                             "impl": a.get("implementing_org"), "iati": a.get("iati_identifier"), "status": label,
                             "commit": a.get("total_commitments"), "disb": a.get("total_disbursements"), "proj": a.get("total_projected_disbursements")}
    loc = json.loads(get(f"{NDCD}activity_locations/?mtef-sector=22"))
    names = {l["id"]: re.sub(r"\s+State$", "", l["name"]).replace("Federal Capital Territory", "FCT") for l in loc.get("locations") or []}
    for _, lid, aid in loc.get("activity_locations") or []:
        if aid in acts: acts[aid].setdefault("st", []).append(names.get(lid, str(lid)))
    if not acts: raise RuntimeError("no activities")
    save("ndcd_water.json", {"built": NOW, "src": "Nigeria Development Cooperation Dashboard, sector: Water Resources and Sanitation",
                             "u": "https://ndcd.ng/by/mtef-sector/21", "acts": sorted(acts.values(), key=lambda a: -(a.get("proj") or a.get("commit") or 0))})

if __name__ == "__main__":
    (DATA / "owid_water.json").unlink(missing_ok=True)  # retired: the UN SDG series in atlas.json already cover it
    only = set(filter(None, os.environ.get("WA_ONLY", "").split(",")))
    for name, fn in (("aquifers", aquifers), ("fao_dams", fao_dams), ("aqueduct", aqueduct), ("ndcd", ndcd)):
        if not only or name in only: step(name, fn)
