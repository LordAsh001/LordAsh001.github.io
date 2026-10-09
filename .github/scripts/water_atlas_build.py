"""Build the Nigeria Water Resources Atlas data files from downloaded sources.

Usage: python3 .github/scripts/water_atlas_build.py RAW_DIR
RAW_DIR is the folder written by water_atlas_fetch.py. Hand-written content comes from
water-atlas/data/curated.json; states and Ramsar wetlands are shared with the forest atlas.
If a source file is missing (its download failed), the matching part of the previous
atlas.json is kept, so a bad week never empties the atlas.
"""
import json, sys, re, math, hashlib, datetime, pathlib, statistics, unicodedata, html
from shapely.geometry import shape, Point, mapping, LineString, MultiLineString, Polygon, MultiPolygon
from shapely.ops import linemerge, unary_union
from shapely.prepared import prep

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "raw")
OUT = ROOT / "water-atlas" / "data"
CUR = json.loads((OUT / "curated.json").read_text())
FOREST = json.loads((ROOT / "forest-atlas" / "data" / "atlas.json").read_text())
PREV = json.loads((OUT / "atlas.json").read_text()) if (OUT / "atlas.json").exists() else {}
TODAY = datetime.date.today().isoformat()

def raw(name):
    p = RAW / name
    if not p.exists():
        print("missing", name); return None
    return json.loads(p.read_text())

def r3(x): return round(x, 3)
def r4(x): return round(x, 4)

def num(v):
    if v is None: return None
    try:
        v = float(v)
    except Exception:
        return None
    if v in (-99, -99.0, -999) or math.isnan(v): return None
    return v

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(dam|dams|reservoir|lake|lakes|river|waterfalls?|falls|warm|spring|springs|the|of|main|multipurpose|project|water|works|earth)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "", s)

def km(a, b):
    R = 6371; la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    x = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

def commons_path(fname):
    f = fname.replace(" ", "_")
    h = hashlib.md5(f.encode()).hexdigest()
    return f"{h[0]}/{h[:2]}/{f}"

def clean_html(s): return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()

def esri_geom(g):
    if not g: return None
    if "x" in g: return Point(g["x"], g["y"])
    if "paths" in g: return MultiLineString([p for p in g["paths"] if len(p) > 1])
    if "rings" in g:
        polys = []
        for r in g["rings"]:
            if len(r) < 4: continue
            # ring orientation: clockwise = outer in Esri JSON
            area = sum((r[i + 1][0] - r[i][0]) * (r[i + 1][1] + r[i][1]) for i in range(len(r) - 1))
            if area > 0 or not polys: polys.append([r, []])
            else: polys[-1][1].append(r)
        return MultiPolygon([Polygon(o, h) for o, h in polys]).buffer(0)
    return None

def poly_coords(g, tol=0.002):
    g = g.simplify(tol, preserve_topology=True)
    if g.is_empty: return None
    ps = [g] if g.geom_type == "Polygon" else list(getattr(g, "geoms", []))
    out = []
    for p in ps:
        if p.geom_type != "Polygon" or p.area < 1e-7: continue
        out.append([[[r3(x), r3(y)] for x, y in p.exterior.coords]] + [[[r3(x), r3(y)] for x, y in i.coords] for i in p.interiors])
    return out or None

# ---------------------------------------------------------------- states
ST = FOREST["st"]
STATE_G = []
for s in ST:
    g = shape({"type": s["t"], "coordinates": s["g"]})
    STATE_G.append((s["n"], prep(g), g))
NG = unary_union([g for _, _, g in STATE_G])
NG_P = prep(NG.buffer(0.02))

def state_of(lo, la):
    p = Point(lo, la)
    for n, pg, g in STATE_G:
        if pg.contains(p): return n
    best = min(STATE_G, key=lambda t: t[2].distance(p))
    return best[0] if best[2].distance(p) < 0.05 else None

STATE_ALIAS = {"federal capital territory": "Federal Capital Territory", "fct": "Federal Capital Territory", "abuja": "Federal Capital Territory",
               "nassarawa": "Nasarawa", "akwa ibom": "Akwa Ibom", "cross river": "Cross River"}
SNAMES = {s["n"].lower(): s["n"] for s in ST}
def canon_state(x):
    x = (x or "").strip().lower().replace(" state", "")
    return STATE_ALIAS.get(x) or SNAMES.get(x)

# ---------------------------------------------------------------- outputs
F = []           # features
BYID = {}
def add(f):
    if f["i"] in BYID: return BYID[f["i"]]
    F.append(f); BYID[f["i"]] = f; return f

WIKI = raw("wikipedia.json") or {}
COMMONS = raw("commons_wikidata.json") or {}

