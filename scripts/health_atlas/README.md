# Nigeria Health Atlas — build

Rebuilds `health-atlas/data/` (facilities, ward distances, ambulance-station scenarios).

```
git clone --depth 1 https://github.com/Kemabonta/nigeria-health-facilities-ward-ear /tmp/src
pip install pandas scikit-learn
python scripts/health_atlas/build.py \
  /tmp/src/data/nigeria_health_facilities_combined_v1.0.csv \
  /tmp/src/data/ward_ear_2025_with_facility_counts.csv \
  health-atlas/data
```

Only the GRID3 NGA Health Facilities v4.0 rows of the combined file are used (70,235 records,
checked against the live GRID3 service by state and level on 7 Nov 2026). The ward table supplies
WorldPop 2025 population on GRID3 operational wards v4.0. When GRID3 publishes a new release,
check the counts again before rebuilding.
