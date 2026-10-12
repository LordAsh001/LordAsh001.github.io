// Builds the "Download all data" package for the Nigeria Energy Atlas.
//
//   node scripts/energy_atlas/build_package.mjs            -> energy-atlas/downloads/nigeria-energy-atlas-data.zip
//   node scripts/energy_atlas/build_package.mjs --release 1.0
//        -> also energy-atlas/downloads/nigeria-energy-atlas-v1.0.zip (application + data, for Zenodo)
//
// It reads the data embedded in energy-atlas/index.html plus the bot-refreshed files in
// energy-atlas/data/, so the package always matches what the atlas shows. Node.js only, no packages.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = process.env.ATLAS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ATLAS = path.join(ROOT, "energy-atlas");
const OUT = path.join(ATLAS, "downloads");
const args = process.argv.slice(2);
const release = args.includes("--release") ? args[args.indexOf("--release") + 1] : null;

// ---------- load the atlas data ----------
const html = fs.readFileSync(path.join(ATLAS, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const dataJs = scripts.find((s) => s.includes("const ASSETS_RAW"));
if (!dataJs) throw new Error("data block not found in index.html");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(dataJs.replace(/^(const|let) /gm, "var "), ctx);
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ATLAS, "data", f), "utf8")); } catch { return null; } };
const gen = readJSON("generation.json"), wdi = readJSON("wdi.json"), docs = readJSON("nerc_docs.json"),
  news = readJSON("grid_news.json"), states = readJSON("nigeria-states.geojson"), manifest = readJSON("manifest.json") || { datasets: {} };
if (gen?.years) ctx.GEN = Object.fromEntries(Object.entries(gen.years).map(([y, v]) => [y, v.slice(0, 4)]));
const WDI_CODES = {};
if (wdi?.series) for (const [k, s] of Object.entries(wdi.series)) { ctx.WDI[k] = s.values; WDI_CODES[k] = [s.indicator, s.label]; }