def strip_pron(t):
    # drop a leading pronunciation/IPA parenthetical, e.g. "Niger River ( NY-jər; French: (le) fleuve Niger [...])"
    i = t.find(" (")
    if i < 0 or i > 120: return t
    depth = 0
    for j in range(i + 1, min(len(t), i + 400)):
        if t[j] == "(": depth += 1
        elif t[j] == ")":
            depth -= 1
            if depth == 0:
                inner = t[i + 2:j]
                if re.search(r"[\[\]ˈəʒɛ]|French|pronounced|listen|IPA|;", inner): return t[:i] + t[j + 1:]
                return t
    return t

def wiki_text(title, n=900):
    w = WIKI.get(title)
    if not w or not w.get("text"): return None
    paras = [p.strip() for p in w["text"].split("\n") if p.strip()]
    t = ""
    for p in paras:
        if len(t) + len(p) > n and t: break
        t += (" " if t else "") + p
    t = strip_pron(t)
    return {"t": t[: n + 300], "u": w.get("url") or "https://en.wikipedia.org/wiki/" + title.replace(" ", "_"), "title": title}

def pic(fname, tag="wd"):
    fname = fname.replace("_", " ")
    m = COMMONS.get(fname) or COMMONS.get(fname.replace(" ", "_")) or {}
    small = (m.get("w") or 2000) < 960
    return [fname, commons_path(fname), clean_html(m.get("author"))[:80] or "", m.get("license") or "see Commons", tag, small, ""]

# ---------------------------------------------------------------- categories
CATS = ["Dam and reservoir", "Dam (UNICEF list only)", "Natural lake", "Lagoon", "Waterfall", "Spring", "Ramsar wetland",
        "River", "Flood-watch gauge", "Reservoir", "River Basin Development Authority"]
GROUP = {0: 0, 9: 0, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 5, 8: 6, 10: 7}

# ---------------------------------------------------------------- 1. dams (Global Dam Watch)
from difflib import SequenceMatcher
import urllib.parse
def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b: return False
    if min(len(a), len(b)) >= 5 and (a in b or b in a): return True
    return SequenceMatcher(None, a, b).ratio() >= 0.8

gdw = raw("gdw_dams.json")
gres = raw("gdw_reservoirs.json") or []
RESPOLY = {}
for r in gres:
    g = esri_geom(r.get("geometry"))
    if g is not None and not g.is_empty: RESPOLY[r["attributes"]["GDW_ID"]] = g
USES = [("USE_IRRI", "Irrigation"), ("USE_ELEC", "Hydroelectricity"), ("USE_SUPP", "Water supply"), ("USE_FCON", "Flood control"),
        ("USE_RECR", "Recreation"), ("USE_NAVI", "Navigation"), ("USE_FISH", "Fisheries")]
DAMWIKI = CUR.get("dam_wiki", {})
NAMEFIX = CUR.get("gdw_name_fix", {})
if gdw is not None:
    for d in gdw:
        a = d["attributes"]; g = d.get("geometry") or {}
        if "x" not in g: continue
        lo, la = g["x"], g["y"]
        gid = a["GDW_ID"]
        nm = (a.get("DAM_NAME") or "").strip() or (a.get("RES_NAME") or "").strip()
        alt = [x for x in [a.get("ALT_NAME"), a.get("RES_NAME") if a.get("DAM_NAME") else None] if x]
        if str(gid) in NAMEFIX:
            alt.append(f"{nm} (spelling in Global Dam Watch)"); nm = NAMEFIX[str(gid)]
        uses_main = [u for k, u in USES if a.get(k) == "Main"]
        uses_sec = [u for k, u in USES if a.get(k) == "Sec"]
        f = {"i": f"g{gid}", "n": (nm + (" Dam" if nm and not re.search(r"dam|reservoir|lake", nm, re.I) else "")) if nm else "",
             "c": 0, "la": r4(la), "lo": r4(lo), "q": "gdw", "gdw": gid, "grand": a.get("GRAND_ID") or None,
             "alt": ", ".join(alt) or None,
             "river": a.get("RIVER") or None, "basin": a.get("MAIN_BASIN") or None, "sub": a.get("SUB_BASIN") or None,
             "city": a.get("NEAR_CITY") or None, "y": int(a["YEAR_DAM"]) if num(a.get("YEAR_DAM")) and num(a.get("YEAR_DAM")) > 1800 else None,
             "hgt": num(a.get("DAM_HGT_M")), "len": num(a.get("DAM_LEN_M")), "akm": num(a.get("AREA_SKM")), "cap": num(a.get("CAP_MCM")),
             "dep": num(a.get("DEPTH_M")), "dis": None, "dor": num(a.get("DOR_PC")), "elev": num(a.get("ELEV_MASL")),
             "catch": num(a.get("CATCH_SKM")), "mw": num(a.get("POWER_MW")), "use": a.get("MAIN_USE") or None,
             "uses": uses_main + [u + " (secondary)" for u in uses_sec], "qual": a.get("QUALITY") or None, "osrc": a.get("ORIG_SRC") or None,
             "dtype": a.get("DAM_TYPE") or None, "src": [], "v": "B" if nm else "C"}
        if num(a.get("DIS_AVG_LS")): f["dis"] = round(num(a["DIS_AVG_LS"]) / 1000, 1)  # L/s -> m3/s
        if gid in RESPOLY: f["g"] = poly_coords(RESPOLY[gid], 0.0015)
        if str(gid) in DAMWIKI: f["wiki"] = DAMWIKI[str(gid)]
        add(f)

