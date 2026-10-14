"""Groundwater layer for the Nigeria Water Resources Atlas.

Builds water-atlas/data/groundwater.json from:
  * data/bgs_groundwater_nigeria.json  BGS quantitative groundwater maps (depth to groundwater, productivity,
    storage; 0.05 degree) and the BGS long-term average recharge map (0.28 degree), clipped to Nigeria.
  * data/aquifers.json                 BGS Africa Groundwater Atlas hydrogeology map of Nigeria (aquifer type).
  * data/atlas.json                    state boundaries and the DHS "borehole" share by state.
  * data/flood_lga.json                LGA boundaries (UNICEF flood risk analysis 2024).
  * archive/river_flow/*.csv           daily GloFAS v4 river discharge at the atlas gauges.

Outputs (all screening-level, documented in the file itself):
  1. Intrinsic aquifer vulnerability with the GOD method (Foster 1987; Foster et al. 2002).
  2. Recharge totals by state, LGA and aquifer type, with the inputs for a groundwater development stress
     indicator (abstraction / recharge, IGRAC / UN WWDR 2015).
  3. Baseflow separation (Lyne-Hollick digital filter, Ladson et al. 2013) at each gauge: baseflow index and
     the baseflow share of annual flood peaks, as an indicator of how much groundwater sustains river flow.

Run:  python .github/scripts/water_atlas_groundwater.py  (from the repository root)
"""
import csv, json, math, pathlib, statistics, datetime
from shapely.geometry import shape, Point
from shapely.prepared import prep
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parents[2]
D = ROOT / "water-atlas" / "data"
BGS = json.loads((D / "bgs_groundwater_nigeria.json").read_text())
AQ = json.loads((D / "aquifers.json").read_text())
ATLAS = json.loads((D / "atlas.json").read_text())
LGA = json.loads((D / "flood_lga.json").read_text())

# ---------------------------------------------------------------- grid (0.05 degree, BGS depth-to-groundwater grid)
X0, Y0, STEP = 2.525, 4.011, 0.05          # centre of the first column / row (west / south)
xs = sorted({r[0] for r in BGS["dtw"]["rows"]}); ys = sorted({r[1] for r in BGS["dtw"]["rows"]})
X0, Y0 = xs[0], ys[0]
NX = round((xs[-1] - X0) / STEP) + 1; NY = round((ys[-1] - Y0) / STEP) + 1
ix = lambda x: round((x - X0) / STEP); iy = lambda y: round((y - Y0) / STEP)

def to_grid(rows, step=STEP):
    g = {}
    for x, y, v in rows:
        i, j = ix(x), iy(y)
        if 0 <= i < NX and 0 <= j < NY: g[(i, j)] = v
    return g
DTW = to_grid(BGS["dtw"]["rows"]); PROD = to_grid(BGS["prod"]["rows"]); STOR = to_grid(BGS["stor"]["rows"])
RCH = BGS["recharge"]["rows"]
RD = BGS["recharge"]["cell_deg"]
RIDX = {(round((x - RCH[0][0]) / RD), round((y - RCH[0][1]) / RD)): v for x, y, v in RCH}
def recharge_at(x, y):
    k = (round((x - RCH[0][0]) / RD), round((y - RCH[0][1]) / RD))
    return RIDX.get(k)

# Nigeria mask from state boundaries
STATES = [(s["n"], shape({"type": s["t"], "coordinates": s["g"]})) for s in ATLAS["st"]]
NG = prep(unary_union([g for _, g in STATES]).buffer(0))
PST = [(n, prep(g), g.bounds) for n, g in STATES]
PAQ = [(a["c"], a.get("geo", ""), prep(shape({"type": a["t"], "coordinates": a["g"]})), shape({"type": a["t"], "coordinates": a["g"]}).bounds) for a in AQ["f"]]
PLG = [(l["s"], l["n"], prep(shape({"type": "MultiPolygon", "coordinates": l["g"]})), shape({"type": "MultiPolygon", "coordinates": l["g"]}).bounds) for l in LGA["f"]]
def lookup(P, x, y):
    for item in P:
        b = item[-1]
        if b[0] <= x <= b[2] and b[1] <= y <= b[3] and item[-2].contains(Point(x, y)): return item
    return None