// ---------- helpers ----------
const csvCell = (v) => { if (v == null) return ""; const s = typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (header, rows) => "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const strip = (s) => String(s).replace(/<[^>]+>/g, "");
const today = new Date().toISOString().slice(0, 10);
const CATS = ctx.CATS;
const assets = ctx.ASSETS_RAW.map((r) => ({ id: r[0], name: r[1], category: CATS[r[2]].label, group: CATS[r[2]].group, state: r[3], lat: r[4], lon: r[5], capacity: r[6], unit: r[7], status: r[8], notes: r[9] }));

// ---------- files ----------
const files = {};
const add = (name, text) => { files[name] = Buffer.from(text, "utf8"); };
add("csv/energy_sites.csv", csv(Object.keys(assets[0]), assets.map(Object.values)));
add("csv/pipelines.csv", csv(["name", "status", "length", "notes", "route_wkt"], ctx.PIPELINES.map((p) => [p.name, p.status, p.length, p.note + " Route is schematic.", "LINESTRING(" + p.coords.map((c) => c[1] + " " + c[0]).join(", ") + ")"])));
add("csv/state_profiles.csv", csv(["state", "zone", "solar_ghi_band_kwh_m2_day", "wind_class", "disco", "disco_name", "electricity_regulator", "key_resources"],
  Object.entries(ctx.STATES).map(([n, s]) => [n, s.zone, s.solar, s.wind, s.disco, ctx.DISCOS[s.disco] || "", s.reg, s.res.join("; ")])));
add("csv/resource_potential.csv", csv(["resource", "estimated_potential_or_reserve", "where_concentrated", "current_use"], ctx.POT));
add("csv/generation_by_source_twh.csv", csv(["year", "gas", "hydro", "solar", "bioenergy", "total"], Object.entries(ctx.GEN).map(([y, v]) => [y, ...v, +v.reduce((a, b) => a + b, 0).toFixed(2)])));
const WDI_DEFAULT = { access: ["EG.ELC.ACCS.ZS", "Access to electricity (% of population)"], urban: ["EG.ELC.ACCS.UR.ZS", "Access to electricity, urban (%)"], rural: ["EG.ELC.ACCS.RU.ZS", "Access to electricity, rural (%)"], cooking: ["EG.CFT.ACCS.ZS", "Access to clean cooking (% of population)"], kwhpc: ["EG.USE.ELEC.KH.PC", "Electric power consumption (kWh per capita)"], renshare: ["EG.FEC.RNEW.ZS", "Renewable share of final energy (%)"], tdloss: ["EG.ELC.LOSS.ZS", "Transmission & distribution losses (% of output)"] };
add("csv/world_bank_indicators.csv", csv(["indicator_code", "indicator", "year", "value"],
  Object.entries(ctx.WDI).flatMap(([k, vals]) => Object.entries(vals).map(([y, v]) => [...(WDI_CODES[k] || WDI_DEFAULT[k] || [k, k]), y, v]))));
add("csv/nerc_quarterly.csv", csv(["quarter", "avg_available_generation_mw", "energy_generated_gwh", "atcc_loss_pct", "collection_efficiency_pct"], ctx.NERCQ));
add("csv/disco_atcc_losses_2026q1.csv", csv(["disco", "atcc_actual_pct", "myto_target_pct"], ctx.DISCO_ATCC));
add("csv/grid_collapses_per_year.csv", csv(["year", "total", "partial", "combined_no_split", "source", "source_url", "note"],
  ctx.COLLAPSES.map((c) => [c[0], c[1], c[2], c[3], ctx.COLLAPSE_SRC[c[4]][0], ctx.COLLAPSE_SRC[c[4]][1], (c[0] === 2026 ? "Year to date. " : "") + (c[5] || "")])));
add("csv/grid_events.csv", csv(["date", "type", "notes", "source_url"], ctx.EVENTS));
add("csv/petrol_import_share.csv", csv(["month", "imported_share_pct"], ctx.PETROL));
const nx = ctx.NEXUS;
add("csv/energy_indices.csv", csv(["index", "edition", "nigeria", "notes", "source_url"], [...ctx.INDICES,
  ["WEF Nexus Index", String(nx.year), `Score ${nx.overall[0]} · rank ${nx.overall[1]} of ${nx.of}`, `Water ${nx.water[0]} (#${nx.water[1]}), energy ${nx.energy[0]} (#${nx.energy[1]}), food ${nx.food[0]} (#${nx.food[1]})`, nx.src]]));
add("csv/wef_nexus_index.csv", csv(["year", "measure", "score_0_100", "rank", "countries_ranked", "source", "method_doi"],
  ["overall", "water", "energy", "food"].map((k) => [nx.year, k, nx[k][0], nx[k][1], nx.of, nx.src, nx.doi])));
add("csv/rise_scores.csv", csv(["pillar", "indicator", "score_0_100"], ctx.RISE.flatMap(([p, rows]) => rows.map((r) => [p, ...r]))));
add("csv/power_projects.csv", csv(["name", "level", "type", "states", "key_numbers", "start_year", "status", "status_as_of", "funder_implementer", "description", "source_url"], ctx.PROJECTS));
add("csv/headline_figures.csv", csv(["section", "value", "description", "source"], [
  ...ctx.STATS.map((s) => ["Overview", ...s.map(strip)]), ...ctx.GRID_FIGURES.map((s) => ["Grid watch", ...s]), ...ctx.SECURITY_FIGURES.map((s) => ["Energy security", ...s])]));
add("csv/sources.csv", csv(["source", "url"], ctx.SOURCES));
add("csv/live_data_links.csv", csv(["name", "description", "url"], ctx.LIVE));
if (docs?.documents) add("csv/nerc_publications.csv", csv(["title", "category", "first_seen", "url"], docs.documents.map((d) => [d.title, d.category, d.first_seen, d.url])));
if (news?.items) add("csv/grid_news_unverified.csv", csv(["seen_utc", "title", "domain", "url", "status"], news.items.map((i) => [i.seen, i.title, i.domain, i.url, i.status])));

const fc = { type: "FeatureCollection", metadata: { title: "Nigeria Energy Atlas — energy sites and pipelines", author: "Shagbaor Hycent Amool", licence: "CC BY 4.0", built: today, note: "Coordinates approximate; pipeline routes schematic." },
  features: [...assets.map((a) => ({ type: "Feature", properties: { ...a, lat: undefined, lon: undefined }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } })),
    ...ctx.PIPELINES.map((p) => ({ type: "Feature", properties: { name: p.name, category: "Pipeline", status: p.status, length: p.length, notes: p.note }, geometry: { type: "LineString", coordinates: p.coords.map((c) => [c[1], c[0]]) } }))] };
