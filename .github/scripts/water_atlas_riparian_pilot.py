#!/usr/bin/env python3
"""Pilot check of the riparian pump-irrigation potential against dry-season cropping seen by Sentinel-2.

For one 1-degree tile it rebuilds the strip grids exactly as water_atlas_riparian.py does, then uses
Sentinel-2 L2A (Element 84 Earth Search, public COGs on AWS) to map land that is bare early in the
dry season and green late in it: the signature of a dry-season crop that must be irrigated.

  early window (default Dec-Jan):  lowest NDVI of cloud-free looks  <= early_max_ndvi
  late window  (default Feb-Mar):  highest NDVI of cloud-free looks >= late_min_ndvi
  and not tree cover, built-up land or water in ESA WorldCover

Perennially green land (green in both windows: riparian forest, wetland grass) is reported separately.

Usage:
  python3 water_atlas_riparian_pilot.py --tile 7,8 --season 2025 --work /tmp/rip --out DIR
    --tile LAT,LON   south-west corner of the 1-degree tile
    --season YEAR    dry season starting in December of YEAR
"""
import argparse, json, math, os, sys, time, csv, urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import water_atlas_riparian as WR  # noqa: E402

STAC = 'https://earth-search.aws.element84.com/v1/search'
VALID_SCL = (4, 5)  # vegetation, not vegetated (bare). Clouds, shadow, water, snow excluded


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def stac_items(bbox, start, end, max_cloud):
    body = {'collections': ['sentinel-2-l2a'], 'bbox': bbox, 'datetime': f'{start}T00:00:00Z/{end}T23:59:59Z',
            'limit': 200, 'query': {'eo:cloud_cover': {'lt': max_cloud}}}
    items, url, method = [], STAC, 'POST'
    while url:
        req = urllib.request.Request(url, data=json.dumps(body).encode() if method == 'POST' else None,
                                     headers={'Content-Type': 'application/json', 'User-Agent': 'nigeria-water-atlas'}, method=method)
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.load(r)
        items += page.get('features', [])
        nxt = [l for l in page.get('links', []) if l.get('rel') == 'next']
        if not nxt:
            break
        url = nxt[0]['href']; method = nxt[0].get('method', 'GET'); body = nxt[0].get('body', body)
    return items