# ---------------------------------------------------------------- GOD vulnerability
# Foster (1987); Foster, Hirata, Gomes, D'Elia & Paris (2002) Groundwater Quality Protection, World Bank GW-MATE.
# D: depth to groundwater. BGS classes are mapped to the GOD depth bands, taking the shallower (more vulnerable)
# band where a BGS class spans two GOD bands.
GOD_D = {"VS": 0.9, "S": 0.8, "SM": 0.7, "M": 0.6, "D": 0.6, "VD": 0.6}
# G (groundwater confinement) and O (overlying strata) from the BGS hydrogeology map units.
GOD_GO = {
    "U-H/VH":     (1.0, 0.7, "Unconsolidated sands and gravels: unconfined (G 1.0); alluvial sands (O 0.7)"),
    "U-H":        (1.0, 0.7, "Unconsolidated sands and gravels: unconfined (G 1.0); alluvial sands (O 0.7)"),
    "CSI-M/H":    (0.6, 0.7, "Sandstone aquifers: unconfined but covered (G 0.6); sandstones (O 0.7)"),
    "CSI-L/M":    (0.6, 0.5, "Mudstone and shale-rich sediments: unconfined but covered (G 0.6); shales and siltstones (O 0.5)"),
    "CSIF-M (H)": (0.6, 0.7, "Fractured sandstones and limestones: unconfined but covered (G 0.6); sandstones and limestones (O 0.7)"),
    "I-L/M":      (1.0, 0.6, "Weathered and fractured igneous rock: unconfined (G 1.0); igneous formations (O 0.6)"),
    "B-L/M":      (1.0, 0.6, "Weathered and fractured basement: unconfined (G 1.0); metamorphic formations (O 0.6)"),
}
def god_class(v):
    return "negligible" if v < 0.1 else "low" if v < 0.3 else "moderate" if v < 0.5 else "high" if v < 0.7 else "extreme"
CLS = ["negligible", "low", "moderate", "high", "extreme"]

cells = {}
for (i, j), d in DTW.items():
    x, y = X0 + i * STEP, Y0 + j * STEP
    if not NG.contains(Point(x, y)): continue
    aq = lookup(PAQ, x, y)
    code = aq[0] if aq else None
    go = GOD_GO.get(code)
    dd = GOD_D.get(d)
    god = round(go[0] * go[1] * dd, 3) if go and dd else None
    st = lookup(PST, x, y); lg = lookup(PLG, x, y)
    cells[(i, j)] = {"x": x, "y": y, "dtw": d, "prod": PROD.get((i, j)), "stor": STOR.get((i, j)), "aq": code,
                     "rch": recharge_at(x, y), "god": god, "st": st[0] if st else None, "lga": (lg[0], lg[1]) if lg else None}
print("Nigeria cells:", len(cells))

# cell area (km2) at latitude y
area = lambda y: (STEP * 111.32 * math.cos(math.radians(y))) * (STEP * 110.57)

def summarise(sel):
    A = sum(area(c["y"]) for c in sel)
    if not A: return None
    rch = [(c["rch"], area(c["y"])) for c in sel if c["rch"] is not None]
    ra = sum(a for _, a in rch)
    mean_r = sum(r * a for r, a in rch) / ra if ra else None
    gods = [(c["god"], area(c["y"])) for c in sel if c["god"] is not None]
    ga = sum(a for _, a in gods)
    share = {k: round(100 * sum(a for v, a in gods if god_class(v) == k) / ga, 1) if ga else None for k in CLS}
    dsh = {k: round(100 * sum(area(c["y"]) for c in sel if c["dtw"] == k) / A, 1) for k in ["VS", "S", "SM", "M", "D", "VD"]}
    psh = {k: round(100 * sum(area(c["y"]) for c in sel if c["prod"] == k) / A, 1) for k in ["VH", "H", "M", "LM", "L", "VL"]}
    return {"area_km2": round(A), "recharge_mm": round(mean_r, 1) if mean_r is not None else None,
            "recharge_mm3": round(mean_r * ra / 1000, 1) if mean_r is not None else None,   # mm x km2 = 1,000 m3 -> million m3
            "god_mean": round(sum(v * a for v, a in gods) / ga, 3) if ga else None, "god_share": share,
            "dtw_share": dsh, "prod_share": psh}

