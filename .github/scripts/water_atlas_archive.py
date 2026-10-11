"""Public data archive for the Nigeria Water Resources Atlas.

The live atlas files in water-atlas/data are overwritten as sources update. This script keeps their history
in water-atlas/archive so planners, researchers and policy analysts can download it:

  river_flow/<gauge>.csv          daily modelled river flow at each flood-watch gauge, from the start of the record (GloFAS via Open-Meteo),
                                  rewritten by the weekly rebuild:  python3 water_atlas_archive.py --gauges /tmp/raw/glofas_gauges.json
  river_flow/gauges.csv           the gauges: river, place, coordinates and the model cell used
  flood_alerts_glofas.csv         one row per GloFAS reporting point per day (alert level, flood probabilities, peak timing)
  river_forecasts_geoglows.csv    one row per gauge per forecast day issued (GEOGLOWS 15-day median forecast)
  flood_events_gdacs.csv          every GDACS flood event seen for Nigeria, with reported impacts
  weather_warnings_nimet.csv      every NiMet warning seen on its public CAP feed
  weather_forecasts_nimet.csv     NiMet 3-day station forecasts, one row per station, issue date and day
  snapshots/YYYY-MM/*.json.gz     a dated copy of every live atlas file, taken once a month
  catalogue.json                  what each file holds, its fields, coverage, size, source and licence (read by the Data page)

Runs after the hourly flood-watch refresh (it is cheap and idempotent: one row per item per day) and after the weekly rebuild.
Files are only rewritten when their content changes.
"""
import csv, io, sys, json, gzip, hashlib, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "water-atlas" / "data"
ARC = ROOT / "water-atlas" / "archive"
NOW = datetime.datetime.now(datetime.timezone.utc)
TODAY = NOW.date().isoformat()

def log(*a): print(*a, flush=True)

def load(p):
    try: return json.loads(pathlib.Path(p).read_text())
    except Exception: return {}

def read_csv(p):
    if not p.exists(): return []
    with p.open(newline="", encoding="utf-8") as f: return list(csv.DictReader(f))

def write_if_changed(p, text):
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists() and p.read_text(encoding="utf-8") == text: return False
    p.write_text(text, encoding="utf-8"); log(f"{p.relative_to(ROOT)}: written"); return True

def csv_text(fields, rows):
    b = io.StringIO(); w = csv.DictWriter(b, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
    w.writeheader(); [w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in fields}) for r in rows]; return b.getvalue()

def upsert(name, fields, key, new_rows, keep_first=()):
    """Merge new rows into an archive CSV. Rows with the same key are replaced by the newest values,
    except the columns in keep_first (e.g. first_seen), which keep their original value."""
    p = ARC / name; rows = {tuple(r[k] for k in key): r for r in read_csv(p)}
    for r in new_rows:
        r = {k: ("" if r.get(k) is None else str(r.get(k))) for k in fields}
        k = tuple(r[c] for c in key); old = rows.get(k)
        if old:
            for c in keep_first:
                if old.get(c): r[c] = old[c]
        rows[k] = r
    out = sorted(rows.values(), key=lambda r: tuple(r[c] for c in key))
    write_if_changed(p, csv_text(fields, out))

# ---------------------------------------------------------------- daily logs from the live flood watch
F_GLOFAS = ["date", "point_id", "name", "river", "basin", "country", "state", "lat", "lon", "upstream_area_km2",
            "prob_2yr_pct", "prob_5yr_pct", "prob_20yr_pct", "alert", "onset", "peak", "forecast_date"]
F_GEOGLOWS = ["issue_date", "gauge_id", "reach_id", "flow_now_m3s", "peak_flow_m3s", "peak_date", "return_period_flag", "median_15day_m3s"]
F_GDACS = ["event_id", "episode", "from_date", "to_date", "alert", "state", "lat", "lon", "deaths", "missing",
           "displaced", "houses_damaged", "other_impacts", "regions", "url", "first_seen", "last_seen"]
F_NIMET = ["warning_id", "sent", "event", "headline", "severity", "urgency", "certainty", "onset", "expires",
           "area", "description", "instruction", "cap_url", "first_seen"]
