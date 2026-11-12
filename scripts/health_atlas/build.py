"""Nigeria Health Atlas: build data files and ambulance-coverage analysis.

Inputs
  GRID3 NGA Health Facilities v4.0 (CIESIN, CC BY 4.0), 70,235 records; read here from the
  Kemabonta (2026) combined layer, GRID3 rows only (verified identical to the live service by
  state x level counts on 2026-11-07).
  Ward population 2025 (WorldPop, aggregated to GRID3 operational wards v4.0) from the same release.
  WorldPop Global2 R2025A v1, constrained, 1 km, 2025 (nga_pop_2025_CN_1km_R2025A_UA_v1.tif,
  DOI 10.5258/SOTON/WP00840); national total aligned to UN WPP 2024 (1 January). The ward table
  above sums to exactly the same total, so it was built from this raster.
  State boundaries (geoBoundaries) from energy-atlas/data/nigeria-states.geojson.
Primary results use the 1 km grid; ward-point results are kept as a comparison.
Usage: build.py FACILITIES_CSV WARDS_CSV OUT_DIR [RASTER_TIF STATES_GEOJSON]
"""
import json, math, sys
import numpy as np, pandas as pd
from sklearn.neighbors import BallTree

SRC = sys.argv[1]; WARDS = sys.argv[2]; OUT = sys.argv[3]
RASTER = sys.argv[4] if len(sys.argv) > 4 else None
STATES = sys.argv[5] if len(sys.argv) > 5 else None
import heapq
R_EARTH = 6371.0088
CIRCUITY = 1.4          # road km per straight-line km (planning assumption)
SPEED = 40.0            # km/h average ambulance road speed (planning assumption)
MIN_PER_KM = CIRCUITY / SPEED * 60   # = 2.1 minutes per straight-line km

d = pd.read_csv(SRC, low_memory=False)
g = d[d.source.str.startswith('GRID3')].copy()
g['level'] = g.level_source.fillna('Unknown').replace('', 'Unknown')
REFERRAL_TYPES = {'General Hospital', 'Specialist Hospital', 'Cottage Hospital',
                  'Federal Medical Center', 'Teaching/Tertiary Hospital'}
TERTIARY_TYPES = {'Federal Medical Center', 'Teaching/Tertiary Hospital'}
pub = g.ownership.eq('Public')
closed = g.functional_status.isin(['Not-Functional', 'Closed'])
NOT_HOSPITAL = {'Clinic', 'Maternity Home', 'Primary Health Clinic', 'Primary Health Center', 'Health Center',
                'Health Post', 'Diagnostic / Laboratory Center', 'Dental Clinic', 'Eye Clinic', 'Specialist Clinic',
                'Nursing / Convalescent Home', 'Outreach Center', 'Dental Hospital', 'Eye Hospital'}
hosp_type = ~g.facility_type.isin(NOT_HOSPITAL)
g['referral'] = ((g.level.isin(['Secondary', 'Tertiary']) & hosp_type) | g.facility_type.isin(REFERRAL_TYPES)) & ~closed
g['tertiary'] = ((g.level.eq('Tertiary') & hosp_type) | g.facility_type.isin(TERTIARY_TYPES)) & ~closed
g['pub_referral'] = g.referral & pub
geo = g[g.has_coords & g.in_nigeria].copy()

# ---------- compact facility file ----------
cats = {}
def idx(col):
    vals = sorted(geo[col].fillna('Unknown').astype(str).unique())
    cats[col] = vals
    m = {v: i for i, v in enumerate(vals)}
    return geo[col].fillna('Unknown').astype(str).map(m)
geo['own2'] = geo.ownership_type.fillna(geo.ownership).fillna('Unknown')
geo['func2'] = geo.functional_status.fillna('Unknown')
cols = {'facility_type': idx('facility_type'), 'level': idx('level'), 'own2': idx('own2'),
        'func2': idx('func2'), 'state': idx('state'), 'lga': idx('lga')}