def read_item(item, tr, shape):
    """Cloud-masked NDVI of one Sentinel-2 scene on the tile grid (NaN where invalid).
    Reads the 20 m overview of only the part of the scene that covers the tile, then reprojects."""
    import rasterio
    from rasterio.windows import from_bounds, Window
    from rasterio.warp import transform_bounds, reproject
    from rasterio.enums import Resampling
    H, W = shape
    bounds = (tr.c, tr.f + tr.e * H, tr.c + tr.a * W, tr.f)
    a = item['assets']
    def read(href, resampling, ref=None):
        with rasterio.open(href) as src:
            b = transform_bounds('EPSG:4326', src.crs, *bounds, densify_pts=21)
            win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
            win = win.intersection(Window(0, 0, src.width, src.height))
            if ref is None:
                f = max(1, round(20 / abs(src.transform.a)))  # read at about 20 m
                oh, ow = max(1, int(win.height // f)), max(1, int(win.width // f))
            else:
                oh, ow = ref
            arr = src.read(1, window=win, out_shape=(oh, ow), resampling=resampling)
            wt = src.window_transform(win) * rasterio.Affine.scale(win.width / ow, win.height / oh)
            dst = np.zeros(shape, arr.dtype)
            reproject(arr, dst, src_transform=wt, src_crs=src.crs, dst_transform=tr, dst_crs='EPSG:4326',
                      resampling=Resampling.nearest, src_nodata=0, dst_nodata=0)
            return dst, (oh, ow)
    red, ref = read(a['red']['href'], Resampling.average)
    nir, _ = read(a['nir']['href'], Resampling.average, ref)
    scl, _ = read(a['scl']['href'], Resampling.nearest, ref)
    red = red.astype(np.float32); nir = nir.astype(np.float32)
    p = item['properties']
    if not p.get('earthsearch:boa_offset_applied', False) and float(p.get('s2:processing_baseline', '0') or 0) >= 4:
        red -= 1000; nir -= 1000
    ok = np.isin(scl, VALID_SCL) & (red > 0) & (nir > 0)
    nd = np.full(shape, np.nan, np.float32)
    nd[ok] = (nir[ok] - red[ok]) / (nir[ok] + red[ok])
    return nd


def composite(items, tr, shape, how, workers=6):
    acc = np.full(shape, np.inf if how == 'min' else -np.inf, np.float32)
    n = np.zeros(shape, np.uint16)
    done = 0
    def job(it):
        try:
            return read_item(it, tr, shape)
        except Exception as e:
            log('  skipped', it['id'], repr(e)[:120]); return None
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for nd in ex.map(job, items):
            done += 1
            if nd is None: continue
            v = ~np.isnan(nd)
            n[v] += 1
            if how == 'min': np.fmin(acc, np.where(v, nd, np.inf), out=acc)
            else: np.fmax(acc, np.where(v, nd, -np.inf), out=acc)
            if done % 10 == 0: log('  %d/%d scenes' % (done, len(items)))
    acc[n == 0] = np.nan
    return acc, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tile', default='7,8'); ap.add_argument('--season', type=int, default=2025)
    ap.add_argument('--work', default='/tmp/rip'); ap.add_argument('--out', required=True)
    ap.add_argument('--early-max-ndvi', type=float, default=0.30); ap.add_argument('--late-min-ndvi', type=float, default=0.45)
    ap.add_argument('--max-cloud', type=float, default=40)
    a = ap.parse_args()
    lat, lon = [int(x) for x in a.tile.split(',')]
    cfg = WR.load_cfg()
    import shapely
    from shapely import STRtree
    with open(os.path.join(a.work, 'reaches.json')) as f:
        R = json.load(f)['reaches']
    for i, r in enumerate(R): r['i'] = i + 1
    geoms = [shapely.from_wkt(r['wkt']) for r in R]
    box = shapely.box(lon - WR.PAD - 0.01, lat - WR.PAD - 0.01, lon + 1 + WR.PAD + 0.01, lat + 1 + WR.PAD + 0.01)
    sub = [R[i] for i in STRtree(geoms).query(box, predicate='intersects') if R[i]['strip']]
    states, _, _ = WR.load_states()
    sw = [(i, shapely.to_wkb(g)) for i, (_, g) in enumerate(states) if g.intersects(box)]
    prot = [shapely.to_wkb(g) for g in WR.load_protected(cfg) if g.intersects(box)]
    log('Tile %+d,%+d: %d river reaches; rebuilding strips' % (lat, lon, len(sub)))
    G = WR.process_tile((lat, lon, cfg, sub, prot, sw, a.work, True))
    if not isinstance(G, dict):
        raise SystemExit('Tile could not be built: %r' % (G,))
    tr, shape = G['transform'], G['shape']
    y0 = a.season
    early = stac_items([lon, lat, lon + 1, lat + 1], f'{y0}-12-01', f'{y0 + 1}-01-31', a.max_cloud)
    late = stac_items([lon, lat, lon + 1, lat + 1], f'{y0 + 1}-02-01', f'{y0 + 1}-03-31', a.max_cloud)
    log('Sentinel-2 scenes: %d early (Dec-Jan), %d late (Feb-Mar)' % (len(early), len(late)))
    emin, ne = composite(early, tr, shape, 'min')
    lmax, nl = composite(late, tr, shape, 'max')
    wc = G['wc']
    nonveg = np.isin(wc, [10, 95, 50, 80])  # tree, mangrove, built-up, water
    seen = (ne > 0) & (nl > 0)
    crop = seen & (emin <= a.early_max_ndvi) & (lmax >= a.late_min_ndvi) & ~nonveg
    green = seen & (emin > a.early_max_ndvi + 0.1) & (lmax >= a.late_min_ndvi)
    # bands by distance from the channel (500-1000 m added to see whether farming goes beyond the strips)
    d = G['dist']; base = G['core'] & (G['state'] > 0) & ~G['chan'] & ~G['water'] & (G['rid'] > 0)
    H, W = shape; n = tr.f
    lat_row = n - (np.arange(H) + 0.5) * WR.RES
    px_ha = (WR.RES * WR.DEG_M) ** 2 * np.cos(np.radians(lat_row)) / 1e4
    A = np.broadcast_to(px_ha[:, None], shape)
    L = cfg['levels']['central']; groups = G['groups']
    ok_lc = np.isin(G['lc'], [groups.index(x) for x in L['landcover']])
    ok_sl = G['slope'] <= L['max_slope_pct']; ok_lf = G['lift'] <= L['max_lift_m']
    bands = [(0, 100), (100, 250), (250, 500), (500, 1000)]
    out = {'tile': [lat, lon], 'season': f'Dec {y0} - Mar {y0 + 1}', 'scenes': {'early': len(early), 'late': len(late)},
           'thresholds': {'early_max_ndvi': a.early_max_ndvi, 'late_min_ndvi': a.late_min_ndvi, 'max_cloud_pct': a.max_cloud},
           'seen_share': round(float((seen & base & (d <= 500)).sum() / max(1, (base & (d <= 500)).sum())), 3), 'bands': []}
    for lo_, hi in bands:
        m = base & (d > lo_) & (d <= hi)
        cm = m & crop
        out['bands'].append({'band_m': [lo_, hi], 'land_ha': round(float(A[m].sum())),
                             'dry_season_crop_ha': round(float(A[cm].sum())),
                             'crop_on_central_suitable_ha': round(float(A[cm & ok_lc & ok_sl & ok_lf].sum())),
                             'crop_excluded_by_landcover_ha': round(float(A[cm & ~ok_lc].sum())),
                             'crop_excluded_by_slope_ha': round(float(A[cm & ok_lc & ~ok_sl].sum())),
                             'crop_excluded_by_lift_ha': round(float(A[cm & ok_lc & ok_sl & ~ok_lf].sum())),
                             'perennially_green_ha': round(float(A[m & green].sum())),
                             'central_suitable_land_ha': round(float(A[m & ok_lc & ok_sl & ok_lf].sum()))})
    # per reach: observed cropping within 250 m vs the modelled potential
    pot = {}
    with open(os.path.join(WR.OUT_ARCH, 'reaches.csv')) as f:
        for row in csv.DictReader(f):
            pot[int(row['hyriv_id'])] = (float(row['potential_ha_250m_central']), float(row['land_ha_250m_central']),
                                         float(row['dry_month_flow_m3s']), float(row['length_km']))
    gid = G['reach_ids'][G['rid']]
    m250 = base & (d <= 250)
    obs = np.bincount(gid[m250 & crop], weights=A[m250 & crop], minlength=len(R) + 1)
    rows = []
    for k in np.unique(gid[m250]):
        if k == 0: continue
        r = R[k - 1]; p = pot.get(r['id'])
        if not p: continue
        rows.append([r['id'], p[3], p[2], round(p[1]), round(p[0]), round(float(obs[k]), 1)])
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, 'reaches.csv'), 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['hyriv_id', 'length_km', 'dry_month_flow_m3s', 'land_ha_250m_central', 'potential_ha_250m_central', 'observed_dry_season_crop_ha_250m']); w.writerows(rows)
    ob = np.array([x[5] for x in rows]); pt = np.array([x[4] for x in rows]); ld = np.array([x[3] for x in rows])
    out['reaches'] = {'n': len(rows), 'observed_crop_ha_250m': round(float(ob.sum())), 'potential_ha_250m_central': round(float(pt.sum())),
                      'land_ha_250m_central': round(float(ld.sum())),
                      'use_of_potential_pct': round(100 * float(ob.sum()) / max(1, float(pt.sum())), 1),
                      'reaches_observed_above_potential': int((ob > pt * 1.1 + 2).sum()),
                      'spearman_obs_vs_potential': round(float(spearman(ob, pt)), 3) if len(rows) > 5 else None}
    with open(os.path.join(a.out, 'summary.json'), 'w') as f:
        json.dump(out, f, indent=1)
    log(json.dumps(out, indent=1))
    preview(a.out, G, lmax, crop, d, base, tr)