F_NIMETFC = ["issued", "station", "state", "lga", "lat", "lon", "day", "day_label", "weather", "temp_day_c", "temp_night_c"]

def flood_logs():
    fw = load(DATA / "floodwatch.json")
    if not fw: log("no floodwatch.json"); return
    day = (fw.get("checked") or TODAY)[:10]
    g = fw.get("glofas") or {}
    upsert("flood_alerts_glofas.csv", F_GLOFAS, ["date", "point_id"], [
        {"date": day, "point_id": p.get("id"), "name": p.get("n"), "river": p.get("river"), "basin": p.get("basin"),
         "country": p.get("country"), "state": p.get("st"), "lat": p.get("la"), "lon": p.get("lo"), "upstream_area_km2": p.get("area"),
         "prob_2yr_pct": p.get("p2"), "prob_5yr_pct": p.get("p5"), "prob_20yr_pct": p.get("p20"), "alert": p.get("alert"),
         "onset": p.get("step"), "peak": p.get("peak"), "forecast_date": p.get("fdate")} for p in g.get("points", [])])
    gg = (fw.get("geoglows") or {}).get("gauges") or {}
    upsert("river_forecasts_geoglows.csv", F_GEOGLOWS, ["issue_date", "gauge_id"], [
        {"issue_date": v.get("d0"), "gauge_id": k, "reach_id": v.get("comid"), "flow_now_m3s": v.get("now"),
         "peak_flow_m3s": v.get("peak"), "peak_date": v.get("peakDate"), "return_period_flag": v.get("rp"),
         "median_15day_m3s": ";".join("" if x is None else str(x) for x in v.get("med") or [])} for k, v in gg.items() if v.get("d0")])
    rows = []
    for e in (fw.get("gdacs") or {}).get("events", []):
        im = dict(e.get("impact") or {})
        rows.append({"event_id": e.get("id"), "episode": e.get("ep"), "from_date": e.get("from"), "to_date": e.get("to"),
                     "alert": e.get("alert"), "state": e.get("st"), "lat": e.get("la"), "lon": e.get("lo"),
                     "deaths": im.pop("death", None), "missing": im.pop("missing", None), "displaced": im.pop("displaced", None),
                     "houses_damaged": im.pop("houses damaged", None), "other_impacts": "; ".join(f"{k}: {v}" for k, v in im.items()),
                     "regions": "; ".join(sorted(set(e.get("regions") or []))), "url": e.get("url"), "first_seen": day, "last_seen": day})
    upsert("flood_events_gdacs.csv", F_GDACS, ["event_id"], rows, keep_first=("first_seen",))
    nm = fw.get("nimet") or {}
    upsert("weather_warnings_nimet.csv", F_NIMET, ["warning_id"], [
        {"warning_id": a.get("id"), "sent": a.get("sent"), "event": a.get("event"), "headline": a.get("head"), "severity": a.get("sev"),
         "urgency": a.get("urg"), "certainty": a.get("cert"), "onset": a.get("onset"), "expires": a.get("exp"), "area": a.get("area"),
         "description": a.get("desc"), "instruction": (a.get("instr") or "").replace("\n", " "), "cap_url": a.get("u"), "first_seen": day}
        for a in nm.get("alerts", [])], keep_first=("first_seen",))
    fc = nm.get("fc") or {}
    if fc.get("at"):
        upsert("weather_forecasts_nimet.csv", F_NIMETFC, ["issued", "station", "day"], [
            {"issued": fc["at"], "station": s.get("n"), "state": s.get("st"), "lga": s.get("lga"), "lat": s.get("la"), "lon": s.get("lo"),
             "day": i + 1, "day_label": d[0], "weather": d[1], "temp_day_c": d[2], "temp_night_c": d[3]}
            for s in fc.get("st", []) for i, d in enumerate(s.get("d") or []) if len(d) >= 4])

# ---------------------------------------------------------------- 40-year river flow per gauge (weekly)
F_GAUGES = ["gauge_id", "river", "place", "lat", "lon", "model_cell_lat", "model_cell_lon", "first_date", "last_date", "days", "file"]