rows = []
for i, r in enumerate(geo.itertuples()):
    flag = (1 if r.referral else 0) | (2 if r.pub_referral else 0) | (4 if r.tertiary else 0) | (8 if r.ownership == 'Public' else 0)
    rows.append([round(r.latitude, 5), round(r.longitude, 5), int(cols['facility_type'].iat[i]),
                 int(cols['level'].iat[i]), int(cols['own2'].iat[i]), int(cols['func2'].iat[i]),
                 int(cols['state'].iat[i]), int(cols['lga'].iat[i]), flag,
                 str(r.facility_name) if isinstance(r.facility_name, str) else '',
                 str(r.ward_name) if isinstance(r.ward_name, str) else '',
                 str(r.nhfr_facility_code) if isinstance(r.nhfr_facility_code, str) else ''])
fac = {'source': 'GRID3 NGA Health Facilities v4.0 (CIESIN, Columbia University), CC BY 4.0',
       'fields': ['lat', 'lon', 'type', 'level', 'ownership', 'functional', 'state', 'lga', 'flags', 'name', 'ward', 'nhfr'],
       'flags': {'1': 'referral hospital (secondary/tertiary or hospital type, not closed)',
                 '2': 'public referral hospital', '4': 'tertiary / teaching / FMC', '8': 'public ownership'},
       'cats': {'type': cats['facility_type'], 'level': cats['level'], 'ownership': cats['own2'],
                'functional': cats['func2'], 'state': cats['state'], 'lga': cats['lga']},
       'rows': rows}
json.dump(fac, open(f'{OUT}/facilities.json', 'w'), separators=(',', ':'), ensure_ascii=False)

# CSV download (GRID3 fields, all 70,235 records incl. those without coordinates)
csv = g[['source_id', 'facility_name', 'facility_type', 'level', 'ownership', 'ownership_type',
         'functional_status', 'state', 'lga', 'ward_name', 'latitude', 'longitude',
         'nhfr_facility_code', 'referral', 'pub_referral', 'tertiary']].rename(columns={'source_id': 'grid3_unique_id'})
for c_ in ['latitude', 'longitude']: csv[c_] = csv[c_].round(5)
for c_ in ['referral', 'pub_referral', 'tertiary']: csv[c_] = csv[c_].astype(int)
csv.to_csv(f'{OUT}/nigeria_health_facilities_grid3_v4.csv', index=False)

# ---------- ward population points ----------
w = pd.read_csv(WARDS)
# 168 rows in the source table lack the state: the ward shares its LGA's name and the columns are shifted
states_set = set(g.state.dropna())
fix = w.state.isna() & w.lga.isin(states_set)
w.loc[fix, 'state'] = w.loc[fix, 'lga']; w.loc[fix, 'lga'] = w.loc[fix, 'ward_name']
l2s = g.dropna(subset=['state', 'lga']).groupby('lga').state.agg(lambda x: x.mode().iat[0])
rest = w.state.isna()
w.loc[rest, 'state'] = w.loc[rest, 'lga'].map(l2s)
print('fixed shifted ward rows', int(fix.sum()), 'still no state', int(w.state.isna().sum()))
pos = geo.groupby('ward_id')[['latitude', 'longitude']].median()
w = w.join(pos, on='ward_id')
lga_pos = geo.groupby(['state', 'lga'])[['latitude', 'longitude']].median()
miss = w.latitude.isna()
for i in w[miss].index:
    k = (w.at[i, 'state'], w.at[i, 'lga'])
    if k in lga_pos.index:
        w.at[i, 'latitude'], w.at[i, 'longitude'] = lga_pos.loc[k].values
w['placed'] = np.where(miss, 'lga', 'ward')
w = w.dropna(subset=['latitude'])
w = w[w.ward_pop_2025 > 0].reset_index(drop=True)
POP = w.ward_pop_2025.values
TOT = POP.sum()
print('wards', len(w), 'pop', round(TOT), 'placed by LGA', int((w.placed == 'lga').sum()))


def tree_ll(lat, lon):
    return BallTree(np.radians(np.c_[lat, lon]), metric='haversine')
def nearest_km(t, lat, lon):
    dist, ind = t.query(np.radians(np.c_[lat, lon]), k=1)
    return dist[:, 0] * R_EARTH, ind[:, 0]

ref = geo[geo.pub_referral].reset_index(drop=True)
anyref = geo[geo.referral].reset_index(drop=True)
ter = geo[geo.tertiary].reset_index(drop=True)
T_REF = tree_ll(ref.latitude.values, ref.longitude.values)
T_ANY = tree_ll(anyref.latitude.values, anyref.longitude.values)
T_TER = tree_ll(ter.latitude.values, ter.longitude.values)
T_FAC = tree_ll(geo.latitude.values, geo.longitude.values)

