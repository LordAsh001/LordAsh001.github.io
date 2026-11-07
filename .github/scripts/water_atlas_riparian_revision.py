#!/usr/bin/env python3
"""Robustness analyses for the riparian pump-irrigation potential (response to peer review).

Uses the river reaches and per-tile strip counts saved by water_atlas_riparian.py (WORK/reaches.json,
WORK/tiles/*.npz) and the GloFAS river-flow archive in water-atlas/archive/river_flow. Writes
water-atlas/archive/riparian/revision/ (JSON summary, CSV tables, figures).

  1  Low flows: RiverATLAS (WaterGAP 1971-2000) against GloFAS reanalysis 1979-2000 and 1991-2020
  2  Sensitivity: perennial threshold, small streams, environmental reserve method, allocation rule,
     seasonal-volume water limit, GloFAS bias correction
  3  Uncertainty: Morris screening and a Monte Carlo ensemble (national, basin and state intervals)
  4  Channel position: RiverATLAS lines against OpenStreetMap rivers in the pilot tiles
  5  Soils: share of the potential on very sandy soils (SoilGrids 2.0 sand 0-5 cm), random sample of reaches
  6  Figures: where water rather than land is the limit; potential per km of river

Usage: python3 water_atlas_riparian_revision.py --work /tmp/rip --out DIR [--draws 1000] [--skip osm,soil]
"""
import argparse, csv, glob, json, math, os, sys, time, urllib.request, urllib.parse
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import water_atlas_riparian as WR  # noqa: E402

DAYS = np.array(WR.DAYS)
SEED = 20261107


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def peff(p):
    p = np.asarray(p, float)
    return np.where(p > 75, 0.8 * p - 25, np.maximum(0.0, 0.6 * p - 10))


# ------------------------------------------------------------------ data
def load(work, cfg):
    import shapely
    from shapely import STRtree
    R = json.load(open(os.path.join(work, 'reaches.json')))['reaches']
    N = len(R)
    groups = list(cfg['landcover_groups'].keys()) + ['protected']
    ND = len(cfg['strips_m']); G = len(groups); NS = len(cfg['slope_breaks_pct']) + 1; NL = len(cfg['lift_breaks_m']) + 1
    states, basins, _ = WR.load_states()
    NST = len(states)
    cube = np.zeros((N, ND, G, NS, NL), np.float32)
    stl = np.zeros((N, NST), np.float32)  # all strip land within 250 m by state, for state shares
    vis = set(); nt = 0
    for fp in sorted(glob.glob(os.path.join(work, 'tiles', '*.npz'))):
        z = np.load(fp); nt += 1
        k = z['key'].copy(); ha = z['ha']
        l_ = k % NL; k //= NL; s_ = k % NS; k //= NS; g_ = k % G; k //= G; d_ = k % ND; k //= ND; st_ = k % 64; ri = k // 64 - 1
        np.add.at(cube, (ri, d_, g_, s_, l_), ha)
        m = d_ <= 1
        np.add.at(stl, (ri[m], st_[m] - 1), ha[m])
        vis.update(int(v) - 1 for v in z['visible'])
    log('Loaded %d reaches and %d tiles' % (N, nt))
    geoms = [shapely.from_wkt(r['wkt']) for r in R]
    mids = [g.interpolate(0.5, normalized=True) for g in geoms]
    bt = STRtree([g for _, g in basins])
    rb = np.full(N, -1)
    for i, m in enumerate(mids):
        h = bt.query(m, predicate='intersects')
        if len(h): rb[i] = int(h[0])
    share = stl / np.maximum(stl.sum(axis=1, keepdims=True), 1e-9)
    return dict(R=R, N=N, cube=np.cumsum(cube, axis=1), groups=groups, states=states, basins=basins,
                rb=rb, share=share, vis=vis, geoms=geoms, mids=mids)