by_state = {}
for c in cells.values():
    if c["st"]: by_state.setdefault(c["st"], []).append(c)
by_lga = {}
for c in cells.values():
    if c["lga"]: by_lga.setdefault(c["lga"], []).append(c)
by_aq = {}
for c in cells.values():
    if c["aq"]: by_aq.setdefault(c["aq"], []).append(c)

# population (NBS projections as listed in the Demographic Statistics Bulletin 2020; via Wikipedia, "List of Nigerian states by population")
POP = {"Kano": 16253549, "Lagos": 15772884, "Katsina": 9300382, "Kaduna": 8324285, "Bauchi": 7540663, "Oyo": 7512855,
       "Anambra": 7299910, "Rivers": 7234973, "Jigawa": 6979080, "Niger": 6720617, "Benue": 6687706, "Borno": 6651590,
       "Ogun": 6445275, "Sokoto": 6163187, "Delta": 6107543, "Imo": 6067722, "Kebbi": 6001610, "Ondo": 5469707,
       "Akwa Ibom": 5780581, "Edo": 5527810, "Zamfara": 5517793, "Plateau": 5400974, "Enugu": 5396098, "Adamawa": 5236948,
       "Kogi": 5053734, "Abia": 4841943, "FCT": 4802443, "Gombe": 4623462, "Yobe": 4350401, "Taraba": 4331885,
       "Kwara": 4259613, "Osun": 4237396, "Cross River": 4175020, "Ebonyi": 4007155, "Nasarawa": 3632239,
       "Ekiti": 3398177, "Bayelsa": 2394725}
DHS = ATLAS.get("dhs", {}).get("sub", {})
SURVEY = "NG2024DHS" if "NG2024DHS" in DHS else sorted(DHS)[-1]

states_out = {}
for n, sel in sorted(by_state.items()):
    s = summarise(sel)
    bh = (DHS.get(SURVEY, {}).get(n, {}) or {}).get("WS_SRCE_P_TUB")
    s.update({"pop": POP.get(n), "borehole_pct": bh})
    if s["recharge_mm3"] and POP.get(n): s["recharge_m3_per_person"] = round(s["recharge_mm3"] * 1e6 / POP[n])
    states_out[n] = s
lga_out = {f"{k[0]}|{k[1]}": summarise(v) for k, v in by_lga.items()}
aq_out = {}
for k, sel in by_aq.items():
    s = summarise(sel); s["label"] = " – ".join(AQ["codes"].get(k, [k])); s["god_g_o"] = GOD_GO.get(k); aq_out[k] = s

# ---------------------------------------------------------------- baseflow separation at gauges
def lyne_hollick(q, a=0.925, passes=3, pad=30):
    """Ladson et al. (2013) implementation: forward/backward/forward passes with reflected padding."""
    q = list(q)
    def one(seq):
        qf = [0.0] * len(seq); qf[0] = seq[0] * 0.5
        b = [0.0] * len(seq)
        for t in range(1, len(seq)):
            qf[t] = a * qf[t - 1] + (1 + a) / 2 * (seq[t] - seq[t - 1])
            if qf[t] < 0: qf[t] = 0.0
            b[t] = seq[t] - qf[t]
            if b[t] > seq[t]: b[t] = seq[t]
        b[0] = seq[0] - qf[0]
        return b
    x = q[pad:0:-1] + q + q[-2:-pad - 2:-1]
    for p in range(passes):
        x = one(x if p % 2 == 0 else x[::-1])
        if p % 2 == 1: x = x[::-1]
    if passes % 2 == 0: pass
    return x[pad:pad + len(q)]