def add_dist(D):
    D['d_pubref'], _ = nearest_km(T_REF, D.lat.values, D.lon.values)
    D['d_anyref'], _ = nearest_km(T_ANY, D.lat.values, D.lon.values)
    D['d_tert'], _ = nearest_km(T_TER, D.lat.values, D.lon.values)
    D['d_anyfac'], _ = nearest_km(T_FAC, D.lat.values, D.lon.values)
    return D

# ---------- demand set 1: ward points ----------
WD = pd.DataFrame({'lat': w.latitude.values, 'lon': w.longitude.values, 'pop': w.ward_pop_2025.values, 'state': w.state.values})
WD = add_dist(WD)

# ---------- demand set 2: 1 km WorldPop grid ----------
GD = None
if RASTER:
    import tifffile
    with tifffile.TiffFile(RASTER) as tf:
        page = tf.pages[0]; arr = page.asarray().astype('float64')
        scale = page.tags['ModelPixelScaleTag'].value; tie = page.tags['ModelTiepointTag'].value
    x0, y0, dx, dy = tie[3], tie[4], scale[0], scale[1]
    arr[~np.isfinite(arr)] = 0; arr[arr < 0] = 0
    yy, xx = np.nonzero(arr > 0)
    GD = pd.DataFrame({'lat': y0 - (yy + 0.5) * dy, 'lon': x0 + (xx + 0.5) * dx, 'pop': arr[yy, xx]})
    print('grid pixels', len(GD), 'total', round(GD['pop'].sum()))
    st = np.full(len(GD), None, dtype=object)
    if STATES:
        import shapely
        from shapely.geometry import shape
        fc = json.load(open(STATES))
        alias = {'FCT': 'Federal Capital Territory'}
        for f in fc['features']:
            nm = alias.get(f['properties']['name'], f['properties']['name'])
            geom = shape(f['geometry']); shapely.prepare(geom)
            todo = st == None
            inside = shapely.contains_xy(geom, GD.lon.values[todo], GD.lat.values[todo])
            idx = np.nonzero(todo)[0][inside]; st[idx] = nm
    miss = st == None
    if miss.any():   # pixels just outside the simplified boundaries: take the nearest ward point's state
        _, ix = nearest_km(tree_ll(WD.lat.values, WD.lon.values), GD.lat.values[miss], GD.lon.values[miss])
        st[miss] = WD.state.values[ix]
    print('pixels assigned by nearest ward', int(miss.sum()))
    GD['state'] = st
    GD = add_dist(GD)

PRIMARY = GD if GD is not None else WD
TOT = PRIMARY['pop'].sum()

BANDS = [0, 5, 10, 20, 40, 1e9]
BLAB = ['<5 km', '5-10 km', '10-20 km', '20-40 km', '>40 km']
def bands(D, col):
    return [round(float(D['pop'][(D[col] >= lo) & (D[col] < hi)].sum())) for lo, hi in zip(BANDS[:-1], BANDS[1:])]

# ---------- station siting: greedy maximal covering ----------
cand = geo[geo.ownership.eq('Public') & ~geo.functional_status.isin(['Not-Functional', 'Closed'])].reset_index(drop=True)
ctree = tree_ll(cand.latitude.values, cand.longitude.values)
CELL = 0.025   # ~2.75 km demand cells for siting on the grid (population-weighted centroids)
def demand_units(D):
    if D is WD: return D
    k = np.floor(D.lat / CELL).astype(int).astype(str) + '_' + np.floor(D.lon / CELL).astype(int).astype(str)
    t = D.assign(k=k, wl=D.lat * D['pop'], wo=D.lon * D['pop']).groupby(['k', 'state'], as_index=False)[['pop', 'wl', 'wo']].sum()
    return pd.DataFrame({'lat': t.wl / t['pop'], 'lon': t.wo / t['pop'], 'pop': t['pop'], 'state': t.state})

