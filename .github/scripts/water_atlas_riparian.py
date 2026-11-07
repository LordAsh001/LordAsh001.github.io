#!/usr/bin/env python3
"""Riparian pump-irrigation potential of Nigeria's rivers that flow all year.

Reproducible pipeline for the Nigeria Water Resources Atlas. Every assumption is in
water-atlas/archive/riparian/config.json; the method is explained in
water-atlas/archive/riparian/METHOD.md.

Stages (run in this order, or all at once with `all`):

  reaches  --gdb PATH   Read RiverATLAS v1.0 for Nigeria, keep reaches that flow all year,
                        save them to WORK/reaches.json (cached between runs).
  tiles                 For every 1-degree tile: map the channel, the 100/250/500 m strips on
                        both banks, land cover (ESA WorldCover), slope and height above the
                        river (Copernicus DEM), protected areas and states. Saves hectare
                        counts per reach to WORK/tiles/*.npz.
  combine               Applies the low/central/high assumptions, the water limit and the
                        downstream routing, and writes the atlas files.

Usage:
  python3 water_atlas_riparian.py all --gdb /tmp/RiverATLAS_v10.gdb [--work /tmp/rip] [--bbox W,S,E,N]

Needs: numpy scipy shapely pyogrio rasterio (all from PyPI). Network access to the
Copernicus DEM and ESA WorldCover buckets on AWS (public, no account).
"""
import argparse, json, math, os, re, sys, time, csv, glob
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CFG_PATH = os.path.join(ROOT, 'water-atlas', 'archive', 'riparian', 'config.json')
OUT_DATA = os.path.join(ROOT, 'water-atlas', 'data')
OUT_ARCH = os.path.join(ROOT, 'water-atlas', 'archive', 'riparian')
LEVELS = ['low', 'central', 'high']
DEG_M = 111320.0
RES = 1 / 3600  # Copernicus GLO-30 grid (1 arc-second) between 0 and 50 degrees latitude
PAD = 0.012     # extra margin read around each tile so strips near tile edges see their channel


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def load_cfg():
    with open(CFG_PATH) as f:
        cfg = json.load(f)
    # local copies of the rasters can be used instead of the cloud buckets (same file-name pattern)
    if os.environ.get('RIP_DEM_URL'): cfg['sources']['dem']['url'] = os.environ['RIP_DEM_URL']
    if os.environ.get('RIP_WC_URL'): cfg['sources']['landcover']['url'] = os.environ['RIP_WC_URL']
    return cfg


# ---------------------------------------------------------------- boundaries
def load_states():
    from shapely.geometry import shape
    with open(os.path.join(ROOT, 'water-atlas', 'data', 'atlas.json')) as f:
        A = json.load(f)
    states = []
    for s in A['st']:
        t = s.get('t', 'Polygon')
        states.append((s['n'], shape({'type': t, 'coordinates': s['g']})))
    basins = []
    for b in A.get('bas', []):
        g = b['g']
        basins.append((b.get('name') or ('Basin ' + str(b.get('pf'))), shape({'type': 'MultiPolygon', 'coordinates': g})))
    named = []
    for f_ in A.get('f', []):
        if f_.get('c') == 7 and f_.get('ln'):
            named.append((f_['n'], f_['ln']))
    return states, basins, named


def load_protected(cfg):
    from shapely.geometry import shape
    p = os.path.join(ROOT, cfg['sources']['protected']['file'])
    with open(p) as f:
        G = json.load(f)
    out = []
    for ft in G['features']:
        g = ft.get('geometry')
        if g and g['type'] in ('Polygon', 'MultiPolygon'):
            try:
                out.append(shape(g).buffer(0))
            except Exception:
                pass
    return out


