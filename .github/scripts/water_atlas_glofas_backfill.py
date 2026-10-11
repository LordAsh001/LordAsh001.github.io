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

def series(files, cells):
    import xarray as xr
    out = {g: {} for g in cells}
    for f in files:
        ds = xr.open_dataset(f)
        var = next(v for v in ds.data_vars if len(ds[v].dims) >= 3)
        tname = next(c for c in ("valid_time", "time", "forecast_reference_time") if c in ds[var].dims or c in ds.coords)
        latn = "latitude" if "latitude" in ds.coords else "lat"; lonn = "longitude" if "longitude" in ds.coords else "lon"
        da = ds[var]
        for g, (la, lo) in cells.items():
            p = da.sel({latn: la, lonn: lo}, method="nearest")
            for t, v in zip(p[tname].values, p.values.reshape(-1)):
                day = str(t)[:10]                      # date of the time stamp; the day offset is fixed by the overlap check
                if v == v: out[g][day] = round(float(v), 2)
        ds.close()
    return out

def main():
    import cdsapi
    key = os.environ.get("EWDS_API_KEY", "").strip()
    if not key: sys.exit("The EWDS_API_KEY repository secret is not set.")
    client = cdsapi.Client(url=URL, key=key, quiet=True)
    gauges = read_csv(RF / "gauges.csv")
    cells = {g["gauge_id"]: (float(g["model_cell_lat"]), float(g["model_cell_lon"])) for g in gauges}
    tmp = tempfile.mkdtemp()

    # 1. overlap check: which day offset makes the EWDS values line up with the Open-Meteo values already archived,
    #    and how closely they agree. GloFAS stamps each 24-hour mean at the end of the period, Open-Meteo at the day it covers.
    shift_days = int(os.environ.get("BF_SHIFT", "-1"))
    try:
        s = series(fetch_year(client, CHECK, f"{tmp}/check.nc"), cells)
        score = {}
        for k in (-1, 0, 1):
            errs = []
            for g in gauges:
                have = {r["date"]: float(r["discharge_m3s"]) for r in read_csv(ARC / g["file"]) if r["date"].startswith(str(CHECK)) and r["discharge_m3s"]}
                for d, v in s[g["gauge_id"]].items():
                    dd = (datetime.date.fromisoformat(d) + datetime.timedelta(days=k)).isoformat()
                    if dd in have and have[dd] > 1: errs.append(abs(v - have[dd]) / have[dd])
            if errs: score[k] = sum(errs) / len(errs)
        if score:
            shift_days = min(score, key=score.get)
            log("overlap " + ", ".join(f"shift {k:+d} day: mean difference {v:.1%}" for k, v in sorted(score.items())) + f"; using {shift_days:+d}")
            if score[shift_days] > 0.10: log("WARNING: EWDS and Open-Meteo values differ by more than 10% on average; check before trusting the backfill.")
    except Exception as e:
        log(f"overlap check skipped ({e!r}); using shift {shift_days:+d} day")

    # 2. backfill
    got = {g: {} for g in cells}
    for y in range(FIRST, LAST + 1):
        try:
            s = series(fetch_year(client, y, f"{tmp}/{y}.nc"), cells)
            for g in cells:
                got[g].update({(datetime.date.fromisoformat(d) + datetime.timedelta(days=shift_days)).isoformat(): v for d, v in s[g].items()})
            log(f"{y}: {sum(len(v) for v in s.values())} gauge-days")
        except Exception as e:
            log(f"{y} FAILED: {e!r}")

    # 3. merge in front of the existing records (existing days always win)
    for g in gauges:
        p = ARC / g["file"]; rows = read_csv(p); have = {r["date"] for r in rows}
        first = min(have) if have else "9999"
        add = sorted((d, v) for d, v in got[g["gauge_id"]].items() if d < first and d not in have)
        if not add: continue
        lines = ["date,discharge_m3s"] + [f"{d},{v:g}" for d, v in add] + [f"{r['date']},{r['discharge_m3s']}" for r in rows]
        p.write_text("\n".join(lines) + "\n", encoding="utf-8")
        g["first_date"] = add[0][0]; g["days"] = str(len(lines) - 1)
        log(f"{g['gauge_id']}: added {len(add)} days, now from {add[0][0]}")
    with open(RF / "gauges.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(gauges[0].keys()), lineterminator="\n"); w.writeheader(); w.writerows(gauges)

if __name__ == "__main__":
    main()