# ---------------------------------------------------------------- 2. Ramsar wetlands (shared with the forest atlas)
for r in FOREST["f"]:
    if r.get("c") != 7: continue
    f = {k: r.get(k) for k in ("n", "la", "lo", "g", "s", "l", "notes", "fauna", "flora", "thr", "tour", "res", "veg", "src", "a", "ar", "y", "w", "ph", "photo", "unesco", "auth")}
    f.update({"i": "r" + r["i"], "c": 6, "q": "wdpa" if r.get("w") else r.get("q"), "forest_id": r["i"], "v": r.get("v", "B")})
    if f.get("g"): f["g"] = [[[[r3(x), r3(y)] for x, y in ring] for ring in poly] for poly in f["g"]]
    add({k: v for k, v in f.items() if v not in (None, "", [])})

# ---------------------------------------------------------------- 3. Wikidata: lakes, lagoons, waterfalls, springs, dams, reservoirs
wd = raw("wikidata.json") or []
TYPE = {"Q12323": 0, "Q131681": 9, "Q23397": 2, "Q34038": 4, "Q177380": 5, "Q124714": 5, "Q187223": 3, "Q1898470": 9, "Q15324": 2, "Q2367225": 4}
items = {}
for r in wd:
    q = r["i"].rsplit("/", 1)[-1]; t = r["t"].rsplit("/", 1)[-1]
    if t == "Q4022": continue
    it = items.setdefault(q, {"q": q, "n": r.get("iLabel"), "types": set(), "imgs": []})
    it["types"].add(TYPE.get(t, 2))
    if r.get("coord") and "coord" not in it:
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["coord"])
        if m: it["coord"] = (float(m.group(1)), float(m.group(2)))
    if r.get("img"):
        fn = urllib.parse.unquote(r["img"].split("FilePath/")[-1])
        if fn not in it["imgs"]: it["imgs"].append(fn)
    for k in ("riverLabel", "inception", "height", "cap", "area", "vol", "enwiki", "commons"):
        if r.get(k) and k not in it: it[k] = r[k]
wd_feats = []
for q, it in items.items():
    n = it["n"] or ""
    if re.fullmatch(r"Q\d+", n) or n[:1].islower() and not n[:1].isdigit(): continue  # no proper English label
    if "coord" not in it or q in CUR.get("wikidata_exclude", {}): continue
    lo, la = it["coord"]
    if not NG_P.contains(Point(lo, la)): continue
    ts = it["types"]
    c = 0 if 0 in ts else 9 if 9 in ts else min(ts)
    if re.search(r"\bdam\b", n, re.I) and c in (2, 9): c = 0
    if re.search(r"lagoon", n, re.I): c = 3
    title = urllib.parse.unquote(it["enwiki"].split("/wiki/")[-1]).replace("_", " ") if it.get("enwiki") else None
    natural = c in (2, 3, 4, 5)
    if natural:  # Wikidata areas, heights and "inception" years on waterfalls and lakes are often wrong; keep them for built features only
        it.pop("inception", None); it.pop("cap", None)
        if c in (4, 5): it.pop("area", None)
    wd_feats.append({"q": q, "n": n, "c": c, "la": la, "lo": lo, "title": title, "imgs": it["imgs"], "river": it.get("riverLabel"),
                     "y": int(it["inception"][:4]) if it.get("inception", "")[:4].isdigit() and int(it["inception"][:4]) > 1800 else None,
                     "hgt": num(it.get("height")), "cap": num(it.get("cap")), "akm": num(it.get("area"))})
# merge duplicate Wikidata items (same place entered more than once)
wd_feats.sort(key=lambda x: (x["title"] is None, -len(x["imgs"])))
merged = []
for w in wd_feats:
    dup = None
    for m in merged:
        d = km((m["la"], m["lo"]), (w["la"], w["lo"]))
        if (d < 2.5 and GROUP[m["c"]] == GROUP[w["c"]]) or (d < 15 and similar(m["n"], w["n"])):
            dup = m; break
    if dup:
        dup.setdefault("dups", []).append(w["q"])
        dup["imgs"] += [i for i in w["imgs"] if i not in dup["imgs"]]
        if not dup["title"] and w["title"]: dup["title"] = w["title"]
        for k in ("river", "y", "hgt", "cap", "akm"):
            if dup.get(k) is None and w.get(k) is not None: dup[k] = w[k]
    else:
        merged.append(w)