# ---------------------------------------------------------------- stage 1: reaches
def stage_reaches(args, cfg):
    import pyogrio, shapely
    from shapely.ops import unary_union
    from shapely import STRtree
    src = cfg['sources']['riveratlas']
    layer = src['layer'] if args.gdb.rstrip('/').lower().endswith('.gdb') else None
    log('Reading', args.gdb, 'layer', layer or '(default)')
    info = pyogrio.read_info(args.gdb, layer=layer)
    fields = list(info['fields'])
    log('RiverATLAS layer has', len(fields), 'fields and', info.get('features'), 'reaches')
    want = ['HYRIV_ID', 'NEXT_DOWN', 'MAIN_RIV', 'LENGTH_KM', 'UPLAND_SKM', 'ORD_STRA',
            'dis_m3_pyr', 'dis_m3_pmn', 'dis_m3_pmx', 'lka_pc_cse']
    pet = sorted([f for f in fields if re.fullmatch(r'pet_mm_c\d\d', f)])
    pre = sorted([f for f in fields if re.fullmatch(r'pre_mm_c\d\d', f)])
    if len(pet) != 12 or len(pre) != 12:
        pet = sorted([f for f in fields if re.fullmatch(r'pet_mm_[a-z]\d\d', f)])[:12]
        pre = sorted([f for f in fields if re.fullmatch(r'pre_mm_[a-z]\d\d', f)])[:12]
    log('Monthly climate fields used:', pet[:1], '...', pre[:1], '...')
    miss = [w for w in want if w not in fields]
    if miss or len(pet) != 12 or len(pre) != 12:
        log('Field names in the layer:', ', '.join(fields))
        raise SystemExit('Missing RiverATLAS fields: %s (monthly pet %d, pre %d)' % (miss, len(pet), len(pre)))
    bbox = tuple(args.bbox) if args.bbox else tuple(cfg['tiles']['bbox'])
    meta, fids, geom, data = pyogrio.raw.read(args.gdb, layer=layer, columns=want + pet + pre, bbox=bbox)
    cols = {n: data[i] for i, n in enumerate(meta['fields'])}
    geoms = shapely.from_wkb(geom)
    log('Read', len(geoms), 'reaches inside the bounding box')
    states, _, _ = load_states()
    nga = unary_union([g for _, g in states]).buffer(0)
    inside = shapely.intersects(geoms, nga)
    thr = cfg['rivers']['min_dry_flow_m3s']
    pmn = np.asarray(cols['dis_m3_pmn'], float)
    pyr = np.asarray(cols['dis_m3_pyr'], float)
    keep = inside & ((pmn >= thr) | (pyr >= 1.0))
    log('Inside Nigeria:', int(inside.sum()), '· kept for routing:', int(keep.sum()),
        '· flowing all year (dry-month flow >= %.2f m3/s): %d' % (thr, int((inside & (pmn >= thr)).sum())))
    log('Sanity check: largest mean flow %.0f m3/s, largest dry-month flow %.0f m3/s' % (pyr[inside].max(), pmn[inside].max()))
    log('Sanity check: median monthly PET %.0f mm, median monthly rain %.0f mm' % (
        np.median(np.stack([np.asarray(cols[c], float)[keep] for c in pet])),
        np.median(np.stack([np.asarray(cols[c], float)[keep] for c in pre]))))
    R = []
    lake_max = cfg['rivers']['exclude_lake_pct']
    for i in np.nonzero(keep)[0]:
        g = shapely.set_precision(geoms[i], 1e-5)
        R.append({
            'id': int(cols['HYRIV_ID'][i]), 'next': int(cols['NEXT_DOWN'][i]), 'main': int(cols['MAIN_RIV'][i]),
            'km': round(float(cols['LENGTH_KM'][i]), 3), 'up': round(float(cols['UPLAND_SKM'][i]), 1),
            'ord': int(cols['ORD_STRA'][i]),
            'qy': round(float(pyr[i]), 4), 'qmin': round(float(pmn[i]), 4), 'qmax': round(float(cols['dis_m3_pmx'][i]), 4),
            'lake': float(cols['lka_pc_cse'][i]),
            'pet': [float(cols[c][i]) for c in pet], 'pre': [float(cols[c][i]) for c in pre],
            'strip': bool(pmn[i] >= thr and float(cols['lka_pc_cse'][i]) < lake_max),
            'wkt': shapely.to_wkt(g, rounding_precision=5),
        })
    os.makedirs(args.work, exist_ok=True)
    with open(os.path.join(args.work, 'reaches.json'), 'w') as f:
        json.dump({'bbox': bbox, 'fields': {'pet': pet, 'pre': pre}, 'reaches': R}, f)
    log('Saved', len(R), 'reaches to', os.path.join(args.work, 'reaches.json'))


