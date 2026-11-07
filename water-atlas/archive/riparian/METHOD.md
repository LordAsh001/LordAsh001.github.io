# Riparian pump-irrigation potential of Nigeria's rivers that flow all year

Part of the Nigeria Water Resources Atlas (https://shagbaor.com/water-atlas/#irrig).
Author: Shagbaor Hycent Amool.

## Question

How much land along the banks of Nigeria's rivers that flow all year could be irrigated in the dry
season by pumping water directly from the river, if cultivation is limited to a strip of fixed width
(100, 250 or 500 m) on each bank?

## Answer, per river reach

    potential = min(land limit, water limit)

* **Land limit**: hectares inside the strip that are cropland, grassland or shrubland (and bare ground and
  herbaceous wetland in the optimistic case), lie on gentle slopes, sit low enough above the river to pump
  cheaply, are outside mapped protected areas, and are inside Nigeria.
* **Water limit**: (lowest monthly river flow x (1 - share reserved for the river) - water already taken
  upstream) / peak gross crop water need.

Results are summed by state, river basin and named river, for nine scenarios: three strip widths x three
assumption sets (low, central, high).

## Data (all open)

| Input | Dataset | Used for |
|---|---|---|
| River reaches, flows, climate | RiverATLAS v1.0 (Linke et al. 2019, doi:10.1038/s41597-019-0300-6) | Reach lines (HydroRIVERS), long-term natural mean and lowest monthly flow (dis_m3_pyr, dis_m3_pmn; WaterGAP 1971-2000), monthly rainfall and potential evapotranspiration of each reach's catchment, reach connectivity (NEXT_DOWN) |
| Elevation | Copernicus DEM GLO-30 (doi:10.5069/G9028PQB) | Slope and height above the river |
| Land cover | ESA WorldCover 10 m 2021 v200 (doi:10.5281/zenodo.7254221) | Open water (true channel position) and land cover in the strips |
| Protected areas | Polygons in the Nigeria Forest Reserves Atlas (WDPA and state records) | Excluded |
| States, basins | geoBoundaries ADM1 and HydroBASINS, as used by the atlas | Totals |

## Steps

1. **Rivers that flow all year.** A RiverATLAS reach inside Nigeria qualifies if its lowest long-term monthly
   natural flow is at least 0.1 m3/s. Reaches whose catchment is at least 50% lake or reservoir are treated as
   shoreline, not river.
2. **Channel position.** RiverATLAS lines are derived from a 500 m elevation model and can lie a few hundred
   metres from the real channel. Open water mapped by WorldCover within 600 m of a line is taken as the
   channel; if a reach has at least one such water pixel per line pixel, only the mapped water is used,
   otherwise the line itself.
3. **Strips.** On the 1-arc-second (about 30 m) Copernicus grid, the distance of every pixel from the nearest
   channel pixel is computed (Euclidean distance transform, metres). Each pixel is assigned to the reach of its
   nearest channel pixel, so land is never counted twice. Strip bands: up to 100, 250 and 500 m.
4. **Land screening.** Every strip pixel is classed by land cover, slope (breaks 2, 5, 8 %) and height above
   the river (pixel elevation minus the lowest elevation within 75 m of the nearest channel pixel; breaks 5, 10,
   15 m). Tree cover, mangrove, built-up land, open water and protected areas are never counted.
5. **Crop water need.** For each reach and month: net need = Kc x PET - effective rain (FAO dependable rain:
   0.8P - 25 if P > 75 mm, otherwise max(0, 0.6P - 10)). The largest monthly value (in mm/day) is the peak;
   gross need = net / irrigation efficiency, converted to L/s per hectare (1 mm/day = 0.1157 L/s/ha).
6. **Water limit and routing.** Reaches are processed from the smallest upstream catchment to the largest.
   Each reach may use its lowest monthly flow minus the reserved share minus everything pumped upstream.
   Return flows are ignored, so the result is conservative.
7. **Scenarios** (all in config.json):

| | Low | Central | High |
|---|---|---|---|
| Land cover counted | cropland, grassland | + shrubland | + bare ground, herbaceous wetland |
| Maximum slope | 2 % | 5 % | 8 % |
| Maximum height above river | 5 m | 10 m | 15 m |
| Irrigation efficiency | 0.50 | 0.60 | 0.75 |
| Crop coefficient at peak | 1.15 | 1.05 | 0.95 |
| Share of dry-month flow left in the river | 50 % | 30 % | 20 % |

## Reproduce

    pip install -r .github/scripts/riparian-requirements.txt
    # download and unzip RiverATLAS_Data_v10.gdb.zip (url in config.json)
    python3 .github/scripts/water_atlas_riparian.py all --gdb RiverATLAS_v10.gdb --work /tmp/rip

or run the GitHub Actions workflow "Riparian pump-irrigation potential". Change any number in
config.json and rerun to test a different assumption. Package versions are pinned; dataset versions and
DOIs are listed above and in config.json. Outputs: water-atlas/data/riparian.json (totals),
water-atlas/data/riparian_reaches.json (map), and reaches.csv / states.csv in this folder.

## Limitations

* Flows are modelled natural long-term flows (WaterGAP, 1971-2000), not gauge measurements, and ignore
  dams, current abstractions, climate change and abstraction in upstream countries. Below large dams the
  real dry-season flow depends on releases.
* The lowest monthly flow is compared with the peak monthly crop need even when the two fall in different
  months, which errs on the cautious side.
* Soil suitability, land tenure, flooding of the strips in the wet season, access, energy and pump costs
  are not assessed. Groundwater is not included.
* Copernicus DEM is a surface model (it includes trees and buildings); WorldCover has known class errors.
* Protected areas known only as points are not excluded.
* Named-river totals use the atlas's river lines, which do not cover every river's full course.

This is a screening estimate, not an engineering design. Field checks are needed before any investment.