def attach(f, w, rename=False):
    f.setdefault("wd", w["q"]); f.setdefault("wdname", w["n"])
    if rename or not f["n"]: f["n"] = w["n"]; f["named_from"] = "Wikidata (matched by location)"
    if w["title"] and not f.get("wiki"): f["wiki"] = w["title"]
    f.setdefault("imgs", [])
    f["imgs"] += [i for i in w["imgs"] if i not in f["imgs"]]

for w in merged:
    P = (w["la"], w["lo"])
    if w["c"] in (0, 9):
        dams = [f for f in F if f["c"] == 0]
        byname = [f for f in dams if f["n"] and similar(f["n"], w["n"]) and km((f["la"], f["lo"]), P) < 80]
        if byname:
            attach(min(byname, key=lambda f: km((f["la"], f["lo"]), P)), w); continue
        near = [f for f in dams if not f["n"] and km((f["la"], f["lo"]), P) < 6]
        if near:
            attach(min(near, key=lambda f: km((f["la"], f["lo"]), P)), w); continue
    if w["c"] == 2:
        dl = [f for f in F if f["c"] == 0 and f["n"] and similar(f["n"], w["n"]) and km((f["la"], f["lo"]), P) < 30]
        if dl:
            attach(dl[0], w); continue
    if w["c"] not in (0, 9):
        wets = [f for f in F if f["c"] == 6 and f.get("la") is not None and km((f["la"], f["lo"]), P) < 12 and (similar(f["n"], w["n"]) or km((f["la"], f["lo"]), P) < 3)]
        if wets:
            f = wets[0]; attach(f, w)
            if w["title"]: f["wiki"] = w["title"]
            continue
    f = {"i": "w" + w["q"][1:], "wd": w["q"], "n": w["n"], "c": w["c"], "la": r4(w["la"]), "lo": r4(w["lo"]), "q": "wikidata",
         "river": w["river"], "y": w["y"], "hgt": w["hgt"], "cap": w["cap"], "akm": w["akm"], "imgs": w["imgs"], "src": [],
         "v": "B" if w["title"] else "C"}
    if w["title"]: f["wiki"] = w["title"]
    if w.get("dups"): f["wddups"] = w["dups"]
    add(f)

# curated extra dams (e.g. newer schemes missing from GDW) placed with Wikipedia coordinates
for e in CUR.get("extra_dams", []):
    w = WIKI.get(e["wiki"]) or {}
    if any(f.get("wiki") == e["wiki"] for f in F): continue
    cand = [f for f in F if f["c"] == 0 and (similar(f["n"], e["name"]) and (not w.get("la") or km((f["la"], f["lo"]), (w["la"], w["lo"])) < 60))]
    if cand:
        cand[0]["wiki"] = e["wiki"]; continue
    if not w.get("la"): continue
    add({"i": "x" + norm(e["name"])[:20], "n": e["name"], "c": 0, "la": r4(w["la"]), "lo": r4(w["lo"]), "q": "wikipedia",
         "river": e.get("river"), "use": e.get("use"), "notes": e.get("note"), "wiki": e["wiki"], "src": [], "v": "B"})

# ---------------------------------------------------------------- 4. Nigeria dam list (UNICEF Nigeria GIS layer)
inv = raw("inventory_dams.json")
seen_inv = set()
for d in (inv or []):
    a = d["attributes"]
    if a.get("latitude") is None: continue
    r = {"n": (a.get("NAMES_OF_DAM") or "").strip().title().replace("T0Llemache", "Tollemache"), "st": a.get("STATE") or "", "la": a["latitude"], "lo": a["longitude"]}
    key = (norm(r["n"]), r["st"])
    if key in seen_inv: continue
    seen_inv.add(key)
    base = re.sub(r"\(.*?\)|\b(main|saddle|concrete|fill|multipurpose|\d)\b|-\s*\d", " ", r["n"], flags=re.I).strip(" -")
    P = (r["la"], r["lo"])
    dams = [f for f in F if f["c"] == 0]
    lst = canon_state(r["st"].split("/")[0])
    match = [f for f in dams if (km((f["la"], f["lo"]), P) < 80 or (lst and lst == state_of(f["lo"], f["la"]) and km((f["la"], f["lo"]), P) < 250))
             and (similar(f["n"], base) or (f.get("alt") and similar(f["alt"], base)) or (f.get("river") and norm(f["river"]) == norm(base) and km((f["la"], f["lo"]), P) < 40))]
    if not match:
        match = [f for f in dams if not f["n"] and km((f["la"], f["lo"]), P) < 4]
        if match:
            f = min(match, key=lambda f: km((f["la"], f["lo"]), P)); f["n"] = base + " Dam"; f["named_from"] = "the UNICEF Nigeria dam list (matched by location)"
    if match:
        f = min(match, key=lambda f: km((f["la"], f["lo"]), P))
        f.setdefault("inv", []); f["inv"].append(r["n"]); continue
    st = canon_state(r["st"].split("/")[0])
    pst = state_of(r["lo"], r["la"])
    f = {"i": "n" + re.sub(r"[^a-z0-9]+", "", r["n"].lower())[:24] + (st or "")[:3].lower(), "n": r["n"] + (" Dam" if not re.search(r"\bdam\b", r["n"], re.I) else ""),
         "c": 1, "la": r3(r["la"]), "lo": r3(r["lo"]), "q": "inventory", "s_listed": st or r["st"], "src": [], "v": "C" if st and pst == st else "D"}
    if st and pst and st != pst: f["loc_note"] = f"Listed under {st} State, but its listed coordinates fall in {pst}. Treat the location as uncertain."
    add(f)