def land_for(D, cfg, band, lc, smax, lmax):
    gi = [D['groups'].index(x) for x in lc]
    sm = sum(1 for b in cfg['slope_breaks_pct'] if b <= smax)
    lm = sum(1 for b in cfg['lift_breaks_m'] if b <= lmax)
    return D['cube'][:, band][:, gi][:, :, :sm, :lm].sum(axis=(1, 2, 3))


def need(D, kc, eff, months=None):
    """Gross need, L/s/ha, per reach (N,) for scalars or per reach x draw (N,S) for arrays."""
    R = D['R']
    pet = np.array([r['pet'] for r in R], float); pre = np.array([r['pre'] for r in R], float)
    pe = peff(pre)
    kc = np.atleast_1d(np.asarray(kc, float)); eff = np.atleast_1d(np.asarray(eff, float))
    ms = range(12) if months is None else months
    if months is None:  # peak month
        out = np.full((len(R), len(kc)), -np.inf)
        for m in ms:
            np.maximum(out, (pet[:, m:m + 1] * kc[None, :] - pe[:, m:m + 1]) / DAYS[m], out=out)
    else:  # mean over the season (volume)
        out = np.zeros((len(R), len(kc)))
        tot = sum(DAYS[m] for m in ms)
        for m in ms:
            out += np.maximum(pet[:, m:m + 1] * kc[None, :] - pe[:, m:m + 1], 0)
        out /= tot
    out = np.maximum(out, 0.5) * 10000 / 86400 / eff[None, :]
    return out if out.shape[1] > 1 else out[:, 0]


def route(D, land, qmin, reserve, q, mode='upstream'):
    """Potential per reach. land, q: (N,) or (N,S); qmin: (N,) or (N,S); reserve: scalar or (S,) or (N,) / (N,S)."""
    R = D['R']; N = D['N']
    pos = {r['id']: i for i, r in enumerate(R)}
    land = np.asarray(land, float); q = np.asarray(q, float)
    S = max(x.shape[1] if np.ndim(x) == 2 else 1 for x in (land, q, np.asarray(qmin), np.asarray(reserve)))
    def col(x):
        x = np.asarray(x, float)
        if x.ndim == 0: return np.full((N, S), float(x))
        if x.ndim == 1 and x.shape[0] == N: return np.repeat(x[:, None], S, axis=1)
        if x.ndim == 1: return np.repeat(x[None, :], N, axis=0)
        return x
    land, q, qm, res = col(land), col(q), col(qmin), col(reserve)
    avail0 = np.maximum(qm * (1 - res), 0)
    pot = np.zeros((N, S))
    if mode == 'none':  # no upstream deduction: upper bound, double counts shared water
        return np.minimum(land, avail0 * 1000 / q)
    if mode == 'local':  # each reach uses only the flow generated in its own catchment
        inc = qm.copy()
        for i, r in enumerate(R):
            nx = pos.get(r['next'])
            if nx is not None: inc[nx] -= qm[i]
        inc = np.maximum(inc, 0) * (1 - res)
        return np.minimum(land, inc * 1000 / q)
    taken = np.zeros((N, S))
    for i in sorted(range(N), key=lambda i: R[i]['up']):
        a = np.maximum(avail0[i] - taken[i], 0)
        p = np.minimum(land[i], a * 1000 / q[i])
        pot[i] = p
        nx = pos.get(R[i]['next'])
        if nx is not None:
            taken[nx] += taken[i] + p * q[i] / 1000
    return pot