def spearman(x, y):
    rx = np.argsort(np.argsort(x)); ry = np.argsort(np.argsort(y))
    return np.corrcoef(rx, ry)[0, 1]


def preview(out, G, lmax, crop, d, base, tr):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    s = 3  # 90 m preview
    img = np.nan_to_num(lmax[::s, ::s], nan=0)
    fig, ax = plt.subplots(figsize=(10, 10), dpi=110)
    ext = (tr.c, tr.c + tr.a * G['shape'][1], tr.f + tr.e * G['shape'][0], tr.f)
    ax.imshow(img, cmap='Greys_r', vmin=0, vmax=0.8, extent=ext)
    strip = (base & (d <= 250))[::s, ::s]
    ax.imshow(np.ma.masked_where(~strip, strip), cmap='Blues', alpha=0.35, extent=ext, vmin=0, vmax=1)
    cr = crop[::s, ::s]
    ax.imshow(np.ma.masked_where(~cr, cr), cmap='autumn', alpha=0.9, extent=ext, vmin=0, vmax=1)
    ax.set_title('Dry-season cropping (orange) and 250 m river strips (blue) on late dry-season NDVI')
    fig.savefig(os.path.join(out, 'preview.png'), bbox_inches='tight'); plt.close(fig)
    # zoom on the 0.12-degree window with most dry-season cropping in the strips
    from scipy import ndimage as ndi
    k = int(0.12 / WR.RES)
    dens = ndi.uniform_filter((crop & base & (d <= 500)).astype(np.float32)[::s, ::s], size=k // s)
    iy, ix = np.unravel_index(np.argmax(dens), dens.shape); iy *= s; ix *= s
    y0, y1 = max(0, iy - k // 2), min(crop.shape[0], iy + k // 2); x0, x1 = max(0, ix - k // 2), min(crop.shape[1], ix + k // 2)
    fig, axs = plt.subplots(1, 2, figsize=(14, 7), dpi=110)
    e2 = (tr.c + x0 * tr.a, tr.c + x1 * tr.a, tr.f + y1 * tr.e, tr.f + y0 * tr.e)
    axs[0].imshow(np.nan_to_num(lmax[y0:y1, x0:x1]), cmap='Greens', vmin=0, vmax=0.8, extent=e2); axs[0].set_title('Highest NDVI, Feb-Mar')
    axs[1].imshow(np.nan_to_num(lmax[y0:y1, x0:x1]), cmap='Greys_r', vmin=0, vmax=0.8, extent=e2)
    st = (base & (d <= 250))[y0:y1, x0:x1]; c2 = crop[y0:y1, x0:x1]
    axs[1].imshow(np.ma.masked_where(~st, st), cmap='Blues', alpha=0.35, extent=e2, vmin=0, vmax=1)
    axs[1].imshow(np.ma.masked_where(~c2, c2), cmap='autumn', alpha=0.9, extent=e2, vmin=0, vmax=1)
    axs[1].set_title('Dry-season crop (yellow) and 250 m strips (blue)')
    fig.savefig(os.path.join(out, 'zoom.png'), bbox_inches='tight'); plt.close(fig)


if __name__ == '__main__':
    main()