for f in F:
    if isinstance(f.get("inv"), list): f["inv"] = ", ".join(dict.fromkeys(f["inv"]))
# ---------------------------------------------------------------- 5. rivers (network + named profiles)
ne_r = raw("ne_10m_rivers_lake_centerlines.json")
diva_l = raw("diva_lines.json")
NETWORK = None
NAMED = {}
if diva_l is not None:
    lines_by_kind = {"p": [], "i": []}
    named_lines = {}
    if "esri" in diva_l:
        for d in diva_l["esri"]:
            g = esri_geom(d.get("geometry"))
            if g is None or g.is_empty: continue
            a = d["attributes"]; per = not str(a.get("HYC_DESCRI", "")).startswith("Non")
            lines_by_kind["p" if per else "i"].append(g)
            nm = (a.get("NAM") or "").strip()
            if nm and nm != "UNK": named_lines.setdefault(nm, []).append(g)
    else:
        for d in diva_l["features"]:
            g = shape(d["geometry"]); a = d["properties"]
            per = "non" not in str(a.get("HYC_DESCRI", "")).lower()
            lines_by_kind["p" if per else "i"].append(g)
            nm = (a.get("NAM") or "").strip()
            if nm and nm != "UNK": named_lines.setdefault(nm, []).append(g)
    NETWORK = {}
    for k, gs in lines_by_kind.items():
        merged_l = linemerge(unary_union(gs))
        ls = [merged_l] if merged_l.geom_type == "LineString" else list(merged_l.geoms)
        out = []
        for l in ls:
            l = l.simplify(0.006)
            if l.length < 0.03: continue
            out.append([[r3(x), r3(y)] for x, y in l.coords])
        NETWORK[k] = out
    for nm, gs in named_lines.items(): NAMED[nm] = unary_union(gs)
NE_NAMED = {}
if ne_r is not None:
    for f in ne_r["features"]:
        g = shape(f["geometry"])
        if not g.intersects(NG.buffer(0.3)): continue
        nm = f["properties"].get("name")
        if nm: NE_NAMED.setdefault(nm, []).append(g.intersection(NG.buffer(0.05)))
WDRIV = {}
for r in wd:
    if r["t"].endswith("/Q4022") and r.get("enwiki"):
        import urllib.parse
        t = urllib.parse.unquote(r["enwiki"].split("/wiki/")[-1]).replace("_", " ")
        e = WDRIV.setdefault(t, {"q": r["i"].rsplit("/", 1)[-1]})
        if r.get("len") and "len" not in e: e["len"] = num(r["len"])
        if r.get("mouthLabel") and "mouth" not in e: e["mouth"] = r["mouthLabel"]
        if r.get("basinLabel") and "basin" not in e: e["basin"] = r["basinLabel"]
        if r.get("img"):
            fn = urllib.parse.unquote(r["img"].split("FilePath/")[-1])
            e.setdefault("imgs", [])
            if fn not in e["imgs"]: e["imgs"].append(fn)
