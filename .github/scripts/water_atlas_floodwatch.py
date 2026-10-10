"""Flood watch refresh for the Nigeria Water Resources Atlas (runs hourly from .github/workflows/flood-watch.yml).

Writes two files:
  water-atlas/data/floodwatch.json  – live alerts: GloFAS official reporting-point alerts (Copernicus EMS),
                                       GEOGLOWS 15-day forecasts at the atlas gauges and rivers above flood thresholds,
                                       GDACS flood events now active in Nigeria.
  water-atlas/data/floodhistory.json – flood history of Nigeria: Dartmouth Flood Observatory archive (1985 onwards),
                                       every GDACS flood event for Nigeria with reported impacts, Wikipedia summaries
                                       of major floods. Rebuilt once a day (or when WA_FULL=1).
  floodwatch.json also carries NiMet's public warnings (CAP feed) and, when the NIMET_API_KEY secret is set, its 3-day station forecasts.
  water-atlas/data/srp.json          – NiMet Seasonal Rainfall Prediction by LGA (onset, end, length, total). Daily check.
A source that fails keeps its previous values, so one outage never empties the page.
Files are only rewritten when their content changes, so quiet hours make no commit.
"""
import os, re, io, json, time, datetime, pathlib, urllib.request, urllib.parse, collections

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "water-atlas" / "data"
LIVE_F, HIST_F = DATA / "floodwatch.json", DATA / "floodhistory.json"
UA = {"User-Agent": "nigeria-water-atlas/1.0 (https://shagbaor.com/water-atlas/)"}
NOW = datetime.datetime.now(datetime.timezone.utc)
BBOX = (2.5, 4.0, 15.0, 14.0)  # lon0, lat0, lon1, lat1
LOG = []

def log(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); LOG.append(s)

def http(url, params=None, tries=3, timeout=90, raw=False, data=None):
    if params: url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params, safe=",:;*")
    err = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA, data=data)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b if raw else json.loads(b)
        except Exception as e:
            err = e; time.sleep(3 * (i + 1))
    raise err

def load(p):
    try: return json.loads(p.read_text())
    except Exception: return {}

def save_if_changed(p, obj, ignore=("checked",)):
    old = load(p)
    strip = lambda o: {k: v for k, v in o.items() if k not in ignore}
    if old and strip(old) == strip(obj):
        log(f"{p.name}: unchanged"); return False
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    log(f"{p.name}: written ({p.stat().st_size // 1024} kB)"); return True

def step(name, fn, *a):
    try: return fn(*a)
    except Exception as e:
        log(f"FAILED {name}: {e!r}"); return None

ATLAS = load(DATA / "atlas.json")
GAUGES = [f for f in ATLAS.get("f", []) if f.get("c") == 8]

# ------------------------------------------------------------- states (point -> state)
try:
    from shapely.geometry import shape, Point
    STATES = [(s["n"], shape({"type": s["t"], "coordinates": s["g"]})) for s in ATLAS.get("st", [])]
except Exception:
    STATES = []
def state_of(lon, lat):
    if lon is None or lat is None or not STATES: return None
    p = Point(lon, lat)
    for n, g in STATES:
        if g.contains(p): return n
    best = min(STATES, key=lambda s: s[1].distance(p))
    return best[0] if best[1].distance(p) < 0.15 else None

# ------------------------------------------------------------- GloFAS (Copernicus EMS) reporting points
GLOFAS = "https://ows.globalfloods.eu/glofas-ows/ows.py"

import html.parser as _hp
class TableParser(_hp.HTMLParser):
    def __init__(self):
        super().__init__(); self.tables = []; self.row = None; self.cell = None
    def handle_starttag(self, tag, attrs):
        if tag == "table": self.tables.append([])
        elif tag == "tr" and self.tables: self.row = []
        elif tag in ("td", "th") and self.row is not None: self.cell = []
        elif tag == "img" and self.cell is not None:
            a = dict(attrs); t = a.get("title") or a.get("alt") or ""
            src = a.get("src") or ""
            if not t and src: t = src.rsplit("/", 1)[-1].split(".")[0]
            if t: self.cell.append(" " + t + " ")
    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip()); self.cell = None
        elif tag == "tr" and self.row is not None and self.tables:
            if self.row: self.tables[-1].append(self.row)
            self.row = None
    def handle_data(self, d):
        if self.cell is not None: self.cell.append(d)