add("geojson/energy_sites_and_pipelines.geojson", JSON.stringify(fc));
if (states) add("geojson/nigeria_states_geoboundaries.geojson", JSON.stringify(states));
add("json/all_data.json", JSON.stringify({ title: "Nigeria Energy Atlas — all data", author: "Shagbaor Hycent Amool", url: "https://shagbaor.com/energy-atlas/", built: today, licence: "CC BY 4.0 (compiled data); third-party data keep their own terms — see README",
  sites: assets, pipelines: ctx.PIPELINES, state_profiles: ctx.STATES, discos: ctx.DISCOS, resource_potential: ctx.POT, generation_twh: ctx.GEN, world_bank: ctx.WDI,
  nerc_quarterly: ctx.NERCQ, disco_atcc_2026q1: ctx.DISCO_ATCC, grid_collapses: ctx.COLLAPSES, grid_collapse_sources: ctx.COLLAPSE_SRC, grid_events: ctx.EVENTS,
  petrol_import_share: ctx.PETROL, indices: ctx.INDICES, rise: ctx.RISE, wef_nexus_index: ctx.NEXUS, projects: ctx.PROJECTS, headline_figures: { overview: ctx.STATS, grid: ctx.GRID_FIGURES, security: ctx.SECURITY_FIGURES },
  nerc_publications: docs?.documents || [], grid_news_unverified: news?.items || [], sources: ctx.SOURCES }, null, 1));

const fileList = Object.keys(files).sort();
add("README.md", `# Nigeria Energy Atlas — data package

Built ${today} from https://shagbaor.com/energy-atlas/ by Shagbaor Hycent Amool (ORCID 0000-0001-8460-6744).
This package holds every dataset shown in the atlas. It is rebuilt automatically when the atlas's data bots update it.

## Files
${fileList.map((f) => "- `" + f + "`").join("\n")}

CSV files are UTF-8 (with BOM, so they open correctly in Excel). Coordinates are WGS84 longitude/latitude.

## What each file contains
- **energy_sites.csv / energy_sites_and_pipelines.geojson** — power plants, refineries, LNG, oil and gas provinces, coal and bitumen, nuclear and research sites, with capacity, status and notes. Locations are approximate (typically within a few km); some markers (basins, programmes) are symbolic. Pipeline routes are schematic.
- **state_profiles.csv** — zone, indicative solar resource band (kWh/m²/day, from the national north–south gradient — not measured site values), qualitative wind class, distribution company and electricity regulator for each state (regulator status as reported to Aug 2025).
- **nigeria_states_geoboundaries.geojson** — state boundaries from geoBoundaries (Nigeria ADM1, 2022; source GRID3), simplified for web display.
- **generation_by_source_twh.csv** — grid electricity generation by source (Our World in Data, from Ember and the Energy Institute).
- **world_bank_indicators.csv** — access to electricity (national/urban/rural), clean cooking, electricity use per person, renewable share and T&D losses (World Bank WDI API).
- **nerc_quarterly.csv, disco_atcc_losses_2026q1.csv** — NERC quarterly reports.
- **grid_collapses_per_year.csv, grid_events.csv** — national grid collapse record; each row names its source. Sources disagree; NERC is used from 2021.
- **energy_indices.csv, rise_scores.csv, wef_nexus_index.csv** — index results with sources.
- **power_projects.csv** — register of power-sector projects and programmes, each with a source and status date.
- **headline_figures.csv, resource_potential.csv, petrol_import_share.csv** — figures quoted on the atlas pages, with sources.
- **nerc_publications.csv, grid_news_unverified.csv** — lists collected by the atlas bots. News items are unverified headlines.
- **sources.csv, live_data_links.csv** — references and live-data links.
- **all_data.json** — everything above in one JSON file.

## Licence and credit
- Datasets compiled for this atlas (sites, state profiles, projects register, grid-collapse record, headline figures) and all text: © 2026 Shagbaor Hycent Amool, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
- World Bank WDI and RISE data: CC BY 4.0, © World Bank. Generation data: Our World in Data / Ember, CC BY 4.0. Boundaries: geoBoundaries (Runfola et al. 2020, PLoS ONE 15(4): e0231866), CC BY 4.0. WEF Nexus Index: Simpson et al. (2022), Frontiers in Water 4:825854.
- Figures quoted from NERC, NUPRC, TCN/NISO, NMDPRA, NOSDRA, index publishers and news reports are cited facts with links to the original sources. Check those publishers' terms before republishing their documents.
- The data are indicative and provided for education, research and planning discussion — not for engineering or investment decisions.

## Cite
Amool, S. H. (2026). Nigeria Energy Atlas (Version 1.0) [Software and dataset]. Zenodo. https://doi.org/10.5281/zenodo.23307712 — live atlas: https://shagbaor.com/energy-atlas/
`);
add("LICENSE.txt", `Data and text: Creative Commons Attribution 4.0 International (CC BY 4.0)
Copyright (c) 2026 Shagbaor Hycent Amool
https://creativecommons.org/licenses/by/4.0/legalcode

Third-party datasets included in this package keep their own licences (see README.md).
`);
add("CITATION.cff", `cff-version: 1.2.0
message: "If you use these data, please cite them as below."
title: "Nigeria Energy Atlas"
type: dataset
authors:
  - family-names: Amool
    given-names: Shagbaor Hycent
    orcid: "https://orcid.org/0000-0001-8460-6744"
    affiliation: University of Northern British Columbia
url: "https://shagbaor.com/energy-atlas/"
doi: "10.5281/zenodo.23307712"
license: CC-BY-4.0
date-released: "${today}"
`);