# ------------------------------------------------------------------ 1 low flows
def flows(D, root):
    import shapely
    from shapely import STRtree
    R = D['R']
    G = list(csv.DictReader(open(os.path.join(root, 'water-atlas', 'archive', 'river_flow', 'gauges.csv'))))
    tree = STRtree(D['geoms'])
    rows = []
    for g in G:
        pt = shapely.Point(float(g['model_cell_lon']), float(g['model_cell_lat']))
        idx = tree.query(pt.buffer(0.08), predicate='intersects')
        if not len(idx): continue
        i = max(idx, key=lambda k: R[k]['up'])  # main stem near the gauge
        dat = list(csv.DictReader(open(os.path.join(root, 'water-atlas', 'archive', g['file']))))
        mon = defaultdict(list)
        for d in dat:
            if d['discharge_m3s'] in ('', None): continue
            mon[(int(d['date'][:4]), int(d['date'][5:7]))].append(float(d['discharge_m3s']))
        def clim(y0, y1):
            mm = [np.mean([np.mean(v) for (y, m), v in mon.items() if m == mo and y0 <= y <= y1]) for mo in range(1, 13)]
            return float(min(mm)), float(np.mean(mm))
        a_min, a_mean = clim(1979, 2000); b_min, b_mean = clim(1991, 2020)
        rows.append({'gauge': g['gauge_id'], 'river': g['river'], 'place': g['place'], 'hyriv_id': R[i]['id'],
                     'upland_km2': R[i]['up'], 'ra_mean': R[i]['qy'], 'ra_min': R[i]['qmin'],
                     'glofas_mean_1979_2000': round(a_mean, 2), 'glofas_min_1979_2000': round(a_min, 3),
                     'glofas_mean_1991_2020': round(b_mean, 2), 'glofas_min_1991_2020': round(b_min, 3),
                     'basin': D['basins'][D['rb'][i]][0] if D['rb'][i] >= 0 else ''})
    for r in rows:
        r['mean_ratio'] = round(r['glofas_mean_1979_2000'] / max(r['ra_mean'], 1e-6), 3)
        r['min_ratio_1979_2000'] = round(r['glofas_min_1979_2000'] / max(r['ra_min'], 1e-6), 3)
        r['min_ratio_1991_2020'] = round(r['glofas_min_1991_2020'] / max(r['ra_min'], 1e-6), 3)
    ok = [r for r in rows if 0.3 < r['mean_ratio'] < 3]  # same river matched (mean flows agree within a factor of 3)
    lr = np.log([max(r['min_ratio_1991_2020'], 1e-3) for r in ok])
    summ = {'gauges': len(rows), 'matched': len(ok),
            'median_min_ratio_1979_2000': float(np.median([r['min_ratio_1979_2000'] for r in ok])) if ok else None,
            'median_min_ratio_1991_2020': float(np.median([r['min_ratio_1991_2020'] for r in ok])) if ok else None,
            'log_ratio_mean': float(lr.mean()) if len(lr) else 0.0, 'log_ratio_sd': float(lr.std(ddof=1)) if len(lr) > 1 else 0.7}
    return rows, ok, summ


# ------------------------------------------------------------------ 3 Morris + Monte Carlo
PARAMS = ['lowflow_factor', 'reserve', 'efficiency', 'kc', 'slope_max', 'lift_max', 'landcover_set', 'landcover_error']


def sample_to_inputs(u, sd):
    """Unit-cube rows (S,8) -> parameter values."""
    u = np.atleast_2d(u)
    from statistics import NormalDist
    nd = NormalDist()
    z = np.array([nd.inv_cdf(min(max(x, 1e-6), 1 - 1e-6)) for x in u[:, 0]])
    return {'lowflow_factor': np.exp(z * sd),
            'reserve': 0.2 + 0.3 * u[:, 1],
            'efficiency': 0.5 + 0.25 * u[:, 2],
            'kc': 0.95 + 0.2 * u[:, 3],
            'slope_max': np.choose(np.minimum((u[:, 4] * 3).astype(int), 2), [2, 5, 8]),
            'lift_max': np.choose(np.minimum((u[:, 5] * 3).astype(int), 2), [5, 10, 15]),
            'landcover_set': np.minimum((u[:, 6] * 3).astype(int), 2),
            'landcover_error': 0.8 + 0.4 * u[:, 7]}