def glofas_latest_time():
    x = http(GLOFAS, {"service": "WMS", "request": "GetCapabilities"}, raw=True).decode("utf-8", "ignore")
    i = x.find("<Name>reportingPoints</Name>")
    m = re.search(r'<Dimension[^>]*name="time"[^>]*>([^<]+)</Dimension>', x[i:i + 4000])
    end = m.group(1).split("/")[1] if m and "/" in m.group(1) else NOW.strftime("%Y-%m-%dT00:00Z")
    return end.replace("Z", "").replace("T00:00", "T00:00:00")[:19]

def glofas_station_positions(t):
    """Render the reporting-points layer over Nigeria and find each point symbol (the service has no point list)."""
    from PIL import Image
    W, H = 1250, 1000
    png = http(GLOFAS, {"service": "WMS", "version": "1.3.0", "request": "GetMap", "format": "image/png", "transparent": "true",
                        "crs": "EPSG:4326", "bbox": f"{BBOX[1]},{BBOX[0]},{BBOX[3]},{BBOX[2]}", "width": W, "height": H,
                        "styles": "", "layers": "reportingPoints", "time": t}, raw=True)
    im = Image.open(io.BytesIO(png)).convert("RGBA"); px = im.load()
    seen = bytearray(W * H); blobs = []
    for y in range(H):
        for x in range(W):
            k = y * W + x
            if seen[k] or px[x, y][3] < 50: continue
            st = [(x, y)]; seen[k] = 1; sx = sy = n = 0
            while st:
                qx, qy = st.pop(); sx += qx; sy += qy; n += 1
                for nx, ny in ((qx + 1, qy), (qx - 1, qy), (qx, qy + 1), (qx, qy - 1)):
                    if 0 <= nx < W and 0 <= ny < H:
                        r = ny * W + nx
                        if not seen[r] and px[nx, ny][3] >= 50: seen[r] = 1; st.append((nx, ny))
            if n >= 20:
                blobs.append((BBOX[0] + (sx / n + .5) / W * (BBOX[2] - BBOX[0]), BBOX[3] - (sy / n + .5) / H * (BBOX[3] - BBOX[1]), n))
    return blobs

def glofas_info(lon, lat, t, d):
    j = http(GLOFAS, {"service": "WMS", "version": "1.3.0", "request": "GetFeatureInfo", "layers": "reportingPoints",
                      "query_layers": "reportingPoints", "info_format": "application/json", "crs": "EPSG:4326",
                      "bbox": f"{lat - d},{lon - d},{lat + d},{lon + d}", "width": 101, "height": 101, "i": 50, "j": 50,
                      "feature_count": 10, "time": t}, raw=True).decode("utf-8", "ignore")
    if not j.startswith("{"): return []
    j = json.loads(j); out = []
    for layer in (j.get("content") or {}).values():
        doc = " ".join(v for v in layer.values() if isinstance(v, str))
        tp = TableParser(); tp.feed(doc)
        info = [tb for tb in tp.tables if tb and "Station ID" in tb[0]]
        fc = [tb for tb in tp.tables if tb and any("Alert level" in c for c in tb[0])]
        for k, tb in enumerate(info):
            for row in tb[1:]:
                if len(row) != len(tb[0]): continue
                o = dict(zip(tb[0], row))
                f = {}
                if k < len(fc) and len(fc[k]) > 1 and len(fc[k][1]) == len(fc[k][0]):
                    f = dict(zip(fc[k][0], fc[k][1]))
                out.append((o, f))
    return out

def num(s):
    m = re.search(r"-?\d[\d,]*\.?\d*", s or "")
    return float(m.group(0).replace(",", "")) if m else None

