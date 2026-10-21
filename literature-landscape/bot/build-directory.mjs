// Nigeria Literature Landscape — directory bot
// Builds data/directory/<field>.json: everyone on Wikidata with an occupation in that field
// whose place of birth can be traced to one of Nigeria's 36 states or the FCT.
// Also writes data/directory/index.json (counts) and data/directory/curated.json
// (state of origin by birthplace for every hand-picked profile).
// Node 20+, no dependencies. Runs weekly in GitHub Actions.

import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/directory/", ROOT);
const UA = "NigeriaLiteratureLandscapeBot/1.0 (https://shagbaor.com/literature-landscape/; amool@unbc.ca)";
const STATES = "Q815913 Q117714 Q337514 Q145793 Q748523 Q836657 Q3817714 Q130626 Q878284 Q503936 Q682777 Q320852 Q376241 Q509300 Q387745 Q424388 Q429908 Q463959 Q464953 Q503910 Q503905 Q503932 Q503928 Q503923 Q503941 Q506808 Q532153 Q534917 Q657821 Q682571 Q682704 Q682691 Q682721 Q739676 Q836645 Q836654 Q842939".split(" ");
const NOT_PLACES = ["Q1033", "Q2046345", "Q472146", "Q585408", "Q2062030"]; // country-level, not a place in a state

const sleep = ms => new Promise(r => setTimeout(r, ms));
const yearOf = v => v ? String(v).replace(/^\+/, "").slice(0, 4) : "";
const qidOf = uri => uri.split("/").pop();

async function sparql(query, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch("https://query.wikidata.org/sparql", {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
        body: "format=json&query=" + encodeURIComponent(query)
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return (await r.json()).results.bindings;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(5000 * (i + 1));
    }
  }
}

// map birthplaces -> state label (batches of 300)
const stateCache = {};
async function statesFor(pobs) {
  const need = [...new Set(pobs)].filter(p => !(p in stateCache));
  for (let i = 0; i < need.length; i += 300) {
    const chunk = need.slice(i, i + 300);
    chunk.forEach(p => stateCache[p] = null);
    const rows = await sparql(`SELECT ?pob ?stLabel WHERE {
      VALUES ?pob { ${chunk.map(p => "wd:" + p).join(" ")} }
      VALUES ?st { ${STATES.map(s => "wd:" + s).join(" ")} }
      ?pob wdt:P131* ?st.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`);
    rows.forEach(b => { stateCache[qidOf(b.pob.value)] = b.stLabel.value.replace(/ State$/, ""); });
    await sleep(1500);
  }
  return stateCache;
}

const data = JSON.parse(await fs.readFile(new URL("data/landscape.json", ROOT), "utf8"));
await fs.mkdir(OUT, { recursive: true });
const counts = {};

for (const s of data.sectors) {
  const rows = await sparql(`SELECT DISTINCT ?p ?pLabel ?pDescription ?b ?d ?sl ?img ?pob WHERE {
    VALUES ?occ { ${s.occupations.map(o => "wd:" + o).join(" ")} }
    ?p wdt:P106 ?occ; wdt:P19 ?pob. ?pob wdt:P17 wd:Q1033.
    FILTER(?pob NOT IN (${NOT_PLACES.map(q => "wd:" + q).join(", ")}))
    ?p wikibase:sitelinks ?sl.
    OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d } OPTIONAL { ?p wdt:P18 ?img }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 30000`);
  await statesFor(rows.map(r => qidOf(r.pob.value)));
  const byQ = new Map();
  for (const r of rows) {
    const qid = qidOf(r.p.value), st = stateCache[qidOf(r.pob.value)];
    if (!st) continue;
    const name = r.pLabel ? r.pLabel.value : qid;
    if (/^Q\d+$/.test(name)) continue;
    const prev = byQ.get(qid);
    if (prev) { if (!prev.img && r.img) prev.img = r.img.value.replace(/^http:/, "https:"); continue; }
    byQ.set(qid, { qid, name, desc: r.pDescription ? r.pDescription.value : "", b: r.b ? yearOf(r.b.value) : "", d: r.d ? yearOf(r.d.value) : "", sl: +r.sl.value, img: r.img ? r.img.value.replace(/^http:/, "https:") : "", st });
  }
  const list = [...byQ.values()].sort((a, b) => b.sl - a.sl);
  counts[s.id] = list.length;
  await fs.writeFile(new URL(s.id + ".json", OUT), JSON.stringify(list));
  console.log(s.id, list.length, "people traced to a state (of", new Set(rows.map(r => r.p.value)).size, "born in Nigeria)");
  await sleep(3000);
}

// curated profiles -> state by birthplace
const titles = [...new Set(data.sectors.flatMap(s => [...s.profiles, ...s.hall]).map(p => p.w).filter(Boolean))];
const byTitle = {};
for (let i = 0; i < titles.length; i += 50) {
  const c = titles.slice(i, i + 50);
  const r = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ action: "query", format: "json", redirects: 1, prop: "pageprops", ppprop: "wikibase_item", titles: c.join("|") }), { headers: { "User-Agent": UA } });
  const j = await r.json();
  const back = {}; (j.query.normalized || []).forEach(n => back[n.to] = n.from); (j.query.redirects || []).forEach(x => back[x.to] = back[x.from] || x.from);
  Object.values(j.query.pages || {}).forEach(p => { if (p.pageprops && p.pageprops.wikibase_item) byTitle[back[p.title] || p.title] = p.pageprops.wikibase_item; });
  await sleep(300);
}
const cq = [...new Set(Object.values(byTitle))];
const curState = {};
for (let i = 0; i < cq.length; i += 150) {
  const chunk = cq.slice(i, i + 150);
  const rows = await sparql(`SELECT ?p ?pob WHERE { VALUES ?p { ${chunk.map(q => "wd:" + q).join(" ")} } ?p wdt:P19 ?pob. }`);
  await statesFor(rows.map(r => qidOf(r.pob.value)));
  rows.forEach(r => { const st = stateCache[qidOf(r.pob.value)]; if (st) curState[qidOf(r.p.value)] = st; });
  await sleep(1500);
}
const curated = {};
titles.forEach(t => { curated[t] = byTitle[t] ? (curState[byTitle[t]] || null) : null; });
await fs.writeFile(new URL("curated.json", OUT), JSON.stringify({ updated: new Date().toISOString(), byTitle, state: curated }));
await fs.writeFile(new URL("index.json", OUT), JSON.stringify({ updated: new Date().toISOString(), rule: "Place of birth (Wikidata P19) located in one of Nigeria's 36 states or the FCT", counts }));
console.log("curated traced:", Object.values(curated).filter(Boolean).length, "of", titles.length);
console.log("not traced:", titles.filter(t => !curated[t]).join("; "));
