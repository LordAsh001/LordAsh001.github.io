# Nigeria Diaspora Atlas — data bots

The atlas reads its refreshable data from `diaspora-atlas/data/*.json`. GitHub Actions bots on this repository keep those files current. If a file is missing or a bot fails, the page falls back to the figures built into `index.html`, so the site never breaks.

| Bot (workflow) | What it updates | Source | Schedule |
|---|---|---|---|
| `diaspora-atlas-data.yml` → `fetch_eurostat.py` | `eurostat.json`: people born in Nigeria (or Nigerian citizens) in every EU and EFTA country, 1 January. Fills Germany, France and the Netherlands, which have no UN figure | Eurostat `migr_pop3ctb`, `migr_pop1ctz` (CC BY 4.0) | Monthly, 9th 05:37 UTC |
| … → `fetch_us_acs.py` | `us_acs.json`: Nigeria-born people in the US, newest American Community Survey year. Finds the Nigeria line by its label, so a renumbered table doesn't break it | US Census Bureau API, table B05006 | Monthly |
| … → `fetch_uis.py` | `students.json`: Nigerian students in tertiary education in each host country, and the total abroad | UNESCO Institute for Statistics API | Monthly |
| … → `fetch_worldbank.py` | `remittances.json`: money received by Nigeria (US$ and % of GDP), average sending cost | World Bank Indicators API (CC BY 4.0) | Monthly |
| … → `fetch_bilateral.py` | `remittances_bilateral.json`: estimated money sent to Nigeria from each country (map's "Money sent home" view) | World Bank Data360, KNOMAD bilateral estimates | Monthly |
| … → `watch_un.py` | Opens an issue when the UN publishes a newer International Migrant Stock edition than the one in the page | UN DESA Population Division | Monthly |
| `diaspora-atlas-watch.yml` → `watch_sources.py` | Opens an issue quoting new sentences with figures on Nigerians abroad, and new pages about Nigeria, from the sources in `scripts/diaspora_atlas/sources.json` (ONS, Migration Observatory, Statistics Canada, ABS, MPI, Intelpoint, CONAPA, Nigerians in Queensland, countryeconomy, State House, NiDCOM, World Bank sending-cost pages, CanadaVisa, MarketReporters, CanadaVisaExpert). Each finding is labelled official, research, community or secondary | Those sites (robots.txt respected) | Weekly, Monday 06:17 UTC |
| `diaspora-atlas-checks.yml` → `check_directory.py` | Opens an issue listing embassy, consulate and association links that failed on two checks in a row | The links in `directory.json` | Monthly, 16th 07:13 UTC |
| … → `watch_emergency.py` | Opens an issue when the UK government's emergency-number advice for a country changes, quoting the new text beside the atlas's numbers | GOV.UK travel advice content API | Monthly, 16th |
| `diaspora-atlas-quarterly.yml` → `quarterly_review.py` | Checklist issue: ambassadors, open suggestions, countries without a data feed, sending costs, city figures, associations | — | 2 Jan/Apr/Jul/Oct |

Every issue carries the `diaspora-atlas` label, as do suggestions sent from the page's "Suggest a correction" form.

## What is changed automatically, and what isn't

- **Automatic:** figures read directly from official statistics services (Eurostat, US Census Bureau, UNESCO, World Bank). On the map, a national figure replaces the UN estimate only when it is at least as recent; the UN figure stays in the country profile.
- **Never automatic:** anything from the source watcher, the link checker or the emergency watcher. A person checks it first. This keeps a blog post or a page summary from overwriting an official number.

## How to act on an issue

- **New figure for a country without a feed** (for example UK, Canada, Australia, Ireland, the Gulf states): add it to `data/manual.json` under the country's ISO numeric code:
  ```json
  "124": {"name": "Canada", "value": 81290, "year": 2021, "basis": "B", "source": "Statistics Canada, Census 2021", "url": "https://..."}
  ```
  `basis` is `B` for people born in Nigeria or `C` for Nigerian citizens. Use official sources only; trace "secondary" findings back to the original.
- **Broken directory link or new ambassador:** edit the country's entry in `data/directory.json` (`w` = website, `head` = head of mission, `ck` = month checked, e.g. `"2027-01"`).
- **Emergency numbers changed:** check the GOV.UK page and Australia's Smartraveller page, then edit `data/emergency.json`.
- **New UN edition:** the base layer (`BUILTIN` in `index.html`) needs rebuilding from the UN's "Destination and origin" Excel file. Ask Claude to do it, giving it the issue link.

## Install notes

- Settings → Actions → General → Workflow permissions must be **Read and write** (already the case for the other atlases' bots).
- Optional: add a repository secret `CENSUS_API_KEY` (free from api.census.gov/data/key_signup.html) if the US Census API starts refusing requests without a key.
- To test a bot, open the Actions tab, choose a "Diaspora Atlas bot" workflow and press **Run workflow**. The first source-watcher and emergency-watch runs only record a baseline and open one "started" issue.
- Offline tests: `python tests/test_diaspora_bots.py` (no network needed).
