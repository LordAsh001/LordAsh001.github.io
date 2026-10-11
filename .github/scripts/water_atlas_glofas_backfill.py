"""Backfill the Water Atlas river-flow archive with GloFAS v4 years that Open-Meteo does not serve.

Open-Meteo's flood API returns GloFAS v4 river discharge from 1997 onwards. The full GloFAS v4 consolidated
reanalysis starts in 1979 and is published by the Copernicus Emergency Management Service in the
CEMS Early Warning Data Store (EWDS). This script downloads one year at a time for a box around Nigeria,
reads the daily value at each gauge's model cell (the cell already used for 1997 onwards, listed in
water-atlas/archive/river_flow/gauges.csv) and adds the earlier years to the front of each gauge's CSV.

Needs:
  - the repository secret EWDS_API_KEY (your personal access token from your EWDS profile page), and
  - the CEMS-FLOODS datasets licence accepted once on the dataset's Download tab while signed in:
    https://ewds.climate.copernicus.eu/datasets/cems-glofas-historical?tab=download

Run from the Actions tab: "Backfill water atlas river flow (GloFAS)". It also checks one overlap year (1997)
against the Open-Meteo values already in the archive and prints how closely they agree.
"""
import os, sys, csv, glob, json, pathlib, datetime, tempfile, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARC = ROOT / "water-atlas" / "archive"
RF = ARC / "river_flow"
URL = "https://ewds.climate.copernicus.eu/api"
AREA = [13.3, 3.2, 5.3, 13.0]          # N, W, S, E: covers every gauge cell
FIRST = int(os.environ.get("BF_START", "1979"))
LAST = int(os.environ.get("BF_END", "1996"))
CHECK = 1997

def log(*a): print(*a, flush=True)

def read_csv(p):
    with open(p, newline="", encoding="utf-8") as f: return list(csv.DictReader(f))

def fetch_year(client, year, out):
    req = {"system_version": ["version_4_0"], "hydrological_model": ["lisflood"], "product_type": ["consolidated"],
           "timespan": ["time_mean"], "variable": ["average_river_discharge_in_the_last_24_hours"],
           "year": [str(year)], "month": [f"{m:02d}" for m in range(1, 13)], "day": [f"{d:02d}" for d in range(1, 32)],
           "data_format": "netcdf", "download_format": "unarchived", "area": AREA}
    client.retrieve("cems-glofas-historical", req).download(out)
    if zipfile.is_zipfile(out):                     # several files come back zipped
        d = pathlib.Path(out).with_suffix(""); d.mkdir(exist_ok=True)
        with zipfile.ZipFile(out) as z: z.extractall(d)
        return sorted(glob.glob(str(d / "*.nc")))
    return [out]

def open_all(files):
    import xarray as xr
    out = []
    for f in files:
        ds = xr.open_dataset(f)
        var = next(v for v in ds.data_vars if len(ds[v].dims) >= 3)
        tname = next(c for c in ("valid_time", "time", "forecast_reference_time") if c in ds[var].dims)
        latn = "latitude" if "latitude" in ds[var].dims else "lat"; lonn = "longitude" if "longitude" in ds[var].dims else "lon"
        out.append((ds, ds[var], tname, latn, lonn))
    return out

def describe(opened):
    for ds, da, t, la, lo in opened:
        lat, lon = da[la].values, da[lo].values
        log(f"file: variable {da.name} ({da.attrs.get('units', '?')}), dims {dict(da.sizes)}, "
            f"lat {lat[0]:.4f}..{lat[-1]:.4f} step {lat[1]-lat[0]:+.4f}, lon {lon[0]:.4f}..{lon[-1]:.4f} step {lon[1]-lon[0]:+.4f}, "
            f"time {str(da[t].values[0])[:16]}..{str(da[t].values[-1])[:16]}")

def cell_series(opened, la, lo, di=0, dj=0):
    """Daily values at the grid cell nearest (la, lo), moved di rows and dj columns."""
    out = {}
    for ds, da, t, latn, lonn in opened:
        lat, lon = da[latn].values, da[lonn].values
        i = int(abs(lat - la).argmin()) + di; j = int(abs(lon - lo).argmin()) + dj
        if not (0 <= i < len(lat) and 0 <= j < len(lon)): continue
        p = da.isel({latn: i, lonn: j})
        for tt, v in zip(p[t].values, p.values.reshape(-1)):
            if v == v: out[str(tt)[:10]] = round(float(v), 2)
    return out

