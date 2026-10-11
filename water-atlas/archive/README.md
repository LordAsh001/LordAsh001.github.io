# Nigeria Water Resources Atlas: data archive

Public history of the data shown on the [Nigeria Water Resources Atlas](https://shagbaor.com/water-atlas/), for planning, research and policy work. Browse and download it from the atlas's **Data & sources** page, or fetch the files directly.

- `catalogue.json`: every dataset with its description, fields, coverage, size, source and licence
- `river_flow/`: daily modelled river flow at each flood-watch gauge since 1984 (GloFAS v4 via Open-Meteo), one CSV per gauge, updated weekly
- `flood_alerts_glofas.csv`, `river_forecasts_geoglows.csv`, `flood_events_gdacs.csv`, `weather_warnings_nimet.csv`, `weather_forecasts_nimet.csv`: daily logs of the flood watch, kept since 10 October 2026
- `snapshots/YYYY-MM/`: a dated, gzip-compressed copy of every live atlas file, taken once a month

The files are updated automatically by `.github/scripts/water_atlas_archive.py`. Each source keeps its own licence (listed in the catalogue): credit the source when you reuse the data, and cite the archive as:

Amool, S. H. (2026). Nigeria Water Resources Atlas: data archive [Data set]. https://shagbaor.com/water-atlas/archive/
