# Techno-Economic Studio

A guided techno-economic assessment (TEA) tool that runs entirely in the browser.

## Files
- `index.html` — the whole application (HTML, CSS and JavaScript in one file)
- `tea-library.json` — the published-TEA library used by the explorer and benchmarks (loaded on demand, about 2 MB)

Both files must sit in the same folder.

## Hosting on GitHub Pages
1. This folder is published at `/tea-studio/` on the site.
Live at https://lordash001.github.io/tea-studio/

## Notes
- No server or database is needed. Projects are kept in the visitor's browser and can be saved as `.tea.json` files or shared as links.
- PDF, Word and Excel exports load small libraries from cdnjs.cloudflare.com and cdn.jsdelivr.net on first use.
- The Claude assistant panel only works inside Claude; on the website every other feature works without it.
- Bibliographic records come from Scopus (© Elsevier B.V.) and Web of Science (© Clarivate). Check that your institution's licence allows public display before publishing.
