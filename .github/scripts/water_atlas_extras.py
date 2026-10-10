"""Extra reference datasets for the Nigeria Water Resources Atlas (run monthly from .github/workflows/water-atlas-extras.yml).

Writes to water-atlas/data/:
  aquifers.json   – Africa Groundwater Atlas hydrogeology map of Nigeria, 1:5 million (British Geological Survey, CC BY-SA)
  fao_dams.json   – FAO AQUASTAT dams database, Nigeria sheet, each record matched to the atlas dam it describes
  aqueduct.json   – WRI Aqueduct 4.0 country and state (province) rankings for Nigeria: water stress, drought and riverine flood risk
  ndcd_water.json – Nigeria Development Cooperation Dashboard: donor-funded water resources and sanitation projects, by state
  oilspills.json  – NOSDRA oil spill incident register as published by Nigerian Oil Spill Monitor (oilspillmonitor.ng)
  wpdx.json       – Water Point Data Exchange: water points in Nigeria by state and whether they were working when last reported
  conflicts.json  – Pacific Institute Water Conflict Chronology: events that involve Nigeria
  health.json     – UN SDG 3.9.2 deaths from unsafe water, sanitation and hygiene; reported cholera cases (Our World in Data)
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
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r: b = r.read()
            if b[:2] == b"\x1f\x8b":  # some servers gzip even when not asked
                import gzip; b = gzip.decompress(b)
            return b
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

# ---------------------------------------------------------------- NOSDRA oil spills (Nigerian Oil Spill Monitor)
ST2 = {"AB": "Abia", "AD": "Adamawa", "AK": "Akwa Ibom", "AN": "Anambra", "BA": "Bauchi", "BY": "Bayelsa", "BE": "Benue", "BO": "Borno",
       "CR": "Cross River", "DE": "Delta", "EB": "Ebonyi", "ED": "Edo", "EK": "Ekiti", "EN": "Enugu", "FC": "FCT", "FCT": "FCT", "GO": "Gombe",
       "IM": "Imo", "JI": "Jigawa", "KD": "Kaduna", "KN": "Kano", "KT": "Katsina", "KE": "Kebbi", "KO": "Kogi", "KW": "Kwara", "LA": "Lagos",
       "NA": "Nasarawa", "NI": "Niger", "OG": "Ogun", "ON": "Ondo", "OS": "Osun", "OY": "Oyo", "PL": "Plateau", "RI": "Rivers", "SO": "Sokoto",
       "TA": "Taraba", "YO": "Yobe", "ZA": "Zamfara"}
ST_NAMES = set(ST2.values())
def spill_state(v):
    for t in re.split(r"[,;/]", str(v or "")):
        t = t.strip()
        if not t or t.lower() == "undefined": continue
        if t.upper() in ST2: return ST2[t.upper()]
        n = t.title().replace("Akwa-Ibom", "Akwa Ibom")
        if n in ST_NAMES: return n
    return ""

def code(v, allowed):
    v = str(v or "").strip().lower()
    for t in re.split(r"[,;/( ]", v):
        if t in allowed: return t
    return "other" if v and v not in ("no", "nil") else ("no" if v in ("no", "nil") else "")

def num(v):
    try: x = float(str(v).replace(",", "").strip()); return x if x >= 0 else None
    except Exception: return None

def oilspills():
    rows = json.loads(get("https://oilspillmonitor.ng/api/spill-data.php?dataset=nosdra&format=json", timeout=300))
    rows = [r for r in rows if (r.get("status") or "").lower() != "invalid"]
    comp = {}; inc = []; agg = {"year": {}, "state": {}, "cause": {}, "comp": {}, "contam": {}, "hab": {}}
    def add(k, key, bbl):
        a = agg[k].setdefault(key, [0, 0.0]); a[0] += 1; a[1] += bbl or 0
    for r in rows:
        y = (r.get("incidentdate") or "")[:4]
        y = int(y) if y.isdigit() and 1990 <= int(y) <= int(NOW[:4]) else None
        cause = code(r.get("cause"), {"sab", "eqf", "cor", "ome", "ytd", "mys"})
        con = code(r.get("contaminant"), {"cr", "ga", "re", "co", "ch", "gs", "no"})
        if con == "gs": con = "ga"
        hab = code(r.get("spillareahabitat"), {"la", "sw", "of", "ss", "iw", "ns"})
        st = spill_state(r.get("statesaffected"))
        c = (r.get("company") or "").strip().upper() or "UNKNOWN"
        bbl = num(r.get("estimatedquantity"))
        rec = num(r.get("quantityrecovered"))
        if y: add("year", y, bbl)
        add("state", st or "Not stated", bbl); add("cause", cause or "", bbl); add("comp", c, bbl); add("contam", con or "", bbl); add("hab", hab or "", bbl)
        la, lo = num(r.get("latitude")), num(r.get("longitude"))
        if la is not None and lo is not None and 3.5 < la < 14.5 and 2.5 < lo < 15:
            ci = comp.setdefault(c, len(comp))
            inc.append([round(la, 3), round(lo, 3), y or 0, cause, con, round(bbl, 2) if bbl is not None else None, hab, st, ci])
    for k in agg: agg[k] = {str(a): [b[0], round(b[1])] for a, b in agg[k].items()}
    save("oilspills.json", {"built": NOW, "src": "NOSDRA oil spill incident register via Nigerian Oil Spill Monitor", "u": "https://oilspillmonitor.ng",
                            "n": len(rows), "comp": sorted(comp, key=comp.get), "agg": agg,
                            "cols": ["lat", "lon", "year", "cause", "contaminant", "barrels", "habitat", "state", "company"], "inc": inc})

# ---------------------------------------------------------------- Water Point Data Exchange
def soql(q):
    return json.loads(get("https://data.waterpointdata.org/resource/eqje-vguj.json?$query=" + urllib.parse.quote(q)))

def wpdx():
    st = soql("SELECT clean_adm1, status_id, count(*) AS n WHERE clean_country_id='NGA' GROUP BY clean_adm1, status_id LIMIT 1000")
    src = soql("SELECT water_source_category, status_id, count(*) AS n WHERE clean_country_id='NGA' GROUP BY water_source_category, status_id LIMIT 500")
    tech = soql("SELECT _water_tech_category, status_id, count(*) AS n WHERE clean_country_id='NGA' GROUP BY _water_tech_category, status_id LIMIT 500")
    rng = soql("SELECT min(report_date) AS mn, max(report_date) AS mx, count(*) AS n WHERE clean_country_id='NGA'")
    yrs = soql("SELECT date_extract_y(report_date) AS y, count(*) AS n WHERE clean_country_id='NGA' GROUP BY y ORDER BY y LIMIT 100")
    def piv(rows, key, fix=lambda s: s):
        o = {}
        for r in rows:
            k = fix((r.get(key) or "Unknown").strip()); s = {"Yes": "y", "No": "n"}.get(r.get("status_id"), "u")
            o.setdefault(k, {"y": 0, "n": 0, "u": 0})[s] += int(r["n"])
        return o
    fixst = lambda s: {"Federal Capital Territory": "FCT", "Abuja": "FCT", "Nassarawa": "Nasarawa", "Akwa-Ibom": "Akwa Ibom"}.get(s, s)
    save("wpdx.json", {"built": NOW, "src": "Water Point Data Exchange (WPDx+), Nigeria", "u": "https://www.waterpointdata.org",
                       "range": rng[0] if rng else {}, "years": {r.get("y"): int(r["n"]) for r in yrs if r.get("y")},
                       "st": piv(st, "clean_adm1", fixst), "src_cat": piv(src, "water_source_category"), "tech": piv(tech, "_water_tech_category")})

# ---------------------------------------------------------------- Pacific Institute Water Conflict Chronology
def conflicts():
    import html as H
    j = json.loads(get("https://www.worldwater.org/conflict/php/table.php?jstr=" + urllib.parse.quote(json.dumps(
        {"region": "%", "conftype": "%", "epoch": f"-50000000,{NOW[:4]}0000", "search": "Nigeria"}, separators=(",", ":")))))
    out = []
    for tr in re.findall(r"<tr>(.*?)</tr>", j.get("txt", ""), re.S):
        td = [H.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td>(.*?)</td>", tr, re.S)]
        if len(td) >= 4 and "Nigeria" in td[3]: out.append({"d": td[0], "h": td[1], "type": td[2], "c": td[3]})
    if not out: raise RuntimeError("no rows")
    save("conflicts.json", {"built": NOW, "src": "Pacific Institute, Water Conflict Chronology", "u": "https://www.worldwater.org/water-conflict/", "ev": out})

# ---------------------------------------------------------------- WASH-attributable deaths and cholera
def health():
    out = {"built": NOW, "sdg": [], "cholera": None}
    for ind in ("3.9.2", "3.9.1"):
        j = json.loads(get(f"https://unstats.un.org/sdgapi/v1/sdg/Indicator/Data?indicator={ind}&areaCode=566&pageSize=2000"))
        for x in j.get("data", []):
            out["sdg"].append({"ind": ind, "series": x.get("series"), "desc": x.get("seriesDescription"), "year": x.get("timePeriodStart"), "value": x.get("value"),
                               "dims": x.get("dimensions"), "units": (x.get("attributes") or {}).get("Units"), "source": x.get("source")})
    for slug in ("number-of-reported-cases-of-cholera", "number-reported-cases-of-cholera", "cholera-cases-reported", "reported-cholera-cases"):
        try:
            txt = get(f"https://ourworldindata.org/grapher/{slug}.csv?v=1&csvType=full&useColumnShortNames=false", timeout=120).decode("utf-8")
            rows = list(csv.reader(io.StringIO(txt)))
            data = [[int(r[2]), float(r[3])] for r in rows[1:] if len(r) > 3 and r[1] == "NGA" and r[3] not in ("", None)]
            if data:
                out["cholera"] = {"slug": slug, "col": rows[0][3], "u": f"https://ourworldindata.org/grapher/{slug}", "data": data}; break
        except Exception as e:
            print("OWID", slug, repr(e), flush=True)
    save("health.json", out)

if __name__ == "__main__":
    (DATA / "owid_water.json").unlink(missing_ok=True)  # retired: the UN SDG series in atlas.json already cover it
    only = set(filter(None, os.environ.get("WA_ONLY", "").split(",")))
    for name, fn in (("aquifers", aquifers), ("fao_dams", fao_dams), ("aqueduct", aqueduct), ("ndcd", ndcd),
                     ("oilspills", oilspills), ("wpdx", wpdx), ("conflicts", conflicts), ("health", health)):
        if not only or name in only: step(name, fn)
