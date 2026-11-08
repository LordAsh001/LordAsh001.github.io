"""Nigeria Health Atlas: build data files and ambulance-coverage analysis.

Inputs
  GRID3 NGA Health Facilities v4.0 (CIESIN, CC BY 4.0), 70,235 records; read here from the
  Kemabonta (2026) combined layer, GRID3 rows only (verified identical to the live service by
  state x level counts on 2026-11-07).
  Ward population 2025 (WorldPop, aggregated to GRID3 operational wards v4.0) from the same release.
Outputs (site/health-atlas/data/)
  facilities.json, wards.json, analysis.json, CSV downloads.
"""
import json, math, sys
import numpy as np, pandas as pd
from sklearn.neighbors import BallTree

SRC = sys.argv[1]; WARDS = sys.argv[2]; OUT = sys.argv[3]
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

def tree(df):
    return BallTree(np.radians(df[['latitude', 'longitude']].values), metric='haversine')
def nearest_km(t, df):
    dist, ind = t.query(np.radians(df[['latitude', 'longitude']].values), k=1)
    return dist[:, 0] * R_EARTH, ind[:, 0]

ref = geo[geo.pub_referral].reset_index(drop=True)
anyref = geo[geo.referral].reset_index(drop=True)
ter = geo[geo.tertiary].reset_index(drop=True)
w['d_pubref'], _ = nearest_km(tree(ref), w)
w['d_anyref'], _ = nearest_km(tree(anyref), w)
w['d_tert'], _ = nearest_km(tree(ter), w)
w['d_anyfac'], _ = nearest_km(tree(geo), w)

BANDS = [0, 5, 10, 20, 40, 1e9]
BLAB = ['<5 km', '5-10 km', '10-20 km', '20-40 km', '>40 km']
def bands(sub, col):
    out = []
    for lo, hi in zip(BANDS[:-1], BANDS[1:]):
        out.append(round(float(sub.ward_pop_2025[(sub[col] >= lo) & (sub[col] < hi)].sum())))
    return out

# ---------- station siting: greedy maximal covering ----------
cand = geo[geo.ownership.eq('Public') & ~geo.functional_status.isin(['Not-Functional', 'Closed'])].reset_index(drop=True)            # public facilities as station hosts
ctree = tree(cand)
def site(radius_km, target=0.95, max_n=6000):
    nb = ctree.query_radius(np.radians(w[['latitude', 'longitude']].values), r=radius_km / R_EARTH)
    # invert: candidate -> demand wards
    cov = [[] for _ in range(len(cand))]
    for wi, cs in enumerate(nb):
        for c in cs: cov[c].append(wi)
    cov = [np.array(c, dtype=np.int32) for c in cov]
    gain = np.array([POP[c].sum() if len(c) else 0.0 for c in cov])
    covered = np.zeros(len(w), bool); chosen = []
    # lazy greedy
    import heapq
    heap = [(-gv, i) for i, gv in enumerate(gain) if gv > 0]; heapq.heapify(heap)
    got = 0.0
    while heap and got / TOT < target and len(chosen) < max_n:
        ng, i = heapq.heappop(heap)
        c = cov[i]; real = POP[c[~covered[c]]].sum() if len(c) else 0
        if heap and real < -heap[0][0] - 1e-6:
            if real > 0: heapq.heappush(heap, (-real, i))
            continue
        if real <= 0: break
        chosen.append((i, real)); covered[c] = True; got += real
    return chosen, covered