GA = {g["id"]: g for g in json.loads((D / "gauges.json").read_text())["g"]}
gauges_out = []
for f in sorted((ROOT / "water-atlas" / "archive" / "river_flow").glob("*.csv")):
    gid = f.stem
    if gid not in GA: continue
    rows = [(r["date"], float(r["discharge_m3s"])) for r in csv.DictReader(f.open()) if r.get("discharge_m3s") not in (None, "")]
    if len(rows) < 3650: continue
    dates = [r[0] for r in rows]; q = [max(0.0, r[1]) for r in rows]
    b = lyne_hollick(q)
    yrs = sorted({d[:4] for d in dates})
    full = [y for y in yrs if sum(1 for d in dates if d[:4] == y) >= 360]
    bfi = sum(b) / sum(q) if sum(q) else None
    peaks = []
    for y in full:
        idx = [k for k, d in enumerate(dates) if d[:4] == y]
        k = max(idx, key=lambda t: q[t])
        pre = [b[t] for t in range(max(0, k - 30), k)]
        peaks.append({"year": int(y), "date": dates[k], "peak": round(q[k], 1), "base": round(b[k], 1),
                      "base_share": round(100 * b[k] / q[k], 1) if q[k] else None, "base_30d_before": round(sum(pre) / len(pre), 1) if pre else None})
    # monthly regime (mean over all full years)
    mon = []
    for m in range(1, 13):
        idx = [k for k, d in enumerate(dates) if int(d[5:7]) == m and d[:4] in full]
        mon.append([round(sum(q[k] for k in idx) / len(idx), 1), round(sum(b[k] for k in idx) / len(idx), 1)] if idx else [None, None])
    # does a high groundwater state before the season go with a larger peak? Spearman rank correlation
    def ranks(v):
        o = sorted(range(len(v)), key=lambda t: v[t]); r = [0] * len(v)
        for n_, t in enumerate(o): r[t] = n_
        return r
    # antecedent groundwater state: mean baseflow in April (end of the dry season), before the rains build up
    for p in peaks:
        apr = [b[k] for k, d in enumerate(dates) if d[:4] == str(p["year"]) and d[5:7] == "04"]
        p["base_april"] = round(sum(apr) / len(apr), 1) if apr else None
    pk = [p for p in peaks if p["base_april"] is not None]
    rho = None
    if len(pk) >= 10:
        r1, r2 = ranks([p["base_april"] for p in pk]), ranks([p["peak"] for p in pk]); n_ = len(pk)
        rho = round(1 - 6 * sum((u - v) ** 2 for u, v in zip(r1, r2)) / (n_ * (n_ * n_ - 1)), 2)
    g = GA[gid]
    gauges_out.append({"id": gid, "river": g.get("river"), "place": g.get("place"), "la": g.get("la"), "lo": g.get("lo"),
                       "years": [int(full[0]), int(full[-1])], "bfi": round(bfi, 3) if bfi is not None else None,
                       "peak_base_share_median": round(statistics.median([p["base_share"] for p in peaks if p["base_share"] is not None]), 1) if peaks else None,
                       "rho_april_base_vs_peak": rho, "monthly": mon, "peaks": peaks})
print("gauges:", len(gauges_out))

# ---------------------------------------------------------------- compact grid for the map
def enc(fn):
    s = []
    for j in range(NY - 1, -1, -1):          # north to south
        for i in range(NX):
            c = cells.get((i, j)); s.append(fn(c) if c else ".")
    return "".join(s)