def glofas_points(prev):
    t = glofas_latest_time(); log("GloFAS forecast time", t)
    blobs = glofas_station_positions(t); log("GloFAS point symbols found:", len(blobs))
    pts = {}
    for lon, lat, n in blobs:
        for o, f in glofas_info(lon, lat, t, .12 if n > 300 else .06):
            sid = o.get("Station ID") or o.get("Point ID")
            if not sid or sid in pts: continue
            probs = [num(x) for x in (f.get(next((k for k in f if "Maximum probability" in k), ""), "") or "").split("/")]
            lo_, la_ = num(o.get("Longitude [Deg]")), num(o.get("Latitude [Deg]"))
            pk = next((k for k in f if k.startswith("Peak")), None)
            pts[sid] = {"id": sid, "n": o.get("Station Name"), "river": o.get("River"), "basin": o.get("Basin"), "country": o.get("Country"),
                        "lo": lo_, "la": lat if la_ is None else la_, "area": num(o.get("LISFLOOD Drainage Area [km2]")),
                        "st": state_of(lo_, la_) if o.get("Country") == "Nigeria" else None,
                        "p2": probs[0] if len(probs) > 0 else None, "p5": probs[1] if len(probs) > 1 else None, "p20": probs[2] if len(probs) > 2 else None,
                        "alert": f.get("Alert level"), "step": f.get(next((k for k in f if "probability step" in k), ""), None),
                        "tend": (lambda t: "rising" if "up" in t else "falling" if "down" in t else "steady" if ("stable" in t or "flat" in t or "equal" in t) else None)((f.get("Discharge tendency") or "").lower()), "peak": f.get(pk) if pk else None, "fdate": f.get("Forecast Date")}
        time.sleep(.2)
    if not pts: raise RuntimeError("no GloFAS points parsed")
    return {"time": t, "points": sorted(pts.values(), key=lambda p: (-(p["p2"] or 0), p["n"] or ""))}

# ------------------------------------------------------------- GEOGLOWS (ECMWF) river forecasts
GG_FEED = "https://livefeeds3.arcgis.com/arcgis/rest/services/GEOGLOWS/GlobalWaterModel_Medium/MapServer/0/query"
GG_API = "https://geoglows.ecmwf.int/api/v2"

def gg_comid(lon, lat):
    j = http(GG_FEED, {"f": "json", "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "inSR": 4326, "distance": 6000,
                       "units": "esriSRUnit_Meter", "outFields": "comid,upstreamarea", "returnGeometry": "false",
                       "orderByFields": "upstreamarea DESC", "resultRecordCount": 1})
    fs = j.get("features") or []
    return fs[0]["attributes"]["comid"] if fs else None