def river_flow(raw):
    gs = load(raw)
    if not isinstance(gs, list) or not gs: log(f"no gauge series in {raw}"); return
    idx = []
    for g in gs:
        q = g.get("q") or []; t0 = datetime.date.fromisoformat(g["t0"])
        rows = [(t0 + datetime.timedelta(days=i)).isoformat() + "," + ("" if v is None else f"{v:g}") for i, v in enumerate(q)]
        while rows and rows[-1].endswith(","): rows.pop()          # trailing days without a value
        while rows and rows[0].endswith(","): rows.pop(0)          # leading days before the record starts
        if not rows: continue
        fn = f"river_flow/{g['id']}.csv"
        # keep earlier years added by the GloFAS backfill (water_atlas_glofas_backfill.py), which Open-Meteo does not serve
        old = [r for r in read_csv(ARC / fn) if r.get("date", "") < rows[0][:10]]
        rows = [f"{r['date']},{r['discharge_m3s']}" for r in old] + rows
        write_if_changed(ARC / fn, "date,discharge_m3s\n" + "\n".join(rows) + "\n")
        idx.append({"gauge_id": g["id"], "river": g.get("river"), "place": g.get("place"), "lat": g.get("la"), "lon": g.get("lo"),
                    "model_cell_lat": g.get("sla"), "model_cell_lon": g.get("slo"), "first_date": rows[0][:10], "last_date": rows[-1][:10],
                    "days": len(rows), "file": fn})
    write_if_changed(ARC / "river_flow" / "gauges.csv", csv_text(F_GAUGES, idx))

# ---------------------------------------------------------------- monthly snapshots of the live files
def snapshot():
    d = ARC / "snapshots" / TODAY[:7]
    if d.exists(): return
    d.mkdir(parents=True)
    for p in sorted(DATA.glob("*.json")):
        b = p.read_bytes(); out = d / (p.name + ".gz")
        with open(out, "wb") as f:
            with gzip.GzipFile(filename=p.name, mode="wb", fileobj=f, mtime=0, compresslevel=9) as z: z.write(b)
    log(f"snapshot {d.relative_to(ROOT)}: {len(list(d.iterdir()))} files")

# ---------------------------------------------------------------- catalogue (read by the Data page)
CC = "CC BY 4.0"
CAT = [
 ("river_flow", "Daily river flow at the flood-watch gauges",
  "Modelled daily river discharge (m³/s) at each of the atlas's flood-watch gauges, from the start of the record to yesterday, from the GloFAS v4 reanalysis and recent forecast runs. One CSV per gauge; gauges.csv lists the rivers, places, coordinates and the model grid cell used.",
  "river_flow/gauges.csv", "GloFAS v4, Copernicus Emergency Management Service, via the Open-Meteo Flood API", CC, "Weekly",
  [("date", "Day (UTC)"), ("discharge_m3s", "Modelled mean daily river discharge, cubic metres per second")],
  "GloFAS is a global model at about 5 km resolution: good for large rivers and seasonal patterns, weak for small streams, urban drainage and dam releases. It is not a measured gauge record."),
 ("flood_alerts_glofas.csv", "GloFAS flood alerts at reporting points, daily",
  "The official GloFAS flood-alert status of every reporting point in and around Nigeria, recorded once a day: alert level, the probability of exceeding the 2-, 5- and 20-year flood, onset and expected peak.",
  "flood_alerts_glofas.csv", "GloFAS, Copernicus Emergency Management Service", "Copernicus licence; free with attribution", "Daily",
  [(f, "") for f in F_GLOFAS], ""),
 ("river_forecasts_geoglows.csv", "GEOGLOWS 15-day river forecasts at the gauges",
  "Each day's 15-day median river-flow forecast for the atlas gauges, with the flow on the issue day, the forecast peak and whether a return-period threshold is exceeded.",
  "river_forecasts_geoglows.csv", "GEOGLOWS, ECMWF", CC, "Daily",
  [(f, "") for f in F_GEOGLOWS], "median_15day_m3s holds 15 values separated by semicolons, day 0 (the issue date) to day 14."),
 ("flood_events_gdacs.csv", "Flood events in Nigeria reported by GDACS",
  "Every GDACS flood event affecting Nigeria seen by the atlas, with dates, alert level, location and reported impacts. The atlas's flood history page also covers events back to 1985.",
  "flood_events_gdacs.csv", "GDACS, European Commission JRC and UN OCHA", "Free with attribution", "Hourly",
  [(f, "") for f in F_GDACS], ""),
 ("weather_warnings_nimet.csv", "NiMet weather warnings",
  "Every warning published on the Nigerian Meteorological Agency's public CAP feed since the archive began, with severity, timing, area and advice. The cap_url links to the original warning, including its map polygon.",
  "weather_warnings_nimet.csv", "Nigerian Meteorological Agency (NiMet)", "Public warnings; credit NiMet", "Hourly",
  [(f, "") for f in F_NIMET], ""),
 ("weather_forecasts_nimet.csv", "NiMet 3-day station forecasts",
  "NiMet's 3-day forecasts for its forecast stations, one row per station, issue date and forecast day, with weather and day and night temperatures.",
  "weather_forecasts_nimet.csv", "Nigerian Meteorological Agency (NiMet) Weather API", "Credit NiMet", "Daily",
  [(f, "") for f in F_NIMETFC], ""),
]

