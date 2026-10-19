# Market Atlas price bots

These scripts keep the prices in the Nigeria Market Atlas up to date. Once a day, GitHub Actions runs them, reads each public source, converts the prices to one format and saves the result to `market-atlas/data/`. The atlas page loads `data/prices-latest.json` when it opens. If that file is missing, the page uses the copy of the data built into it.

## What each bot reads

| Bot | Source | What it collects | Unit handling |
|---|---|---|---|
| `kasuwa_api` | Kasuwa (Agriarche) market pricing | Agent price records by market (Kumo, Lashe Money, Billiri, Giwa, Potiskum, Hadejia, Mubi…). Also open-market bag prices from Kaduna markets | ₦/kg as Kasuwa reports it, with bag size |
| `lagos_tracker` | Lagos State Ministry of Agriculture: Food Price Tracker (.xlsx) | Monthly averages for 10 Lagos markets, plus the 10-market average | Pack sizes taken from the item name (50 kg bag, 3.3 kg paint…) |
| `lcfe` | Lagos Commodities & Futures Exchange: market data | Dated ₦/kg prices by producing state | ₦/kg, ₦/litre |
| `ncx_ticker` | Nigeria Commodity Exchange: live ticker | Price by contract code. The last letters of the code give the state | ₦/kg is assumed because the ticker shows no unit. It shows no date either, so records are marked *undated* |
| `commodity_ng` | Commodity Nigeria: live prices | National 50 kg bag prices | 50 kg. Marked *undated*, low confidence |
| `avestack` | Avestack food price index | Wholesale prices with their main market | Taken from the unit text. Marked *undated*, low confidence |
| `opaindex` | Opaindex (re-publishes NBS) | New NBS Selected Food Prices Watch months | ₦/kg national |
| `wfp_hdx` | WFP food prices for Nigeria on HDX (CC BY-IGO) | Monthly market prices from WFP monitors (last 6 months) | Taken from the CSV unit column |

`export_prices.py` (a separate step) writes `export-prices.json` for the Export Camp tab:

| Source | What it collects |
|---|---|
| `wb_pinksheet` | World Bank Pink Sheet monthly averages (CC BY 4.0): cocoa, palm oil, groundnuts, soybeans, maize, sorghum, rice, wheat, sugar, cotton, rubber, in US$/t |
| `amis` | AMIS Market Monitor export quotations (FOB, US$/t) for maize, wheat, rice, soybeans and vegetable oils, read through the public data endpoint the AMIS site uses |

Nigerian export quotes (sesame, ginger, cashew…), specifications and rules are typed into the page and need a manual update.


## How the bots behave

- They identify themselves (`NigeriaMarketAtlasBot/1.0 (+https://shagbaor.com/market-atlas/)`) and obey each site's `robots.txt`. If a site disallows the bot, that source is skipped and its status says why.
- They wait 2 seconds between requests to the same site and run once a day.
- If one source fails, the others still update and the failed source keeps its last good data. `status.json` records the error, and the Tracker tab shows it under Data health.
- Every price keeps its source, date, unit and level (market, state or national), so the atlas can always show where a number came from.

## Set up (one time)

1. Copy `bots/`, `.github/workflows/market-atlas-bots.yml` and `market-atlas/` into the root of the website repository.
2. On GitHub, open **Settings → Actions → General** and set **Workflow permissions** to *Read and write*.
3. Open **Actions → Market Atlas price bots → Run workflow** for the first run. After that it runs every day at 05:17 UTC.
4. Note that GitHub pauses scheduled workflows in repositories with no commits for 60 days. The bot's own daily commits normally keep the schedule active.

## Run locally

```bash
pip install -r bots/requirements.txt
python -m pytest bots/tests -q             # parser tests
python bots/collect.py --out market-atlas/data
python bots/collect.py --only lcfe,kasuwa_api   # refresh only some sources
```

## When a site changes its layout

The bot for that site will log `page read, but no prices recognised`. Each parser is a small function in `sources.py` (`parse_lcfe`, `parse_avestack`…), and each has a test in `tests/test_parsers.py` built from the layout seen in October 2026. Update the parser and the test together.

To add a market the bots don't recognise, add it to `markets.json` and to `MARKETS_RAW` in the atlas. Until then, its prices are filed under the state.

## Using the data

Credit each source as the atlas does. Kasuwa, LCFE, NCX, Commodity Nigeria and Avestack publish these prices on public pages but don't state reuse terms. Before you publish the data beyond the atlas, check their terms or ask them. The WFP data is CC BY-IGO.

## Market-day calendar: community reports on the website

On claude.ai, the calendar saves reports to the artifact's shared store. Your website is a static GitHub Pages site and can't save anything itself. Instead it sends reports through a free Tally form, and a bot turns them into `market-atlas/data/market-days.json` each day.

1. **Create the form.** In Tally, make a form with these **hidden fields**, spelled exactly like this:
   `name, localName, state, lga, anchor, cycle, goods, notes, lat, lng, locMethod, reporterDistanceKm, updates, confirmDate`.
   Add a short visible line such as "Press Submit to send your market report". The atlas fills in all the hidden fields before it opens the form.
2. **Connect the form to the atlas.** Publish the form and copy its link (for example `https://tally.so/r/abcd12`). Open `market-atlas/index.html`, find the line `const TALLY_FORM_URL = "";` and paste the link between the quotes.
3. **Give the bot access to the form.** In Tally, open Settings → API keys and create a key. On GitHub, open Settings → Secrets and variables → Actions, add a **secret** `TALLY_API_KEY` with that key, and add a **variable** `TALLY_FORM_ID` with the form id (`abcd12`).
4. **Check the first run.** The workflow then runs `bots/market_days.py` every day. Its connection to the Tally API is written from Tally's public API format but hasn't been run against a real form yet. Check the first workflow run, and adjust `fetch_submissions` if Tally's response differs.

How the bot handles reports:
- A new report is added as *reported*.
- A second report, or a "held on" confirmation, marks the market *confirmed*. A later confirmed date also moves the market's dates forward to match it.
- Reports that would put a market day in the future, or that miss the name, state, LGA or cycle, are dropped.
- To remove spam or a duplicate, add its Tally submission id to `bots/market_days_blocklist.txt`.
- Reporters' own positions are never sent. Only their distance from the market is recorded.

## Fuel prices: community reports

The fuel tracker in the Logistics tab shows NNPC pump prices by state, depot prices, NBS monthly averages and black-market prices. Black-market prices come only from what people report. On the website, reports go to a second Tally form (`tally.so/r/xXk2Zy`), and `bots/fuel_reports.py` turns them into `market-atlas/data/fuel-reports.json` every day.

- The bot uses the same `TALLY_API_KEY` secret as the market-day bot; the form id is set in the workflow.
- It keeps reports from the last 90 days. A report is dropped if its state isn't recognised or its price is outside a sensible range (₦300–₦6,000 for petrol).
- To remove a bad report, add its submission id to `bots/fuel_reports_blocklist.txt`.
- The official prices (NNPC by state, depot prices, NBS) are typed into the page and need a manual update when new figures come out.