# ---------------------------------------------------------------- stage 2: tiles
def tile_name(fmt, lat, lon):
    return fmt.format(NS='N' if lat >= 0 else 'S', lat=abs(lat), EW='E' if lon >= 0 else 'W', lon=abs(lon))


def open_many(urls):
    import rasterio
    out = []
    for u in urls:
        try:
            out.append(rasterio.open(u))
        except Exception:
            pass
    return out


def read_mosaic(urls, bounds, shape, nearest=True):
    """Read a padded window from one or more cloud-optimised GeoTIFFs onto the DEM grid."""
    import rasterio
    from rasterio.merge import merge
    from rasterio.enums import Resampling
    ds = open_many(urls)
    if not ds:
        return None
    try:
        arr, tr = merge(ds, bounds=bounds, res=(RES, RES), resampling=Resampling.nearest if nearest else Resampling.bilinear,
                        nodata=0, indexes=[1])
    finally:
        for d in ds:
            d.close()
    a = arr[0]
    if a.shape != shape:  # rounding of the window: crop or pad to the expected grid
        b = np.zeros(shape, a.dtype)
        h, w = min(shape[0], a.shape[0]), min(shape[1], a.shape[1])
        b[:h, :w] = a[:h, :w]
        a = b
    return a


def process_tile(job):
    lat, lon, cfg, reaches, prot_wkb, states_wkb, work = job[:7]
    want_arrays = len(job) > 7 and job[7]  # used by the validation scripts, which need the grids themselves
    out_path = os.path.join(work, 'tiles', 't_%+03d_%+04d.npz' % (lat, lon))
    if os.path.exists(out_path) and not want_arrays:
        return out_path, 'cached'
    import shapely
    from rasterio.transform import from_origin
    from rasterio.features import rasterize
    from scipy import ndimage as ndi
    t0 = time.time()
    w, s, e, n = lon - PAD, lat - PAD, lon + 1 + PAD, lat + 1 + PAD
    W = int(round((e - w) / RES)); H = int(round((n - s) / RES))
    tr = from_origin(w, n, RES, RES)
    # elevation (Copernicus GLO-30) from this tile and its neighbours
    dem_urls = [tile_name(cfg['sources']['dem']['url'], la, lo) for la in (lat - 1, lat, lat + 1) for lo in (lon - 1, lon, lon + 1)]
    dem = read_mosaic(dem_urls, (w, s, e, n), (H, W), nearest=False)
    if dem is None:
        return out_path, 'no elevation tile'
    dem = dem.astype(np.float32)
    # land cover (ESA WorldCover, 3-degree tiles)
    wc_urls = sorted({tile_name(cfg['sources']['landcover']['url'], int(math.floor(la / 3) * 3), int(math.floor(lo / 3) * 3))
                      for la in (s, n) for lo in (w, e)})
    wc = read_mosaic(wc_urls, (w, s, e, n), (H, W), nearest=True)
    if wc is None:
        return out_path, 'no land-cover tile'
    wc = wc.astype(np.uint8)
    # river lines, burned with the reach index (1-based)
    shapes = [(shapely.from_wkt(r['wkt']), k + 1) for k, r in enumerate(reaches) if r['strip']]
    if not shapes:
        return out_path, 'no rivers'
    lab = rasterize(shapes, out_shape=(H, W), transform=tr, all_touched=True, fill=0, dtype='int32')
    line = lab > 0
    latc = lat + 0.5
    dy = RES * DEG_M; dx = RES * DEG_M * math.cos(math.radians(latc))
    d_line, (iy, ix) = ndi.distance_transform_edt(~line, sampling=(dy, dx), return_indices=True)
    near = lab[iy, ix]; del iy, ix
    water = wc == 80
    snapped = water & (d_line <= cfg['rivers']['snap_to_water_m'])
    nl = np.bincount(lab[line], minlength=len(reaches) + 1)
    nw = np.bincount(near[snapped], minlength=len(reaches) + 1)
    visible = nw >= cfg['rivers']['visible_ratio'] * np.maximum(nl, 1)
    visible[0] = False
    chan = snapped | (line & ~visible[lab])
    chan_id = np.where(snapped, near, lab).astype(np.int32)
    del near, d_line
    d, (cy, cx) = ndi.distance_transform_edt(~chan, sampling=(dy, dx), return_indices=True)
    rid = chan_id[cy, cx]
    zmin = ndi.minimum_filter(dem, size=5)
    lift = dem - zmin[cy, cx]
    del cy, cx, zmin
    gy, gx = np.gradient(dem, dy, dx)
    slope = np.hypot(gx, gy) * 100.0
    del gy, gx
    smax = max(cfg['strips_m'])
    # only count pixels in the core tile (the padding belongs to the neighbouring tile)
    p = int(round(PAD / RES))
    core = np.zeros((H, W), bool); core[p:H - p, p:W - p] = True
    strip = core & (d > 0) & (d <= smax) & ~chan & ~water & (rid > 0)
    # protected areas and states
    pr = [(shapely.from_wkb(g), 1) for g in prot_wkb]
    prot = rasterize(pr, out_shape=(H, W), transform=tr, fill=0, dtype='uint8') if pr else np.zeros((H, W), np.uint8)
    st = rasterize([(shapely.from_wkb(g), i + 1) for i, g in states_wkb], out_shape=(H, W), transform=tr, fill=0, dtype='uint8')
    strip &= st > 0  # Nigeria only
    # classes
    groups = list(cfg['landcover_groups'].keys())
    G = len(groups) + 1  # last group = protected area
    lut = np.full(256, groups.index('other'), np.int64)
    for gi, g in enumerate(groups):
        for c in cfg['landcover_groups'][g]:
            lut[c] = gi
    lc = lut[wc]
    lc[prot > 0] = G - 1
    dcls = np.digitize(d, cfg['strips_m'], right=True)          # 0: <=100, 1: <=250, 2: <=500
    scls = np.digitize(slope, cfg['slope_breaks_pct'], right=True)
    lcls = np.digitize(np.maximum(lift, 0), cfg['lift_breaks_m'], right=True)
    NS = len(cfg['slope_breaks_pct']) + 1; NL = len(cfg['lift_breaks_m']) + 1; ND = len(cfg['strips_m'])
    if want_arrays:
        return {'transform': tr, 'pad': p, 'shape': (H, W), 'dist': d.astype(np.float32), 'rid': rid, 'chan': chan,
                'water': water, 'wc': wc, 'lc': lc, 'groups': groups + ['protected'], 'slope': slope.astype(np.float32),
                'lift': lift.astype(np.float32), 'state': st, 'core': core, 'strip': strip,
                'reach_ids': np.array([0] + [r['i'] for r in reaches], np.int64)}
    rows = np.nonzero(strip)
    lat_row = n - (rows[0] + 0.5) * RES
    area_ha = (dy * RES * DEG_M * np.cos(np.radians(lat_row))) / 1e4
    reach_global = np.array([0] + [r['i'] for r in reaches], np.int64)[rid[rows]]
    key = ((((reach_global * 64 + st[rows].astype(np.int64)) * ND + dcls[rows]) * G + lc[rows]) * NS + scls[rows]) * NL + lcls[rows]
    uk, inv = np.unique(key, return_inverse=True)
    ha = np.bincount(inv, weights=area_ha)
    vis_ids = np.array([reaches[k - 1]['i'] for k in np.nonzero(visible)[0]], np.int64)
    np.savez_compressed(out_path, key=uk, ha=ha, visible=vis_ids, dims=np.array([64, ND, G, NS, NL]))
    return out_path, '%d strip pixels, %.0f ha, %.0fs' % (len(rows[0]), ha.sum(), time.time() - t0)


