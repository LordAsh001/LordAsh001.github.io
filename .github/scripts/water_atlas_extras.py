"""Extra reference datasets for the Nigeria Water Resources Atlas (run monthly from .github/workflows/water-atlas-extras.yml).

Writes to water-atlas/data/:
  aquifers.json   – Africa Groundwater Atlas hydrogeology map of Nigeria, 1:5 million (British Geological Survey, CC BY-SA)
  fao_dams.json   – FAO AQUASTAT dams database, Nigeria sheet
  aqueduct.json   – WRI Aqueduct 4.0 country and state (province) rankings for Nigeria
  owid_water.json – Our World in Data series for Nigeria (SDG 6.4.2 water stress, withdrawals, safely managed water and sanitation)
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
    save("fao_dams.json", {"built": NOW, "src": "FAO AQUASTAT dams database, Nigeria", "u": "https://www.fao.org/aquastat/en/databases/dams", "head": head, "dams": out})

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
    save("aqueduct.json", {"built": NOW, "src": "WRI Aqueduct 4.0 Current and Future Country Rankings", "u": "https://www.wri.org/data/aqueduct-40-country-rankings", "sheets": sheets})

# ---------------------------------------------------------------- Our World in Data
OWID = ["freshwater-withdrawals-as-a-share-of-internal-resources", "water-withdrawals-per-capita", "annual-freshwater-withdrawals",
        "renewable-water-resources-per-capita", "proportion-using-safely-managed-drinking-water", "share-using-safely-managed-sanitation",
        "share-of-the-population-using-at-least-basic-drinking-water", "share-of-population-using-at-least-basic-sanitation",
        "water-productivity", "agricultural-water-as-a-share-of-total-water-withdrawals"]
def owid():
    out = {}
    for s in OWID:
        try:
            t = get(f"https://ourworldindata.org/grapher/{s}.csv?v=1&csvType=full&useColumnShortNames=true").decode("utf-8")
            rows = list(csv.reader(io.StringIO(t))); head = rows[0]
            keep = [r for r in rows[1:] if r[0] in ("Nigeria", "Sub-Saharan Africa (WB)", "Sub-Saharan Africa", "World", "Africa")]
            out[s] = {"head": head, "rows": keep}
        except Exception as e: print("owid", s, repr(e), flush=True)
    if not out: raise RuntimeError("no OWID series")
    save("owid_water.json", {"built": NOW, "src": "Our World in Data (UN SDG database, FAO AQUASTAT, WHO/UNICEF JMP)", "u": "https://ourworldindata.org/water-use-stress", "series": out})

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
    only = set(filter(None, os.environ.get("WA_ONLY", "").split(",")))
    for name, fn in (("aquifers", aquifers), ("fao_dams", fao_dams), ("aqueduct", aqueduct), ("owid", owid), ("ndcd", ndcd)):
        if not only or name in only: step(name, fn)