def shifted(sr, k):
    return {(datetime.date.fromisoformat(d) + datetime.timedelta(days=k)).isoformat(): v for d, v in sr.items()}

def diff(sr, have):
    # relative difference; flows under 1 m3/s (dry-season small rivers) are compared on an absolute 1 m3/s scale
    e = [abs(v - have[d]) / max(have[d], 1.0) for d, v in sr.items() if d in have]
    return (sum(e) / len(e), len(e)) if e else (None, 0)

def main():
    import cdsapi
    key = os.environ.get("EWDS_API_KEY", "").strip()
    if not key: sys.exit("The EWDS_API_KEY repository secret is not set.")
    client = cdsapi.Client(url=URL, key=key, quiet=True)
    gauges = read_csv(RF / "gauges.csv")
    cells = {g["gauge_id"]: (float(g["model_cell_lat"]), float(g["model_cell_lon"])) for g in gauges}
    tmp = tempfile.mkdtemp()
    tol = float(os.environ.get("BF_TOL", "0.15"))

    # 1. Overlap check on 1997, gauge by gauge: find the grid cell (within two cells of the one Open-Meteo uses)
    #    and the day offset at which the EWDS series matches the Open-Meteo values already archived.
    #    Gauges that do not match within the tolerance are left alone.
    opened = open_all(fetch_year(client, CHECK, f"{tmp}/check.nc")); describe(opened)
    choice = {}
    for g in gauges:
        gid = g["gauge_id"]; la, lo = cells[gid]
        have = {r["date"]: float(r["discharge_m3s"]) for r in read_csv(ARC / g["file"]) if r["date"].startswith(str(CHECK)) and r["discharge_m3s"]}
        best = None
        for di in range(-2, 3):
            for dj in range(-2, 3):
                sr = cell_series(opened, la, lo, di, dj)
                for k in (-1, 0, 1):
                    d, n = diff(shifted(sr, k), have)
                    if d is not None and n > 300 and (best is None or d < best[0]): best = (d, di, dj, k)
        base = diff(shifted(cell_series(opened, la, lo), -1), have)[0]
        if best and best[0] <= tol:
            choice[gid] = best[1:]
            log(f"{gid}: match {best[0]:.1%} at cell offset ({best[1]:+d},{best[2]:+d}), day shift {best[3]:+d} (same cell, shift -1: {base if base is None else f'{base:.1%}'})")
        else:
            log(f"{gid}: NO MATCH (best {best[0]:.1%} at {best[1:]}" if best else f"{gid}: NO DATA", "- skipped")
    for o in opened: o[0].close()
    if os.environ.get("BF_CHECK_ONLY", "") in ("1", "true"):
        log("Check only: nothing added."); return
    if not choice: sys.exit("No gauge matched the archived values; nothing added.")

    # 2. Backfill the matched gauges
    got = {g: {} for g in choice}
    for y in range(FIRST, LAST + 1):
        try:
            opened = open_all(fetch_year(client, y, f"{tmp}/{y}.nc"))
            for gid, (di, dj, k) in choice.items():
                got[gid].update(shifted(cell_series(opened, *cells[gid], di, dj), k))
            for o in opened: o[0].close()
            log(f"{y}: done")
        except Exception as e:
            log(f"{y} FAILED: {e!r}")

    # 3. Merge in front of the existing records (existing days always win)
    for g in gauges:
        if g["gauge_id"] not in got: continue
        p = ARC / g["file"]; rows = read_csv(p); have = {r["date"] for r in rows}
        first = min(have) if have else "9999"
        add = sorted((d, v) for d, v in got[g["gauge_id"]].items() if d < first and d not in have and d >= f"{FIRST}-01-01")
        if not add: continue
        lines = ["date,discharge_m3s"] + [f"{d},{v:g}" for d, v in add] + [f"{r['date']},{r['discharge_m3s']}" for r in rows]
        p.write_text("\n".join(lines) + "\n", encoding="utf-8")
        g["first_date"] = add[0][0]; g["days"] = str(len(lines) - 1)
        log(f"{g['gauge_id']}: added {len(add)} days, now from {add[0][0]}")
    with open(RF / "gauges.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(gauges[0].keys()), lineterminator="\n"); w.writeheader(); w.writerows(gauges)

if __name__ == "__main__":
    main()