def geoglows(prev):
    old = (prev.get("geoglows") or {}).get("gauges") or {}
    out = {}; gen = None
    for g in GAUGES:
        key = g.get("gauge"); comid = (old.get(key) or {}).get("comid")
        try:
            if not comid: comid = gg_comid(g["lo"], g["la"])
            if not comid: continue
            f = http(f"{GG_API}/forecast/{comid}", {"format": "json"})
            gen = gen or (f.get("metadata") or {}).get("gen_date")
            days = collections.OrderedDict()
            for t, m, lo, hi in zip(f["datetime"], f["flow_median"], f["flow_uncertainty_lower"], f["flow_uncertainty_upper"]):
                d = t[:10]; a = days.setdefault(d, [0, 0, 0])
                a[0] = max(a[0], m or 0); a[1] = max(a[1], lo or 0); a[2] = max(a[2], hi or 0)
            ds = list(days.items())
            pk = max(ds, key=lambda x: x[1][0])
            rp = None
            try:
                r = http(GG_FEED, {"f": "json", "where": f"comid={comid}", "outFields": "returnperiod", "returnGeometry": "false"})
                rp = (r.get("features") or [{}])[0].get("attributes", {}).get("returnperiod")
            except Exception: pass
            out[key] = {"comid": comid, "d0": ds[0][0], "med": [round(v[0], 1) for _, v in ds], "lo": [round(v[1], 1) for _, v in ds],
                        "hi": [round(v[2], 1) for _, v in ds], "now": round(ds[0][1][0], 1), "peak": round(pk[1][0], 1), "peakDate": pk[0], "rp": rp}
        except Exception as e:
            log(f"GEOGLOWS {key}: {e!r}")
            if key in old: out[key] = old[key]
        time.sleep(.2)
    # rivers in Nigeria forecast above a return-period flow
    reaches = []; counts = collections.Counter()
    try:
        r = http(GG_FEED, {"f": "json", "where": "returnperiod>=2 AND rivercountry='Nigeria'", "outFields": "comid,returnperiod,meanflow,streamorder,upstreamarea",
                           "returnGeometry": "true", "outSR": 4326, "maxAllowableOffset": 0.01, "resultRecordCount": 4000})
        for ft in r.get("features") or []:
            a = ft["attributes"]; counts[str(a["returnperiod"])] += 1
            path = (ft.get("geometry") or {}).get("paths") or [[]]
            mid = path[0][len(path[0]) // 2] if path and path[0] else [None, None]
            reaches.append({"comid": a["comid"], "rp": a["returnperiod"], "q": a["meanflow"], "so": a["streamorder"],
                            "km2": round((a["upstreamarea"] or 0) / 1e6), "lo": round(mid[0], 3) if mid[0] else None, "la": round(mid[1], 3) if mid[1] else None})
        reaches = [x for x in reaches if (x["so"] or 0) >= 3]
        reaches.sort(key=lambda x: (-x["km2"], -x["rp"]))
        for x in reaches[:40]: x["st"] = state_of(x["lo"], x["la"])
    except Exception as e:
        log(f"GEOGLOWS reaches: {e!r}")
    if not out: raise RuntimeError("no GEOGLOWS forecasts")
    return {"gen": gen, "gauges": out, "reach_counts": dict(counts), "reaches": reaches[:40]}

# ------------------------------------------------------------- GDACS (EC JRC / UN OCHA)
GDACS = "https://www.gdacs.org/gdacsapi/api/events"

def gdacs_list(frm, to=None):
    to = to or (NOW + datetime.timedelta(days=2)).strftime("%Y-%m-%d")
    out, page = [], 1
    while page < 20:
        j = http(f"{GDACS}/geteventlist/SEARCH", {"eventlist": "FL", "country": "Nigeria", "fromDate": frm, "toDate": to,
                                                  "alertlevel": "Green;Orange;Red", "pageSize": 100, "pageNumber": page})
        fs = j.get("features") or []
        out += fs
        if len(fs) < 100: break
        page += 1
    return out

def gdacs_event(f):
    p = f["properties"]; c = (f.get("geometry") or {}).get("coordinates") or [None, None]
    return {"id": int(p["eventid"]), "ep": p.get("episodeid"), "from": p["fromdate"][:10], "to": p["todate"][:10], "alert": (p.get("alertlevel") or "").title(),
            "cur": bool(p.get("iscurrent") in (True, "true")), "lo": c[0], "la": c[1], "st": state_of(c[0], c[1]),
            "countries": [a.get("iso3") for a in p.get("affectedcountries") or [] if a.get("iso3")],
            "url": f"https://www.gdacs.org/report.aspx?eventtype=FL&eventid={p['eventid']}"}

def gdacs_impacts(eid):
    j = http(f"{GDACS}/geteventdata", {"eventtype": "FL", "eventid": eid})
    s = (j.get("properties") or {}).get("sendai") or []
    tot = collections.Counter(); latest = [x for x in s if x.get("latest")]
    rows = latest if latest else s
    best = {}
    for x in rows:
        k = (x.get("sendainame"), x.get("region") or x.get("country"))
        v = num(str(x.get("sendaivalue")))
        if v is None: continue
        best[k] = max(best.get(k, 0), v)
    for (name, _), v in best.items(): tot[name] += v
    regions = sorted({x.get("region") for x in s if x.get("region")})
    return {k: int(v) for k, v in tot.items()}, regions[:12]

def gdacs_live(prev):
    frm = (NOW - datetime.timedelta(days=120)).strftime("%Y-%m-%d")
    ev = [gdacs_event(f) for f in gdacs_list(frm)]
    for e in ev[:15]:
        try: e["impact"], e["regions"] = gdacs_impacts(e["id"])
        except Exception: pass
    ev.sort(key=lambda e: e["from"], reverse=True)
    return {"events": ev, "active": sum(e["cur"] for e in ev)}

# ------------------------------------------------------------- NiMet (Nigerian Meteorological Agency)
NIMET_CAP = "https://cap-sources.s3.amazonaws.com/ng-nimet-en/rss.xml"
NIMET = "https://nimet.gov.ng/"
SRP_API = "https://nimet-scp-backend.onrender.com/api/srp"
SRP_F = DATA / "srp.json"

def _tag(x, t):
    m = re.search(r"<(?:cap:)?%s>([\s\S]*?)</(?:cap:)?%s>" % (t, t), x)
    if not m: return None
    v = re.sub(r"<!\[CDATA\[|\]\]>", "", m.group(1)).strip()
    import html as _h
    return _h.unescape(v)

def nimet_cap(prev):
    rss = http(NIMET_CAP, raw=True, timeout=40).decode("utf-8", "replace")
    old = {a["id"]: a for a in ((prev.get("nimet") or {}).get("alerts") or [])}
    out = []
    for it in rss.split("<item>")[1:16]:
        link = _tag(it, "link")
        if not link: continue
        aid = link.rsplit("/", 1)[-1].replace(".xml", "")
        if aid in old: out.append(old[aid]); continue
        x = http(link, raw=True, timeout=40, tries=2).decode("utf-8", "replace")
        info = x.split("<cap:info>")[1] if "<cap:info>" in x else x
        polys = []
        for m in re.finditer(r"<cap:polygon>([\s\S]*?)</cap:polygon>", info):
            pts = []
            for pr in m.group(1).split():
                try:
                    la, lo = pr.split(",")[:2]; pts.append([round(float(la), 3), round(float(lo), 3)])
                except Exception: pass
            if len(pts) > 2: polys.append(pts)
        out.append({"id": aid, "u": link, "sent": _tag(x, "sent"), "event": _tag(info, "event"), "head": _tag(info, "headline") or _tag(it, "title"),
                    "sev": _tag(info, "severity"), "urg": _tag(info, "urgency"), "cert": _tag(info, "certainty"),
                    "onset": _tag(info, "onset") or _tag(info, "effective"), "exp": _tag(info, "expires"),
                    "desc": _tag(info, "description"), "instr": _tag(info, "instruction"), "area": _tag(info, "areaDesc"), "poly": polys})
        time.sleep(.2)
    if not out: raise RuntimeError("empty CAP feed")
    out.sort(key=lambda a: a.get("sent") or "", reverse=True)
    return out

# NiMet Weather API (https://nimet.gov.ng/weatherapi): 3-day forecasts at NiMet's forecast stations.
# Needs the repository secret NIMET_API_KEY; the key stays on GitHub and is never written to the website.
NIMET_API = "https://api.nimet.gov.ng/api"
# Approximate positions of NiMet forecast stations (town centres or the coastal station); the API gives names only.
NIMET_STN = {
    "ABAKALIKI": (8.11, 6.33), "ABEOKUTA": (3.35, 7.15), "ABUJA": (7.49, 9.06), "ADO-EKITI": (5.22, 7.62), "AKURE": (5.19, 7.25),
    "ASABA": (6.73, 6.20), "AWKA": (7.07, 6.21), "BAUCHI": (9.84, 10.31), "BADAGRY": (2.88, 6.42), "BENIN": (5.63, 6.34),
    "BIDA": (6.01, 9.08), "CALABAR": (8.33, 4.96), "CALABAR MARINE": (8.31, 4.93), "DUTSE": (9.34, 11.76), "EKET MARINE": (7.95, 4.59),
    "ENUGU": (7.49, 6.44), "GOMBE": (11.17, 10.29), "GUSAU": (6.66, 12.16), "IBADAN": (3.90, 7.38), "IJEBU-ODE": (3.92, 6.82),
    "IKEJA": (3.35, 6.60), "IKOM": (8.71, 5.96), "ILORIN": (4.55, 8.50), "ISEYIN": (3.60, 7.97), "JALINGO": (11.36, 8.89),
    "JOS": (8.89, 9.90), "KADUNA": (7.44, 10.52), "KANO": (8.52, 12.00), "KATSINA": (7.60, 12.99), "KEBBI": (4.20, 12.45),
    "KOKO": (5.47, 6.00), "LAFIA": (8.52, 8.49), "LOKOJA": (6.74, 7.80), "MAIDUGURI": (13.16, 11.83), "MAKURDI": (8.54, 7.73),
    "MINNA": (6.55, 9.61), "NGURU": (10.45, 12.88), "NIOMR LAGOS": (3.40, 6.42), "OBUDU": (9.17, 6.66), "OSOGBO": (4.56, 7.77),
    "OWERRI": (7.03, 5.48), "PORT HARCOURT": (7.01, 4.82), "PORT HARCOURT MARINE": (7.03, 4.77), "POTISKUM": (11.07, 11.71),
    "SHAKI": (3.39, 8.67), "SOKOTO": (5.24, 13.06), "UMUAHIA": (7.49, 5.53), "UYO": (7.93, 5.04), "WARRI": (5.75, 5.52),
    "WARRI NPA": (5.73, 5.51), "YELWA": (4.75, 10.84), "YENAGOA": (6.26, 4.93), "YENAGOA MARINE": (6.08, 4.70), "YOLA": (12.46, 9.21),
    "ZARIA": (7.70, 11.09), "APAPA LAGOS": (3.37, 6.45), "AYETORO ONDO": (4.75, 6.10),
}

def nimet_forecast():
    key = os.environ.get("NIMET_API_KEY", "").strip()
    if not key: return None
    hdr = dict(UA, **{"x-api-key": key})
    def get(path):
        req = urllib.request.Request(NIMET_API + path, headers=hdr)
        with urllib.request.urlopen(req, timeout=40) as r: return json.loads(r.read())
    stations = get("/forecaststation")
    out = []
    for st in stations:
        name = (st.get("station") or "").strip()
        try: f = get("/forecast/" + urllib.parse.quote(name))
        except Exception as e:
            log("NiMet forecast", name, repr(e)); continue
        days = []
        for k in ("day1", "day2", "day3"):
            d = f.get(k) or {}
            t = re.findall(r"-?\d+(?:\.\d+)?", d.get("temp") or "")
            days.append([d.get("date"), d.get("condition"), float(t[0]) if t else None, float(t[1]) if len(t) > 1 else None])
        lo, la = NIMET_STN.get(name.upper(), (None, None))
        stn = {"Federal Capital Territory": "FCT"}.get(st.get("state"), st.get("state"))
        out.append({"n": name.title(), "st": stn, "lga": st.get("lga"), "lo": lo, "la": la, "d": days})
        time.sleep(.15)
    if not out: raise RuntimeError("no NiMet forecasts")
    return {"at": NOW.strftime("%Y-%m-%d"), "st": out}

def nimet(prev):
    # Forecast bulletins on nimet.gov.ng sit behind a JavaScript bot check, so they are linked on the page, not collected.
    p = prev.get("nimet") or {}
    a = step("NiMet CAP alerts", nimet_cap, prev)
    f = step("NiMet forecasts", nimet_forecast)
    if a is None and f is None and not p: return None
    o = {"alerts": a if a is not None else p.get("alerts", [])}
    fc = f if f is not None else p.get("fc")
    if fc: o["fc"] = fc
    return o

def srp():
    d = http(SRP_API, timeout=120)
    states, year = {}, None
    for s in d:
        n = (s.get("statename") or "").strip()
        n = {"River": "Rivers", "Federal Capital Territory": "FCT", "Abuja": "FCT", "Nassarawa": "Nasarawa"}.get(n, n)
        year = year or s.get("year")
        rows = []
        for c in s.get("city") or []:
            num_ = lambda v: int(float(v)) if str(v).replace(".", "", 1).isdigit() else None
            rows.append([c.get("name"), c.get("onset"), c.get("seasonend"), num_(c.get("seasonlength")), num_(c.get("annualrainfall"))])
        if n: states[n] = sorted(rows, key=lambda r: r[0] or "")
    if len(states) < 30: raise RuntimeError("SRP: only %d states" % len(states))
    return {"year": year or NOW.year, "src": "NiMet Seasonal Rainfall Prediction (SRP) %s" % (year or NOW.year), "u": NIMET + "srp", "states": states}

# ------------------------------------------------------------- history
DFO = "https://services1.arcgis.com/AXaYBvnJsB5Q7sDF/ArcGIS/rest/services/Global_Archive_of_large_flood_events/FeatureServer/0/query"

def dfo():
    j = http(DFO, {"f": "json", "where": "COUNTRY LIKE '%Nigeria%' OR OTHERCOUNT LIKE '%Nigeria%'",
                   "outFields": "ID,COUNTRY,OTHERCOUNT,LONG,LAT,AREA,BEGAN,ENDED,VALIDATION,DEAD,DISPLACED,MAINCAUSE,SEVERITY",
                   "returnGeometry": "false", "orderByFields": "BEGAN", "resultRecordCount": 2000})
    out = []
    for f in j.get("features") or []:
        a = f["attributes"]
        d = lambda ms: datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime("%Y-%m-%d") if ms else None
        out.append({"id": a["ID"], "from": d(a["BEGAN"]), "to": d(a["ENDED"]), "dead": a.get("DEAD"), "disp": a.get("DISPLACED"),
                    "cause": a.get("MAINCAUSE"), "sev": a.get("SEVERITY"), "km2": round(a.get("AREA") or 0), "lo": a.get("LONG"), "la": a.get("LAT"),
                    "st": state_of(a.get("LONG"), a.get("LAT")), "other": a.get("OTHERCOUNT") if a.get("OTHERCOUNT") not in ("0", None, "") else None})
    if not out: raise RuntimeError("no DFO rows")
    return out

WIKI_TITLES = ["2012 Nigeria floods", "2022 Nigeria floods", "2023 Nigeria floods", "2024 Nigeria floods", "Borno State flooding", "Alau Dam",
               "2025 Nigeria floods", "2025 Mokwa flood", "Ogunpa River"]

def wiki():
    titles = WIKI_TITLES + [f"{y} Nigeria floods" for y in range(NOW.year - 1, NOW.year + 1)]
    out = {}
    for t in dict.fromkeys(titles):
        try:
            j = http("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(t.replace(" ", "_")) + "?redirect=true", tries=1)
            if j.get("type") == "standard" and j.get("extract"):
                out[j["title"]] = {"t": j["extract"], "u": j.get("content_urls", {}).get("desktop", {}).get("page")}
        except Exception: pass
    return out

def history(prevh):
    old = {e["id"]: e for e in prevh.get("gdacs", [])}
    ev = [gdacs_event(f) for f in gdacs_list("1985-01-01")]
    recent = (NOW - datetime.timedelta(days=90)).strftime("%Y-%m-%d")
    for e in ev:
        o = old.get(e["id"])
        if o and o.get("impact") is not None and o["to"] < recent:
            e["impact"], e["regions"] = o.get("impact"), o.get("regions", [])
        else:
            try: e["impact"], e["regions"] = gdacs_impacts(e["id"])
            except Exception as x: e["impact"], e["regions"] = (o or {}).get("impact"), (o or {}).get("regions", [])
            time.sleep(.3)
    ev.sort(key=lambda e: e["from"])
    d = step("DFO archive", dfo) or prevh.get("dfo", [])
    w = step("Wikipedia", wiki) or prevh.get("wiki", {})
    return {"built": NOW.strftime("%Y-%m-%d"), "gdacs": ev, "dfo": d, "wiki": w}

# ------------------------------------------------------------- main
def main():
    prev = load(LIVE_F)
    live = {"checked": NOW.strftime("%Y-%m-%dT%H:%MZ")}
    for key, fn in (("glofas", glofas_points), ("geoglows", geoglows), ("gdacs", gdacs_live), ("nimet", nimet)):
        v = step(key, fn, prev)
        live[key] = v if v is not None else prev.get(key)
        if v is None and prev.get(key): live[key]["stale"] = True
    live["log"] = [l for l in LOG if l.startswith("FAILED")]
    save_if_changed(LIVE_F, live, ignore=("checked", "log"))
    prevh = load(HIST_F)
    if os.environ.get("WA_FULL") == "1" or not prevh or prevh.get("built") != NOW.strftime("%Y-%m-%d"):
        h = step("history", history, prevh)
        if h: save_if_changed(HIST_F, h, ignore=())
        daily = True
    else: daily = False
    if daily or not SRP_F.exists():
        r = step("NiMet SRP", srp)
        if r: save_if_changed(SRP_F, r, ignore=())

if __name__ == "__main__":
    main()