def model_batch(D, cfg, P, band=1):
    LC = [cfg['levels'][l]['landcover'] for l in ('low', 'central', 'high')]
    S = len(P['reserve'])
    combos = {}
    land = np.zeros((D['N'], S))
    for s in range(S):
        key = (int(P['landcover_set'][s]), int(P['slope_max'][s]), int(P['lift_max'][s]))
        if key not in combos:
            combos[key] = land_for(D, cfg, band, LC[key[0]], key[1], key[2])
        land[:, s] = combos[key] * P['landcover_error'][s]
    q = need(D, P['kc'], P['efficiency'])
    qmin = np.array([r['qmin'] for r in D['R']])[:, None] * P['lowflow_factor'][None, :]
    strip = np.array([r['strip'] for r in D['R']])
    land[~strip] = 0
    return route(D, land, qmin, P['reserve'], q)


def morris(D, cfg, sd, r=24, levels=4):
    rng = np.random.default_rng(SEED)
    k = len(PARAMS); delta = levels / (2 * (levels - 1))
    pts = []
    for _ in range(r):
        x = rng.integers(0, levels // 2, k) / (levels - 1)
        traj = [x.copy()]
        for j in rng.permutation(k):
            x = x.copy(); x[j] = x[j] + delta if x[j] + delta <= 1 else x[j] - delta
            traj.append(x)
        pts.append(np.array(traj))
    U = np.vstack(pts)
    tot = model_batch(D, cfg, sample_to_inputs(U, sd)).sum(axis=0)
    ee = defaultdict(list)
    for t in range(r):
        T = pts[t]; y = tot[t * (k + 1):(t + 1) * (k + 1)]
        for s in range(k):
            j = int(np.nonzero(T[s + 1] != T[s])[0][0])
            ee[PARAMS[j]].append((y[s + 1] - y[s]) / (T[s + 1][j] - T[s][j]))
    return {p: {'mu_star_ha': float(np.mean(np.abs(v))), 'sigma_ha': float(np.std(v))} for p, v in ee.items()}


def montecarlo(D, cfg, sd, n):
    rng = np.random.default_rng(SEED + 1)
    pot = np.zeros((D['N'], n), np.float32)
    for c in range(0, n, 250):
        m = min(250, n - c)
        pot[:, c:c + m] = model_batch(D, cfg, sample_to_inputs(rng.random((m, len(PARAMS))), sd))
        log('  Monte Carlo %d/%d' % (c + m, n))
    nat = pot.sum(axis=0)
    def pct(x): return [float(np.percentile(x, p)) for p in (5, 50, 95)]
    out = {'national_p5_p50_p95': pct(nat)}
    B = D['basins']; rb = D['rb']
    out['basins'] = {B[b][0]: pct(pot[rb == b].sum(axis=0)) for b in range(len(B))}
    st = D['share'].T @ pot
    out['states'] = {D['states'][s][0]: pct(st[s]) for s in range(len(D['states']))}
    return out


# ------------------------------------------------------------------ 4 channel position vs OSM
def osm_check(D, tiles):
    import shapely
    from shapely import STRtree
    res = []
    for la, lo in tiles:
        q = f'[out:json][timeout:180];way["waterway"="river"]({la},{lo},{la + 1},{lo + 1});out geom;'
        js = None
        for attempt in range(6):
            url = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
                   'https://overpass.private.coffee/api/interpreter'][attempt % 3]
            try:
                req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': q}).encode(),
                                             headers={'User-Agent': 'nigeria-water-atlas-research'})
                with urllib.request.urlopen(req, timeout=240) as r:
                    js = json.load(r)
                break
            except Exception as e:
                log('  Overpass attempt %d failed: %r' % (attempt + 1, e)); time.sleep(20)
        if js is None: raise RuntimeError('Overpass unavailable')
        lines = [shapely.LineString([(p['lon'], p['lat']) for p in w['geometry']]) for w in js['elements'] if len(w.get('geometry', [])) > 1]
        if not lines: continue
        t = STRtree(lines)
        box = shapely.box(lo, la, lo + 1, la + 1)
        for i, r in enumerate(D['R']):
            if not r['strip'] or r['ord'] < 4 or not D['mids'][i].within(box): continue
            g = D['geoms'][i]
            for f in (0.25, 0.5, 0.75):
                p = g.interpolate(f, normalized=True)
                j = t.nearest(p)
                dd = lines[j].distance(p) * 111320 * math.cos(math.radians(la + 0.5))
                res.append({'tile': f'{la},{lo}', 'hyriv_id': r['id'], 'order': r['ord'], 'visible': int(i in D['vis']), 'offset_m': round(dd)})
        time.sleep(5)
    return res