scen = {}
for R in (5, 10, 15):
    chosen, covered = site(R)
    st = cand.iloc[[c for c, _ in chosen]]
    cum = np.cumsum([g_ for _, g_ in chosen]) / TOT
    # how many stations to reach 50/75/90/95%
    steps = {str(p): int(np.searchsorted(cum, p / 100) + 1) if cum[-1] >= p / 100 else None for p in (50, 75, 90, 95)}
    stations = []
    for (ci, gain_), (_, r) in zip(chosen, st.iterrows()):
        stations.append([round(r.latitude, 4), round(r.longitude, 4), int(round(gain_)),
                         str(r.facility_name) if isinstance(r.facility_name, str) else '', r.state, r.lga,
                         1 if r.pub_referral else 0])
    by_state = st.groupby('state').size().to_dict()
    scen[str(R)] = {'radius_km': R, 'approx_minutes': round(R * MIN_PER_KM), 'n': len(chosen),
                    'coverage': round(float(cum[-1]), 4), 'steps': steps,
                    'curve': [round(float(x), 4) for x in cum[::max(1, len(cum) // 200)]],
                    'by_state': by_state, 'stations': stations}
    w[f'cov{R}'] = covered
    print('R', R, 'stations', len(chosen), 'coverage', round(cum[-1], 4), steps)

# ---------- state table ----------
states = []
for s, sub in w.groupby('state'):
    fs = g[g.state == s]
    pop = float(sub.ward_pop_2025.sum())
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
           'median_km_pubref': round(float(np.average(sub.d_pubref, weights=sub.ward_pop_2025)), 1),
           'share_over20_pubref': round(float(sub.ward_pop_2025[sub.d_pubref >= 20].sum() / pop), 4),
           'share_over40_tert': round(float(sub.ward_pop_2025[sub.d_tert >= 40].sum() / pop), 4),
           'stations': {k: int(v['by_state'].get(s, 0)) for k, v in scen.items()},
           'ambulances_norm100k': int(math.ceil(pop / 1e5)),
           'ambulances_norm50k': int(math.ceil(pop / 5e4))}
    # popn-weighted mean distance (rename to mean, keep key for compat)
    rec['mean_km_pubref'] = rec.pop('median_km_pubref')
    states.append(rec)
states.sort(key=lambda r: r['state'])

nat = {'pop2025': round(TOT), 'facilities': int(len(g)), 'with_coords': int(g.has_coords.sum()),
       'mapped': int(len(geo)), 'primary': int(g.level.eq('Primary').sum()),
       'secondary': int(g.level.eq('Secondary').sum()), 'tertiary_level': int(g.level.eq('Tertiary').sum()),
       'unknown_level': int(g.level.eq('Unknown').sum()),
       'referral': int(g.referral.sum()), 'pub_referral': int(g.pub_referral.sum()),
       'pub_referral_mapped': int(len(ref)), 'tertiary': int(g.tertiary.sum()),
       'bands_pubref': bands(w, 'd_pubref'), 'bands_anyref': bands(w, 'd_anyref'),
       'bands_tert': bands(w, 'd_tert'), 'bands_anyfac': bands(w, 'd_anyfac'),
       'mean_km_pubref': round(float(np.average(w.d_pubref, weights=POP)), 1),
       'ambulances_norm100k': int(math.ceil(TOT / 1e5)), 'ambulances_norm50k': int(math.ceil(TOT / 5e4)),
       'types': g.facility_type.value_counts().to_dict(),
       'ownership': g.ownership_type.fillna('Not recorded').value_counts().to_dict(),
       'functional': g.functional_status.fillna('Not recorded').value_counts().to_dict()}
analysis = {'built': '2026-11-07', 'band_labels': BLAB,
            'assumptions': {'circuity': CIRCUITY, 'speed_kmh': SPEED, 'min_per_km': MIN_PER_KM,
                            'station_hosts': 'public facilities not recorded as closed or non-functional',
                            'demand': 'WorldPop 2025 ward population placed at the median position of the ward\'s GRID3 facilities (LGA median where a ward has none)',
                            'target_coverage': 0.95},
            'national': nat, 'states': states, 'scenarios': scen}
json.dump(analysis, open(f'{OUT}/analysis.json', 'w'), separators=(',', ':'))

wp = [[round(r.latitude, 4), round(r.longitude, 4), int(round(r.ward_pop_2025)), r.ward_name, r.lga, r.state,
       round(r.d_pubref, 1), round(r.d_tert, 1)] for r in w.itertuples()]
json.dump({'fields': ['lat', 'lon', 'pop2025', 'ward', 'lga', 'state', 'km_public_referral', 'km_tertiary'],
           'rows': wp}, open(f'{OUT}/wards.json', 'w'), separators=(',', ':'), ensure_ascii=False)
for R in (5, 10, 15):
    pd.DataFrame(scen[str(R)]['stations'], columns=['lat', 'lon', 'pop_added', 'host_facility', 'state', 'lga', 'host_is_referral']) \
      .to_csv(f'{OUT}/proposed_stations_{R}km.csv', index=False)
print(json.dumps(nat, indent=0)[:1500])
