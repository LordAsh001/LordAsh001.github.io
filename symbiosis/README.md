# Symbiosis Workbench

An evidence-based industrial symbiosis tool:

- **Park builder:** design an eco-industrial park. The emission factors come from sources and are cited.
- **Waste catalogue:** 129 industrial waste streams, each keyed to the EU List of Waste.
- **Case atlas:** 19 documented case studies.
- **Learn & quiz:** the theory, with a self-check quiz.
- **Sources:** 230 references.

It is a static site, so it runs on GitHub Pages with no build step and no server.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure, SEO and social-sharing tags |
| `app.css` | All styles (light and dark themes, print styles) |
| `app.js` | Application code |
| `data.js` | The evidence base: waste streams, cases, references, repositories |
| `sw.js` | Service worker for offline use (stale-while-revalidate) |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Installable app (PWA) metadata and icons |
| `og-image.png` | Preview image for links shared on LinkedIn, X or WhatsApp |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Publish on GitHub Pages

### Option A: its own repository (address: `https://<username>.github.io/symbiosis-workbench/`)

1. On GitHub, create a new public repository, for example `symbiosis-workbench`.
2. Click **Add file → Upload files**, drag in **everything in this folder** (including `.nojekyll`), and commit.
3. Open **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, then branch `main` and folder `/ (root)`, and save.
4. After a minute or two the site is live at the address GitHub shows.

### Option B: inside your existing GitHub Pages site (address: `https://<username>.github.io/symbiosis/`)

1. In your site's repository, create a folder, for example `symbiosis/`.
2. Upload all the files from this folder into it and commit.
3. Link to it from your homepage, for example `<a href="symbiosis/">Symbiosis Workbench</a>`.

All paths are relative, so the tool works at any address.

## After publishing

- **Social preview:** in `index.html`, change `og:image` to the full address, for example `https://<username>.github.io/symbiosis-workbench/og-image.png`. LinkedIn and some other sites need a full URL.
- **Footer and citation:** edit the `CONFIG` block at the top of `app.js` to set the author, affiliation, version and a `repoUrl`. If you set `repoUrl`, the footer shows a "Source code on GitHub" link.
- **Updates:** whenever you upload changed files, raise `VERSION` in `sw.js` (for example `sw-3.0.1`). Returning visitors then get the new version instead of the copy saved for offline use.

## Deep links you can share

Every view has its own address, so the browser's back and forward buttons work:

- `#/catalogue/coal_fly_ash`: one waste stream
- `#/catalogue?recv=Animal%20feed&trl=Commercial`: a filtered catalogue
- `#/cases/kalundborg`: one case study
- `#/learn/regulation`: one section of the lesson
- `#/sources/chertow2007`: one reference

## Keyboard

- `Ctrl/⌘ K` search everything
- `1`–`5` switch sections
- `J`/`K` next or previous stream or case
- `S` save
- `B` saved items and history
- `T` change theme
- `?` all shortcuts
- `Ctrl/⌘ Z` undo in the builder

## Data and licence

The evidence base cites its sources. Figures and statements belong to their original authors, so keep the citations when you reuse them. Add a `LICENSE` file for the code if you want others to reuse it (MIT is a common choice).