# ------------------------------------------------------------------ 5 soils
def soil_check(D, pot_c, n=3000):
    import rasterio
    from pyproj import Transformer
    url = 'https://files.isric.org/soilgrids/latest/data/sand/sand_0-5cm_mean.vrt'
    rng = np.random.default_rng(SEED + 2)
    idx = [i for i in range(D['N']) if D['R'][i]['strip'] and pot_c[i] > 0]
    pick = rng.choice(idx, size=min(n, len(idx)), replace=False, p=pot_c[idx] / pot_c[idx].sum())
    with rasterio.open(url) as src:
        tf = Transformer.from_crs('EPSG:4326', src.crs, always_xy=True)
        xy = []
        for i in pick:
            g = D['geoms'][i]; m = D['mids'][i]
            a = g.interpolate(max(0, g.project(m) - 0.001)); b = g.interpolate(min(g.length, g.project(m) + 0.001))
            dx, dy = b.x - a.x, b.y - a.y; L = math.hypot(dx, dy) or 1
            off = 150 / 111320  # 150 m either side of the channel
            for sgn in (1, -1):
                xy.append(tf.transform(m.x - sgn * dy / L * off, m.y + sgn * dx / L * off))
        vals = np.array([v[0] for v in src.sample(xy)], float)
    sand = vals.reshape(-1, 2).mean(axis=1) / 10.0  # g/kg -> %
    valid = sand > 0
    return {'reaches_sampled': int(valid.sum()), 'weighted_by': 'central potential',
            'share_of_sample_sand_over_80pct': float((sand[valid] > 80).mean()),
            'share_of_sample_sand_over_70pct': float((sand[valid] > 70).mean()),
            'median_sand_pct': float(np.median(sand[valid]))}