def site(U, radius_km, target=0.95, max_n=12000):
    P = U['pop'].values; tot = P.sum()
    nb = ctree.query_radius(np.radians(np.c_[U.lat.values, U.lon.values]), r=radius_km / R_EARTH)
    lens = np.array([len(x) for x in nb]); rows = np.repeat(np.arange(len(U)), lens); cols = np.concatenate(nb) if len(nb) else np.array([], int)
    order = np.argsort(cols, kind='stable'); rows, cols = rows[order], cols[order]
    starts = np.searchsorted(cols, np.arange(len(cand) + 1))
    cov = [rows[starts[i]:starts[i + 1]] for i in range(len(cand))]
    gain = np.array([P[c].sum() for c in cov])
    covered = np.zeros(len(U), bool); chosen = []
    heap = [(-gv, i) for i, gv in enumerate(gain) if gv > 0]; heapq.heapify(heap)
    got = 0.0
    while heap and got / tot < target and len(chosen) < max_n:
        ng, i = heapq.heappop(heap)
        c = cov[i]; real = P[c[~covered[c]]].sum()
        if heap and real < -heap[0][0] - 1e-6:
            if real > 0: heapq.heappush(heap, (-real, i))
            continue
        if real <= 0: break
        chosen.append((i, real)); covered[c] = True; got += real
    cum = np.cumsum([g_ for _, g_ in chosen]) / tot
    steps = {str(p): int(np.searchsorted(cum, p / 100) + 1) if cum[-1] >= p / 100 else None for p in (50, 75, 90, 95)}
    return chosen, cum, steps

