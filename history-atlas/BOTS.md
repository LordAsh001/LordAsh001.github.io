# Nigeria History Atlas: update bots

The page reads `history-atlas/data/records.json` and `news.json` when it loads. If they are missing, it falls back to the records built into the page.

| Workflow | What it does | Schedule |
|---|---|---|
| `history-atlas-news.yml` → `scan_news.py` | Collects headlines about local government in each state from the GDELT index. Stores headline, publisher, date and link only. Headlines naming an LGA and a chairman become candidates. | Tuesdays |
| `history-atlas-wikipedia.yml` → `scan_wikipedia.py` | Looks for creation statements on the Wikipedia page of each LGA without a documented date. | 4th of each month |
| `history-atlas-sites.yml` → `scan_sites.py` | Reads the state and LGA government sites in `scripts/history_atlas/sources.json`, following links to LGA and history pages. Respects robots.txt. Records failures in `data/site_status.json`. | 11th of each month |
| `history-atlas-approved.yml` → `apply_approved.py` | Publishes what you approve in `data/approved.txt`. | When that file changes |

## What is published automatically, and what isn't

- **Automatic:** a creation date, when two independent non-directory sites give the same year. A documented date is never overwritten. A differing date is added beside it as a conflict.
- **Automatic:** news headlines on state pages, labelled as collected automatically.
- **Waiting for you:** everything else, including every chairman's name. Text matching can misread a page, and these are named people on a public site.

## How to review

Each run opens an issue with the `history-atlas` label. To act on it, edit `history-atlas/data/approved.txt` on GitHub and commit:

```
a1b2c3d4e5                        approve a creation date
f6a7b8c9d0 | Full Name | elected  approve a chairman from a headline (or caretaker)
reject 0a1b2c3d4e                 never suggest this again
```

## Adding sources

Add any site to `scripts/history_atlas/sources.json`:

```json
{"state": "Yobe", "url": "https://example.gov.ng/lgas/", "lga": null, "kind": "found"}
```

Set `lga` when the page is about one LGA. Entries with `"kind": "guess"` follow the usual address pattern and may not exist. PDFs and Word files are not read, and the issue lists them for you to open. The list of directory sites treated as unconfirmed is `DIRECTORY_DOMAINS` in `common.py`.

## Install notes

- Workflow permissions must be Read and write (already the case for the other atlases).
- To test a bot, open the Actions tab, choose a "History Atlas bot" workflow and press Run workflow.
- Offline tests: `python tests/test_history_bots.py` (no network needed).