# ------------------------------------------------------------------ 6 figures
def figures(D, out, land_c, wl_c, pot_c):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.collections import LineCollection
    R = D['R']
    segs, cols, lws = [], [], []
    for i, r in enumerate(R):
        if not r['strip'] or land_c[i] <= 0: continue
        g = D['geoms'][i]; cs = list(g.coords) if g.geom_type == 'LineString' else list(g.geoms[0].coords)
        segs.append(cs); water = wl_c[i] < land_c[i]
        cols.append('#c0392b' if water else '#2a78d6'); lws.append(0.3 + min(2.2, r['ord'] * 0.25))
    fig, ax = plt.subplots(figsize=(9, 8), dpi=200)
    for _, g in D['states']:
        for poly in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
            x, y = poly.exterior.xy; ax.plot(x, y, color='#bbbbbb', lw=0.4)
    ax.add_collection(LineCollection(segs, colors=cols, linewidths=lws))
    ax.set_aspect('equal'); ax.set_xlim(2.6, 14.8); ax.set_ylim(4.2, 14)
    ax.set_title('Which limit binds: water (red) or land (blue)\n250 m strips, central assumptions')
    ax.axis('off'); fig.savefig(os.path.join(out, 'fig_binding_limit.png'), bbox_inches='tight'); plt.close(fig)
    segs, vals = [], []
    for i, r in enumerate(R):
        if not r['strip'] or pot_c[i] <= 0: continue
        g = D['geoms'][i]; cs = list(g.coords) if g.geom_type == 'LineString' else list(g.geoms[0].coords)
        segs.append(cs); vals.append(pot_c[i] / max(r['km'], 0.1))
    fig, ax = plt.subplots(figsize=(9, 8), dpi=200)
    for _, g in D['states']:
        for poly in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
            x, y = poly.exterior.xy; ax.plot(x, y, color='#bbbbbb', lw=0.4)
    lc = LineCollection(segs, array=np.clip(vals, 0, 50), cmap='viridis_r', linewidths=0.9)
    ax.add_collection(lc); fig.colorbar(lc, ax=ax, shrink=0.6, label='ha per km of river (250 m strips, central)')
    ax.set_aspect('equal'); ax.set_xlim(2.6, 14.8); ax.set_ylim(4.2, 14); ax.axis('off')
    ax.set_title('Riverbank pump-irrigation potential per km of river')
    fig.savefig(os.path.join(out, 'fig_potential_per_km.png'), bbox_inches='tight'); plt.close(fig)


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', default='/tmp/rip'); ap.add_argument('--out', required=True)
    ap.add_argument('--draws', type=int, default=1000); ap.add_argument('--skip', default='')
    ap.add_argument('--only', default='', help='osm: run only the channel-position check and write channel_offset.json')
    a = ap.parse_args(); skip = set(a.skip.split(','))
    os.makedirs(a.out, exist_ok=True)
    cfg = WR.load_cfg(); root = WR.ROOT
    D = load(a.work, cfg); R = D['R']; N = D['N']
    if a.only == 'osm':
        pos = osm_check(D, [(7, 8), (12, 9), (13, 5), (7, 3), (10, 4), (12, 5)])
        with open(os.path.join(a.out, 'channel_offset_vs_osm.csv'), 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(pos[0].keys())); w.writeheader(); w.writerows(pos)
        off = np.array([p['offset_m'] for p in pos]); vis = np.array([p['visible'] for p in pos])
        res = {'points': len(off), 'median': float(np.median(off)), 'p90': float(np.percentile(off, 90)),
               'share_over_100m': float((off > 100).mean()), 'share_over_250m': float((off > 250).mean()),
               'median_visible': float(np.median(off[vis == 1])) if (vis == 1).any() else None,
               'median_not_visible': float(np.median(off[vis == 0])) if (vis == 0).any() else None}
        json.dump(res, open(os.path.join(a.out, 'channel_offset.json'), 'w'), indent=1)
        log('Channel offset:', res); return
    strip = np.array([r['strip'] for r in R])
    C = cfg['levels']['central']
    land_c = land_for(D, cfg, 1, C['landcover'], C['max_slope_pct'], C['max_lift_m']); land_c[~strip] = 0
    qmin = np.array([r['qmin'] for r in R]); qy = np.array([r['qy'] for r in R]); order = np.array([r['ord'] for r in R])
    q_c = need(D, C['kc'], C['efficiency'])
    base = route(D, land_c, qmin, C['reserve_frac_of_dry_flow'], q_c)[:, 0]
    wl_c = route(D, np.full(N, 1e12), qmin, C['reserve_frac_of_dry_flow'], q_c)[:, 0]
    out = {'base_central_250m_ha': float(base.sum()), 'land_central_250m_ha': float(land_c.sum())}
    log('Base (should match the atlas run): %.0f ha' % base.sum())

    # 1 low flows
    rows, ok, fs = flows(D, root)
    if rows:
        with open(os.path.join(a.out, 'lowflow_vs_glofas.csv'), 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    out['lowflow_check'] = fs
    log('Low flows:', fs)
    sd = max(fs['log_ratio_sd'], 0.3)

    # 2 sensitivity (central, 250 m)
    S = {}
    for thr in (0.1, 0.25, 0.5, 1.0, 2.0, 5.0):
        S[f'perennial_threshold_{thr}'] = float(route(D, np.where(qmin >= thr, land_c, 0), qmin, C['reserve_frac_of_dry_flow'], q_c)[:, 0].sum())
    for o in (1, 2, 3):
        S[f'exclude_order_le_{o}'] = float(route(D, np.where(order > o, land_c, 0), qmin, C['reserve_frac_of_dry_flow'], q_c)[:, 0].sum())
    S['reserve_none'] = float(route(D, land_c, qmin, 0.0, q_c)[:, 0].sum())
    res_t = np.minimum(1.0, 0.1 * qy / np.maximum(qmin, 1e-9))  # Tennant: 10% of mean annual flow, as a share of the dry-month flow
    S['reserve_tennant_10pct_mean_flow'] = float(route(D, land_c, qmin, res_t, q_c)[:, 0].sum())
    res_t30 = np.minimum(1.0, 0.3 * qy / np.maximum(qmin, 1e-9))
    S['reserve_tennant_30pct_mean_flow'] = float(route(D, land_c, qmin, res_t30, q_c)[:, 0].sum())
    S['allocation_no_upstream_deduction'] = float(route(D, land_c, qmin, C['reserve_frac_of_dry_flow'], q_c, 'none')[:, 0].sum())
    S['allocation_local_flow_only'] = float(route(D, land_c, qmin, C['reserve_frac_of_dry_flow'], q_c, 'local')[:, 0].sum())
    q_season = need(D, C['kc'], C['efficiency'], months=[10, 11, 0, 1, 2])  # Nov-Mar
    S['water_limit_seasonal_volume_nov_mar'] = float(route(D, land_c, qmin, C['reserve_frac_of_dry_flow'], q_season)[:, 0].sum())
    if ok:
        fac = defaultdict(list)
        for r in ok: fac[r['basin']].append(r['min_ratio_1991_2020'])
        bf = {b: float(np.exp(np.mean(np.log(np.maximum(v, 1e-3))))) for b, v in fac.items()}
        gm = float(np.exp(np.mean(np.log([max(r['min_ratio_1991_2020'], 1e-3) for r in ok]))))
        f_r = np.array([bf.get(D['basins'][D['rb'][i]][0] if D['rb'][i] >= 0 else '', gm) for i in range(N)])
        S['glofas_bias_corrected_1991_2020'] = float(route(D, land_c, qmin * f_r, C['reserve_frac_of_dry_flow'], q_c)[:, 0].sum())
        out['glofas_basin_factors'] = bf
    out['sensitivity_ha'] = S
    log('Sensitivity:', json.dumps(S))
    # where potential sits by stream order and binding
    out['by_order'] = {int(o): float(base[order == o].sum()) for o in np.unique(order)}
    out['water_bound_reaches'] = int(((wl_c < land_c) & (land_c > 0)).sum())

    # 3 uncertainty
    out['morris'] = morris(D, cfg, sd)
    log('Morris:', out['morris'])
    out['montecarlo'] = montecarlo(D, cfg, sd, a.draws)
    log('Monte Carlo national 5/50/95%:', out['montecarlo']['national_p5_p50_p95'])

    # 4 channel position
    if 'osm' not in skip:
        try:
            pos = osm_check(D, [(7, 8), (12, 9), (13, 5)])
            with open(os.path.join(a.out, 'channel_offset_vs_osm.csv'), 'w', newline='') as f:
                w = csv.DictWriter(f, fieldnames=list(pos[0].keys())); w.writeheader(); w.writerows(pos)
            off = np.array([p['offset_m'] for p in pos]); vis = np.array([p['visible'] for p in pos])
            out['channel_offset_m'] = {'points': len(off), 'median': float(np.median(off)), 'p90': float(np.percentile(off, 90)),
                                       'share_over_100m': float((off > 100).mean()), 'share_over_250m': float((off > 250).mean()),
                                       'median_visible': float(np.median(off[vis == 1])) if (vis == 1).any() else None,
                                       'median_not_visible': float(np.median(off[vis == 0])) if (vis == 0).any() else None}
            log('Channel offset:', out['channel_offset_m'])
        except Exception as e:
            log('OSM check failed:', repr(e)); out['channel_offset_m'] = {'error': repr(e)[:200]}
    # 5 soils
    if 'soil' not in skip:
        try:
            out['soils'] = soil_check(D, base)
            log('Soils:', out['soils'])
        except Exception as e:
            log('Soil check failed:', repr(e)); out['soils'] = {'error': repr(e)[:200]}
    # 6 figures
    figures(D, a.out, land_c, wl_c, base)
    with open(os.path.join(a.out, 'revision.json'), 'w') as f:
        json.dump(out, f, indent=1)
    log('Done')


if __name__ == '__main__':
    main()