for rv in CUR["rivers"]:
    gs = []
    for n in rv.get("ne", []): gs += NE_NAMED.get(n + " River", []) + NE_NAMED.get(n, [])
    if not gs:
        for n in rv.get("diva", []):
            if n in NAMED: gs.append(NAMED[n])
    geom = None
    if gs:
        u = unary_union([g for g in gs if not g.is_empty])
        u = linemerge(u) if u.geom_type == "MultiLineString" else u
        ls = [u] if u.geom_type == "LineString" else [x for x in getattr(u, "geoms", []) if x.geom_type == "LineString"]
        geom = [[[r3(x), r3(y)] for x, y in l.simplify(0.004).coords] for l in ls if l.length > 0.01]
    if not geom: continue
    allc = [c for l in geom for c in l]
    mid = allc[len(allc) // 2]
    states = sorted({s for s in (state_of(c[0], c[1]) for c in allc[:: max(1, len(allc) // 40)]) if s})
    w = WDRIV.get(rv["wiki"], {})
    f = {"i": "riv-" + rv["id"], "n": rv["n"] + " River" if not rv["n"].endswith("River") else rv["n"], "c": 7, "la": mid[1], "lo": mid[0],
         "q": "line", "ln": geom, "states": states, "wiki": rv["wiki"], "rlen": w.get("len"), "mouth": w.get("mouth"),
         "imgs": w.get("imgs", []), "wd": w.get("q"), "src": [], "v": "B" if WIKI.get(rv["wiki"]) else "C",
         "geomsrc": "Natural Earth" if rv.get("ne") and any(NE_NAMED.get(n + " River") or NE_NAMED.get(n) for n in rv["ne"]) else "DIVA-GIS (Digital Chart of the World)"}
    add(f)

# ---------------------------------------------------------------- 6. lakes and water areas (polygons for the map)
LAKES = []
diva_a = raw("diva_areas.json")
if diva_a is not None:
    src = diva_a.get("esri") or []
    for d in src:
        g = esri_geom(d.get("geometry"))
        if g is None or g.is_empty or g.area < 0.0004: continue
        nm = (d["attributes"].get("NAME") or "").strip()
        pc = poly_coords(g, 0.003)
        if pc: LAKES.append({"n": nm if nm and nm != "UNK" else "", "t": d["attributes"].get("F_CODE_DES") or "", "g": pc})
ne_l = raw("ne_10m_lakes.json")
if ne_l is not None:
    for f in ne_l["features"]:
        g = shape(f["geometry"])
        if g.intersects(NG.buffer(0.2)) and f["properties"].get("name") == "Lake Chad":
            pc = poly_coords(g, 0.003)
            if pc: LAKES.append({"n": "Lake Chad (open water, Natural Earth)", "t": "Lake", "g": pc})

# ---------------------------------------------------------------- 7. flood-watch gauges
GAUGES_OUT = []
gg = raw("glofas_gauges.json")
if gg:
    for g in gg:
        q = [x for x in g["q"]]
        t0 = datetime.date.fromisoformat(g["t0"])
        doy = {}
        ann = {}
        for i, v in enumerate(q):
            if v is None: continue
            d = t0 + datetime.timedelta(days=i)
            if 1991 <= d.year <= 2020:
                k = min(d.timetuple().tm_yday, 365)
                doy.setdefault(k, []).append(v)
            ann.setdefault(d.year, (0, None))
            if v > ann[d.year][0]: ann[d.year] = (v, d.isoformat())
        def pct(vals, p):
            vals = sorted(vals); k = (len(vals) - 1) * p; f0 = math.floor(k); c0 = math.ceil(k)
            return vals[f0] if f0 == c0 else vals[f0] + (vals[c0] - vals[f0]) * (k - f0)
        clim = {"p50": [], "p90": [], "max": []}
        for k in range(1, 366):
            win = []
            for j in range(k - 7, k + 8):
                win += doy.get((j - 1) % 365 + 1, [])
            if not win: clim["p50"].append(None); clim["p90"].append(None); clim["max"].append(None); continue
            clim["p50"].append(round(pct(win, .5))); clim["p90"].append(round(pct(win, .9))); clim["max"].append(round(max(win)))
        this_year = datetime.date.today().year
        annual = [[y, round(v), dt] for y, (v, dt) in sorted(ann.items()) if y < this_year and dt]
        rec = max(annual, key=lambda a: a[1]) if annual else None
        mean = round(statistics.mean([v for v in q if v is not None]))
        GAUGES_OUT.append({"id": g["id"], "river": g["river"], "place": g["place"], "la": g["sla"], "lo": g["slo"], "clim": clim,
                           "annual": annual, "record": rec, "mean": mean})
        if mean < 5:
            print("dropping gauge with no modelled channel:", g["id"]); GAUGES_OUT.pop(); continue
        add({"i": "gauge-" + g["id"], "n": f"{g['river']} {g['place']}" if g["place"][:1].islower() else f"{g['river']} at {g['place']}", "c": 8, "la": r4(g["sla"]), "lo": r4(g["slo"]), "q": "glofas",
             "gauge": g["id"], "river": g["river"], "qmean": mean, "rec": rec, "src": [], "v": "B"})
elif PREV.get("gauges"):
    GAUGES_OUT = None  # keep previous gauges.json

# ---------------------------------------------------------------- 8. River Basin Development Authorities (HQ points)
for r in CUR["rbdas"]:
    if r.get("skip"): continue
    add({"i": "rbda-" + norm(r["name"])[:18], "n": r["name"], "c": 10, "la": r["la"], "lo": r["lo"], "q": "hq",
         "notes": f"Headquarters: {r['hq']}. Area of operation: {r['area']}.", "src": [CUR["rbda_source"]["url"]], "v": "B", "hq": r["hq"]})

# ---------------------------------------------------------------- finish features: names, states, text, photos, levels
BNAME = CUR.get("basin_names", {})
BASP = []
for b in (raw("hydrobasins_l4.json") or []):
    g = esri_geom(b.get("geometry"))
    pf = str(b["attributes"].get("PFAF_ID"))
    if g is not None and pf in BNAME: BASP.append((BNAME[pf], prep(g)))
for f in F:
    if f.get("la") is not None and BASP:
        pt = Point(f["lo"], f["la"])
        for nm_, pg in BASP:
            if pg.contains(pt): f["bn"] = nm_; break
    if f.get("alt"):
        keep = [a.strip() for a in f["alt"].split(",") if a.strip() and norm(a) != norm(f["n"])]
        f["alt"] = ", ".join(keep) or None
    if not f["n"]:
        f["n"] = f"Unnamed reservoir (GDW {f['gdw']})" if f.get("gdw") else "Unnamed"
    if f.get("la") is not None and not f.get("s"):
        if f.get("states"): f["s"] = "; ".join(f["states"])
        else: f["s"] = state_of(f["lo"], f["la"]) or f.get("s_listed") or ""
    wt = wiki_text(f["wiki"]) if f.get("wiki") else None
    if wt: f["wt"] = wt
    imgs = f.pop("imgs", None) or []
    if f.get("wiki") and (WIKI.get(f["wiki"]) or {}).get("img"):
        pi = WIKI[f["wiki"]]["img"].replace("_", " ")
        if pi not in [i.replace("_", " ") for i in imgs] and not re.search(r"\.svg$|map|locator|flag", pi, re.I): imgs.append(pi)
    pics = [pic(i) for i in imgs if not re.search(r"\.(svg|tif|pdf)$", i, re.I) and not re.search(r"map|locator|apollo|from space|iss0", i, re.I)]
    if pics: f["pics"] = pics[:6]
    # sources
    src = list(f.get("src") or [])
    if f.get("wt"): src.append(f["wt"]["u"])
    if f.get("wd"): src.append("https://www.wikidata.org/wiki/" + f["wd"])
    f["src"] = list(dict.fromkeys(src))
    # verification
    if f["c"] == 0 and f.get("gdw"):
        if f.get("named_from"): f["v"] = "B" if f.get("wt") else "C"
        elif f["n"] and not f["n"].startswith("Unnamed"): f["v"] = "A" if (f.get("wt") or f.get("wd")) else "B"
        else: f["v"] = "C"
    if f["c"] in (2, 3, 4, 5, 9) and f.get("wt") and f.get("pics"): f["v"] = "A"
    for k in [k for k, v in f.items() if v in (None, "", [], {})]: f.pop(k)

F.sort(key=lambda f: (f["c"], f["n"]))
print("features by category:", {CATS[c]: sum(1 for f in F if f["c"] == c) for c in range(len(CATS))})

# ---------------------------------------------------------------- statistics inputs
dhs = raw("dhs.json")
DHS = PREV.get("dhs")
if dhs:
    lab = {i["IndicatorId"]: i["Label"] for i in dhs["indicators"]}
    sub = {}
    for r in dhs["subnational"]:
        reg = r.get("CharacteristicLabel", "")
        if r.get("IsPreferred") is not None and not r.get("IsPreferred"): continue
        # DHS labels states as "..North Central..Kwara" style; keep the last component
        name = re.sub(r"^\.+", "", reg).split("..")[-1].strip()
        st = canon_state(name)
        if not st: continue
        sub.setdefault(r["SurveyId"], {}).setdefault(st, {})[r["IndicatorId"]] = r["Value"]
    nat = {}
    for r in dhs["national"]:
        if r.get("IsPreferred") is not None and not r.get("IsPreferred"): continue
        nat.setdefault(r["IndicatorId"], {})[r["SurveyId"]] = [r["SurveyYear"], r["Value"]]
    DHS = {"labels": lab, "sub": sub, "nat": nat}
wb = raw("worldbank.json")
WB = wb if wb else PREV.get("wb")

WP = PREV.get("wp")
wpr = raw("grid3_waterpoints.json")
WPTS = None
if wpr is not None:
    types = {}
    pts = []
    bystate = {}
    for d in wpr:
        g = d.get("geometry") or {}
        if "x" not in g: continue
        a = d["attributes"]
        t = (a.get("water_typ") or "Unspecified").strip() or "Unspecified"
        ti = types.setdefault(t, len(types))
        st = canon_state(a.get("statename")) or state_of(g["x"], g["y"]) or "Unknown"
        pts.append([r3(g["x"]), r3(g["y"]), ti])
        bystate.setdefault(st, {}).setdefault(t, 0); bystate[st][t] += 1
    WP = {"n": len(pts), "types": list(types), "bystate": bystate, "src": "eHealth Africa and Proxy Logics (2020), Water Points in Nigeria, GRID3 Nigeria"}
    WPTS = {"types": list(types), "p": pts}

FL = PREV.get("fl")
flr = raw("flood_lga_2024.json")
FLOOD_LGA = None
if flr is not None:
    feats = []
    bys = {}
    for d in flr:
        a = d["attributes"]
        g = esri_geom(d.get("geometry"))
        st = canon_state(a.get("ADM1_EN") or a.get("STATE"))
        rk = {k: a.get(k) or "None" for k in ("Flood_Risk", "Riverine_Flood_Risk", "Flash_Flood_Risk", "Coastal_Flood_Risk")}
        if st:
            b = bys.setdefault(st, {"lgas": 0, "High": 0, "Medium": 0, "Low": 0, "riv_high": 0, "flash_high": 0, "coast_high": 0})
            b["lgas"] += 1
            if rk["Flood_Risk"] in b: b[rk["Flood_Risk"]] += 1
            b["riv_high"] += rk["Riverine_Flood_Risk"] == "High"; b["flash_high"] += rk["Flash_Flood_Risk"] == "High"; b["coast_high"] += rk["Coastal_Flood_Risk"] == "High"
        if g is not None and not g.is_empty:
            pc = poly_coords(g, 0.004)
            if pc: feats.append({"n": a.get("ADM2_EN"), "s": st, "r": [rk["Flood_Risk"][0], rk["Riverine_Flood_Risk"][0], rk["Flash_Flood_Risk"][0], rk["Coastal_Flood_Risk"][0]],
                                 "cm": a.get("Comments") or "", "g": pc})
    FL = {"bystate": bys, "src": "UNICEF Nigeria, 2024 Nigeria Flood Risk Analysis (ArcGIS Online layer, LGA level)"}
    FLOOD_LGA = feats

BAS = PREV.get("bas")
hb = raw("hydrobasins_l4.json")
if hb is not None:
    BAS = []
    for d in hb:
        g = esri_geom(d.get("geometry"))
        if g is None or g.is_empty: continue
        gi = g.intersection(NG)
        if gi.is_empty or gi.area < 0.05: continue
        a = d["attributes"]
        pc = poly_coords(gi, 0.01)
        if pc: BAS.append({"id": a.get("HYBAS_ID"), "pf": a.get("PFAF_ID"), "name": CUR.get("basin_names", {}).get(str(a.get("PFAF_ID"))), "up": a.get("UP_AREA"), "sub": a.get("SUB_AREA"), "endo": a.get("ENDO"), "g": pc,
                           "kmng": round(gi.area * 111 * 111 * math.cos(math.radians(gi.centroid.y)))})

EV = []
for e in CUR.get("flood_events", []):
    wt = wiki_text(e["title"], 700)
    if wt: EV.append({"year": e["year"], **wt})
EXTRA = {t: wiki_text(t, 700) for t in ("Niger River", "Benue River", "Lake Chad", "Niger Delta", "Lagdo Dam", "Water supply and sanitation in Nigeria", "Hadejia-Nguru wetlands")}

meta = {"version": "1.0", "compiled": PREV.get("meta", {}).get("compiled", TODAY), "refreshed": TODAY,
        "sources_ok": sorted(p.name for p in RAW.glob("*.json"))}
atlas = {"meta": meta, "cats": CATS, "f": F, "st": [{"n": s["n"], "c": s["c"], "t": s["t"], "g": s["g"], "km2": s.get("km2")} for s in ST],
         "net": NETWORK if NETWORK is not None else PREV.get("net"), "lakes": LAKES or PREV.get("lakes"), "bas": BAS,
         "ha": CUR["hydrological_areas"], "ha_note": CUR["ha_note"], "nwrmp": CUR["nwrmp"], "rbda_src": CUR["rbda_source"],
         "gw": CUR["groundwater"], "gw_src": CUR["groundwater_source"], "gw_facts": CUR["groundwater_facts"], "ag": CUR["agencies"],
         "dhs": DHS, "wb": WB, "wp": WP, "fl": FL, "ev": EV or PREV.get("ev"), "wiki": {k: v for k, v in EXTRA.items() if v} or PREV.get("wiki"),
         "gauges": [{k: g[k] for k in ("id", "river", "place", "la", "lo", "mean", "record")} for g in GAUGES_OUT] if GAUGES_OUT else PREV.get("gauges")}
(OUT / "atlas.json").write_text(json.dumps(atlas, separators=(",", ":"), ensure_ascii=False))
if GAUGES_OUT: (OUT / "gauges.json").write_text(json.dumps({"refreshed": TODAY, "base": "1991–2020", "g": GAUGES_OUT}, separators=(",", ":")))
if WPTS: (OUT / "waterpoints.json").write_text(json.dumps(WPTS, separators=(",", ":")))
if FLOOD_LGA: (OUT / "flood_lga.json").write_text(json.dumps({"src": FL["src"], "f": FLOOD_LGA}, separators=(",", ":"), ensure_ascii=False))
for p in OUT.glob("*.json"): print(p.name, round(p.stat().st_size / 1024), "KB")