// ---------- minimal ZIP writer (deflate) ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(entries) {
  const d = new Date(), dt = ((d.getUTCFullYear() - 1980) << 25) | ((d.getUTCMonth() + 1) << 21) | (d.getUTCDate() << 16) | (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const locals = [], centrals = []; let off = 0;
  for (const [name, data] of entries) {
    const nm = Buffer.from(name, "utf8"), comp = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(dt >>> 0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(dt >>> 0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, comp); centrals.push(ch, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

fs.mkdirSync(OUT, { recursive: true });
const PREFIX = "nigeria-energy-atlas-data/";
const dataEntries = Object.keys(files).sort((a, b) => (a.includes("/") - b.includes("/")) || a.localeCompare(b)).map((n) => [PREFIX + n, files[n]]);
const pkg = zip(dataEntries);
const pkgPath = path.join(OUT, "nigeria-energy-atlas-data.zip");
const old = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath) : null;
// only rewrite when the contents changed (ignoring the build date), to avoid empty commits
const sig = (entries) => crc32(Buffer.concat(entries.map(([n, b]) => Buffer.concat([Buffer.from(n), Buffer.from(b.toString("utf8").replace(/20\d\d-\d\d-\d\d/g, ""))]))));
const sigPath = path.join(OUT, ".package-signature");
const newSig = String(sig(dataEntries));
if (!old || !fs.existsSync(sigPath) || fs.readFileSync(sigPath, "utf8") !== newSig) {
  fs.writeFileSync(pkgPath, pkg);
  fs.writeFileSync(sigPath, newSig);
  manifest.datasets = manifest.datasets || {};
  manifest.datasets.package = { updated: new Date().toISOString().replace(/\.\d+Z$/, "+00:00"), size: pkg.length, files: dataEntries.length };
  fs.writeFileSync(path.join(ATLAS, "data", "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  console.log(`data package written: ${dataEntries.length} files, ${pkg.length} bytes`);
} else console.log("data package unchanged");

if (release) {
  // application snapshot + data package, for archiving (e.g. Zenodo)
  const app = [];
  const walk = (dir, base) => { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f), rel = path.posix.join(base, f); if (fs.statSync(p).isDirectory()) { if (f !== "downloads" && f !== "__pycache__") walk(p, rel); } else app.push([rel, fs.readFileSync(p)]); } };
  walk(ATLAS, "energy-atlas");
  for (const d of ["scripts/energy_atlas", "tests"]) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), d);
  const wf = path.join(ROOT, ".github", "workflows");
  if (fs.existsSync(wf)) for (const f of fs.readdirSync(wf).filter((f) => f.startsWith("energy-atlas"))) app.push([".github/workflows/" + f, fs.readFileSync(path.join(wf, f))]);
  const R = `nigeria-energy-atlas-v${release}/`;
  const rel = zip([
    [R + "README.md", Buffer.from(`# Nigeria Energy Atlas v${release}\n\nSnapshot of https://shagbaor.com/energy-atlas/ taken ${today}.\n\n- \`app/\` — the complete web application (open \`app/energy-atlas/index.html\` from a local web server, e.g. \`python -m http.server\`), its data files, the data bots (\`scripts/energy_atlas\`, \`.github/workflows\`) and their tests.\n- \`data/\` — the full data package (CSV, GeoJSON, JSON) with its own README, licence and citation file.\n\nLicences: code MIT; compiled data and text CC BY 4.0; third-party data keep their own terms (see data/README.md).\n\nAuthor: Shagbaor Hycent Amool (ORCID 0000-0001-8460-6744), University of Northern British Columbia.\n`)],
    [R + "LICENSE-CODE.txt", Buffer.from(`MIT License\n\nCopyright (c) 2026 Shagbaor Hycent Amool\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`)],
    ...app.map(([n, b]) => [R + "app/" + n, b]),
    ...dataEntries.map(([n, b]) => [R + "data/" + n.slice(PREFIX.length), b]),
  ]);
  const rp = path.join(OUT, `nigeria-energy-atlas-v${release}.zip`);
  fs.writeFileSync(rp, rel);
  console.log(`release written: ${rp} (${rel.length} bytes)`);
}