DCODE = {"VS": "a", "S": "b", "SM": "c", "M": "d", "D": "e", "VD": "f"}
PCODE = {"VH": "a", "H": "b", "M": "c", "LM": "d", "L": "e", "VL": "f"}
SCODE = {"VH": "a", "H": "b", "M": "c", "LM": "d", "L": "e", "0": "f"}
GCODE = {k: "abcde"[n] for n, k in enumerate(CLS)}
B36 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
def rch_code(c):
    r = c["rch"]
    if r is None: return "."
    return B36[min(61, int(r // 5))]        # 5 mm bins, 0-305 mm
AQC = {k: B36[n] for n, k in enumerate(sorted(GOD_GO))}

out = {
    "built": datetime.date.today().isoformat(),
    "grid": {"x0": X0, "y0_north": Y0 + (NY - 1) * STEP, "step": STEP, "nx": NX, "ny": NY,
             "dtw": enc(lambda c: DCODE.get(c["dtw"], "?")), "prod": enc(lambda c: PCODE.get(c["prod"], "?")),
             "stor": enc(lambda c: SCODE.get(c["stor"], "?")), "god": enc(lambda c: GCODE[god_class(c["god"])] if c["god"] is not None else "?"),
             "godv": enc(lambda c: B36[min(61, int(round(c["god"] * 61)))] if c["god"] is not None else "?"),
             "rch": enc(rch_code), "aq": enc(lambda c: AQC.get(c["aq"], "?")),
             "codes": {"dtw": {v: k for k, v in DCODE.items()}, "prod": {v: k for k, v in PCODE.items()}, "stor": {v: k for k, v in SCODE.items()},
                       "god": {v: k for k, v in GCODE.items()}, "aq": {v: k for k, v in AQC.items()}, "rch": "base-62 digit x 5 = recharge mm/yr (lower bound of 5 mm bin)",
                       "godv": "base-62 digit / 61 = GOD index"}},
    "keys": BGS["meta"]["keys"],
    "states": states_out, "lgas": lga_out, "aquifers": aq_out, "gauges": gauges_out,
    "national": summarise(list(cells.values())),
    "method": {
        "god": {"ref": "Foster, S.S.D. (1987); Foster, S., Hirata, R., Gomes, D., D'Elia, M., Paris, M. (2002) Groundwater Quality Protection: a guide for water utilities, municipal authorities and environment agencies. World Bank GW-MATE.",
                "formula": "GOD index = G x O x D. Classes: negligible <0.1, low 0.1-0.3, moderate 0.3-0.5, high 0.5-0.7, extreme 0.7-1.0.",
                "D": GOD_D, "G_O": {k: {"G": v[0], "O": v[1], "why": v[2]} for k, v in GOD_GO.items()},
                "limits": "Screening level at 5 km. Uses map-scale aquifer types and BGS depth classes, not local borehole logs; confining layers, soils and land use are not mapped. Not for site decisions."},
        "recharge": {"ref": "MacDonald et al. (2021) Mapping groundwater recharge in Africa from ground observations and implications for water security. Environ. Res. Lett. 16 034012; dataset doi 10.5285/45d2b71c-d413-44d4-8b4b-6190527912ff",
                     "limits": "Long-term average (1970-2019) at about 30 km; local recharge varies with soils, land cover and rainfall intensity."},
        "stress": {"ref": "Groundwater Development Stress (GDS) = abstraction / recharge x 100% (IGRAC, UN World Water Development Report 2015).",
                   "limits": "The atlas estimates domestic abstraction only: population x share using boreholes (DHS) x litres per person per day chosen by the user. Irrigation, industry and wells are not included, so true stress is higher."},
        "baseflow": {"ref": "Lyne & Hollick (1979) digital filter, alpha 0.925, three passes with reflected padding (Ladson et al. 2013, Australian Journal of Water Resources 17:25-34).",
                     "limits": "Applied to modelled GloFAS v4 daily discharge, whose groundwater stores come from the LISFLOOD model, not observed gauge records. On large rivers the slow component also includes floodplain, wetland and reservoir storage, not only groundwater. Use as an indicator of slow, sustained flow, not a measured groundwater contribution. The correlation is Spearman's rank correlation between mean baseflow in April (end of the dry season) and that year's peak flow."},
    },
    "sources": BGS["meta"]["sources"],
    "pop_src": "National Bureau of Statistics population projections (Demographic Statistics Bulletin 2020), as listed in Wikipedia, List of Nigerian states by population",
    "dhs_survey": SURVEY,
}
(D / "groundwater.json").write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
print("written", (D / "groundwater.json").stat().st_size, "bytes")
