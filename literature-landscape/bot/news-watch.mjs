// Nigeria Literature Landscape — news watch bot
// Runs daily in GitHub Actions. Combs Nigerian arts & entertainment news (publisher RSS feeds and
// Google News searches per field), matches headlines to people on the Landscape, classifies them
// (death, award, release/new work, other) and writes data/news.json.
// Possible deaths, awards and new works involving people on the site are opened as GitHub issues
// labelled "literature-landscape-review" so they can be checked before anything on the site changes.
// Node 20+, no dependencies.

import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/news.json", ROOT);
const STATE = new URL("data/news-state.json", ROOT);
const UA = "NigeriaLiteratureLandscapeBot/1.0 (https://shagbaor.com/literature-landscape/; amool@unbc.ca)";
const REPO = process.env.GITHUB_REPOSITORY || "lordash001/lordash001.github.io";
const TOKEN = process.env.GITHUB_TOKEN || "";
const KEEP_DAYS = 60, MAX_ITEMS = 600;

const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}&hl=en-NG&gl=NG&ceid=NG:en`;
const FEEDS = [
  // field searches (Google News aggregates every Nigerian outlet)
  { name: "Google News · Literature", url: gnews('Nigerian (author OR novelist OR "book launch" OR "literary prize")'), field: "literature" },
  { name: "Google News · Poetry", url: gnews('Nigerian (poet OR poetry)'), field: "poetry" },
  { name: "Google News · Drama & Theatre", url: gnews('Nigeria (playwright OR "stage play" OR theatre production)'), field: "drama" },
  { name: "Google News · Music", url: gnews('(Afrobeats OR "Nigerian singer" OR "Nigerian musician" OR Headies)'), field: "music" },
  { name: "Google News · Film & TV", url: gnews('(Nollywood OR "Nigerian film" OR AMVCA OR Kannywood)'), field: "film" },
  { name: "Google News · Photography & Video", url: gnews('Nigerian (photographer OR photojournalist OR cinematographer OR "music video director")'), field: "photography" },
  { name: "Google News · Comedy", url: gnews('Nigerian (comedian OR "skit maker" OR "stand-up")'), field: "comedy" },
  { name: "Google News · Journalism", url: gnews('Nigerian journalist OR "press freedom" Nigeria'), field: "journalism" },
  { name: "Google News · Digital Creators", url: gnews('Nigerian (influencer OR "content creator" OR YouTuber OR TikToker)'), field: "digital" },
  { name: "Google News · Deaths", url: gnews('Nigerian (actor OR actress OR singer OR musician OR writer OR comedian OR journalist) dies'), field: null },
  // publisher feeds
  { name: "Brittle Paper", url: "https://brittlepaper.com/feed/", field: "literature" },
  { name: "BellaNaija", url: "https://www.bellanaija.com/feed/", field: null },
  { name: "Premium Times · Arts", url: "https://www.premiumtimesng.com/entertainment/feed", field: null },
  { name: "NotJustOk", url: "https://notjustok.com/feed/", field: "music" },
  { name: "Nollywood Reinvented", url: "https://nollywoodreinvented.com/feed", field: "film" },
  { name: "Punch · Entertainment", url: "https://punchng.com/topics/entertainment/feed/", field: null },
  { name: "Vanguard · Entertainment", url: "https://www.vanguardngr.com/category/entertainment/feed/", field: null }
];

const KIND = [
  ["death", /\b(dies|died|is dead|dead at|passes away|passed away|passes on|passed on|death of|laid to rest|buried|mourns?|tribute to the late|RIP)\b/i],
  ["award", /\b(wins?|won|winner|awards?|prize|nominat\w*|shortlist\w*|longlist\w*|honou?r(ed|s)?|grammy|headies|amvca|amaa)\b/i],
  ["release", /\b(releases?|released|new (album|single|ep|book|novel|film|movie|series|collection)|debut (album|novel|film)|premieres?|box office|trailer|launch(es|ed)? (book|album))\b/i]
];
const FIELD_HINT = [
  ["literature", /\b(novel|author|book|literary|memoir|writer)\b/i], ["poetry", /\b(poet|poetry|poems?)\b/i],
  ["drama", /\b(play|playwright|theatre|theater|stage)\b/i], ["music", /\b(song|album|single|singer|rapper|afrobeats|music|ep|headies|grammy|concert)\b/i],
  ["film", /\b(nollywood|film|movie|actor|actress|series|cinema|box office|amvca|kannywood)\b/i], ["photography", /\b(photograph\w*|photo exhibition|cinematograph\w*|music video)\b/i],
  ["comedy", /\b(comedian|comedy|skit)\b/i], ["journalism", /\b(journalist|editor|newspaper|press freedom|broadcaster|reporter)\b/i],
  ["digital", /\b(influencer|content creator|youtuber|tiktok\w*|instagram|skit maker|streamer)\b/i]
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘").replace(/&#8220;|&ldquo;/g, "“").replace(/&#8221;|&rdquo;/g, "”").replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—").replace(/&quot;/g, '"').replace(/&#039;|&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? decode(m[1]) : ""; };

async function fetchFeed(f) {
  const r = await fetch(f.url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" }, redirect: "follow", signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const xml = await r.text();
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map(m => {
    const it = m[0];
    let title = tag(it, "title"), source = f.name;
    const src = it.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    if (src) { source = decode(src[1]); title = title.replace(new RegExp("\\s+-\\s+" + source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), ""); }
    const link = tag(it, "link") || (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const date = new Date(tag(it, "pubDate") || tag(it, "dc:date") || Date.now());
    return { title, link, source, date: isNaN(date) ? new Date().toISOString() : date.toISOString(), summary: tag(it, "description").slice(0, 300), feedField: f.field };
  }).filter(x => x.title && x.link);
}

// ---- people to match ----
const data = JSON.parse(await fs.readFile(new URL("data/landscape.json", ROOT), "utf8"));
const people = new Map(); // name -> {name, fields:Set, living:bool, curated:bool, qid}
const addPerson = (name, field, living, curated, qid) => {
  name = String(name || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (name.split(/\s+/).length < 2 && !/^[A-Z][a-z]+[A-Z]/.test(name) && name.length < 6) return; // avoid one-word noise
  const e = people.get(name) || { name, fields: new Set(), living, curated, qid };
  e.fields.add(field); e.curated = e.curated || curated; if (!living) e.living = false; if (qid) e.qid = qid;
  people.set(name, e);
};
for (const s of data.sectors) {
  s.profiles.forEach(p => addPerson(p.n, s.id, true, true));
  s.hall.forEach(p => addPerson(p.n, s.id, false, true));
  try {
    const rows = JSON.parse(await fs.readFile(new URL(`data/directory/${s.id}.json`, ROOT), "utf8"));
    rows.forEach(r => addPerson(r.name, s.id, !r.d, false, r.qid));
  } catch {}
}
const names = [...people.keys()].filter(n => n.length >= 5).sort((a, b) => b.length - a.length);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameRes = names.map(n => [n, new RegExp(`(^|[^\\p{L}])${esc(n)}(?=$|[^\\p{L}])`, "u")]);

// ---- crawl ----
let prev = { items: [] }, state = { issued: [] };
try { prev = JSON.parse(await fs.readFile(OUT, "utf8")); } catch {}
try { state = JSON.parse(await fs.readFile(STATE, "utf8")); } catch {}
const sources = [];
const all = [];
for (const f of FEEDS) {
  try { const items = await fetchFeed(f); all.push(...items); sources.push({ name: f.name, ok: true, items: items.length }); }
  catch (e) { sources.push({ name: f.name, ok: false, error: e.message }); }
  await sleep(800);
}

const cutoff = Date.now() - KEEP_DAYS * 864e5;
const byKey = new Map();
for (const x of [...(prev.items || []), ...all]) {
  if (Date.parse(x.date) < cutoff) continue;
  const key = x.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
  if (byKey.has(key)) continue;
  const text = x.title + " " + (x.summary || "");
  const matched = x.people || nameRes.filter(([, re]) => re.test(text)).map(([n]) => n).slice(0, 6);
  const kinds = x.kinds || KIND.filter(([, re]) => re.test(x.title)).map(([k]) => k);
  const fields = new Set(x.fields || []);
  if (!x.fields) {
    // fields come from the people named; otherwise from field keywords in the headline
    matched.forEach(n => people.get(n) && people.get(n).fields.forEach(fl => fields.add(fl)));
    if (!fields.size) FIELD_HINT.forEach(([fl, re]) => { if (re.test(text)) fields.add(fl); });
  }
  // keep only items relevant to the creative fields
  if (!fields.size) continue;
  byKey.set(key, { title: x.title, link: x.link, source: x.source, date: x.date, fields: [...fields], people: matched, kinds });
}
const items = [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_ITEMS);

// ---- review: precise, person-specific patterns ----
const REL = /\b(husband|wife|father|mother|son|daughter|brother|sister|mum|mom|dad|uncle|aunt|grandmother|grandfather|manager|colleague|friend|fan|co-star)\b/i;
function personKind(n, title) {
  const N = esc(n);
  const death1 = new RegExp(`${N}([^.!?]{0,40}?)\\b(dies|died|is dead|dead at|passes away|passed away|passes on|passed on|has died)\\b`, "iu");
  const death2 = new RegExp(`\\b(death of|mourns?|mourning|laid to rest|burial of|funeral of|RIP|tribute to (the )?late|remembering)\\s+(the\\s+)?(late\\s+)?(veteran\\s+)?(\\w+\\s+)?${N}`, "iu");
  const relAfter = new RegExp(`${N}['’]s\\s+(late\\s+)?${REL.source.slice(2, -2)}`, "iu"); // "X's mother" is about a relative
  const m1 = title.match(death1);
  if (!relAfter.test(title) && ((m1 && !REL.test(m1[1])) || death2.test(title))) return "death";
  const award = new RegExp(`${N}([^.!?]{0,50}?)\\b(wins?|won|bags?|clinch(es|ed)?|scoops?|named|nominated|nominations?|shortlisted|longlisted|honou?red|receives?|emerges?)\\b|\\b(award|prize|honour|honor)\\b[^.!?]{0,30}\\bto\\s+${N}`, "iu");
  const ma = title.match(award);
  if (ma && !/\b(never|not|yet to|didn['’]t|fails? to|snub\w*)\b/i.test(ma[1] || "")) return "award";
  const release = new RegExp(`${N}[^.!?]{0,40}?\\b(releases?|released|drops?|unveils?|announces? new|premieres?|debuts?)\\b|${N}['’]s\\s+(new|latest|debut)\\s+(album|single|ep|book|novel|film|movie|series|collection)`, "iu");
  if (release.test(title)) return "release";
  return null;
}
const issued = new Set(state.issued || []);
const toIssue = [], digest = [];
for (const it of items) {
  for (const n of it.people) {
    const p = people.get(n); if (!p) continue;
    const k = personKind(n, it.title);
    if (!k) continue;
    if (k === "death" && p.living) toIssue.push({ key: "death|" + n, kind: "Possible death", name: n, p, it });
    else if (k !== "death" && p.curated) digest.push({ key: k + "|" + n + "|" + it.title.slice(0, 80), kind: k === "award" ? "Award or nomination" : "New work", name: n, p, it });
  }
}
const GH = (path, opt = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, { ...opt, headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": UA, ...(opt.headers || {}) } });
let opened = 0, digested = 0;
if (TOKEN) {
  // one-time clean-up of the noisy first run (individual award/new-work issues)
  if (!state.v2) {
    const r = await GH(`/issues?labels=literature-landscape-review&state=open&per_page=100`);
    const list = r.ok ? await r.json() : []; for (const x of (Array.isArray(list) ? list : [])) {
      await GH(`/issues/${x.number}/comments`, { method: "POST", body: JSON.stringify({ body: "Closed automatically: the news-watch bot now uses stricter matching. Awards and new works are collected in a single weekly review digest; only possible deaths get their own issue." }) });
      await GH(`/issues/${x.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "not_planned" }) });
      await sleep(800);
    }
    state.v2 = true;
  }
  // possible deaths: one issue each
  const seenNames = new Set();
  for (const t of toIssue) {
    if (issued.has(t.key) || seenNames.has(t.name)) continue; seenNames.add(t.name);
    const body = `**Possible death** reported for **${t.name}** (${[...t.p.fields].join(", ")}${t.p.curated ? ", hand-written profile" : ""}).\n\n- Headline: ${t.it.title}\n- Source: ${t.it.source} — ${t.it.link}\n- Date: ${t.it.date.slice(0, 10)}\n${t.p.qid ? `- Wikidata: https://www.wikidata.org/wiki/${t.p.qid}\n` : ""}\nConfirm with a second reliable source, then move the person to Lived / the Hall of Fame. Close this issue when done.\n\n_Opened automatically by the Literature Landscape news-watch bot._`;
    const r = await GH(`/issues`, { method: "POST", body: JSON.stringify({ title: `[literature-landscape] Possible death: ${t.name}`, body, labels: ["literature-landscape-review"] }) });
    if (r.ok) { issued.add(t.key); opened++; } else console.warn("Issue failed", r.status, await r.text());
    await sleep(1500);
  }
  // awards & new works: one rolling digest issue, one comment per run
  const fresh = digest.filter(d => !issued.has(d.key));
  if (fresh.length) {
    const title = "[literature-landscape] Review digest: awards and new works";
    const r = await GH(`/issues?labels=literature-landscape-review&state=open&per_page=100`);
    const list = r.ok ? await r.json() : []; let num = ((Array.isArray(list) ? list : []).find(x => x.title === title) || {}).number;
    if (!num) {
      const c = await GH(`/issues`, { method: "POST", body: JSON.stringify({ title, labels: ["literature-landscape-review"], body: "Awards, nominations and new works reported in the news for people with hand-written profiles. Each daily run adds a comment. Tick items off by updating their profile highlights (or ignore them), and close this issue whenever you like — a new one opens automatically.\n\n_Maintained by the Literature Landscape news-watch bot._" }) });
      num = c.ok ? (await c.json()).number : null;
    }
    if (num) {
      const lines = fresh.slice(0, 40).map(d => `- [ ] **${d.name}** — ${d.kind}: [${d.it.title.replace(/[\[\]]/g, "")}](${d.it.link}) · ${d.it.source}, ${d.it.date.slice(0, 10)}`);
      const c = await GH(`/issues/${num}/comments`, { method: "POST", body: JSON.stringify({ body: `### ${new Date().toISOString().slice(0, 10)}\n${lines.join("\n")}` }) });
      if (c.ok) { fresh.forEach(d => issued.add(d.key)); digested = fresh.length; }
    }
  }
}
const alerts = [...toIssue, ...digest].map(t => ({ kind: t.kind, name: t.name, title: t.it.title, link: t.it.link, date: t.it.date }));

await fs.writeFile(OUT, JSON.stringify({ updated: new Date().toISOString(), keepDays: KEEP_DAYS, sources, items, alerts: alerts.slice(0, 50) }));
await fs.writeFile(STATE, JSON.stringify({ v2: !!state.v2, issued: [...issued].slice(-3000) }));
console.log(`${items.length} items kept · ${all.length} fetched · ${sources.filter(s => s.ok).length}/${sources.length} sources ok · ${toIssue.length} death alerts · ${opened} issues opened · ${digested} digest items`);
sources.filter(s => !s.ok).forEach(s => console.log("  source failed:", s.name, s.error));
