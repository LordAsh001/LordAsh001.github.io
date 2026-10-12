# Nigeria Energy Atlas — data bots

The atlas reads its refreshable data from `energy-atlas/data/*.json`. GitHub Actions bots on the website repository keep those files current. If a file is missing or a bot fails, the page falls back to the values built into `index.html`, so the site never breaks.

| Bot (workflow) | What it updates | Source | Schedule | Why this frequency |
|---|---|---|---|---|
| `energy-atlas-generation.yml` | Electricity generation by source, 2000–latest (History tab, gas-share tile) | Our World in Data CSV (Ember + Energy Institute), CC BY 4.0 | Weekly, Mon 05:23 UTC | Ember revises annual data a few times a year |
| `energy-atlas-worldbank.yml` | Access (national/urban/rural), clean cooking, kWh per person, renewable share, T&D losses | World Bank Indicators API, CC BY 4.0 | Monthly, 3rd at 06:41 UTC | WDI updates several times a year |
| `energy-atlas-nerc.yml` | "Latest NERC publications" list (Grid watch) + GitHub issue for each new document | nerc.gov.ng resource pages (robots.txt permits) | Daily, 07:11 UTC | NERC posts monthly factsheets, quarterly reports and orders |
| `energy-atlas-news.yml` | "News radar — unverified" list (Grid watch) + GitHub issue for possible grid collapses | GDELT 2.0 news index API | Every 6 hours | Collapses are sudden events |
| `energy-atlas-quarterly-review.yml` | Checklist issue for hand-curated data (NERC quarterly figures, collapses, projects, reserves, indices, WEF Nexus) | — | 1 Jan/Apr/Jul/Oct | Those sources publish PDFs/images with no data feed |

## What is deliberately *not* automated

- **Live grid output (NISO / niggrid.org):** the operator's robots.txt forbids automated access and there is no public API. The atlas links to the live dashboards instead. If NISO (or nigeriapowerdata.com) grants permission or an API, add a bot here.
- **Figures inside NERC PDFs** (ATC&C losses, collapse tables, available capacity): layouts change between reports, so automatic extraction would risk publishing wrong numbers. The NERC bot opens an issue; a person enters the verified figures.
- **News items** are never added to the official collapse timeline automatically. They show as "unverified" until checked against NERC/NISO.

## Install (once)

1. Copy into the root of the website repository (the one GitHub Pages serves shagbaor.com from):
   - `energy-atlas/` → replaces the atlas page and adds `data/`
   - `scripts/energy_atlas/`
   - `.github/workflows/energy-atlas-*.yml`
   - `tests/test_bots.py` (optional)
2. Repository **Settings → Actions → General → Workflow permissions**: choose **Read and write permissions**.
3. **Actions** tab → open each "Energy Atlas bot" workflow → **Run workflow** once to test it.
4. Make sure **Issues** are enabled (Settings → General → Features) so the review issues can be opened. Turn on GitHub notifications for issues to get alerts.

Notes
- Bot commits are made by `energy-atlas-bot`. If your Pages site is built by a custom Actions workflow rather than "Deploy from a branch", add `workflow_run` on these workflows to that deploy workflow, because pushes made with `GITHUB_TOKEN` do not start other workflows.
- GitHub pauses scheduled workflows in a repository with no activity for 60 days. The bots' own commits usually keep it active; if a pause happens, re-enable the workflows from the Actions tab.
- Run the offline tests with `python tests/test_bots.py`. They need no network access.
