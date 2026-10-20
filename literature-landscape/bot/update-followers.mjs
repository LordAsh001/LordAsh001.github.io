// Nigeria Literature Landscape — follower & record bot
// Runs weekly in GitHub Actions (see .github/workflows/literature-landscape-bot.yml).
//  1. Resolves each curated profile's Wikipedia title to its Wikidata item.
//  2. Reads official social accounts (X, Instagram, YouTube, TikTok, Facebook, Spotify) from Wikidata.
//  3. Collects the latest dated follower counts recorded on Wikidata (P8687).
//  4. Fetches live YouTube subscriber counts from the YouTube Data API v3 (needs secret YT_API_KEY).
//  5. Flags living profiles whose Wikidata record has gained a date of death, for human review.
// Writes data/followers.json. Node 20+, no dependencies.

import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const DATA_FILE = new URL("data/landscape.json", ROOT);
const OUT_FILE = new URL("data/followers.json", ROOT);
const UA = "NigeriaLiteratureLandscapeBot/1.0 (https://shagbaor.com/literature-landscape/; amool@unbc.ca)";
const YT_KEY = process.env.YT_API_KEY || "";
const HIST_MAX = 26; // ~6 months of weekly points

const sleep = ms => new Promise(r => setTimeout(r, ms));
const qs = o => new URLSearchParams(o).toString();
const today = new Date().toISOString().slice(0, 10);

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) throw new Error("HTTP " + r.status);
      if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { fatal: true });
      return await r.json();
    } catch (e) {
      if (e.fatal || i === tries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ---- load curated data ----
const data = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
const living = new Set(), allTitles = new Set();
for (const s of data.sectors) {
  for (const p of s.profiles) if (p.w) { living.add(p.w); allTitles.add(p.w); }
  for (const p of s.hall) if (p.w) allTitles.add(p.w);
}
let prev = { people: {} };
try { prev = JSON.parse(await fs.readFile(OUT_FILE, "utf8")); } catch {}

// ---- 1. titles -> QIDs ----
const byTitle = {};
for (const c of chunks([...allTitles], 50)) {
  const j = await getJSON("https://en.wikipedia.org/w/api.php?" + qs({ action: "query", format: "json", redirects: 1, prop: "pageprops", ppprop: "wikibase_item", titles: c.join("|") }));
  const back = {};
  (j.query.normalized || []).forEach(n => back[n.to] = n.from);
  (j.query.redirects || []).forEach(r => back[r.to] = back[r.from] || r.from);
  for (const p of Object.values(j.query.pages || {})) {
    const qid = p.pageprops && p.pageprops.wikibase_item;
    if (qid) byTitle[back[p.title] || p.title] = qid;
  }
  await sleep(300);
}
console.log("Resolved", Object.keys(byTitle).length, "of", allTitles.size, "titles");

// ---- 2/3. Wikidata claims ----
const HANDLE = { P2002: "x", P2003: "instagram", P2397: "youtube", P7085: "tiktok", P2013: "facebook", P1902: "spotify" };
const QUAL_PLATFORM = { P2002: "x", P6552: "x", P2003: "instagram", P2397: "youtube", P7085: "tiktok", P2013: "facebook", P11892: "threads" };
const people = {}, flags = [];
const qids = [...new Set(Object.values(byTitle))];
const titleOf = Object.fromEntries(Object.entries(byTitle).map(([t, q]) => [q, t]));
for (const c of chunks(qids, 50)) {
  const j = await getJSON("https://www.wikidata.org/w/api.php?" + qs({ action: "wbgetentities", format: "json", props: "claims", ids: c.join("|") }));
  for (const [qid, ent] of Object.entries(j.entities || {})) {
    const C = ent.claims || {};
    const handles = {};
    for (const [pid, key] of Object.entries(HANDLE)) {
      const st = (C[pid] || []).find(s => s.rank !== "deprecated" && s.mainsnak.datavalue);
      if (st) handles[key] = st.mainsnak.datavalue.value;
    }
    const counts = {};
    for (const st of C.P8687 || []) {
      if (st.rank === "deprecated" || !st.mainsnak.datavalue) continue;
      const value = Math.round(+st.mainsnak.datavalue.value.amount);
      const q = st.qualifiers || {};
      const date = q.P585 && q.P585[0].datavalue ? q.P585[0].datavalue.value.time.replace(/^\+/, "").slice(0, 10) : null;
      const plat = Object.keys(QUAL_PLATFORM).find(p => q[p]);
      if (!plat || !date || !value) continue;
      const k = QUAL_PLATFORM[plat];
      if (!counts[k] || counts[k].date < date) counts[k] = { value, date, source: "Wikidata (P8687)" };
    }
    const title = titleOf[qid];
    if (living.has(title) && (C.P570 || []).some(s => s.rank !== "deprecated")) flags.push({ qid, title, reason: "Wikidata now records a date of death — review for the Hall of Fame" });
    people[qid] = { title, handles, counts };
  }
  await sleep(300);
}

// ---- 4. YouTube Data API ----
const sources = ["Wikidata"];
if (YT_KEY) {
  const withYT = Object.entries(people).filter(([, p]) => p.handles.youtube);
  for (const c of chunks(withYT, 50)) {
    try {
      const j = await getJSON("https://www.googleapis.com/youtube/v3/channels?" + qs({ part: "statistics", id: c.map(([, p]) => p.handles.youtube).join(","), key: YT_KEY }));
      const stat = Object.fromEntries((j.items || []).map(i => [i.id, i.statistics]));
      for (const [, p] of c) {
        const s = stat[p.handles.youtube];
        if (!s) continue;
        if (!s.hiddenSubscriberCount && s.subscriberCount) p.counts.youtube = { value: +s.subscriberCount, date: today, source: "YouTube Data API" };
        p.youtube = { views: +s.viewCount || 0, videos: +s.videoCount || 0, date: today };
      }
    } catch (e) { console.warn("YouTube batch failed:", e.message); }
  }
  sources.push("YouTube Data API");
} else {
  console.warn("YT_API_KEY not set — skipping live YouTube counts");
}

// ---- history (keeps a short weekly trail per platform) ----
for (const [qid, p] of Object.entries(people)) {
  const old = (prev.people || {})[qid] || {};
  p.hist = old.hist || {};
  for (const [k, v] of Object.entries(p.counts)) {
    const h = p.hist[k] = p.hist[k] || [];
    if (!h.length || h[h.length - 1][0] !== v.date) h.push([v.date, v.value]);
    while (h.length > HIST_MAX) h.shift();
  }
  if (!Object.keys(p.handles).length && !Object.keys(p.counts).length) delete people[qid];
}

const out = { updated: new Date().toISOString(), sources, people, byTitle, flags };
await fs.writeFile(OUT_FILE, JSON.stringify(out));
console.log(`Wrote ${Object.keys(people).length} people, ${flags.length} flags`);