def stats(p):
    rows = read_csv(p); dates = []
    for r in rows:
        for c in ("date", "issue_date", "issued", "sent", "from_date", "first_seen"):
            if r.get(c): dates.append(r[c][:10]); break
    return len(rows), (min(dates) if dates else None), (max(dates) if dates else None)

def catalogue():
    out = []
    for cid, title, desc, path, src, lic, freq, fields, note in CAT:
        p = ARC / path
        if not p.exists(): continue
        n, first, last = stats(p)
        item = {"id": cid, "title": title, "description": desc, "file": path, "source": src, "licence": lic, "update": freq,
                "rows": n, "first": first, "last": last, "bytes": p.stat().st_size, "fields": [{"name": a, "desc": b} for a, b in fields]}
        if note: item["note"] = note
        if cid == "river_flow":
            gs = read_csv(p); item["gauges"] = [{"id": g["gauge_id"], "name": f"{g['river']} at {g['place']}", "file": g["file"],
                "first": g["first_date"], "last": g["last_date"], "days": int(g["days"])} for g in gs]
            if gs: item["first"], item["last"] = min(g["first_date"] for g in gs), max(g["last_date"] for g in gs)
            if item.get("first") and item["first"] < "1997":
                item["description"] += " Years before 1997 come from the GloFAS v4 consolidated reanalysis in the CEMS Early Warning Data Store, at the same model cell; later years come through the Open-Meteo Flood API."
                item["source"] = "GloFAS v4, Copernicus Emergency Management Service, via the CEMS Early Warning Data Store (before 1997) and the Open-Meteo Flood API"
            item["rows"] = sum(int(g["days"]) for g in gs); item["bytes"] = sum((ARC / g["file"]).stat().st_size for g in gs if (ARC / g["file"]).exists())
        out.append(item)
    snaps = []
    for d in sorted((ARC / "snapshots").glob("*")) if (ARC / "snapshots").exists() else []:
        fs = sorted(d.glob("*.gz")); snaps.append({"month": d.name, "files": [f"snapshots/{d.name}/{f.name}" for f in fs], "bytes": sum(f.stat().st_size for f in fs)})
    cat = {"title": "Nigeria Water Resources Atlas: data archive", "url": "https://shagbaor.com/water-atlas/archive/",
           "started": "2026-10-10", "datasets": out, "snapshots": snaps,
           "citation": "Amool, S. H. (2026). Nigeria Water Resources Atlas: data archive [Data set]. https://shagbaor.com/water-atlas/archive/"}
    old = load(ARC / "catalogue.json")
    if old and {k: v for k, v in old.items() if k != "generated"} == cat: return
    cat["generated"] = NOW.strftime("%Y-%m-%dT%H:%MZ")
    write_if_changed(ARC / "catalogue.json", json.dumps(cat, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    ARC.mkdir(parents=True, exist_ok=True)
    if "--gauges" in sys.argv:
        river_flow(sys.argv[sys.argv.index("--gauges") + 1])
    else:
        flood_logs()
        snapshot()
    catalogue()