def scenarios(D, keep_stations):
    U = demand_units(D); out = {}
    for R in (5, 10, 15):
        chosen, cum, steps = site(U, R)
        st = cand.iloc[[c for c, _ in chosen]]
        rec = {'radius_km': R, 'approx_minutes': round(R * MIN_PER_KM), 'n': len(chosen),
               'coverage': round(float(cum[-1]), 4), 'steps': steps,
               'curve': [round(float(x), 4) for x in cum[::max(1, len(cum) // 200)]],
               'by_state': st.groupby('state').size().to_dict()}
        if keep_stations:
            rec['stations'] = [[round(r.latitude, 4), round(r.longitude, 4), int(round(g_)),
                                str(r.facility_name) if isinstance(r.facility_name, str) else '', r.state, r.lga,
                                1 if r.pub_referral else 0] for (ci, g_), (_, r) in zip(chosen, st.iterrows())]
        out[str(R)] = rec
        print(('grid' if D is GD else 'ward'), 'R', R, 'stations', len(chosen), steps)
    return out

scen = scenarios(PRIMARY, True)
scen_w = scenarios(WD, False) if PRIMARY is not WD else None

# ---------- state table ----------
states = []
for s, sub in PRIMARY.groupby('state'):
    fs = g[g.state == s]
    pop = float(sub['pop'].sum())
    ws = WD[WD.state == s]
    rec = {'state': s, 'pop2025': round(pop),
           'facilities': int(len(fs)), 'no_coords': int((~fs.has_coords).sum()),
           'primary': int(fs.level.eq('Primary').sum()), 'secondary': int(fs.level.eq('Secondary').sum()),
           'tertiary_level': int(fs.level.eq('Tertiary').sum()),
           'referral': int(fs.referral.sum()), 'pub_referral': int(fs.pub_referral.sum()),
           'public': int(fs.ownership.eq('Public').sum()), 'private': int(fs.ownership.eq('Private').sum()),
           'functional': int(fs.functional_status.eq('Functional').sum()),
           'per100k_fac': round(len(fs) / pop * 1e5, 1),
           'per100k_pubref': round(fs.pub_referral.sum() / pop * 1e5, 2),
           'bands_pubref': bands(sub, 'd_pubref'),
           'mean_km_pubref': round(float(np.average(sub.d_pubref, weights=sub['pop'])), 1),
           'share_over20_pubref': round(float(sub['pop'][sub.d_pubref >= 20].sum() / pop), 4),
           'share_over40_tert': round(float(sub['pop'][sub.d_tert >= 40].sum() / pop), 4),
           'stations': {k: int(v['by_state'].get(s, 0)) for k, v in scen.items()},
           'ambulances_norm100k': int(math.ceil(pop / 1e5)),
           'ambulances_norm50k': int(math.ceil(pop / 5e4))}
    if scen_w is not None and len(ws):
        rec['ward_method'] = {'share_over20_pubref': round(float(ws['pop'][ws.d_pubref >= 20].sum() / ws['pop'].sum()), 4),
                              'mean_km_pubref': round(float(np.average(ws.d_pubref, weights=ws['pop'])), 1),
                              'stations': {k: int(v['by_state'].get(s, 0)) for k, v in scen_w.items()}}
    states.append(rec)
states.sort(key=lambda r: r['state'])

nat = {'pop2025': round(TOT), 'facilities': int(len(g)), 'with_coords': int(g.has_coords.sum()),
       'mapped': int(len(geo)), 'primary': int(g.level.eq('Primary').sum()),
       'secondary': int(g.level.eq('Secondary').sum()), 'tertiary_level': int(g.level.eq('Tertiary').sum()),
       'unknown_level': int(g.level.eq('Unknown').sum()),
       'referral': int(g.referral.sum()), 'pub_referral': int(g.pub_referral.sum()),
       'pub_referral_mapped': int(len(ref)), 'tertiary': int(g.tertiary.sum()),
       'bands_pubref': bands(PRIMARY, 'd_pubref'), 'bands_anyref': bands(PRIMARY, 'd_anyref'),
       'bands_tert': bands(PRIMARY, 'd_tert'), 'bands_anyfac': bands(PRIMARY, 'd_anyfac'),
       'mean_km_pubref': round(float(np.average(PRIMARY.d_pubref, weights=PRIMARY['pop'])), 1),
       'ambulances_norm100k': int(math.ceil(TOT / 1e5)), 'ambulances_norm50k': int(math.ceil(TOT / 5e4)),
       'types': g.facility_type.value_counts().to_dict(),
       'ownership': g.ownership_type.fillna('Not recorded').value_counts().to_dict(),
       'functional': g.functional_status.fillna('Not recorded').value_counts().to_dict()}
comparison = None
if scen_w is not None:
    comparison = {'label': 'Ward method (population placed at one point per ward)',
                  'bands_pubref': bands(WD, 'd_pubref'), 'bands_tert': bands(WD, 'd_tert'),
                  'mean_km_pubref': round(float(np.average(WD.d_pubref, weights=WD['pop'])), 1),
                  'pop2025': round(float(WD['pop'].sum())),
                  'scenarios': {k: {'n': v['n'], 'steps': v['steps'], 'coverage': v['coverage']} for k, v in scen_w.items()}}
import datetime
analysis = {'built': datetime.date.today().isoformat(), 'band_labels': BLAB,
            'population': {'product': 'WorldPop Global2 R2025A v1, constrained, 1 km, 2025',
                           'file': 'nga_pop_2025_CN_1km_R2025A_UA_v1.tif', 'doi': '10.5258/SOTON/WP00840',
                           'note': 'National total aligned to UN World Population Prospects 2024 (1 January estimate)',
                           'method': 'grid' if GD is not None else 'ward'},
            'assumptions': {'circuity': CIRCUITY, 'speed_kmh': SPEED, 'min_per_km': MIN_PER_KM,
                            'station_hosts': 'public facilities not recorded as closed or non-functional',
                            'demand': ('1 km WorldPop grid cells; stations sited on population-weighted ~2.75 km cells'
                                       if GD is not None else 'ward population placed at the median position of the ward\'s facilities'),
                            'target_coverage': 0.95},
            'national': nat, 'states': states, 'scenarios': scen, 'comparison': comparison}
json.dump(analysis, open(f'{OUT}/analysis.json', 'w'), separators=(',', ':'))

wp = [[round(r.latitude, 4), round(r.longitude, 4), int(round(r.ward_pop_2025)), r.ward_name, r.lga, r.state,
       round(dp, 1), round(dt, 1)] for r, dp, dt in zip(w.itertuples(), WD.d_pubref.values, WD.d_tert.values)]
json.dump({'fields': ['lat', 'lon', 'pop2025', 'ward', 'lga', 'state', 'km_public_referral', 'km_tertiary'],
           'rows': wp}, open(f'{OUT}/wards.json', 'w'), separators=(',', ':'), ensure_ascii=False)
for R in (5, 10, 15):
    pd.DataFrame(scen[str(R)]['stations'], columns=['lat', 'lon', 'pop_added', 'host_facility', 'state', 'lga', 'host_is_referral']) \
      .to_csv(f'{OUT}/proposed_stations_{R}km.csv', index=False)
far = (nat['bands_pubref'][3] + nat['bands_pubref'][4]) / TOT
print('far share', round(far, 4), 'mean', nat['mean_km_pubref'])
