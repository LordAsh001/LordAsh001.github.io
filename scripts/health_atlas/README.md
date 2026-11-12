# Nigeria Health Atlas — build

Rebuilds `health-atlas/data/` (facilities, distances, ambulance-station scenarios).
Runs automatically on GitHub Actions (`.github/workflows/health-atlas.yml`) when this script changes,
or on demand from the Actions tab. To run it yourself:

```
K=https://raw.githubusercontent.com/Kemabonta/nigeria-health-facilities-ward-ear/main/data
curl -L $K/nigeria_health_facilities_combined_v1.0.csv -o facilities.csv
curl -L $K/ward_ear_2025_with_facility_counts.csv -o wards.csv
curl -L https://data.worldpop.org/GIS/Population/Global_2015_2030/R2025A/2025/NGA/v1/1km_ua/constrained/nga_pop_2025_CN_1km_R2025A_UA_v1.tif -o pop.tif
pip install numpy pandas scikit-learn tifffile imagecodecs shapely
python scripts/health_atlas/build.py facilities.csv wards.csv health-atlas/data pop.tif energy-atlas/data/nigeria-states.geojson
```

Sources
- GRID3 NGA Health Facilities v4.0 (CIESIN, CC BY 4.0): the GRID3 rows of the Kemabonta (2026) copy,
  checked against the live GRID3 service by state and level on 7 Nov 2026.
- WorldPop Global2 R2025A v1, constrained, 1 km, 2025 (DOI 10.5258/SOTON/WP00840); national total aligned
  to UN WPP 2024 (1 January). The Kemabonta ward table sums to the same total and is kept as a comparison
  and for the ward layer.
- State boundaries: geoBoundaries, via energy-atlas/data/nigeria-states.geojson.