def stage_tiles(args, cfg):
    import shapely
    from shapely import STRtree
    with open(os.path.join(args.work, 'reaches.json')) as f:
        RJ = json.load(f)
    R = RJ['reaches']
    for i, r in enumerate(R):
        r['i'] = i + 1
    geoms = [shapely.from_wkt(r['wkt']) for r in R]
    tree = STRtree(geoms)
    states, _, _ = load_states()
    st_wkb = [(i, shapely.to_wkb(g)) for i, (_, g) in enumerate(states)]
    prot = load_protected(cfg)
    ptree = STRtree(prot) if prot else None
    bbox = args.bbox or cfg['tiles']['bbox']
    os.makedirs(os.path.join(args.work, 'tiles'), exist_ok=True)
    jobs = []
    for lat in range(int(math.floor(bbox[1])), int(math.ceil(bbox[3]))):
        for lon in range(int(math.floor(bbox[0])), int(math.ceil(bbox[2]))):
            box = shapely.box(lon - PAD - 0.01, lat - PAD - 0.01, lon + 1 + PAD + 0.01, lat + 1 + PAD + 0.01)
            idx = tree.query(box, predicate='intersects')
            sub = [R[i] for i in idx if R[i]['strip']]
            if not sub:
                continue
            pidx = ptree.query(box, predicate='intersects') if ptree is not None else []
            sw = [(i, w_) for i, w_ in st_wkb if shapely.from_wkb(w_).intersects(box)]
            jobs.append((lat, lon, cfg, sub, [shapely.to_wkb(prot[j]) for j in pidx], sw, args.work))
    log('Tiles to process:', len(jobs))
    done = 0; failed = []
    with ProcessPoolExecutor(max_workers=cfg['tiles']['workers']) as ex:
        futs = {ex.submit(process_tile, j): (j[0], j[1]) for j in jobs}
        for fu in as_completed(futs):
            la, lo = futs[fu]; done += 1
            try:
                pth, msg = fu.result()
                log('[%d/%d] tile %+d,%+d: %s' % (done, len(jobs), la, lo, msg))
            except Exception as ex_:
                failed.append((la, lo)); log('[%d/%d] tile %+d,%+d FAILED: %r' % (done, len(jobs), la, lo, ex_))
    if failed:
        log('Failed tiles (rerun to retry):', failed)
        if len(failed) > max(2, len(jobs) // 20):
            raise SystemExit('Too many tiles failed')


# ---------------------------------------------------------------- stage 3: combine
def eff_rain(p):
    return 0.8 * p - 25 if p > 75 else max(0.0, 0.6 * p - 10)


DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def stage_combine(args, cfg):
    import shapely
    from shapely import STRtree
    with open(os.path.join(args.work, 'reaches.json')) as f:
        RJ = json.load(f)
    R = RJ['reaches']
    N = len(R)
    pos = {r['id']: i for i, r in enumerate(R)}
    states, basins, named = load_states()
    groups = list(cfg['landcover_groups'].keys()) + ['protected']
    ND = len(cfg['strips_m']); G = len(groups); NS = len(cfg['slope_breaks_pct']) + 1; NL = len(cfg['lift_breaks_m']) + 1
    NST = len(states)
    # hectares by reach x state x strip-band x land cover x slope class x lift class
    from collections import defaultdict
    cube = defaultdict(lambda: np.zeros((ND, G, NS, NL)))
    visible = set(); tiles = 0
    for fp in sorted(glob.glob(os.path.join(args.work, 'tiles', '*.npz'))):
        z = np.load(fp); tiles += 1
        k = z['key']; ha = z['ha']
        l_ = k % NL; k //= NL; s_ = k % NS; k //= NS; g_ = k % G; k //= G; d_ = k % ND; k //= ND; st_ = k % 64; ri = k // 64
        for a in zip(ri, st_, d_, g_, s_, l_, ha):
            cube[(int(a[0]) - 1, int(a[1]) - 1)][a[2], a[3], a[4], a[5]] += a[6]
        visible.update(int(v) - 1 for v in z['visible'])
    log('Combined', tiles, 'tiles;', len(cube), 'reach-state pieces with strip land')
    scen = [(di, lv) for di in range(ND) for lv in LEVELS]
    NSC = len(scen)
    land = np.zeros((N, NST, NSC))
    for (ri, si), c in cube.items():
        cum = np.cumsum(c, axis=0)  # band 0 = <=100 m, 1 = <=250 m, 2 = <=500 m
        for j, (di, lv) in enumerate(scen):
            L = cfg['levels'][lv]
            gi = [groups.index(x) for x in L['landcover']]
            sm = sum(1 for b in cfg['slope_breaks_pct'] if b <= L['max_slope_pct'])
            lm = sum(1 for b in cfg['lift_breaks_m'] if b <= L['max_lift_m'])
            land[ri, si, j] = cum[di][np.ix_(gi, range(sm), range(lm))].sum()
    land_r = land.sum(axis=1)
    # crop water need at peak (gross, litres per second per hectare) by reach and level
    qneed = np.zeros((N, len(LEVELS)))
    for i, r in enumerate(R):
        for li, lv in enumerate(LEVELS):
            L = cfg['levels'][lv]
            mm_day = max((L['kc'] * r['pet'][m] - eff_rain(r['pre'][m])) / DAYS[m] for m in range(12))
            qneed[i, li] = max(mm_day, 0.5) * 10000 / 86400 / L['efficiency']  # mm/day -> L/s/ha
    # route downstream: smallest catchment first, upstream withdrawals reduce flow below
    order = sorted(range(N), key=lambda i: R[i]['up'])
    pot = np.zeros((N, NSC)); wlim = np.zeros((N, NSC)); binding = np.zeros((N, NSC), bool)
    for j, (di, lv) in enumerate(scen):
        li = LEVELS.index(lv); res = cfg['levels'][lv]['reserve_frac_of_dry_flow']
        taken = np.zeros(N)
        for i in order:
            r = R[i]
            avail = max(0.0, r['qmin'] * (1 - res) - taken[i])
            wl = avail * 1000.0 / qneed[i, li]
            p = min(land_r[i, j], wl)
            pot[i, j] = p; wlim[i, j] = wl; binding[i, j] = wl < land_r[i, j]
            nx = pos.get(r['next'])
            if nx is not None:
                taken[nx] += taken[i] + p * qneed[i, li] / 1000.0
    share = np.divide(land, np.maximum(land_r[:, None, :], 1e-9))
    pot_st = (share * pot[:, None, :]).sum(axis=0)        # by state
    # reach -> basin and named river
    geoms = [shapely.from_wkt(r['wkt']) for r in R]
    mids = [g.interpolate(0.5, normalized=True) for g in geoms]
    btree = STRtree([g for _, g in basins]) if basins else None
    rb = np.full(N, -1)
    if btree is not None:
        for i, m in enumerate(mids):
            h = btree.query(m, predicate='intersects')
            if len(h): rb[i] = int(h[0])
    rn = np.full(N, -1)
    if named:
        nl = [shapely.LineString(c) if isinstance(c[0][0], (int, float)) else shapely.MultiLineString(c) for _, c in named]
        bufs = [g.buffer(0.015) for g in nl]
        ntree = STRtree(bufs)
        for i, g in enumerate(geoms):
            if not R[i]['strip'] or g.length == 0: continue
            best, bf = -1, 0.6
            for h in ntree.query(g, predicate='intersects'):
                fr = g.intersection(bufs[h]).length / g.length
                if fr > bf: best, bf = int(h), fr
            rn[i] = best
    # ---- outputs
    sk = ['%dm_%s' % (cfg['strips_m'][di], lv) for di, lv in scen]
    strip_ids = [i for i in range(N) if R[i]['strip']]
    km = sum(R[i]['km'] for i in strip_ids)
    lc_c = {}
    jc = sk.index('250m_central') if '250m_central' in sk else 0
    tot = np.zeros(G)
    for (ri, si), c in cube.items():
        tot += np.cumsum(c, axis=0)[1].sum(axis=(1, 2)) if ND > 1 else c[0].sum(axis=(1, 2))
    lc_c = {g: round(float(tot[k])) for k, g in enumerate(groups)}
    def r0(a): return [int(round(x)) for x in a]
    out = {
        'meta': {'version': cfg['version'], 'run': time.strftime('%Y-%m-%d'), 'tiles': tiles,
                 'sources': {k: {kk: v[kk] for kk in ('name', 'cite', 'licence') if kk in v} for k, v in cfg['sources'].items()},
                 'config': {k: v for k, v in cfg.items() if not k.startswith('_') and k not in ('sources', 'tiles')}},
        'scen': sk,
        'nat': {'km': round(km), 'reaches': len(strip_ids), 'visible_reaches': len(visible),
                'land': r0(land_r.sum(axis=0)), 'pot': r0(pot.sum(axis=0)),
                'water_bound_reaches': [int((binding[:, j] & (land_r[:, j] > 0)).sum()) for j in range(NSC)],
                'qneed_median': [round(float(np.median(qneed[strip_ids, li])), 2) for li in range(len(LEVELS))],
                'strip_landcover_250m': lc_c},
        'states': sorted([{'n': states[s][0], 'land': r0(land[:, s, :].sum(axis=0)), 'pot': r0(pot_st[s])} for s in range(NST)],
                         key=lambda x: -x['pot'][jc]),
        'basins': sorted([{'n': basins[b][0], 'km': round(sum(R[i]['km'] for i in strip_ids if rb[i] == b)),
                           'pot': r0(pot[rb == b].sum(axis=0))} for b in range(len(basins))], key=lambda x: -x['pot'][jc]),
        'rivers': sorted([{'n': named[k][0], 'km': round(sum(R[i]['km'] for i in strip_ids if rn[i] == k)),
                           'pot': r0(pot[rn == k].sum(axis=0)), 'land': r0(land_r[rn == k].sum(axis=0))}
                          for k in range(len(named)) if (rn == k).any()], key=lambda x: -x['pot'][jc]),
    }
    os.makedirs(OUT_DATA, exist_ok=True); os.makedirs(OUT_ARCH, exist_ok=True)
    with open(os.path.join(OUT_DATA, 'riparian.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    # map layer: simplified reach lines with potential in every scenario
    feats = []
    for i in strip_ids:
        if pot[i].max() < 1: continue
        g = geoms[i].simplify(0.002)
        cs = [[round(x, 3), round(y, 3)] for x, y in (g.coords if g.geom_type == 'LineString' else g.geoms[0].coords)]
        feats.append([cs, r0(pot[i]), round(R[i]['qmin'], 2), round(R[i]['km'], 1), int(rn[i]) if rn[i] >= 0 else -1])
    with open(os.path.join(OUT_DATA, 'riparian_reaches.json'), 'w') as f:
        json.dump({'scen': sk, 'names': [n for n, _ in named], 'r': feats}, f, separators=(',', ':'))
    # archive tables
    with open(os.path.join(OUT_ARCH, 'reaches.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['hyriv_id', 'next_down', 'length_km', 'upland_km2', 'strahler_order', 'mean_flow_m3s', 'dry_month_flow_m3s',
                    'flows_all_year', 'channel_seen_in_worldcover', 'named_river', 'basin', 'peak_need_central_l_s_ha']
                   + ['land_ha_' + s for s in sk] + ['water_limit_ha_' + s for s in sk] + ['potential_ha_' + s for s in sk])
        for i, r in enumerate(R):
            w.writerow([r['id'], r['next'], r['km'], r['up'], r['ord'], r['qy'], r['qmin'], int(r['strip']), int(i in visible),
                        named[rn[i]][0] if rn[i] >= 0 else '', basins[rb[i]][0] if rb[i] >= 0 else '', round(qneed[i, 1], 3)]
                       + r0(land_r[i]) + [int(min(x, 1e9)) for x in wlim[i]] + r0(pot[i]))
    with open(os.path.join(OUT_ARCH, 'states.csv'), 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['state'] + ['land_ha_' + s for s in sk] + ['potential_ha_' + s for s in sk])
        for s in range(NST):
            w.writerow([states[s][0]] + r0(land[:, s, :].sum(axis=0)) + r0(pot_st[s]))
    log('National potential (ha):', dict(zip(sk, out['nat']['pot'])))
    log('National land within reach (ha):', dict(zip(sk, out['nat']['land'])))
    log('Strip land cover, 250 m (ha):', lc_c)
    log('Map layer:', len(feats), 'reaches,', os.path.getsize(os.path.join(OUT_DATA, 'riparian_reaches.json')) // 1024, 'KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('stage', choices=['reaches', 'tiles', 'combine', 'all'])
    ap.add_argument('--gdb'); ap.add_argument('--work', default='/tmp/rip')
    ap.add_argument('--bbox', type=lambda s: [float(x) for x in s.split(',')] if s else None, default=None)
    args = ap.parse_args()
    cfg = load_cfg()
    if args.stage in ('reaches', 'all') and not os.path.exists(os.path.join(args.work, 'reaches.json')):
        stage_reaches(args, cfg)
    if args.stage in ('tiles', 'all'):
        stage_tiles(args, cfg)
    if args.stage in ('combine', 'all'):
        stage_combine(args, cfg)


if __name__ == '__main__':
    main()
