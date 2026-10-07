(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DATA = window.LL_SCHOLARSHIPS, ESSAYS = window.LL_ESSAYS;
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysTo = (s) => Math.round((parseD(s) - TODAY) / 864e5);
const fmtD = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const T = (n, t) => { try { if (window.SiteTrack) window.SiteTrack(n, t); } catch (e) {} };
const wc = (t) => (t.trim().match(/\S+/g) || []).length;

/* ---------------- state ---------------- */
const KEY = "laureate_lab_v1";
let st = { xp: 0, days: [], stamps: {}, ready: {}, tracker: [], drafts: {}, paths: {}, moves: {}, iv: 0, pomos: 0, rewrites: 0, reqs: {}, remember: true };
const STORY_FORM_URL = ""; /* Tally link for "Share your story", e.g. https://tally.so/r/abc123 */
try { const raw = localStorage.getItem(KEY); if (raw) st = Object.assign(st, JSON.parse(raw)); } catch (e) {}
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }, 250); };

const LEVELS = [[0, "Applicant"], [150, "Shortlisted"], [400, "Interviewed"], [800, "Finalist"], [1400, "Scholar"], [2200, "Fellow"], [3200, "Laureate"]];
const STAMPS = [
  ["draft", "First draft", "Write 150 words in the Dojo"],
  ["green", "Green essay", "Score 75+ on any essay"],
  ["moves", "Full structure", "Cover every move of one essay type"],
  ["guided", "Guided build", "Finish a guided build"],
  ["coach", "Hand-held", "Finish every step of a step-by-step scholarship guide"],
  ["cliche", "Cliché slayer", "Score 80% in Cliché Buster"],
  ["architect", "Architect", "Solve Structure Sort"],
  ["rewriter", "Rewriter", "Clear all 5 Rewrite Arena rounds"],
  ["budget", "Word budget", "Win the Word Budget Sprint"],
  ["interview", "Panel ready", "Finish 3 interview answers"],
  ["planner", "Planner", "Send a plan to the tracker"],
  ["tracker", "Pipeline", "Track 3 applications"],
  ["focus", "Focus", "Finish a 25-min sprint"],
  ["path", "Pathfinder", "Complete 10 funding-route steps"],
  ["streak", "3-day streak", "Practise 3 days in a row"]
];
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => { t.style.opacity = 0; setTimeout(() => (t.hidden = true), 300); }, 2400); }
function addXP(n, why) {
  st.xp += n; const k = dayKey(); if (!st.days.includes(k)) st.days.push(k);
  if (streak() >= 3) stamp("streak");
  save(); renderPassport(); if (why) toast(`+${n} XP · ${why}`);
}
function stamp(id) { if (st.stamps[id]) return; st.stamps[id] = dayKey(); save(); const s = STAMPS.find((x) => x[0] === id); setTimeout(() => toast(`Passport stamp earned: ${s[1]}`), 900); renderPassport(); }
function streak() { let n = 0; const d = new Date(); for (;;) { if (st.days.includes(dayKey(d))) { n++; d.setDate(d.getDate() - 1); } else break; } return n; }
function level() { let i = 0; LEVELS.forEach((l, j) => { if (st.xp >= l[0]) i = j; }); return i; }
function renderPassport() {
  const i = level(), cur = LEVELS[i][0], nxt = LEVELS[i + 1] ? LEVELS[i + 1][0] : cur + 1000;
  $("#lvlName").textContent = `Level ${i + 1} · ${LEVELS[i][1]}`;
  $("#xpTxt").textContent = `${st.xp} XP`;
  $("#xpBar").style.width = Math.min(100, ((st.xp - cur) / (nxt - cur)) * 100) + "%";
  $("#streak").textContent = streak();
  $("#stampCount").textContent = Object.keys(st.stamps).length;
  $("#stamps").innerHTML = STAMPS.map((s, j) => `<div class="stamp ${st.stamps[s[0]] ? "got" : ""}" style="--r:${(j % 5) * 4 - 8}deg" title="${esc(s[2])}">${esc(s[1])}</div>`).join("");
  $("#stTrack").textContent = st.tracker.length;
  $("#trackCount").textContent = st.tracker.length;
  $("#stWords").textContent = Object.values(st.drafts).reduce((a, t) => a + wc(t || ""), 0);
  const tot = READY.length, got = READY.filter((r, j) => st.ready[j]).length;
  $("#stReady").textContent = Math.round((got / tot) * 100) + "%";
}

/* ---------------- tabs ---------------- */
function go(v) {
  T("section/" + v, "Opened section: " + v);
  $$(".view").forEach((s) => s.classList.toggle("on", s.id === "v-" + v));
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", t.dataset.v === v));
  try { history.replaceState(null, "", "#" + v); } catch (e) {}
  window.scrollTo({ top: 0 });
}
$$(".tab").forEach((t) => t.addEventListener("click", () => go(t.dataset.v)));
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go); });

/* ---------------- scholarships ---------------- */
function status(s) {
  if (s.conf === "closed") return { k: "closed", label: "Closed · next cycle", cls: "p-closed" };
  if (!s.deadline) return { k: "up", label: "Window varies", cls: "p-up" };
  const d = daysTo(s.deadline);
  if (d < 0) return { k: "closed", label: "Closed", cls: "p-closed" };
  if (s.conf === "confirmed") return d <= 14 ? { k: "open", label: "Closing soon", cls: "p-soon" } : { k: "open", label: "Open", cls: "p-open" };
  return d <= 60 ? { k: "open", label: "Likely open", cls: "p-open" } : { k: "up", label: "Upcoming", cls: "p-up" };
}
const confPill = (s) => s.conf === "confirmed" ? `<span class="pill p-conf" title="Date published for the 2027 cycle">confirmed date</span>` : s.conf === "typical" ? `<span class="pill p-typ" title="Based on past cycles; verify">typical date</span>` : "";
const isTracked = (id) => st.tracker.some((t) => t.id === id);
function tbtn(id, compact) {
  const on = isTracked(id);
  return `<button type="button" class="btn sm tbtn ${on ? "on" : ""}" data-tid="${id}" data-compact="${compact ? 1 : ""}" aria-pressed="${on}" title="${on ? "Click to remove from your tracker" : "Add to your application tracker"}">${on ? (compact ? "✓ Tracked" : "✓ Tracking · remove") : (compact ? "Track" : "Add to tracker")}</button>`;
}
function syncTBtns() { $$(".tbtn").forEach((b) => { b.outerHTML = tbtn(b.dataset.tid, !!b.dataset.compact); }); }
function reqHTML(s) {
  if (!s.req || !s.req.items.length) return "";
  const got = s.req.items.filter((x, i) => st.reqs[s.id + "|" + i]).length;
  return `<details class="req"><summary>What to prepare · <span class="mono" data-reqcount="${s.id}">${got}/${s.req.items.length}</span> ready</summary>
    <div class="list-check">${s.req.items.map((x, i) => `<label><input type="checkbox" data-rq="${s.id}|${i}" ${st.reqs[s.id + "|" + i] ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div>
    <p class="small muted" style="margin-top:6px">${s.req.src === "official" ? "From the official page, checked 29 Sep 2026 (and again on 7 Oct 2026 for the step-by-step guides). Rules change each cycle — confirm before you apply." : "Typical for this award — confirm the exact rules on the official page."}</p></details>`;
}
document.addEventListener("change", (e) => {
  const c = e.target.closest("[data-rq]"); if (!c) return;
  const k = c.dataset.rq, id = k.split("|")[0]; st.reqs[k] = c.checked; save();
  const s = DATA.find((x) => x.id === id), got = s.req.items.filter((x, i) => st.reqs[id + "|" + i]).length;
  $$(`[data-reqcount="${id}"]`).forEach((el) => (el.textContent = `${got}/${s.req.items.length}`));
  if (c.checked && got === s.req.items.length) addXP(20, "all documents ready for " + s.name);
});
function passCard(s, extra = "") {
  const stt = status(s), d = s.deadline ? daysTo(s.deadline) : null;
  const stub = s.deadline && d >= 0 ? `<span class="eyebrow">T-minus</span><b class="mono">${d}</b><span class="small muted">days</span>` : s.deadline ? `<span class="eyebrow">Closed</span><b class="mono">—</b><span class="small muted">${fmtD(parseD(s.deadline))}</span>` : `<span class="eyebrow">Deadline</span><b class="mono">·</b><span class="small muted">varies</span>`;
  return `<article class="pass"><div class="pass-main">
    <div class="row" style="gap:6px"><span class="pill ${stt.cls}">${stt.label}</span>${confPill(s)}${s.national ? `<span class="pill p-up">Nigeria</span>` : ""}</div>
    <h3>${esc(s.name)}</h3>
    <dl class="kv"><dt>Host</dt><dd>${esc(s.host)}</dd><dt>Level</dt><dd>${s.levels.join(", ")}</dd><dt>Window</dt><dd>${esc(s.window)}</dd><dt>Covers</dt><dd>${esc(s.funding)}</dd><dt>Eligibility</dt><dd>${esc(s.elig)}</dd></dl>
    ${extra}
    ${reqHTML(s)}
    <div class="row"><button type="button" class="btn sm primary" data-gstart="${s.id}">Guide me step by step</button><a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">Official page ↗</a>
    ${tbtn(s.id)}
    ${s.essays && s.essays.length ? `<button class="btn sm" data-essay="${s.essays[0]}">Practise ${esc(ESSAYS[s.essays[0]].name.toLowerCase())}</button>` : ""}</div>
  </div><div class="pass-stub">${stub}</div></article>`;
}
let aStatus = "";
const fSel = new Set();
const fieldOK = (s) => { if (!fSel.size) return true; if (!s.fields) return $("#fAny").checked; return s.fields.some((f) => fSel.has(f)); };
function renderFields() {
  $("#fieldList").innerHTML = window.LL_FIELDS.map((f) => { const n = DATA.filter((s) => s.fields && s.fields.includes(f)).length; return `<label><input type="checkbox" data-field="${esc(f)}" ${fSel.has(f) ? "checked" : ""}> <span>${esc(f)}</span><span class="n" title="Awards limited to fields including this one">${n}</span></label>`; }).join("");
}
$("#fieldList").addEventListener("change", (e) => { const c = e.target.closest("[data-field]"); if (!c) return; c.checked ? fSel.add(c.dataset.field) : fSel.delete(c.dataset.field); renderAtlas(); });
$("#fAny").addEventListener("change", renderAtlas);
$("#fClear").addEventListener("click", () => { fSel.clear(); renderFields(); renderAtlas(); });
function renderAtlas() {
  const q = $("#aQ").value.toLowerCase().trim(), lv = $("#aLevel").value, rg = $("#aRegion").value, so = $("#aSort").value;
  let list = DATA.filter((s) => {
    if (!fieldOK(s)) return false;
    if (lv && !s.levels.includes(lv)) return false;
    if (rg && s.region !== rg) return false;
    if (aStatus && status(s).k !== aStatus) return false;
    if (q && !(s.name + " " + s.host + " " + s.elig + " " + s.tags.join(" ") + " " + s.funding + " " + (s.fields || ["any field"]).join(" ")).toLowerCase().includes(q)) return false;
    return true;
  });
  const ord = (s) => { const k = status(s).k; const d = s.deadline ? daysTo(s.deadline) : 9999; return (k === "closed" ? 1e5 : k === "up" && !s.deadline ? 5e4 : 0) + d; };
  list.sort(so === "az" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => ord(a) - ord(b));
  $("#aCount").textContent = `${list.length} of ${DATA.length} opportunities` + (fSel.size ? ` · fields: ${[...fSel].join(", ")}${$("#fAny").checked ? " (plus awards open to any field)" : ""}` : "");
  $("#atlasList").innerHTML = list.map((s) => passCard(s)).join("") || `<p class="muted">Nothing matches. Clear a filter.</p>`;
}
["aQ", "aLevel", "aRegion", "aSort"].forEach((id) => $("#" + id).addEventListener("input", renderAtlas));
$$("#aStatus button").forEach((b) => b.addEventListener("click", () => { aStatus = b.dataset.s; $$("#aStatus button").forEach((x) => x.setAttribute("aria-pressed", x === b)); renderAtlas(); }));
document.addEventListener("click", (e) => {
  const t = e.target.closest(".tbtn"); if (t) { const id = t.dataset.tid; if (isTracked(id)) untrack(id); else trackAdd(id); }
  const es = e.target.closest("[data-essay]"); if (es) { $("#eType").value = es.dataset.essay; loadType(); go("dojo"); }
});
function renderHome() {
  const open = DATA.filter((s) => status(s).k === "open");
  $("#stOpen").textContent = open.length;
  const next = DATA.filter((s) => s.deadline && daysTo(s.deadline) >= 0 && s.conf !== "closed").sort((a, b) => daysTo(a.deadline) - daysTo(b.deadline)).slice(0, 6);
  $("#homeDeadlines").innerHTML = next.map((s) => { const d = daysTo(s.deadline); return `<div class="dl"><span class="tminus ${d <= 14 ? "hot" : d <= 45 ? "warm" : ""}">T-${d}</span><div><b>${esc(s.name)}</b><div class="small muted">${fmtD(parseD(s.deadline))} · ${s.conf === "confirmed" ? "confirmed" : "typical, verify"}</div></div>${tbtn(s.id, true)}</div>`; }).join("");
  $("#checked").textContent = fmtD(parseD(window.LL_CHECKED));
}
const READY = ["Passport valid at least 12 months beyond your start date (some visas ask for more)", "Transcripts (sealed & scanned)", "Degree certificate or statement of result", "NYSC certificate or exemption letter", "2-page academic CV", "English test — commonly IELTS 6.5 overall with no band below 6.0 (or TOEFL/PTE/Duolingo equivalent), or an English-medium letter where accepted", "2–3 referees agreed", "Personal statement draft", "Research proposal (PhD)", "Proof of work experience letters", "Admission offer(s)", "Financial documents, if required"];
function renderReady() {
  $("#readyList").innerHTML = READY.map((r, j) => `<label><input type="checkbox" data-r="${j}" ${st.ready[j] ? "checked" : ""}> ${esc(r)}</label>`).join("");
  $$("#readyList input").forEach((c) => c.addEventListener("change", () => { const j = c.dataset.r; if (c.checked && !st.ready[j]) addXP(10, "document ready"); st.ready[j] = c.checked; save(); renderPassport(); }));
}

/* ---------------- matcher ---------------- */
$("#matchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const nat = $("#mNat").value, lv = $("#mLevel").value, cls = +$("#mClass").value, age = +$("#mAge").value, hrs = +$("#mWork").value * 1800, kw = $("#mField").value.toLowerCase().split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
  const clsName = { 1: "First Class", 2: "2:1", 3: "2:2" };
  const res = DATA.filter((s) => s.levels.includes(lv) && !(nat !== "ng" && s.national)).map((s) => {
    let sc = 70; const why = [], ok = [];
    if (s.minClass && cls > s.minClass) { sc -= 40; why.push(`usually expects ${clsName[s.minClass]} or better`); } else if (s.minClass) ok.push("degree class fits");
    if (s.ageMax && age > s.ageMax) { sc -= 50; why.push(`age limit around ${s.ageMax}`); }
    if (s.workHrs && hrs < s.workHrs) { sc -= 35; why.push(`needs ~${s.workHrs.toLocaleString()} work hours (you have ~${hrs.toLocaleString()})`); } else if (s.workHrs) ok.push("work experience fits");
    if (kw.length && kw.some((k) => (s.name + s.tags.join(" ") + s.elig + s.host).toLowerCase().includes(k))) { sc += 15; ok.push("matches your field keywords"); }
    const k = status(s).k; if (k === "open") { sc += 10; ok.push("open now"); } if (k === "closed") { sc -= 15; why.push("closed this cycle — prepare for the next"); }
    if (s.national && nat === "ng") ok.push("Nigeria-specific: smaller applicant pool");
    return { s, sc: Math.max(0, Math.min(100, sc)), why, ok };
  }).sort((a, b) => b.sc - a.sc);
  $("#matchOut").innerHTML = `<p class="small muted">${res.length} scholarships offer ${lv} study for your profile. Scores are guidance only — always read the official criteria.</p>` + res.map((r) => {
    const col = r.sc >= 70 ? "var(--good)" : r.sc >= 45 ? "var(--warn)" : "var(--bad)";
    return passCard(r.s, `<div class="stack" style="gap:4px"><div class="meter-top"><span><b>Fit ${r.sc}</b></span><span class="small muted">${r.ok.join(" · ")}</span></div><div class="xpbar"><i style="width:${r.sc}%;background:${col}"></i></div>${r.why.length ? `<span class="small" style="color:var(--bad)">${esc(r.why.join(" · "))}</span>` : ""}</div>`);
  }).join("");
  addXP(5); T("matcher-run", "Ran the eligibility matcher");
});

/* ---------------- analysis engine ---------------- */
const CL = window.LL_CLICHES, FILL = window.LL_FILLER, SV = window.LL_STRONGVERBS;
const clRe = new RegExp("(" + CL.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
const fillRe = new RegExp("\\b(" + FILL.join("|") + ")\\b", "gi");
const clTest = new RegExp(clRe.source, "i");
const svRe = new RegExp("\\b(" + SV.join("|") + ")\\b", "gi");
const SENT = /(?:\b(?:Dr|Prof|Mr|Mrs|Ms|St|vs|al|e\.g|i\.e|No)\.|[^.!?]|\.(?=\d))+(?:[.!?]+["'”’)\]]*|$)\s*/g;
function scoreSentence(s, moves) {
  const w = wc(s), why = [], good = [];
  let sc = 0;
  const cl = s.match(clRe) || [], fl = s.match(fillRe) || [], sv = s.match(svRe) || [];
  if (/\d|₦|£|\$|€|%/.test(s)) { sc += 2; good.push("uses a number"); }
  if (sv.length) { sc += 2; good.push("strong verb: " + sv[0]); }
  if (/\s[A-Z][a-zA-Z]{2,}/.test(s.replace(/\s(I|I'm|I've)\b/g, ""))) { sc += 1; good.push("names something specific"); }
  const mv = moves.filter((m) => !m.cue.startsWith("^") && new RegExp(m.cue, "i").test(s));
  if (mv.length) { sc += 1; good.push("fits move: " + mv.map((m) => m.label).join(", ")); }
  if (cl.length) { sc -= 3 * cl.length; why.push("cliché: “" + cl.join("”, “") + "”"); }
  if (fl.length) { sc -= Math.min(2, fl.length); why.push("filler: " + [...new Set(fl.map((x) => x.toLowerCase()))].join(", ")); }
  if (/\b(was|were|is|are|been|being|be)\s+\w+(ed|en)\b/i.test(s)) { sc -= 1; why.push("passive voice — who did it?"); }
  if (/\b(i think|maybe|perhaps|hopefully|try to|i hope|kind of|sort of|i feel that)\b/i.test(s)) { sc -= 1; why.push("hedging weakens your claim"); }
  if (w > 35) { sc -= 2; why.push(`long sentence (${w} words) — split it`); }
  if (w < 5) { sc -= 1; why.push("too short to carry evidence"); }
  const t0 = s.trim(), mech = [];
  if (/^[a-z]/.test(t0)) mech.push("start the sentence with a capital letter");
  if (/(^|\s)i(\s|'|’|,|$)/.test(t0)) mech.push("write “I” as a capital");
  const rep = t0.match(/\b(\w{2,})\s+\1\b/i); if (rep && !/^(had|that)$/i.test(rep[1])) mech.push(`repeated word “${rep[1]}”`);
  if (/\S {2,}\S/.test(t0)) mech.push("double space");
  if (/\s[,.;:!?]/.test(t0)) mech.push("space before punctuation");
  if (/\balot\b/i.test(t0)) mech.push("“alot” → “a lot”");
  if (/\b(could|should|would|must) of\b/i.test(t0)) mech.push("“could of” → “could have”");
  if (mech.length) { sc -= Math.min(2, mech.length); why.push("mechanics: " + mech.join("; ")); }
  let cls = sc >= 3 ? "good" : sc >= 1 ? "ok" : sc >= -1 ? "warn" : "bad";
  if (cl.length && cls !== "bad") cls = cl.length > 1 ? "bad" : "warn";
  if (!why.length && cls !== "good") why.push("add a number, a name, or an action you took");
  return { cls, sc, why, good, mv, w };
}
function analyze(text, type) {
  const E = ESSAYS[type], moves = E.moves;
  const paras = text.split(/\n/);
  const out = [], sents = [];
  paras.forEach((p, pi) => {
    const parts = p.match(SENT) || (p ? [p] : []);
    const html = parts.map((raw) => {
      if (!raw.trim()) return esc(raw);
      const r = scoreSentence(raw, moves); sents.push(r);
      let h = esc(raw).replace(clRe, '<mark class="cl">$1</mark>').replace(svRe, '<mark class="sv">$1</mark>');
      const tip = [...r.good.map((g) => "✓ " + g), ...r.why.map((g) => "✗ " + g)].join("\n") || "Sound sentence";
      return `<span class="s s-${r.cls}" data-why="${esc(tip)}">${h}</span>`;
    }).join("");
    out.push(html);
  });
  const done = moves.map((m) => m.cue.startsWith("^") ? new RegExp(m.cue, "i").test(text.trim().slice(0, 240)) && !clTest.test(text.trim().slice(0, 120)) : sents.some((s) => s.cls !== "bad" && s.mv.includes(m)));
  const n = sents.length || 1, words = wc(text);
  const spec = Math.round((sents.filter((s) => s.good.some((g) => /number|verb|specific/.test(g))).length / n) * 100);
  const struct = Math.round((done.filter(Boolean).length / moves.length) * 100);
  const clar = Math.max(0, 100 - Math.round((sents.filter((s) => s.why.some((g) => /long|passive|filler|hedg|mechanics/.test(g))).length / n) * 100));
  const orig = Math.max(0, 100 - sents.reduce((a, s) => a + s.why.filter((g) => /cliché/.test(g)).length, 0) * 25);
  const ratio = words / E.limit; const len = ratio > 1 ? Math.max(0, Math.round(100 - (ratio - 1) * 300)) : Math.round(Math.min(1, ratio / 0.8) * 100);
  const total = words ? Math.round(spec * 0.25 + struct * 0.3 + clar * 0.15 + orig * 0.15 + len * 0.15) : 0;
  return { html: out.join("\n"), done, meters: { Specificity: spec, Structure: struct, Clarity: clar, Originality: orig, Length: len }, total, words, sents };
}
const barCol = (v) => v >= 75 ? "var(--good)" : v >= 50 ? "var(--ok)" : v >= 30 ? "var(--warn)" : "var(--bad)";
const meterHTML = (m) => Object.entries(m).map(([k, v]) => `<div class="meter"><div class="meter-top"><span>${k}</span><span class="mono">${v}</span></div><div class="bar"><i style="width:${v}%;background:${barCol(v)}"></i></div></div>`).join("");

/* tooltip */
const tip = $("#tip");
function showTip(el, x, y) { tip.textContent = el.dataset.why; tip.style.whiteSpace = "pre-line"; tip.hidden = false; const w = tip.offsetWidth; tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 12)) + "px"; tip.style.top = y + 16 + "px"; }
document.addEventListener("mouseover", (e) => { const s = e.target.closest(".s"); if (s) showTip(s, e.clientX, e.clientY); else tip.hidden = true; });
document.addEventListener("mousemove", (e) => { if (!tip.hidden && e.target.closest(".s")) showTip(e.target.closest(".s"), e.clientX, e.clientY); });
document.addEventListener("click", (e) => { const s = e.target.closest(".s"); if (s) { const r = s.getBoundingClientRect(); showTip(s, r.left, r.bottom - 10); } });

/* ---------------- dojo ---------------- */
let booting = true;
let cur = "leadership", mode = "free", lastA = null, gi = 0, gParts = [];
$("#eType").innerHTML = Object.entries(ESSAYS).map(([k, e]) => `<option value="${k}">${esc(e.name)}</option>`).join("");
let sampleText = "";
const getDraft = (k) => (st.remember !== false ? st.drafts[k] || "" : "");
const setDraft = (k, t) => { if (st.remember !== false) st.drafts[k] = t; };
function loadType() {
  cur = $("#eType").value; const E = ESSAYS[cur];
  $("#eFor").textContent = `Used by: ${E.for} · target ≤ ${E.limit} words`;
  $("#eFrame").textContent = `Moves · ${E.frame}`;
  const saved = getDraft(cur);
  $("#eText").value = saved; sampleText = "";
  $("#eRestored").hidden = !(saved.trim() && !booting);
  if (saved.trim()) $("#eRestoredTxt").textContent = `Restored your saved ${E.name.toLowerCase()} draft (${wc(saved)} words). Drafts are kept separately for each essay type.`;
  gi = 0; gParts = E.moves.map(() => "");
  runDojo(); if (mode === "guided") renderGuided();
}
const PII = [["an email address", /[\w.+-]+@[\w-]+\.[\w.]{2,}/], ["a phone number", /(\+?234[\s-]?|\b0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}\b|\+\d{1,3}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3,4}/], ["an 11-digit ID number (NIN/BVN?)", /\b(?!0[789][01])\d{11}\b/], ["a passport-style number", /\b[A-Z]\d{8}\b/], ["a date of birth", /\b(date of birth|born on|d\.o\.b)\b/i], ["a home address", /\b\d+[a-z]?,?\s+[A-Z][\w'-]+\s+(street|road|avenue|close|crescent|lane|way)\b/i]];
const piiFound = (t) => PII.filter(([, re]) => re.test(t)).map(([n]) => n);
function runDojo() {
  const E = ESSAYS[cur], t = $("#eText").value, a = analyze(t, cur); lastA = a;
  const pf = piiFound(t);
  $("#ePII").hidden = !pf.length;
  if (pf.length) $("#ePII").textContent = `Privacy check: your draft seems to contain ${pf.join(", ")}. Scholarship essays rarely need these — remove them before sharing the draft or sending it for AI review.`;
  $("#eMirror").innerHTML = a.html || `<span class="muted">Your colour-coded draft appears here as you type.</span>`;
  $("#eMeters").innerHTML = meterHTML(a.meters);
  $("#eWc").textContent = `${a.words} / ${E.limit} words`; $("#eWc").style.color = a.words > E.limit ? "var(--bad)" : "";
  $("#eScore").textContent = `Score ${a.total}`; $("#eScore").style.color = barCol(a.total);
  $("#eMoves").innerHTML = E.moves.map((m, j) => `<button class="move ${a.done[j] ? "done" : ""} ${mode === "guided" && j === gi ? "active" : ""}" data-mi="${j}"><span class="dot"></span><span><b>${esc(m.label)}</b><br><span class="small muted">${esc(m.tip)}</span></span></button>`).join("");
  $("#eMovesCount").textContent = `${a.done.filter(Boolean).length}/${E.moves.length}`;
  if (booting) return;
  // rewards
  st.moves[cur] = st.moves[cur] || [];
  a.done.forEach((d, j) => { if (d && !st.moves[cur].includes(j)) { st.moves[cur].push(j); addXP(15, `move unlocked: ${E.moves[j].label}`); } });
  if (a.done.every(Boolean)) stamp("moves");
  if (a.words >= 150) stamp("draft");
  if (a.words >= 100) T("essay-drafted/" + cur, "Drafted 100+ words: " + E.name);
  if (a.total >= 75 && a.words >= 120) stamp("green");
  if (t !== sampleText) setDraft(cur, t); save();
  $("#stWords").textContent = Object.values(st.drafts).reduce((x, y) => x + wc(y || ""), 0);
}
let dT; $("#eText").addEventListener("input", () => { clearTimeout(dT); dT = setTimeout(runDojo, 120); });
$("#eType").addEventListener("change", loadType);
$("#eSample").addEventListener("click", () => { const E = ESSAYS[cur]; sampleText = "Ever since I was a child I have been passionate about this field. " + E.moves.map((m) => m.weak).join(" "); $("#eText").value = sampleText; $("#eRestored").hidden = true; runDojo(); });
$("#eClear").addEventListener("click", () => { $("#eText").value = ""; $("#eRestored").hidden = true; runDojo(); });
$("#eFresh").addEventListener("click", () => { $("#eText").value = ""; delete st.drafts[cur]; save(); $("#eRestored").hidden = true; runDojo(); toast("Draft cleared"); });
$("#eKeep").addEventListener("click", () => { $("#eRestored").hidden = true; });
$("#pRemember").checked = st.remember !== false;
if (st.howClosed) $("#howBox").open = false;
$("#howBox").addEventListener("toggle", () => { st.howClosed = !$("#howBox").open; save(); });
$("#pRemember").addEventListener("change", (e) => { st.remember = e.target.checked; if (!st.remember) { st.drafts = {}; toast("Drafts will not be kept on this device"); } else { setDraft(cur, $("#eText").value); toast("Drafts will be kept on this device"); } save(); });
$("#pDelete").addEventListener("click", () => { $("#pConfirm").hidden = false; });
$("#pNo").addEventListener("click", () => { $("#pConfirm").hidden = true; });
$("#pYes").addEventListener("click", () => { clearTimeout(saveT); try { localStorage.removeItem(KEY); } catch (e) {} st = { xp: 0, days: [], stamps: {}, ready: {}, tracker: [], drafts: {}, paths: {}, moves: {}, iv: 0, pomos: 0, rewrites: 0, reqs: {}, remember: true }; toast("All Laureate data on this device deleted"); setTimeout(() => location.reload(), 900); });
/* save essay as PDF / text */
let DL = null;
const essayName = () => ESSAYS[cur].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
async function saveFile(filename, data, type) {
  if (DL) { try { await DL.save({ filename, data }); return; } catch (e) { if (e && e.code === "cancelled") return; } }
  try { const blob = data instanceof Blob ? data : new Blob([data], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  catch (e) { toast("Your browser blocked the download — use Copy text instead"); }
}
const pdfSafe = (t) => t.replace(/₦/g, "NGN ").replace(/€/g, "EUR ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "-").replace(/[^\x00-\xFF]/g, "?");
$("#ePdf").addEventListener("click", async () => {
  const t = $("#eText").value.trim(); if (!t) { toast("Write something first"); return; }
  const J = window.jspdf && window.jspdf.jsPDF; if (!J) { toast("The PDF tool didn't load — use Save as .txt"); return; }
  const E = ESSAYS[cur], doc = new J({ unit: "pt", format: "a4" }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 60; let y = M;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(pdfSafe(E.name), M, y); y += 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(pdfSafe(`${wc(t)} words (usual limit ${E.limit}) · saved ${fmtD(new Date())} · Dojo score ${lastA ? lastA.total : "-"}/100`), M, y); y += 26;
  doc.setTextColor(20); doc.setFontSize(11.5);
  pdfSafe(t).split(/\n/).forEach((para) => { const lines = para.trim() ? doc.splitTextToSize(para, W - 2 * M) : [""]; lines.forEach((ln) => { if (y > H - M) { doc.addPage(); y = M; } doc.text(ln, M, y); y += 17; }); y += para.trim() ? 6 : 0; });
  const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text(`Drafted in Laureate Lab · page ${i} of ${n}`, M, H - 30); }
  await saveFile(`${essayName()}-draft.pdf`, doc.output("blob"), "application/pdf"); T("essay-saved-pdf", "Saved an essay as PDF");
});
$("#eTxt").addEventListener("click", () => { const t = $("#eText").value.trim(); if (!t) { toast("Write something first"); return; } saveFile(`${essayName()}-draft.txt`, t + "\n", "text/plain"); T("essay-saved-txt", "Saved an essay as text"); });
$("#eCopy").addEventListener("click", () => copyText($("#eText").value));
$("#eMoves").addEventListener("click", (e) => { const b = e.target.closest("[data-mi]"); if (!b) return; if (mode === "guided") { gi = +b.dataset.mi; renderGuided(); runDojo(); } });
$$("#eMode button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m; $$("#eMode button").forEach((x) => x.setAttribute("aria-pressed", x === b)); $("#guidedBox").hidden = mode !== "guided"; if (mode === "guided") renderGuided(); runDojo(); }));
function renderGuided() {
  const E = ESSAYS[cur], m = E.moves[gi];
  $("#gStep").textContent = `Move ${gi + 1} of ${E.moves.length} · ${E.frame}`;
  $("#gLabel").textContent = m.label; $("#gTip").textContent = m.tip; $("#gWeak").textContent = m.weak; $("#gStrong").textContent = m.strong;
  $("#gInput").value = gParts[gi] || ""; $("#gNext").textContent = gi === E.moves.length - 1 ? "Lock in & assemble essay" : "Lock in & next move";
  runGuided();
}
function runGuided() {
  const E = ESSAYS[cur], m = E.moves[gi], t = $("#gInput").value, a = analyze(t, cur);
  $("#gMirror").innerHTML = a.html || `<span class="muted small">Live feedback on this move.</span>`;
  const hit = m.cue.startsWith("^") ? new RegExp(m.cue, "i").test(t) : new RegExp(m.cue, "i").test(t);
  const bad = a.sents.some((s) => s.cls === "bad"), green = a.sents.some((s) => s.cls === "good"), w = a.words;
  const need = [];
  if (w < 12) need.push(`${12 - w} more words`); if (!hit) need.push(`signal the ${m.label.toLowerCase()} clearly`); if (!green) need.push("one green sentence"); if (bad) need.push("fix red sentences");
  const ok = !need.length;
  $("#gNext").disabled = !ok; $("#gHint").textContent = ok ? "Ready to lock in." : "Needs: " + need.join(" · ");
  $("#gStatus").textContent = ok ? "Strong move" : green ? "Almost" : "Keep going"; $("#gStatus").className = "pill " + (ok ? "p-open" : green ? "p-typ" : "p-up");
  gParts[gi] = t;
}
$("#gInput").addEventListener("input", runGuided);
$("#gBack").addEventListener("click", () => { if (gi > 0) { gi--; renderGuided(); runDojo(); } });
$("#gNext").addEventListener("click", () => {
  const E = ESSAYS[cur]; addXP(20, `${E.moves[gi].label} locked in`);
  $("#eText").value = gParts.filter((x) => x.trim()).join("\n\n");
  if (gi < E.moves.length - 1) { gi++; renderGuided(); } else { stamp("guided"); T("guided-build-finished", "Finished a guided essay build"); addXP(50, "essay assembled"); $$("#eMode button")[0].click(); }
  runDojo();
});

/* ---------------- sample (AI) ---------------- */
let sample = null;
const errCopy = (c) => ({ not_granted: "AI coach not allowed for this page.", rate_limited: "Too many requests — try again in a minute.", session_expired: "Sign in to Claude again.", refused: "Claude declined this text. Try rewording.", invalid_json: "The review came back garbled. Try again." }[c] || "Something went wrong. Try again.");
(async () => {
  try { sample = window.claude && window.claude.use ? await window.claude.use("sample") : null; } catch (e) { sample = null; }
  if (sample) { $("#aiState").textContent = "Available"; $("#aiState").className = "pill p-open"; $("#aiRun").disabled = false; $("#ivAI").disabled = false; }
  else if (!window.claude) { $("#aiCard").hidden = true; $("#ivAI").hidden = true; }
  else { $("#aiState").textContent = "Not available here"; $("#aiState").className = "pill p-closed"; $("#aiNote").textContent = "The AI coach runs when this page is opened on claude.ai. The live colour review above works everywhere."; $("#ivAI").title = "Available when opened on claude.ai"; }
})();
let aiCtl, aiPIIok = false;
$("#aiStop").addEventListener("click", () => aiCtl && aiCtl.abort());
$("#aiRun").addEventListener("click", async () => {
  const E = ESSAYS[cur], t = $("#eText").value.trim();
  if (wc(t) < 40) { $("#aiOut").innerHTML = `<p class="small" style="color:var(--warn)">Write at least 40 words first.</p>`; return; }
  const pf = piiFound(t);
  if (pf.length && !aiPIIok) { $("#aiOut").innerHTML = `<div class="notice warn"><span>Your draft seems to contain ${esc(pf.join(", "))}. Remove it before sending, or send anyway if it is not real personal data.</span><button type="button" class="btn sm" id="aiAnyway">Send anyway</button></div>`; $("#aiAnyway").onclick = () => { aiPIIok = true; $("#aiRun").click(); }; return; }
  aiPIIok = false;
  const prompt = `You are a strict but encouraging scholarship essay coach who has sat on Chevening, Commonwealth and Rhodes panels.
Essay type: ${E.name} (used by ${E.for}). Word limit: ${E.limit}. Required moves in order: ${E.moves.map((m) => m.label + " — " + m.tip).join(" | ")}.
Review the essay below. Reply with ONLY JSON in this shape:
{"overall":0-100,"verdict":"one sentence","moves":[{"label":"move name","score":0-10,"comment":"max 20 words"}],"fixes":[{"quote":"exact weak sentence from essay","issue":"max 15 words","rewrite":"stronger version, same facts, no invented numbers — use [X] placeholders where a fact is needed"}],"next":"the single most important next step"}
Give exactly 3 fixes.

ESSAY:
"""${t.slice(0, 9000)}"""`;
  aiCtl = new AbortController(); $("#aiRun").disabled = true; $("#aiStop").hidden = false;
  $("#aiOut").innerHTML = `<p class="small muted">Thinking… a panel review takes up to a minute.</p>`;
  try {
    const r = await sample.json(prompt, { signal: aiCtl.signal });
    const mv = (r.moves || []).map((m) => `<div class="meter"><div class="meter-top"><span>${esc(m.label)}</span><span class="mono">${+m.score || 0}/10</span></div><div class="bar"><i style="width:${(+m.score || 0) * 10}%;background:${barCol((+m.score || 0) * 10)}"></i></div><span class="small muted">${esc(m.comment || "")}</span></div>`).join("");
    const fx = (r.fixes || []).map((f) => `<div class="fix stack" style="gap:4px"><span class="small"><b>“${esc(f.quote)}”</b></span><span class="small" style="color:var(--warn)">${esc(f.issue)}</span><span class="small" style="color:var(--good)">→ ${esc(f.rewrite)}</span></div>`).join("");
    $("#aiOut").innerHTML = `<div class="row"><span class="scorebig mono" style="color:${barCol(+r.overall || 0)}">${+r.overall || 0}</span><p>${esc(r.verdict || "")}</p></div><div class="meters">${mv}</div><h4>Three fixes</h4>${fx}<p><b>Next step:</b> ${esc(r.next || "")}</p>`;
    addXP(25, "AI panel review"); T("ai-review", "Got an AI essay review");
  } catch (e) { if (e && e.code !== "cancelled") $("#aiOut").innerHTML = `<p class="small" style="color:var(--bad)">${errCopy(e && e.code)}</p>`; else $("#aiOut").innerHTML = ""; if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) { $("#aiRun").disabled = true; } }
  finally { if (!(sample === null)) $("#aiRun").disabled = false; $("#aiStop").hidden = true; }
});

/* ---------------- arcade ---------------- */
let cb = { i: 0, score: 0, streak: 0, right: 0, list: [], timer: null, t0: 0, live: false };
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function cbNext() {
  if (cb.i >= cb.list.length) return cbEnd();
  const [s] = cb.list[cb.i]; $("#cbSent").textContent = s; $("#cbWhy").textContent = `Round ${cb.i + 1} of ${cb.list.length}`;
  cb.live = true; cb.t0 = performance.now(); cancelAnimationFrame(cb.timer);
  const tick = () => { const p = 1 - (performance.now() - cb.t0) / 6000; $("#cbTimer").style.width = Math.max(0, p * 100) + "%"; if (p <= 0) { cbAnswer(null); return; } cb.timer = requestAnimationFrame(tick); }; tick();
}
function cbAnswer(v) {
  if (!cb.live) return; cb.live = false; cancelAnimationFrame(cb.timer);
  const [, strong, why] = cb.list[cb.i], ok = v === strong, card = $("#gClich");
  if (ok) { cb.streak++; cb.right++; cb.score += 10 + Math.min(20, cb.streak * 2); } else cb.streak = 0;
  card.classList.remove("flash-good", "flash-bad"); void card.offsetWidth; card.classList.add(ok ? "flash-good" : "flash-bad");
  $("#cbWhy").innerHTML = `<b style="color:${ok ? "var(--good)" : "var(--bad)"}">${v === null ? "Time's up" : ok ? "Correct" : "Not quite"}</b> — ${strong ? "Strong" : "Weak"}: ${esc(why)}`;
  $("#cbScore").textContent = `Score ${cb.score} · streak ${cb.streak}`; cb.i++; setTimeout(cbNext, 1700);
}
function cbEnd() { T("game/cliche-buster", "Played Cliché Buster"); $("#cbStrong").disabled = $("#cbWeak").disabled = true; $("#cbStart").disabled = false; const pct = Math.round((cb.right / cb.list.length) * 100); $("#cbSent").textContent = `Round over: ${cb.right}/${cb.list.length} correct (${pct}%).`; addXP(Math.round(cb.score / 4), "Cliché Buster"); if (pct >= 80) stamp("cliche"); }
$("#cbStart").addEventListener("click", () => { cb = { i: 0, score: 0, streak: 0, right: 0, list: shuffle(window.LL_GAME_SENTENCES).slice(0, 10), timer: null, live: false }; $("#cbStart").disabled = true; $("#cbStrong").disabled = $("#cbWeak").disabled = false; $("#cbScore").textContent = "Score 0 · streak 0"; cbNext(); });
$("#cbStrong").addEventListener("click", () => cbAnswer(true));
$("#cbWeak").addEventListener("click", () => cbAnswer(false));

const OG = window.LL_ORDER_GAME; let osOrder = [], osSel = null;
$("#osTitle").textContent = OG.title;
function osRender(check) {
  $("#osList").innerHTML = osOrder.map((p, j) => `<button class="order-item ${osSel === j ? "sel" : ""} ${check ? (p === j ? "right" : "wrong") : ""}" data-oi="${j}" style="text-align:left"><span class="n">${j + 1}</span><span class="small">${esc(OG.parts[p])}${check ? ` <b>(${OG.labels[p]})</b>` : ""}</span></button>`).join("");
}
function osShuffle() { do osOrder = shuffle([0, 1, 2, 3, 4]); while (osOrder.every((p, j) => p === j)); osSel = null; $("#osMsg").textContent = ""; osRender(); }
$("#osList").addEventListener("click", (e) => { const b = e.target.closest("[data-oi]"); if (!b) return; const j = +b.dataset.oi; if (osSel === null) osSel = j; else { [osOrder[osSel], osOrder[j]] = [osOrder[j], osOrder[osSel]]; osSel = null; } osRender(); });
$("#osCheck").addEventListener("click", () => { const n = osOrder.filter((p, j) => p === j).length; osRender(true); $("#osMsg").textContent = `${n}/5 in place`; if (n === 5) { T("game/structure-sort", "Solved Structure Sort"); addXP(40, "Structure solved"); stamp("architect"); } });
$("#osShuffle").addEventListener("click", osShuffle);

let ra = 0; const RW = window.LL_REWRITES;
function raChecks(t, a) {
  const sv = new RegExp(svRe.source, "i");
  return [["Action you took", sv.test(t) || /\bI\s+\w+ed\b/.test(t)], ["A number", /\d|₦|£|\$|€|%/.test(t)], ["A named place or organisation", /[^.!?\s]\s+[A-Z][a-zA-Z]{2,}/.test(t.replace(/\s(I|I'm|I've)\b/g, ""))], ["No clichés or filler", !!t.trim() && !a.sents.some((s) => s.why.some((g) => /cliché|filler/.test(g)))], ["8+ words", wc(t) >= 8]];
}
function raLoad() { $("#raIdx").textContent = `${ra + 1}/${RW.length}`; $("#raWeak").textContent = RW[ra].weak; $("#raHint").textContent = "Hint: " + RW[ra].hint; $("#raIn").value = ""; $("#raMirror").innerHTML = `<span class="muted small">Your rewrite is colour-coded here as you type.</span>`; $("#raNext").disabled = true; $("#raStatus").textContent = ""; $("#raModel").hidden = true; $("#raChecks").innerHTML = raChecks("", { sents: [] }).map(([l]) => `<span>${l}</span>`).join(""); }
$("#raShow").addEventListener("click", () => { $("#raModel").hidden = false; $("#raModel").innerHTML = `<b>One strong version:</b> ${esc(RW[ra].model || "")}<br><span class="muted">Now write your own, with your real facts.</span>`; });
$("#raIn").addEventListener("input", () => {
  const t = $("#raIn").value, a = analyze(t, "leadership"); $("#raMirror").innerHTML = a.html || `<span class="muted small">Your rewrite is colour-coded here as you type.</span>`;
  const ch = raChecks(t, a); $("#raChecks").innerHTML = ch.map(([l, y]) => `<span class="${y ? "y" : ""}">${y ? "✓ " : ""}${l}</span>`).join("");
  const ok = a.sents.length && ch.every(([, y]) => y) && a.sents.every((s) => s.cls === "good" || s.cls === "ok") && a.sents.some((s) => s.cls === "good");
  $("#raNext").disabled = !ok; $("#raStatus").innerHTML = ok ? `<span style="color:var(--good)">Green — lock it in.</span>` : `<span class="muted">${ch.filter(([, y]) => !y).length ? "Still needed: " + ch.filter(([, y]) => !y).map(([l]) => l.toLowerCase()).join(", ") : "Nearly there — tighten the wording until it turns green."}</span>`;
});
$("#raNext").addEventListener("click", () => { T("game/rewrite-arena", "Rewrote a sentence"); addXP(15, "sentence rewritten"); ra++; if (ra >= RW.length) { stamp("rewriter"); ra = 0; toast("All five rewritten. Round reset."); } raLoad(); });

$("#wbIn").value = "In the year of 2023, I was basically the only engineer who was working at a cooperative of 40 farmers in Benue State, and I noticed that a very large amount of our tomatoes, around 30%, were actually rotting before they could reach the market, which was a really big problem for all of us. So I designed a solar dryer.";
function wbCheck() {
  const t = $("#wbIn").value, n = wc(t), facts = [/\b40\b/.test(t), /30\s?%/.test(t), /solar/i.test(t) && /dryer|drier/i.test(t)];
  $("#wbCount").textContent = `${n} words`; $("#wbCount").style.color = n <= 40 ? "var(--good)" : "var(--bad)";
  const miss = ["40 farmers", "30%", "solar dryer"].filter((f, j) => !facts[j]);
  if (n <= 40 && !miss.length) { $("#wbStatus").innerHTML = `<b style="color:var(--good)">Budget met with every fact kept.</b>`; T("game/word-budget", "Won Word Budget Sprint"); if (!st.stamps.budget) { addXP(30, "Word Budget Sprint"); stamp("budget"); } }
  else $("#wbStatus").textContent = (n > 40 ? `Cut ${n - 40} more words. ` : "") + (miss.length ? "Missing: " + miss.join(", ") : "");
}
$("#wbIn").addEventListener("input", wbCheck);

/* ---------------- interview ---------------- */
const IV = window.LL_INTERVIEW; $("#ivSet").innerHTML = Object.keys(IV).map((k) => `<option>${k}</option>`).join("");
let ivT = null, ivLeft = 120, ivStart = 0, ivQ = "";
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
$("#ivDraw").addEventListener("click", () => {
  const qs = IV[$("#ivSet").value]; ivQ = qs[Math.floor(Math.random() * qs.length)]; $("#ivQ").textContent = ivQ; $("#ivA").value = ""; $("#ivAIOut").textContent = "Answer, then press Finish.";
  ivLeft = +$("#ivTime").value; ivStart = Date.now(); clearInterval(ivT); $("#ivClock").textContent = clock(ivLeft); $("#ivClock").style.color = "";
  ivT = setInterval(() => { ivLeft--; $("#ivClock").textContent = clock(Math.max(0, ivLeft)); if (ivLeft <= 20) $("#ivClock").style.color = "var(--bad)"; if (ivLeft <= 0) ivFinish(); }, 1000); $("#ivA").focus();
});
function ivFinish() {
  clearInterval(ivT); const t = $("#ivA").value, w = wc(t), secs = Math.max(1, Math.round((Date.now() - ivStart) / 1000));
  if (!ivQ || w < 10) { $("#ivAIOut").textContent = "Draw a question and write at least 10 words."; return; }
  const a = analyze(t, "leadership");
  const star = [["Situation — set the scene", /\b(when|in 20\d\d|at (my|the)|as (a|the)|during|while)\b/i], ["Task — your goal or responsibility", /\b(goal|task|needed|responsib|had to|aim|target|role)\b/i], ["Action — what you did (\"I …\")", /\bI\s+(\w+ed|led|built|ran|made|took|set|won|wrote|taught|chose|began|spoke|met)\b/], ["Result — measurable outcome", /(\d|%|result|outcome|led to|increased|reduced|saved)/i], ["Reflection — what you learned", /\b(learn|taught me|realis|realiz|next time|since then)\b/i]];
  $("#ivStar").innerHTML = star.map(([l, re]) => { const ok = re.test(t); return `<label style="color:${ok ? "var(--good)" : "var(--ink2)"}"><input type="checkbox" disabled ${ok ? "checked" : ""}> ${l}</label>`; }).join("");
  const target = +$("#ivTime").value * 2.2; // ~130 wpm spoken
  $("#ivMeters").innerHTML = meterHTML({ Structure: Math.round((star.filter(([, re]) => re.test(t)).length / 5) * 100), Specificity: a.meters.Specificity, Originality: a.meters.Originality, Depth: Math.min(100, Math.round((w / target) * 100)) });
  $("#ivAIOut").textContent = `${w} words in ${clock(secs)}. Spoken at ~130 words a minute that's ${clock(Math.round((w / 130) * 60))}. ${sample ? "Ask the AI interviewer for a follow-up." : ""}`;
  st.iv++; save(); T("interview-answer", "Finished an interview answer"); addXP(20, "interview answer"); if (st.iv >= 3) stamp("interview");
}
$("#ivDone").addEventListener("click", ivFinish);
$("#ivAI").addEventListener("click", async () => {
  const t = $("#ivA").value.trim(); if (!sample || !ivQ || wc(t) < 10) return;
  $("#ivAI").disabled = true; $("#ivAIOut").textContent = "Thinking…";
  try {
    T("ai-interviewer", "Asked the AI interviewer");
    await sample(`You are a ${$("#ivSet").value} scholarship interview panellist. Question asked: "${ivQ}". Candidate's answer: """${t.slice(0, 5000)}"""
Reply in plain text, under 150 words, with three labelled lines:
Score: X/10 and one-sentence reason.
Strongest point:
Follow-up question: (the probing question a real panel would ask next)`, { cache: false, onText: ({ text }) => { $("#ivAIOut").textContent = text; } });
    addXP(10, "AI follow-up");
  } catch (e) { $("#ivAIOut").textContent = (e && e.text) || errCopy(e && e.code); }
  finally { $("#ivAI").disabled = false; }
});

/* ---------------- pathways ---------------- */
function renderPaths() {
  $("#pathList").innerHTML = window.LL_PATHWAYS.map((p, i) => `<div class="card pathcard stack"><h3>${esc(p.t)}</h3><p class="small muted">${esc(p.d)}</p><div class="list-check">${p.steps.map((s, j) => `<label class="small"><input type="checkbox" data-p="${i}-${j}" ${st.paths[i + "-" + j] ? "checked" : ""}> ${esc(s)}</label>`).join("")}</div></div>`).join("");
  $$("#pathList input").forEach((c) => c.addEventListener("change", () => { const k = c.dataset.p; if (c.checked && !st.paths[k]) addXP(5, "route step"); st.paths[k] = c.checked; save(); if (Object.values(st.paths).filter(Boolean).length >= 10) stamp("path"); }));
}

/* ---------------- tools ---------------- */
const future = DATA.filter((s) => s.deadline && daysTo(s.deadline) >= 0 && s.conf !== "closed").sort((a, b) => daysTo(a.deadline) - daysTo(b.deadline));
$("#rpSch").innerHTML = `<option value="">Custom date</option>` + future.map((s) => `<option value="${s.id}">${esc(s.name)} (${fmtD(parseD(s.deadline))})</option>`).join("");
const PLAN = [[-90, "Confirm eligibility; shortlist courses/programmes"], [-80, "Request transcripts and degree certificate"], [-70, "Book IELTS/TOEFL/Duolingo if needed"], [-60, "Draft every essay (Essay Dojo, free write)"], [-45, "Ask referees — send brag sheet (Referee builder)"], [-38, "Essay draft 2 + peer review"], [-30, "Finalise 2-page CV"], [-24, "AI coach review; draft 3 of each essay"], [-14, "Upload documents; check file names & sizes"], [-7, "Final proofread aloud; check word limits"], [-3, "Submit — never on the last day"], [0, "Official deadline"]];
function renderPlan() {
  const id = $("#rpSch").value; if (id) $("#rpDate").value = DATA.find((s) => s.id === id).deadline;
  const v = $("#rpDate").value; if (!v) { $("#rpOut").innerHTML = `<p class="small muted">Pick a date.</p>`; return; }
  const dl = parseD(v);
  $("#rpOut").innerHTML = PLAN.map(([o, t]) => { const d = new Date(dl); d.setDate(d.getDate() + o); const diff = Math.round((d - TODAY) / 864e5); return `<div class="plan-row ${diff < 0 ? "past" : diff <= 3 && diff >= 0 ? "today" : ""}"><span class="mono small">${fmtD(d)}</span><span>${esc(t)}${diff < 0 ? " <span class='small'>(overdue)</span>" : ""}</span></div>`; }).join("");
}
$("#rpSch").addEventListener("change", renderPlan); $("#rpDate").addEventListener("input", () => { $("#rpSch").value = ""; renderPlan(); });
$("#rpAdd").addEventListener("click", () => { T("planner-used", "Sent a deadline plan to the tracker"); const id = $("#rpSch").value; if (id) trackAdd(id); else trackAdd(null, "Custom application", $("#rpDate").value); stamp("planner"); go("tracker"); });

function renderGrade() {
  const sc = +$("#gcScale").value, v = +$("#gcVal").value; let cls, uk, us;
  if (sc === 5) { cls = v >= 4.5 ? "First Class" : v >= 3.5 ? "Second Class Upper" : v >= 2.4 ? "Second Class Lower" : v >= 1.5 ? "Third Class" : "Pass"; uk = v >= 4.5 ? "First (70%+)" : v >= 3.5 ? "Upper Second, 2:1 (60–69%)" : v >= 2.4 ? "Lower Second, 2:2 (50–59%)" : "Third (40–49%)"; us = Math.min(4, (v / 5) * 4); }
  else { cls = v >= 3.5 ? "Distinction" : v >= 3.0 ? "Upper Credit" : v >= 2.5 ? "Lower Credit" : v >= 2.0 ? "Pass" : "Below pass"; uk = v >= 3.0 ? "Often treated as 2:2–2:1 with a PGD; check each university" : "Often needs a PGD or bridging course"; us = Math.min(4, v); }
  $("#gcOut").innerHTML = [["Class", cls], ["UK equivalent (approx.)", uk], ["US GPA (approx.)", us.toFixed(2) + " / 4.0"]].map(([k, x]) => `<div class="stack" style="gap:2px"><span class="eyebrow">${k}</span><b>${esc(x)}</b></div>`).join("");
}
["gcScale", "gcVal"].forEach((i) => $("#" + i).addEventListener("input", renderGrade));

function renderEmails() {
  const g = (i) => $("#" + i).value.trim();
  $("#ceOut").textContent = `Subject: Prospective PhD student — ${g("ceIdea")}

Dear Professor ${g("ceProf")},

I read ${g("cePaper")} with great interest. I hold an ${g("ceMe")}, and I would like to explore ${g("ceIdea")} under your supervision from ${g("ceTerm")}.

[One sentence on your most relevant result, with a number.]

Could you tell me whether you expect to take new doctoral students for ${g("ceTerm")}, and whether funded positions or scholarship nominations are available in your group? I have attached a one-page CV and a one-page research outline.

Thank you for your time.

Kind regards,
[Your name]
[Link to profile / Google Scholar]`;
  $("#rfOut").textContent = `Subject: Reference request — ${g("rfSch")} application

Dear ${g("rfName")},

I am applying for the ${g("rfSch")} scholarship and would be grateful if you would act as one of my referees. The reference portal closes on ${g("rfDl")}; I will send the link as soon as I submit.

To make it easier, you might speak to: ${g("rfPts")}. I have attached my CV, draft essays and a short summary of the scholarship's criteria.

Please let me know if you are able to help, or if you would like any further information.

With thanks,
[Your name]`;
}
["ceProf", "cePaper", "ceMe", "ceIdea", "ceTerm", "rfName", "rfSch", "rfDl", "rfPts"].forEach((i) => $("#" + i).addEventListener("input", renderEmails));
function copyText(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast("Copied"), () => toast("Copy blocked — select the text instead")); else toast("Select the text to copy"); }
document.addEventListener("click", (e) => { const o = e.target.closest(".pass a[href]"); if (o) T("official-link", "Opened an official scholarship page"); });
document.addEventListener("click", (e) => { const c = e.target.closest("[data-copy]"); if (c) copyText($("#" + c.dataset.copy).textContent); });

const FG = { cost: [["Tuition", 18000], ["Living costs", 14000], ["Visa, health surcharge", 2500], ["Flights & settling in", 1800]], fund: [["Scholarship", 20000], ["Savings", 3000], ["Family / sponsor", 2000], ["Loan", 0]] };
$("#fgCost").innerHTML = `<span class="eyebrow">Costs / year</span>` + FG.cost.map(([k, v], j) => `<label class="f">${k}<input type="number" data-fg="c${j}" value="${v}" min="0"></label>`).join("");
$("#fgFund").innerHTML = `<span class="eyebrow">Funding / year</span>` + FG.fund.map(([k, v], j) => `<label class="f">${k}<input type="number" data-fg="f${j}" value="${v}" min="0"></label>`).join("");
function renderGap() { const sum = (p) => $$(`[data-fg^="${p}"]`).reduce((a, i) => a + (+i.value || 0), 0); const c = sum("c"), f = sum("f"), gap = c - f; $("#fgGap").textContent = (gap > 0 ? "−" : "+") + Math.abs(gap).toLocaleString(); $("#fgGap").style.color = gap > 0 ? "var(--bad)" : "var(--good)"; $("#fgBar").style.width = Math.min(100, c ? (f / c) * 100 : 0) + "%"; $("#fgBar").style.background = gap > 0 ? "var(--warn)" : "var(--good)"; }
$$("[data-fg]").forEach((i) => i.addEventListener("input", renderGap));

const SC = [["Asks you to pay an application or 'processing' fee", 3], ["Promises the award is guaranteed", 3], ["Asks for bank details, BVN, or card numbers", 3], ["Can't be found on the funder's official website", 2], ["Sent from a free email address (gmail, yahoo)", 2], ["Pressures you to act within 24–48 hours", 2], ["Spread only through WhatsApp broadcasts", 1], ["Spelling errors and unofficial logos", 1]];
$("#scList").innerHTML = SC.map(([t, w], j) => `<label class="small"><input type="checkbox" data-sc="${w}"> ${esc(t)}</label>`).join("");
function renderScam() { const s = $$("#scList input").filter((c) => c.checked).reduce((a, c) => a + +c.dataset.sc, 0); $("#scPin").style.left = `calc(${Math.min(100, (s / 10) * 100)}% - 2px)`; $("#scMsg").textContent = s === 0 ? "No red flags ticked." : s < 3 ? "Some caution — verify on the official site." : s < 6 ? "High risk. Contact the funder through its official website." : "Almost certainly a scam. Do not pay or share details."; $("#scMsg").style.color = s < 3 ? "var(--ink2)" : "var(--bad)"; }
$("#scList").addEventListener("change", renderScam);

let pmT = null, pmLeft = 1500;
$("#pmStart").addEventListener("click", () => { if (pmT) { clearInterval(pmT); pmT = null; $("#pmStart").textContent = "Resume"; return; } $("#pmStart").textContent = "Pause"; pmT = setInterval(() => { pmLeft--; $("#pmClock").textContent = clock(pmLeft); if (pmLeft <= 0) { clearInterval(pmT); pmT = null; pmLeft = 1500; $("#pmStart").textContent = "Start sprint"; st.pomos++; T("focus-sprint", "Finished a focus sprint"); addXP(20, "focus sprint done"); stamp("focus"); $("#pmDone").textContent = `${st.pomos} sprints finished`; } }, 1000); });
$("#pmReset").addEventListener("click", () => { clearInterval(pmT); pmT = null; pmLeft = 1500; $("#pmClock").textContent = "25:00"; $("#pmStart").textContent = "Start sprint"; });

$("#wtIn").addEventListener("input", () => { const t = $("#wtIn").value; const f = (t.match(fillRe) || []).map((x) => x.toLowerCase()), c = t.match(clRe) || []; const cnt = {}; f.forEach((x) => (cnt[x] = (cnt[x] || 0) + 1)); $("#wtOut").innerHTML = `<span>${wc(t)} words</span><span>${t.length} characters</span><span>${t.replace(/\s/g, "").length} without spaces</span>`; $("#wtCut").innerHTML = f.length || c.length ? `Cut first: ${Object.entries(cnt).map(([k, v]) => `<b>${esc(k)}</b> ×${v}`).join(", ")}${c.length ? ` · clichés: ${c.map((x) => `<b style="color:var(--bad)">${esc(x)}</b>`).join(", ")}` : ""}` : ""; });

/* ---------------- tracker ---------------- */
const STAGES = ["Researching", "Drafting", "Referees", "Submitted", "Result"];
function trackAdd(id, name, dl) {
  if (id && st.tracker.some((t) => t.id === id)) { toast("Already in your tracker"); return; }
  const s = id ? DATA.find((x) => x.id === id) : null;
  st.tracker.push({ id: id || "c" + Date.now(), name: s ? s.name : name, deadline: s ? s.deadline : dl || null, stage: 0 });
  save(); T("tracker-add", "Added an application to the tracker"); addXP(10, "added to tracker"); if (st.tracker.length >= 3) stamp("tracker"); renderTracker();
}
function untrack(id) {
  const t = st.tracker.find((x) => x.id === id); if (!t) return;
  st.tracker = st.tracker.filter((x) => x.id !== id); save(); renderTracker(); toast(`Removed ${t.name} from your tracker`); T("tracker-remove", "Removed an application from the tracker");
}
function renderTracker() {
  $("#tkSel").innerHTML = DATA.filter((s) => !st.tracker.some((t) => t.id === s.id)).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  $("#kanban").innerHTML = STAGES.map((sg, si) => { const items = st.tracker.filter((t) => t.stage === si); return `<div class="col"><h4><span>${sg}</span><span class="mono muted">${items.length}</span></h4>${items.map((t) => { const d = t.deadline ? daysTo(t.deadline) : null; return `<div class="kcard"><b>${esc(t.name)}</b><span class="small ${d !== null && d <= 14 && d >= 0 ? "" : "muted"}" style="${d !== null && d <= 14 && d >= 0 ? "color:var(--bad)" : ""}">${t.deadline ? (d >= 0 ? `T-${d} days · ${fmtD(parseD(t.deadline))}` : `Deadline passed ${fmtD(parseD(t.deadline))}`) : "No fixed deadline"}</span><div class="row"><button class="btn sm" data-mv="${t.id}" data-d="-1" ${si === 0 ? "disabled" : ""} aria-label="Move back">◀</button><button class="btn sm" data-mv="${t.id}" data-d="1" ${si === 4 ? "disabled" : ""} aria-label="Move forward">▶</button><button class="btn sm" data-rm="${t.id}">Remove</button></div></div>`; }).join("") || `<span class="small muted">Empty</span>`}</div>`; }).join("");
  renderPassport(); syncTBtns();
}
$("#tkAdd").addEventListener("click", () => { const v = $("#tkSel").value; if (v) trackAdd(v); });
$("#kanban").addEventListener("click", (e) => {
  const m = e.target.closest("[data-mv]"), r = e.target.closest("[data-rm]");
  if (m) { const t = st.tracker.find((x) => x.id === m.dataset.mv); t.stage = Math.max(0, Math.min(4, t.stage + +m.dataset.d)); if (+m.dataset.d > 0) addXP(10, `moved to ${STAGES[t.stage]}`); save(); renderTracker(); }
  if (r) { st.tracker = st.tracker.filter((x) => x.id !== r.dataset.rm); save(); renderTracker(); }
});
(async () => {
  let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) {}
  if (!dl) return; DL = dl; $("#tkExport").hidden = false;
  $("#tkExport").addEventListener("click", async () => { const rows = [["Scholarship", "Deadline", "Stage"], ...st.tracker.map((t) => [t.name, t.deadline || "", STAGES[t.stage]])]; const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"); try { await dl.save({ filename: "scholarship-tracker.csv", data: csv }); } catch (e) { toast("Download cancelled"); } });
})();

/* ---------------- scholar stories ---------------- */
let STORIES = [], STORIES_SHOWN = [];
const safeURL = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
function renderStories() {
  const f = $("#stFilter").value; STORIES_SHOWN = STORIES.filter((x) => !f || x.scholarship === f);
  if (!STORIES.length) { $("#stList").innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No stories published yet</h3><p>Won a scholarship? Share how you did it — your story could be the reason the next applicant applies.</p></div>`; return; }
  $("#stList").innerHTML = STORIES_SHOWN.map((x, i) => {
    const photo = x.photo ? safeURL(x.photo) : "", link = x.contact_url ? safeURL(x.contact_url) : "", first = String(x.name || "").split(" ")[0];
    const story = String(x.story || ""), long = story.length > 520;
    return `<article class="card story"><div class="story-top">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : `<span class="ph">${esc(first.slice(0, 1))}</span>`}<div><h3>${esc(x.name || "")}</h3><div class="small muted">${esc([x.scholarship, x.year].filter(Boolean).join(" · "))}</div><div class="small muted">${esc([x.course, x.university].filter(Boolean).join(", "))}${x.home_country ? " · from " + esc(x.home_country) : ""}</div></div></div>
      <blockquote>${esc(long ? story.slice(0, 520) + "…" : story)}</blockquote>${long ? `<button type="button" class="btn sm" data-more="${i}" style="align-self:flex-start">Read the full story</button>` : ""}
      ${x.tips && x.tips.length ? `<div><b class="small">Top tips</b><ul class="small muted" style="margin:4px 0 0;padding-left:18px">${x.tips.map((tp) => `<li>${esc(typeof tp === "string" ? tp : tp.tip || "")}</li>`).join("")}</ul></div>` : ""}
      ${link ? `<a class="btn sm teal" style="align-self:flex-start" href="${esc(link)}" target="_blank" rel="noopener nofollow">Ask ${esc(first)} a question ↗</a>` : `<span class="small muted">This scholar has not shared a contact link.</span>`}</article>`;
  }).join("") || `<p class="muted">No stories for this scholarship yet.</p>`;
}
$("#stList").addEventListener("click", (e) => { const b = e.target.closest("[data-more]"); if (!b) return; b.previousElementSibling.textContent = STORIES_SHOWN[+b.dataset.more].story; b.remove(); });
$("#stFilter").addEventListener("change", renderStories);
if (STORY_FORM_URL) { $("#stShare").href = STORY_FORM_URL + (STORY_FORM_URL.includes("?") ? "&" : "?") + "tool=laureate"; } else { $("#stShare").hidden = true; }
fetch("stories.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { stories: [] })).catch(() => ({ stories: [] })).then((d) => {
  STORIES = ((d && d.stories) || []).filter((x) => x && x.name && x.story && x.consent === true && !x.hidden);
  const names = [...new Set(STORIES.map((x) => x.scholarship).filter(Boolean))].sort();
  $("#stFilter").innerHTML = `<option value="">All scholarships</option>` + names.map((n) => `<option>${esc(n)}</option>`).join("");
  renderStories();
});

/* ---------------- step-by-step guide (hand-holding mode) ---------------- */
st.guide = Object.assign({ cur: null, step: {}, done: {}, acts: {}, checks: {}, elig: {}, started: {} }, st.guide || {});
const G = { cache: {}, data: null, s: null, i: 0 };
const PHASES = ["Decide", "Prepare", "Documents", "Write", "References", "Apply", "After you apply"];
const okURL = (u) => /^https?:\/\//i.test(String(u || "")) ? String(u) : "";
const ytEmbed = (u) => {
  u = String(u || "");
  const v = /[?&]v=([\w-]{11})/.exec(u) || /youtu\.be\/([\w-]{11})/.exec(u) || /\/shorts\/([\w-]{11})/.exec(u);
  const l = /[?&]list=([\w-]+)/.exec(u);
  if (v) return "https://www.youtube-nocookie.com/embed/" + v[1] + "?autoplay=1&rel=0" + (l ? "&list=" + l[1] : "");
  if (l) return "https://www.youtube-nocookie.com/embed/videoseries?list=" + l[1] + "&autoplay=1&rel=0";
  return "";
};
function gStatus(s) {
  /* where the applicant stands: apply now, or prepare for the next round with projected dates */
  const k = status(s).k;
  if (!s.deadline || s.conf === "closed" && !s.deadline) return { mode: "nodate", dl: null, proj: false };
  let d = parseD(s.deadline), proj = false;
  if (k === "closed" || daysTo(s.deadline) < 0) { while (d < TODAY) d.setFullYear(d.getFullYear() + 1); proj = true; }
  return { mode: proj ? "next" : "now", dl: d, proj };
}
function gDue(step, gs) {
  if (!gs.dl || step.due === null || step.due === undefined || step.due === "" || isNaN(+step.due)) return null;
  let back = +step.due;
  /* short on time? squeeze the plan so every step still fits between today and the deadline */
  if (back > 0 && gs.mode === "now" && G.data) {
    const left = Math.round((gs.dl - TODAY) / 864e5), max = Math.max(...G.data.steps.map((x) => (+x.due > 0 ? +x.due : 0)));
    if (max > left - 1 && left > 1) back = Math.round(back * (left - 1) / max);
  }
  const d = new Date(gs.dl); d.setDate(d.getDate() - back); return d;
}
function gSqueezed(gs) { if (gs.mode !== "now" || !G.data) return false; const left = Math.round((gs.dl - TODAY) / 864e5); return Math.max(...G.data.steps.map((x) => (+x.due > 0 ? +x.due : 0))) > left - 1; }
const gKey = (id, i) => id + "|" + i;
function gStepDone(id, i) { return !!st.guide.done[gKey(id, i)]; }
function gProgress(id, n) { let c = 0; for (let i = 0; i < n; i++) if (gStepDone(id, i)) c++; return c; }
function gLoad(id) {
  if (G.cache[id]) return Promise.resolve(G.cache[id]);
  return fetch("guides/" + encodeURIComponent(id) + ".json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => (G.cache[id] = d));
}

/* --- picker --- */
let gWhen = "";
function renderGuidePick() {
  const q = $("#gQ").value.toLowerCase().trim(), lv = $("#gLevel").value;
  const list = DATA.filter((s) => {
    if (lv && !s.levels.includes(lv)) return false;
    const gs = gStatus(s);
    if (gWhen === "now" && gs.mode !== "now") return false;
    if (gWhen === "next" && gs.mode === "now") return false;
    if (q && !(s.name + " " + s.host + " " + s.tags.join(" ") + " " + s.levels.join(" ") + " " + (s.fields || []).join(" ")).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => { const A = gStatus(a), B = gStatus(b); const w = (x) => (x.mode === "now" ? 0 : x.mode === "next" ? 1 : 2); return w(A) - w(B) || ((A.dl || 0) - (B.dl || 0)) || a.name.localeCompare(b.name); });
  $("#gList").innerHTML = list.map((s) => {
    const gs = gStatus(s), started = st.guide.started[s.id];
    const when = gs.mode === "now" ? `<span class="pill p-open">Apply now · T-${daysTo(s.deadline)}</span>` : gs.mode === "next" ? `<span class="pill p-up">Prepare for next round</span>` : `<span class="pill p-up">Watch for the call</span>`;
    return `<button type="button" class="gpick" data-gstart="${s.id}"><div class="gp-meta">${when}<span>${esc(s.levels.join(" · "))}</span></div><h3>${esc(s.name)}</h3><span class="small muted">${esc(s.host)} · ${esc(s.funding)}</span>${started ? `<span class="small" style="color:var(--good);font-weight:600">You've started this guide → continue</span>` : `<span class="small" style="color:var(--accent);font-weight:600">Start the step-by-step guide →</span>`}</button>`;
  }).join("") || `<p class="muted">Nothing matches. Clear the search.</p>`;
  const mine = Object.keys(st.guide.started).filter((id) => DATA.some((s) => s.id === id));
  $("#gMine").innerHTML = mine.length ? `<div class="card gmine"><h3>Continue where you left off</h3><div class="row">${mine.map((id) => { const s = DATA.find((x) => x.id === id), n = st.guide.started[id].n || 0, c = gProgress(id, n); return `<button type="button" class="btn" data-gstart="${id}">${esc(s.name)} <span class="mono small muted">${c}/${n}</span></button>`; }).join("")}</div></div>` : "";
}
$("#gQ").addEventListener("input", renderGuidePick);
$("#gLevel").addEventListener("input", renderGuidePick);
$$("#gWhen button").forEach((b) => b.addEventListener("click", () => { gWhen = b.dataset.w; $$("#gWhen button").forEach((x) => x.setAttribute("aria-pressed", x === b)); renderGuidePick(); }));

/* --- open a guide --- */
function openGuide(id, stepIdx) {
  const s = DATA.find((x) => x.id === id); if (!s) return;
  go("guide", true);
  $("#gPick").hidden = true; $("#gRun").hidden = false;
  $("#gRun").innerHTML = `<div class="card"><p class="muted">Loading the guide for ${esc(s.name)}…</p></div>`;
  gLoad(id).then((d) => {
    G.data = d; G.s = s; st.guide.cur = id;
    if (!st.guide.started[id]) { st.guide.started[id] = { on: dayKey(), n: d.steps.length }; T("guide-start/" + id, "Started guide: " + s.name); addXP(10, "started a step-by-step guide"); }
    st.guide.started[id].n = d.steps.length;
    G.i = stepIdx != null ? stepIdx : (st.guide.step[id] != null ? st.guide.step[id] : -1);
    save(); renderGuide(); setHash();
  }).catch(() => { $("#gRun").innerHTML = `<div class="card stack"><p>The guide couldn't load. Check your connection and try again.</p><div class="row"><button class="btn" data-gback>Back to the list</button><a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener">Official page ↗</a></div></div>`; });
}
function closeGuide() { st.guide.cur = null; save(); $("#gRun").hidden = true; $("#gPick").hidden = false; renderGuidePick(); setHash(); window.scrollTo({ top: 0 }); }
function setHash() { try { history.replaceState(null, "", "#guide" + (st.guide.cur && !$("#gRun").hidden ? "/" + st.guide.cur + (G.i >= 0 ? "/" + (G.i + 1) : "") : "")); } catch (e) {} }

function renderGuide() {
  const d = G.data, s = G.s, id = s.id, gs = gStatus(s), n = d.steps.length, c = gProgress(id, n);
  const dl = gs.dl ? fmtD(gs.dl) : "", left = gs.dl ? Math.round((gs.dl - TODAY) / 864e5) : null;
  const banner = gs.mode === "now"
    ? (gSqueezed(gs) ? `<div class="g-banner ${left <= 14 ? "bad" : "warn"}"><b>${left} days left.</b> Winners usually start about ${Math.max(...d.steps.map((x) => (+x.due > 0 ? +x.due : 0)))} days out, so I've squeezed every step to fit the time you have. Work through them in order and don't skip the checks.</div>` : "")
    : gs.mode === "next" ? `<div class="g-banner warn"><b>This round has closed.</b> Use this guide to get ready for the next one. Dates below are projected from this year's deadline (${esc(s.window)}). Check the official page when the new call opens.</div>`
    : `<div class="g-banner warn"><b>No fixed deadline yet.</b> ${esc(s.window || "")} Do the early steps now so you can apply the moment the call opens.</div>`;
  const plan = PHASES.concat(["Other"]).map((ph) => {
    const items = d.steps.map((x, i) => [x, i]).filter(([x]) => (PHASES.includes(x.phase) ? x.phase : "Other") === ph);
    if (!items.length) return "";
    return `<li class="ph">${esc(ph)}</li>` + items.map(([x, i]) => {
      const due = gDue(x, gs), done = gStepDone(id, i), late = !done && due && due < TODAY && gs.mode === "now";
      return `<li class="${done ? "done" : ""} ${late ? "late" : ""}"><button type="button" data-gstep="${i}" ${G.i === i ? 'aria-current="step"' : ""}><span class="dot">${done ? "✓" : i + 1}</span><span>${esc(x.title)}<small>${due ? (late ? "Overdue · was " : gs.proj ? "Aim for " : "Finish by ") + fmtD(due) : x.due < 0 ? "After you apply" : "When it applies"}</small></span></button></li>`;
    }).join("");
  }).join("");
  const vids = (d.videos || []).filter((v) => okURL(v.u));
  $("#gRun").innerHTML = `
  <div class="row" style="justify-content:space-between"><button type="button" class="btn sm" data-gback>← All scholarships</button><div class="g-tools"><button type="button" class="btn sm" id="gIcs">Add my plan to calendar</button><button type="button" class="btn sm" id="gPrint">Print / save as PDF</button>${tbtn(id)}<button type="button" class="btn sm" id="gShare">Copy link to this guide</button></div></div>
  <div class="card g-head">
    <div class="row" style="gap:6px"><span class="pill ${status(s).cls}">${status(s).label}</span>${confPill(s)}<span class="pill p-up">${esc(s.host)}</span></div>
    <h2>${esc(s.name)}</h2>
    <p>${esc(d.summary || "")}</p>
    <div class="g-count">${gs.dl ? `<div><span class="eyebrow">${gs.proj ? "Next deadline (projected)" : "Deadline"}</span><div><b class="mono">${left}</b> <span class="muted">days · ${dl}</span></div></div>` : ""}<div style="flex:1;min-width:200px"><span class="eyebrow">Your progress</span><div class="row" style="gap:8px"><div class="gbar" style="flex:1"><i style="width:${(c / n) * 100}%"></i></div><span class="mono small">${c}/${n} steps</span></div></div></div>
    ${banner}
  </div>
  <div class="g-wrap">
    <aside class="g-side">
      <div class="card" style="padding:12px"><button type="button" class="btn sm" data-gstep="-1" style="width:100%;justify-content:center;margin-bottom:6px" ${G.i === -1 ? 'aria-current="step"' : ""}>Start here: can you apply?</button><ol class="g-plan">${plan}</ol></div>
      ${vids.length ? `<div class="card stack" style="padding:12px"><h3 style="font-size:1rem">Watch and learn</h3><div class="vids">${vids.map(vidHTML).join("")}</div></div>` : ""}
    </aside>
    <div class="card" id="gMain">${G.i === -1 ? eligHTML() : G.i >= n ? finishHTML() : stepHTML(G.i)}</div>
  </div>
  ${(d.faq || []).length ? `<div class="card g-faq"><h3>Questions first-time applicants ask</h3>${d.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>` : ""}
  <p class="small muted">Guide researched from the official ${esc(s.name)} pages and other sources on ${fmtD(parseD(d.checked || window.LL_CHECKED))}. Rules change every cycle: always confirm on the <a href="${esc(s.url)}" target="_blank" rel="noopener">official page</a>. Laureate Lab is free and not affiliated with any funder. ${(d.sources || []).length ? `<details style="display:inline"><summary style="display:inline;cursor:pointer;text-decoration:underline">Sources (${d.sources.length})</summary><span style="display:block;margin-top:6px">${d.sources.filter(okURL).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener" style="display:block;word-break:break-all">${esc(u)}</a>`).join("")}</span></details>` : ""}</p>`;
}
function vidHTML(v, j) {
  const emb = v.kind !== "search" ? ytEmbed(v.u) : "";
  const inner = `<span class="pl ${emb ? "" : "s"}"></span><span>${esc(v.t)}<small>${esc(v.by ? v.by + " · " : "")}${esc(v.why || (emb ? "" : "Opens YouTube search"))}</small></span>`;
  return `<div class="vid">${emb ? `<button type="button" data-vid="${esc(emb)}" data-watch="${esc(okURL(v.u))}" aria-label="Play video: ${esc(v.t)}">${inner}</button>` : `<a href="${esc(okURL(v.u))}" target="_blank" rel="noopener">${inner}</a>`}</div>`;
}
function linksHTML(links) {
  const L = (links || []).filter((l) => okURL(l.u));
  if (!L.length) return "";
  const lbl = { official: "Official", guide: "Guide", video: "Video", search: "YouTube" };
  return `<div class="g-sec"><h4>Open these</h4><div class="g-links">${L.map((l) => {
    const emb = l.kind === "video" ? ytEmbed(l.u) : "";
    return emb ? `<div class="vid"><button type="button" data-vid="${esc(emb)}" data-watch="${esc(l.u)}"><span class="pl"></span><span>${esc(l.t)}<small>Plays here</small></span></button></div>`
      : `<a href="${esc(l.u)}" target="_blank" rel="noopener"><span class="k ${esc(l.kind || "")}">${lbl[l.kind] || "Link"}</span><span>${esc(l.t)} ↗</span></a>`;
  }).join("")}</div></div>`;
}
function eligHTML() {
  const d = G.data, id = G.s.id, qs = d.eligibility || [];
  const ans = (j) => st.guide.elig[gKey(id, j)];
  const no = qs.some((q, j) => q.must && ans(j) === "no");
  const all = qs.length && qs.every((q, j) => ans(j));
  return `<div class="g-step">
    <div class="g-step-top"><div><span class="eyebrow">Before you start</span><h3>Can you apply? Answer honestly.</h3></div></div>
    <p class="g-why">Most rejected applications fail here, before anyone reads an essay. Answer each question. If you hit a "no", I'll tell you what to do instead.</p>
    ${(d.lookfor || []).length ? `<div class="g-box g-tipbox"><h4 class="eyebrow">What the selectors look for</h4><ul>${d.lookfor.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    ${d.cycle ? `<p class="small"><b>This cycle:</b> ${esc(d.cycle)}</p>` : ""}
    <div class="g-elig">${qs.map((q, j) => { const a = ans(j); return `<div class="g-q"><span>${esc(q.q)}${q.must ? "" : ` <span class="small muted">(helps, not required)</span>`}</span><div class="seg" role="group" aria-label="Your answer">${["yes", "no", "unsure"].map((v) => `<button type="button" data-elig="${j}" data-a="${v}" aria-pressed="${a === v}">${v === "unsure" ? "Not sure" : v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div>${a === "no" && q.no ? `<div class="no-msg">${q.must ? "<b>This one is required.</b> " : ""}${esc(q.no)}</div>` : ""}${a === "unsure" ? `<div class="unsure-msg">Check this on the <a href="${esc(G.s.url)}" target="_blank" rel="noopener">official eligibility page</a> before you spend time on the application.${q.no ? " If it turns out to be no: " + esc(q.no) : ""}</div>` : ""}</div>`; }).join("")}</div>
    ${no ? `<div class="g-banner bad"><b>You don't meet a required condition yet.</b> Read the advice above. You can still read the steps to learn how this award works, or <button type="button" class="btn sm" data-gback>pick another scholarship</button>.</div>` : all ? `<div class="g-banner good"><b>Good, you can apply.</b> Next I'll take you through every step in order. Each one shows when to finish it.</div>` : ""}
    <div class="g-nav"><span></span><button type="button" class="btn primary" data-gstep="0">${no ? "Show me the steps anyway" : "Start step 1"} →</button></div>
  </div>`;
}
function stepHTML(i) {
  const d = G.data, s = G.s, id = s.id, x = d.steps[i], n = d.steps.length, gs = gStatus(s), due = gDue(x, gs);
  const late = due && due < TODAY && gs.mode === "now" && !gStepDone(id, i);
  const acts = x.do || [], checks = x.check || [];
  const actOK = (j) => !!st.guide.acts[gKey(id, i) + "|" + j], chkOK = (j) => !!st.guide.checks[gKey(id, i) + "|" + j];
  const essayName = x.essay && ESSAYS[x.essay] ? ESSAYS[x.essay].name : "";
  const ready = checks.every((c, j) => chkOK(j));
  return `<div class="g-step">
    <div class="g-step-top"><div><span class="eyebrow">Step ${i + 1} of ${n} · ${esc(x.phase || "")}</span><h3>${esc(x.title)}</h3></div>
      <div class="g-when">${due ? `<span class="pill ${late ? "p-closed" : "p-open"}">${late ? "Overdue · was " : gs.proj ? "Aim for " : "Finish by "}${fmtD(due)}</span>` : x.due < 0 ? `<span class="pill p-up">After you apply</span>` : ""}${x.time ? `<span class="pill p-up">⏱ ${esc(x.time)}</span>` : ""}</div></div>
    ${x.why ? `<p class="g-why"><b>Why this matters:</b> ${esc(x.why)}</p>` : ""}
    ${late ? `<div class="g-banner bad">You're behind on this one. Do it today: the later steps depend on it.</div>` : ""}
    <div class="g-sec"><h4>Do this, in order</h4><ol class="g-do">${acts.map((a, j) => `<li><label><input type="checkbox" data-gact="${i}|${j}" ${actOK(j) ? "checked" : ""}><span>${esc(a)}</span></label></li>`).join("")}</ol></div>
    ${x.essay || x.prompt ? `<div class="g-essay"><span class="eyebrow">The question you're answering</span>${x.prompt ? `<p style="font-size:15px"><b>${esc(x.prompt)}</b></p>` : ""}${x.limit ? `<p class="small">Limit: <b>${esc(x.limit)}</b></p>` : ""}${essayName ? `<div class="row"><button type="button" class="btn primary sm" data-gessay="${esc(x.essay)}">Draft it in the Essay Dojo (${esc(essayName.toLowerCase())})</button><span class="small muted">Your draft is colour-coded as you type; come back here when it's done.</span></div>` : ""}</div>` : ""}
    ${(x.tips || []).length || (x.avoid || []).length ? `<div class="g-two">${(x.tips || []).length ? `<div class="g-box g-tipbox"><h4 class="eyebrow">Do it well</h4><ul>${x.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}${(x.avoid || []).length ? `<div class="g-box avoid"><h4 class="eyebrow">Avoid these mistakes</h4><ul>${x.avoid.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}</div>` : ""}
    ${linksHTML(x.links)}
    ${checks.length ? `<div class="g-check"><h4 class="eyebrow" style="margin-bottom:6px">Before you move on, can you say yes to these?</h4>${checks.map((c, j) => `<label><input type="checkbox" data-gchk="${i}|${j}" ${chkOK(j) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div>` : ""}
    <div class="g-nav">
      <button type="button" class="btn" data-gstep="${i - 1}">← ${i === 0 ? "Can you apply?" : "Previous step"}</button>
      <div class="row">${gStepDone(id, i) ? `<button type="button" class="btn sm" data-gundo="${i}">Mark not done</button><button type="button" class="btn primary" data-gstep="${i + 1}">Next step →</button>` : `<button type="button" class="btn primary" data-gdone="${i}" ${ready ? "" : 'title="Tick the checks above first, or mark it done anyway"'}>${ready ? "Done, next step →" : "Mark done and continue →"}</button>`}</div>
    </div>
  </div>`;
}
function finishHTML() {
  const s = G.s, n = G.data.steps.length, c = gProgress(s.id, n);
  return `<div class="g-done-all"><span class="big">${c}/${n}</span><h3>${c === n ? "You've worked through every step." : "You've reached the end of the guide."}</h3><p class="muted" style="max-width:52ch">${c === n ? "That's the whole application, done the way winners do it. Keep the guide open for results day and the next stage." : "Some steps are still open. Use the plan on the left to go back to them."}</p><div class="row" style="justify-content:center"><button type="button" class="btn" data-gstep="0">Back to step 1</button><button type="button" class="btn primary" data-go="interview">Practise in the Interview Room</button><button type="button" class="btn" data-gback>Start another guide</button></div></div>`;
}
function gShow(i) { G.i = i; st.guide.step[G.s.id] = i; save(); renderGuide(); setHash(); const m = $("#gMain"); if (m) m.scrollIntoView({ behavior: "smooth", block: "start" }); }
document.addEventListener("click", (e) => {
  const t = e.target;
  const gs = t.closest("[data-gstart]"); if (gs) { openGuide(gs.dataset.gstart); return; }
  if (t.closest("[data-gback]")) { closeGuide(); return; }
  const sp = t.closest("[data-gstep]"); if (sp && G.data) { const i = +sp.dataset.gstep; gShow(Math.max(-1, Math.min(G.data.steps.length, i))); return; }
  const el = t.closest("[data-elig]"); if (el && G.s) { st.guide.elig[gKey(G.s.id, el.dataset.elig)] = el.dataset.a; save(); const y = window.scrollY; renderGuide(); window.scrollTo(0, y); return; }
  const dn = t.closest("[data-gdone]"); if (dn && G.s) {
    const i = +dn.dataset.gdone, k = gKey(G.s.id, i);
    if (!st.guide.done[k]) { st.guide.done[k] = dayKey(); addXP(25, "step done: " + G.data.steps[i].title); T("guide-step/" + G.s.id, "Finished a guide step"); }
    const n = G.data.steps.length; if (gProgress(G.s.id, n) === n) { stamp("coach"); T("guide-finish/" + G.s.id, "Finished a whole guide: " + G.s.name); }
    gShow(i + 1); return;
  }
  const un = t.closest("[data-gundo]"); if (un && G.s) { delete st.guide.done[gKey(G.s.id, +un.dataset.gundo)]; save(); renderGuide(); return; }
  const es = t.closest("[data-gessay]"); if (es) { $("#eType").value = es.dataset.gessay; loadType(); go("dojo"); return; }
  const v = t.closest("[data-vid]"); if (v) { const box = v.closest(".vid"); if (!box.querySelector("iframe")) { box.insertAdjacentHTML("beforeend", `<iframe src="${esc(v.dataset.vid)}" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe><a class="small" style="display:block;padding:6px 10px" href="${esc(v.dataset.watch || "")}" target="_blank" rel="noopener">Not playing here? Watch on YouTube ↗</a>`); T("guide-video", "Played a guide video"); } else { box.querySelector("iframe").remove(); const w = box.querySelector("a.small"); if (w) w.remove(); } return; }
  if (t.closest("#gPrint")) { window.print(); return; }
  if (t.closest("#gShare")) { copyText(location.origin + location.pathname + "#guide/" + G.s.id); return; }
  if (t.closest("#gIcs")) { gCalendar(); return; }
});
document.addEventListener("change", (e) => {
  const a = e.target.closest("[data-gact]"), c = e.target.closest("[data-gchk]");
  if (!(a || c) || !G.s) return;
  const [i, j] = (a || c).dataset[a ? "gact" : "gchk"].split("|");
  const bag = a ? st.guide.acts : st.guide.checks, k = gKey(G.s.id, i) + "|" + j;
  if (e.target.checked) { bag[k] = 1; if (a) addXP(2); } else delete bag[k];
  save();
  if (c) { const x = G.data.steps[+i], ok = (x.check || []).every((q, jj) => st.guide.checks[gKey(G.s.id, i) + "|" + jj]); const b = $(`[data-gdone="${i}"]`); if (b) { b.textContent = ok ? "Done, next step →" : "Mark done and continue →"; } }
});
function gCalendar() {
  const s = G.s, gs = gStatus(s), d = G.data;
  const ics = (dt) => dt.getFullYear() + String(dt.getMonth() + 1).padStart(2, "0") + String(dt.getDate()).padStart(2, "0");
  const clean = (t) => String(t).replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const ev = [];
  d.steps.forEach((x, i) => { const due = gDue(x, gs); if (!due || due < TODAY) return; const e2 = new Date(due); e2.setDate(e2.getDate() + 1); ev.push(["BEGIN:VEVENT", "UID:" + s.id + "-" + i + "@shagbaor.com/laureate", "DTSTAMP:" + ics(new Date()) + "T000000Z", "DTSTART;VALUE=DATE:" + ics(due), "DTEND;VALUE=DATE:" + ics(e2), "SUMMARY:" + clean(s.name + ": " + x.title), "DESCRIPTION:" + clean((x.do || []).map((a, j) => j + 1 + ". " + a).join("\n") + "\nGuide: " + location.origin + location.pathname + "#guide/" + s.id + "/" + (i + 1)), "END:VEVENT"].join("\r\n")); });
  if (gs.dl && gs.dl >= TODAY) { const e2 = new Date(gs.dl); e2.setDate(e2.getDate() + 1); ev.push(["BEGIN:VEVENT", "UID:" + s.id + "-deadline@shagbaor.com/laureate", "DTSTAMP:" + ics(new Date()) + "T000000Z", "DTSTART;VALUE=DATE:" + ics(gs.dl), "DTEND;VALUE=DATE:" + ics(e2), "SUMMARY:" + clean(s.name + " DEADLINE" + (gs.proj ? " (projected — confirm)" : "")), "END:VEVENT"].join("\r\n")); }
  if (!ev.length) { toast("No upcoming dates to add yet"); return; }
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Laureate Lab//EN", "CALSCALE:GREGORIAN"].concat(ev, ["END:VCALENDAR"]).join("\r\n");
  saveFile(s.id + "-plan.ics", body, "text/calendar"); T("guide-calendar", "Exported a guide plan to calendar"); addXP(10, "plan added to calendar");
}
renderGuidePick();

/* ---------------- v4: live openings, page watcher, compare, funding types, winners library, CV Studio ---------------- */
const getJSON = (f) => fetch(f, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const FUND = { full: "Fully funded", partial: "Partial", grant: "Grant / bursary", loan: "Loan", staff: "Staff training" };
const FUNDMAP = { kth: "partial", radboud: "partial", eiffel: "partial", uopeople: "partial", aauw: "partial", eth: "full", delft: "full", "ubc-isp": "full",
  nlng: "grant", agbami: "grant", shell: "grant", seplat: "grant", mtn: "grant", ovia: "grant", nbplc: "grant", state: "grant", nelfund: "loan", tetfund: "staff", "fsb-bea": "full" };
DATA.forEach((s) => (s.fund = FUNDMAP[s.id] || "full"));
const V4 = { live: null, watch: null, vids: null, winners: null, cv: null };
st.lastVisit = st.lastVisit || null; const prevVisit = st.lastVisit; st.lastVisit = dayKey(); save();
st.cmp = st.cmp || []; st.cvDoc = st.cvDoc || null;

/* --- live feed --- */
function liveHTML(list, max) {
  return list.slice(0, max).map((i) => {
    const s = (i.ids || []).map((id) => DATA.find((x) => x.id === id)).filter(Boolean);
    const fresh = prevVisit && i.seen > prevVisit;
    return `<div class="live-item"><time>${esc(fmtD(parseD(i.date)).replace(/ \d{4}$/, ""))}</time><div><a href="${esc(okURL(i.link))}" target="_blank" rel="noopener nofollow">${esc(i.title)} ↗</a>${fresh ? `<span class="nw">NEW</span>` : ""}<small>${esc(i.source)}${i.official ? " · official" : ""}${s.length ? ` · ${s.map((x) => `<button type="button" class="btn sm" style="padding:1px 7px;font-size:11.5px" data-gstart="${x.id}">Guide: ${esc(x.name.split(" (")[0])}</button>`).join(" ")}` : ""}</small></div></div>`;
  }).join("") || `<p class="small muted">Nothing new matches.</p>`;
}
function renderLive() {
  const L = V4.live; if (!L || !(L.items || []).length) return;
  const items = L.items;
  const newN = prevVisit ? items.filter((i) => i.seen > prevVisit).length : 0;
  $("#homeLive").hidden = false; $("#homeLiveList").innerHTML = liveHTML(items, 8);
  $("#liveUpd").textContent = "Updated " + fmtD(parseD(L.updated));
  if (newN) { $("#liveNew").hidden = false; $("#liveNew").textContent = newN + " new since your last visit"; }
  const off = $("#liveOfficial").checked, mine = $("#liveMine").checked, tracked = st.tracker.map((t) => t.id);
  const list = items.filter((i) => (!off || i.official) && (!mine || (i.ids || []).some((id) => tracked.includes(id))));
  $("#atlasLive").hidden = false; $("#atlasLiveCount").textContent = `${items.length} posts in the last ~10 weeks${newN ? ` · ${newN} new since your last visit` : ""}`;
  $("#atlasLiveList").innerHTML = liveHTML(list, 40);
}
["liveOfficial", "liveMine"].forEach((id) => $("#" + id).addEventListener("change", renderLive));

/* --- watcher pill + compare + funding on atlas cards --- */
function watchPill(s) {
  const p = V4.watch && V4.watch.pages && V4.watch.pages[s.id]; if (!p || !p.ok) return "";
  const out = [];
  if (p.signal === "open" && status(s).k !== "open") out.push(`<span class="pill p-open" title="${esc(p.evidence || "")}">Official page says applications are open · auto-check ${esc(fmtD(parseD(p.since || p.checked)))}</span>`);
  else if (p.changed && daysTo(p.changed) >= -14) out.push(`<span class="pill p-watch" title="The official page changed. Check it for new dates or rules.">Official page updated ${esc(fmtD(parseD(p.changed)))}</span>`);
  return out.join("");
}
const _passCard = passCard;
passCard = function (s, extra = "") {
  const add = `<div class="row" style="gap:6px"><span class="pill p-fund">${FUND[s.fund]}</span>${watchPill(s)}<label class="cmp-chk"><input type="checkbox" data-cmp="${s.id}" ${st.cmp.includes(s.id) ? "checked" : ""}> Compare</label></div>`;
  return _passCard(s, add + extra);
};
const _renderAtlas = renderAtlas;
renderAtlas = function () {
  const f = $("#aFund").value;
  if (!f) return _renderAtlas();
  const keep = DATA.slice(); DATA.length = 0; keep.filter((s) => s.fund === f).forEach((s) => DATA.push(s));
  try { _renderAtlas(); } finally { DATA.length = 0; keep.forEach((s) => DATA.push(s)); }
};
$("#aFund").addEventListener("input", () => renderAtlas());
/* the original filters were bound to the old function: re-apply the funding filter after them */
["aQ", "aLevel", "aRegion", "aSort", "fAny"].forEach((id) => $("#" + id).addEventListener("input", () => { if ($("#aFund").value) renderAtlas(); }));
$("#fieldList").addEventListener("change", () => { if ($("#aFund").value) renderAtlas(); });
$$("#aStatus button").forEach((b) => b.addEventListener("click", () => { if ($("#aFund").value) renderAtlas(); }));
function cmpSync() { const n = st.cmp.length; $("#cmpBar").hidden = !n || !$("#v-atlas").classList.contains("on"); $("#cmpTxt").textContent = n === 1 ? "1 selected — pick up to 2 more" : `${n} selected`; }
document.addEventListener("change", (e) => {
  const c = e.target.closest("[data-cmp]"); if (!c) return;
  const id = c.dataset.cmp;
  if (c.checked) { if (st.cmp.length >= 3) { c.checked = false; toast("Compare up to 3 at a time"); return; } st.cmp.push(id); } else st.cmp = st.cmp.filter((x) => x !== id);
  save(); cmpSync();
});
$("#cmpClear").addEventListener("click", () => { st.cmp = []; save(); cmpSync(); $$("[data-cmp]").forEach((c) => (c.checked = false)); });
$("#cmpClose").addEventListener("click", () => $("#cmpDlg").close());
$("#cmpGo").addEventListener("click", () => {
  const L = st.cmp.map((id) => DATA.find((s) => s.id === id)).filter(Boolean);
  const row = (h, f) => `<tr><th>${h}</th>${L.map((s) => `<td>${f(s)}</td>`).join("")}</tr>`;
  $("#cmpTable").innerHTML = `<table><tr><th></th>${L.map((s) => `<td><b>${esc(s.name)}</b></td>`).join("")}</tr>
    ${row("Status", (s) => `<span class="pill ${status(s).cls}">${status(s).label}</span>`)}
    ${row("Deadline", (s) => (s.deadline ? `${fmtD(parseD(s.deadline))}${daysTo(s.deadline) >= 0 ? ` · T-${daysTo(s.deadline)}` : ""}` : "Varies") + `<div class="small muted">${esc(s.window)}</div>`)}
    ${row("Funding type", (s) => FUND[s.fund])}${row("Covers", (s) => esc(s.funding))}${row("Host", (s) => esc(s.host))}${row("Level", (s) => s.levels.join(", "))}
    ${row("Eligibility", (s) => esc(s.elig))}${row("Essays", (s) => (s.essays || []).map((k) => (ESSAYS[k] ? ESSAYS[k].name : k)).join(", ") || "None listed")}
    ${row("Documents", (s) => (s.req ? s.req.items.length + " to prepare" : "—"))}
    ${row("", (s) => `<div class="row"><button type="button" class="btn sm primary" data-gstart="${s.id}">Guide me</button><a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">Official ↗</a></div>`)}</table>`;
  $("#cmpDlg").showModal(); T("compare", "Compared scholarships");
});
document.addEventListener("click", (e) => { if (e.target.closest("#cmpDlg [data-gstart]")) $("#cmpDlg").close(); });

/* --- tracker: all deadlines to calendar --- */
(function () {
  const host = $("#tkAdd") && $("#tkAdd").parentElement; if (!host) return;
  host.insertAdjacentHTML("beforeend", `<button type="button" class="btn sm" id="tkIcs">Add all deadlines to my calendar</button>`);
  $("#tkIcs").addEventListener("click", () => {
    const ics = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const ev = st.tracker.filter((t) => t.deadline && daysTo(t.deadline) >= 0).flatMap((t) => {
      const d = parseD(t.deadline), e2 = new Date(d); e2.setDate(e2.getDate() + 1); const w = new Date(d); w.setDate(w.getDate() - 7); const w2 = new Date(w); w2.setDate(w2.getDate() + 1);
      return [["BEGIN:VEVENT", "UID:" + t.id + "-dl@shagbaor.com/laureate", "DTSTAMP:" + ics(new Date()) + "T000000Z", "DTSTART;VALUE=DATE:" + ics(d), "DTEND;VALUE=DATE:" + ics(e2), "SUMMARY:DEADLINE: " + t.name, "END:VEVENT"].join("\r\n"),
        ["BEGIN:VEVENT", "UID:" + t.id + "-wk@shagbaor.com/laureate", "DTSTAMP:" + ics(new Date()) + "T000000Z", "DTSTART;VALUE=DATE:" + ics(w), "DTEND;VALUE=DATE:" + ics(w2), "SUMMARY:One week left: " + t.name, "END:VEVENT"].join("\r\n")];
    });
    if (!ev.length) { toast("No upcoming deadlines in your tracker"); return; }
    saveFile("scholarship-deadlines.ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Laureate Lab//EN"].concat(ev, ["END:VCALENDAR"]).join("\r\n"), "text/calendar");
    T("tracker-ics", "Exported tracker deadlines"); addXP(10, "deadlines added to calendar");
  });
})();

/* --- guide extras: news, auto-found recent videos, Via Scholaris library, winning examples --- */
const VS = window.LL_VIASCHOLARIS || [];
const _renderGuide = renderGuide;
renderGuide = function () {
  _renderGuide();
  const s = G.s; if (!s) return;
  const side = $("#gRun .g-side"); if (!side) return;
  const news = V4.live ? (V4.live.items || []).filter((i) => (i.ids || []).includes(s.id)).slice(0, 4) : [];
  if (news.length) side.insertAdjacentHTML("afterbegin", `<div class="card stack" style="padding:12px"><h3 style="font-size:1rem">In the news</h3><div class="live-list">${liveHTML(news, 4)}</div></div>`);
  const auto = V4.vids && V4.vids.items && V4.vids.items[s.id] || [];
  const have = new Set((G.data.videos || []).map((v) => v.u));
  const fresh = auto.filter((v) => !have.has("https://www.youtube.com/watch?v=" + v.id)).map((v) => ({ t: v.t, u: "https://www.youtube.com/watch?v=" + v.id, by: v.by, why: "Posted " + fmtD(parseD(v.date)), kind: "video" }));
  if (fresh.length) { const box = side.querySelector(".vids"); const html = `<div class="small muted" style="margin-top:4px">New this month (found automatically)</div>` + fresh.map(vidHTML).join(""); if (box) box.insertAdjacentHTML("afterbegin", html); }
  if (VS.length) {
    const pick = VS.filter((v) => !have.has("https://www.youtube.com/watch?v=" + v.id)).slice(0, 5);
    side.insertAdjacentHTML("beforeend", `<div class="card stack" style="padding:12px"><h3 style="font-size:1rem">From the Via Scholaris library</h3><div class="vids">${pick.map((v) => vidHTML({ t: v.t, u: "https://www.youtube.com/watch?v=" + v.id, by: "Via Scholaris", why: v.why, kind: "video" })).join("")}</div><a class="small" href="https://www.youtube.com/@viascholaris" target="_blank" rel="noopener">All Via Scholaris videos ↗</a></div>`);
  }
  // long video lists: keep the first 6 visible
  const vb = side.querySelector(".card .vids"); if (vb) { const all = [...vb.children].filter((n) => n.classList.contains("vid")); if (all.length > 7) { const more = document.createElement("details"); more.innerHTML = `<summary class="small" style="cursor:pointer;margin-top:6px">Show ${all.length - 6} more videos</summary>`; all.slice(6).forEach((n) => more.appendChild(n)); vb.appendChild(more); } }
  // winning examples on writing steps
  const m = $("#gMain .g-essay"); const x = G.i >= 0 && G.data.steps[G.i];
  if (m && x && x.essay) { m.insertAdjacentHTML("beforeend", `<button type="button" class="btn sm" data-winsee="${esc(s.id)}|${esc(x.essay)}">See how winners wrote this</button>`); }
};
document.addEventListener("click", (e) => {
  const w = e.target.closest("[data-winsee]"); if (!w) return;
  const [sid, type] = w.dataset.winsee.split("|");
  $("#eType").value = type; loadType(); go("dojo");
  loadWinners().then(() => { const has = V4.winners.items.some((i) => i.scholarship_id === sid); $("#winSch").value = has ? sid : ""; $("#winType").checked = !has || V4.winners.items.some((i) => i.scholarship_id === sid && i.type === type); $("#winBox").open = true; renderWinners(); $("#winBox").scrollIntoView({ behavior: "smooth" }); });
});

/* --- Learn from winners (Essay Dojo) --- */
function loadWinners() { return V4.winners ? Promise.resolve(V4.winners) : getJSON("winners.json").then((d) => { V4.winners = d || { items: [], criteria: {} }; const ids = [...new Set(V4.winners.items.map((i) => i.scholarship_id))]; $("#winSch").innerHTML = `<option value="">All scholarships</option>` + ids.map((id) => { const s = DATA.find((x) => x.id === id); return `<option value="${esc(id)}">${esc(s ? s.name : id === "general" ? "General / other" : id)}</option>`; }).join(""); return V4.winners; }); }
function renderWinners() {
  if (!V4.winners) return;
  const type = $("#eType").value, sch = $("#winSch").value, only = $("#winType").checked;
  let L = V4.winners.items.filter((i) => (!sch || i.scholarship_id === sch) && (!only || i.type === type));
  if (!L.length && only) L = V4.winners.items.filter((i) => !sch || i.scholarship_id === sch);
  $("#winCount").textContent = `· ${V4.winners.items.length} analysed winners · ${L.length} shown`;
  const crit = V4.winners.criteria || {};
  $("#winList").innerHTML = L.map((i) => {
    const c = crit[i.scholarship_id];
    return `<article class="win"><div class="row" style="justify-content:space-between;gap:6px"><span class="kind ${i.kind === "essay" ? "essay" : ""}">${i.kind === "essay" ? "Published essay" : "Winner's breakdown"}</span><span class="meta">${esc([i.award, i.year, i.country].filter(Boolean).join(" · "))}</span></div>
      <h4>${esc(i.title)}</h4><span class="meta">By ${esc(i.author)} · ${esc((ESSAYS[i.type] || {}).name || i.type)}${i.words ? " · length: " + esc(i.words) : ""}</span>
      ${i.quote ? `<q>${esc(i.quote)}</q>` : ""}
      <a class="btn sm" style="align-self:flex-start" href="${esc(okURL(i.url))}" target="_blank" rel="noopener">Read it on the author's page ↗</a>
      <details open><summary>Which criteria it hits</summary><ul>${(i.criteria || []).map((x) => `<li><b>${esc(x.c)}:</b> ${esc(x.how)}</li>`).join("")}</ul>${c ? `<p class="small muted" style="margin-top:4px"><a href="${esc(okURL(c.url))}" target="_blank" rel="noopener">Official criteria ↗</a></p>` : ""}</details>
      <details><summary>How it is built</summary><ol>${(i.structure || []).map((x) => `<li><b>${esc(x.move)}:</b> ${esc(x.what)}</li>`).join("")}</ol></details>
      <details><summary>Techniques to notice</summary><ul>${(i.techniques || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>
      <details><summary>What could be stronger</summary><ul>${(i.weaknesses || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>
      <details open><summary>Steal these moves</summary><ul>${(i.borrow || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>
      ${i.exercise ? `<button type="button" class="btn sm primary" data-winex="${esc(i.id)}">Try the exercise in my draft</button>` : ""}</article>`;
  }).join("") || `<p class="small muted">No analysed winners for this yet. Try "All scholarships".</p>`;
}
["winSch", "winType"].forEach((id) => $("#" + id).addEventListener("change", renderWinners));
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-winex]"); if (!b) return;
  const i = V4.winners.items.find((x) => x.id === b.dataset.winex); if (!i) return;
  const t = $("#winTask"); t.hidden = false;
  t.innerHTML = `<span><b>Your exercise (from ${esc(i.author)}'s ${esc(i.award)} essay):</b> ${esc(i.exercise)} Write it in your own words in the draft box below.</span><button type="button" class="btn sm" id="winTaskX">Done</button>`;
  $("#eText").focus(); $("#eText").scrollIntoView({ behavior: "smooth", block: "center" }); T("winner-exercise", "Started a winner exercise"); addXP(5, "learning from winners");
});
document.addEventListener("click", (e) => { if (e.target.closest("#winTaskX")) $("#winTask").hidden = true; });
const _loadType = loadType;
loadType = function () { _loadType(); if (V4.winners) renderWinners(); };
$("#eType").addEventListener("change", () => { if (V4.winners) renderWinners(); });
$$(".tab").forEach((t) => t.addEventListener("click", () => { if (t.dataset.v === "dojo") loadWinners().then(renderWinners); if (t.dataset.v === "cv") cvInit(); }));
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g && g.dataset.go === "dojo") loadWinners().then(renderWinners); if (g && g.dataset.go === "cv") cvInit(); });

/* --- CV Studio --- */
const CV_SECTIONS = ["Education", "Professional experience", "Research & publications", "Leadership & volunteering", "Awards & scholarships", "Skills", "Languages", "Professional memberships", "Referees"];
const VERB_RX = () => new RegExp("^(" + ((V4.cv && V4.cv.verbs) || window.LL_STRONGVERBS).map((v) => v.toLowerCase().replace(/[^a-z-]/g, "")).filter(Boolean).join("|") + ")\\b", "i");
let cvSampleIdx = 0;
function cvBlank() { return { name: "", contact: "", profile: "", style: "uk", sections: [{ h: "Education", entries: [{ title: "", org: "", place: "", dates: "", bullets: "" }] }, { h: "Professional experience", entries: [{ title: "", org: "", place: "", dates: "", bullets: "" }] }, { h: "Awards & scholarships", entries: [] }, { h: "Skills", entries: [] }, { h: "Referees", entries: [] }] }; }
function cvInit() {
  if (V4.cv) return;
  getJSON("cv.json").then((d) => {
    V4.cv = d || {}; const c = V4.cv;
    const ids = [...new Set((c.rules || []).flatMap((r) => r.scholarship_ids || []))];
    $("#cvSch").innerHTML = `<option value="">General advice</option>` + ids.map((id) => { const s = DATA.find((x) => x.id === id); return s ? `<option value="${id}">${esc(s.name)}</option>` : ""; }).join("");
    $("#cvTemplates").innerHTML = (c.templates || []).filter((t) => okURL(t.url)).map((t) => `<a href="${esc(t.url)}" target="_blank" rel="noopener"><span class="k official">${/latex|overleaf/i.test(t.format + t.name) ? "LaTeX" : /online/i.test(t.format) ? "Online" : /word|docx/i.test(t.format) ? "Word" : "PDF"}</span><span><b>${esc(t.name)}</b> · ${esc(t.by)}<br><span class="small muted">${esc(t.good_for)}</span></span></a>`).join("");
    $("#cvSamples").innerHTML = (c.samples || []).map((s, i) => `<button type="button" data-cvs="${i}" aria-pressed="${i === 0}">${esc(["Chevening / Commonwealth", "Erasmus (Europass)", "PhD (academic)", "Undergraduate"][i] || "Sample " + (i + 1))}</button>`).join("");
    $("#cvRewrites").innerHTML = (c.rewrites || []).map((r) => `<div class="ex"><div class="w"><b>Weak</b><br>${esc(r.weak)}</div><div class="g"><b>Strong</b><br>${esc(r.strong)}<div class="small muted" style="margin-top:4px">${esc(r.why)}</div></div></div>`).join("");
    $("#cvPatterns").innerHTML = (c.metric_patterns || []).map((p) => `<li>${esc(p)}</li>`).join("");
    $("#cvVerbs").textContent = (c.verbs || []).join(" · ");
    $("#cvAddSel").innerHTML = CV_SECTIONS.map((h) => `<option>${h}</option>`).join("");
    if (!st.cvDoc) st.cvDoc = cvBlank();
    cvRules(); cvShowSample(); cvForm(); cvPreview();
  });
}
function cvRules() {
  const c = V4.cv, id = $("#cvSch").value, a = c.advice || {};
  const rules = (c.rules || []).filter((r) => id && (r.scholarship_ids || []).includes(id));
  $("#cvRules").innerHTML = (rules.length ? `<div class="g-box g-tipbox"><h4 class="eyebrow">Rules for this scholarship</h4><ul>${rules.map((r) => `<li>${esc(r.rule)} <a href="${esc(okURL(r.url))}" target="_blank" rel="noopener">source ↗</a></li>`).join("")}</ul></div>` : "")
    + `<details ${rules.length ? "" : "open"}><summary><b>Section order that works</b></summary><ol class="small" style="padding-left:18px">${(a.order || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>
    <div class="g-two"><div class="g-box g-tipbox"><h4 class="eyebrow">Do</h4><ul>${(a.do || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div><div class="g-box avoid"><h4 class="eyebrow">Don't</h4><ul>${(a.dont || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
    ${(a.nigeria || []).length ? `<details><summary><b>For Nigerian applicants</b></summary><ul class="small" style="padding-left:18px">${a.nigeria.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}`;
}
$("#cvSch").addEventListener("change", cvRules);
function cvPaper(doc, notes) {
  const entry = (e) => { const bl = Array.isArray(e.bullets) ? e.bullets : String(e.bullets || "").split("\n").map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean); return `<div class="e">${e.dates ? `<span class="d">${esc(e.dates)}</span>` : ""}${e.title ? `<b>${esc(e.title)}</b>` : ""}${e.org || e.place ? `<div class="o">${esc([e.org, e.place].filter(Boolean).join(", "))}</div>` : ""}${bl.length ? `<ul>${bl.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}</div>`; };
  return `<h1>${esc(doc.name || "Your Name")}</h1><div class="ct">${esc(doc.contact || "City, Country · email · phone")}</div>${doc.profile ? `<h2>Profile</h2><p>${esc(doc.profile)}</p>` : ""}`
    + (doc.sections || []).filter((s) => s.entries && s.entries.length).map((s) => `<h2>${esc(s.h)}</h2>${notes && s.note ? `<div class="note">${esc(s.note)}</div>` : ""}${s.entries.map(entry).join("")}`).join("");
}
function cvShowSample() {
  const s = (V4.cv.samples || [])[cvSampleIdx]; if (!s) return;
  const doc = { name: "", contact: "", profile: "", sections: [] };
  s.sections.forEach((sec) => {
    if (/contact|personal information/i.test(sec.h)) { const e = sec.entries[0] || {}; doc.name = e.title; doc.contact = [e.place].concat(e.bullets || []).filter(Boolean).join(" · "); doc.contactNote = sec.note; return; }
    if (/profile|summary|about me/i.test(sec.h) && sec.entries.length === 1 && !sec.entries[0].title) { doc.profile = (sec.entries[0].bullets || []).join(" "); doc.profileNote = sec.note; return; }
    doc.sections.push(sec);
  });
  const notes = $("#cvNotes").checked;
  $("#cvSample").innerHTML = `<p class="small" style="font-family:var(--f-body);color:#555;margin:0 0 10px"><b>${esc(s.title)}</b><br>${esc(s.persona)}</p>` + (notes && doc.contactNote ? `<div class="note">${esc(doc.contactNote)}</div>` : "") + cvPaper(doc, notes).replace("<h2>Profile</h2>", "<h2>Profile</h2>" + (notes && doc.profileNote ? `<div class="note">${esc(doc.profileNote)}</div>` : ""));
  V4.sampleDoc = doc;
}
$("#cvSamples").addEventListener("click", (e) => { const b = e.target.closest("[data-cvs]"); if (!b) return; cvSampleIdx = +b.dataset.cvs; $$("#cvSamples button").forEach((x) => x.setAttribute("aria-pressed", x === b)); cvShowSample(); });
$("#cvNotes").addEventListener("change", cvShowSample);
$("#cvUseSample").addEventListener("click", () => {
  if (!V4.sampleDoc) return;
  if (st.cvDoc && st.cvDoc.name && !confirm("Replace your CV with this sample? Your current CV will be lost.")) return;
  const d = V4.sampleDoc; st.cvDoc = { name: d.name, contact: d.contact, profile: d.profile, style: ["uk", "europass", "academic", "uk"][cvSampleIdx] || "uk", sections: d.sections.map((s) => ({ h: s.h, entries: s.entries.map((e) => ({ title: e.title || "", org: e.org || "", place: e.place || "", dates: e.dates || "", bullets: (e.bullets || []).join("\n") })) })) };
  save(); cvForm(); cvPreview(); toast("Sample loaded: now make every line yours"); $("#cvName").scrollIntoView({ behavior: "smooth", block: "center" });
});
function cvForm() {
  const d = st.cvDoc; $("#cvName").value = d.name || ""; $("#cvContact").value = d.contact || ""; $("#cvProfile").value = d.profile || ""; $("#cvStyle").value = d.style || "uk";
  $("#cvSections").innerHTML = d.sections.map((s, si) => `<div class="cv-sec"><div class="row"><input type="text" value="${esc(s.h)}" data-cvh="${si}" aria-label="Section title"><button type="button" class="btn sm" data-cvup="${si}" title="Move up">↑</button><button type="button" class="btn sm" data-cvdel="${si}" title="Remove section">✕</button></div>
    ${s.entries.map((e, ei) => `<div class="cv-ent"><input type="text" placeholder="Title (degree, role, award)" value="${esc(e.title)}" data-cve="${si}|${ei}|title"><input type="text" placeholder="Dates (e.g. 2021 – 2024)" value="${esc(e.dates)}" data-cve="${si}|${ei}|dates"><input type="text" placeholder="Organisation" value="${esc(e.org)}" data-cve="${si}|${ei}|org"><input type="text" placeholder="City, Country" value="${esc(e.place)}" data-cve="${si}|${ei}|place"><textarea rows="3" placeholder="One achievement per line: verb + what + number/result" data-cve="${si}|${ei}|bullets">${esc(e.bullets)}</textarea><button type="button" class="btn sm x" data-cvx="${si}|${ei}">Remove entry</button></div>`).join("")}
    <button type="button" class="btn sm" data-cvnew="${si}" style="align-self:flex-start">+ Add entry</button></div>`).join("");
}
function cvPreview() {
  const d = st.cvDoc; $("#cvPreview").innerHTML = cvPaper(d, false);
  // live check
  const rx = VERB_RX(); const bullets = d.sections.flatMap((s) => s.entries.flatMap((e) => String(e.bullets || "").split("\n").map((b) => b.replace(/^[-•*]\s*/, "").trim()).filter(Boolean)));
  const strong = bullets.filter((b) => rx.test(b)), numbers = bullets.filter((b) => /\d/.test(b)), long = bullets.filter((b) => b.split(/\s+/).length > 32);
  const words = (d.profile + " " + bullets.join(" ")).split(/\s+/).filter(Boolean).length, pages = Math.max(1, Math.round(words / 420 * 10) / 10);
  const pii = /\b(married|single|religion|christian|muslim|date of birth|d\.o\.b|state of origin|genotype|blood group)\b/i.test(JSON.stringify(d));
  const checks = [
    [!!d.name && !!d.contact, "Name and contact line filled in"],
    [d.profile && d.profile.split(/\s+/).length <= 70, "Profile is short (2–3 lines) and tied to your goal"],
    [bullets.length >= 6, `${bullets.length} achievement bullets (aim for 6+)`],
    [bullets.length && strong.length / bullets.length >= 0.7, `${strong.length}/${bullets.length} bullets start with an action verb`],
    [bullets.length && numbers.length / bullets.length >= 0.5, `${numbers.length}/${bullets.length} bullets include a number or result`],
    [!long.length, long.length ? `${long.length} bullet(s) are too long: keep under ~30 words` : "Bullets are concise"],
    [pages <= 2.2, `About ${pages} page(s) of text (most funders expect 1–2)`],
    [!(pii && d.style !== "europass"), pii ? "Remove personal details (marital status, religion, date of birth, state of origin) for UK/US-style CVs" : "No unnecessary personal details"],
  ];
  const score = Math.round((checks.filter((c) => c[0]).length / checks.length) * 100);
  $("#cvScore").textContent = score + "/100";
  $("#cvCheck").innerHTML = checks.map(([ok, t]) => `<div class="chk-row"><i style="background:${ok ? "var(--good)" : "var(--warn)"}"></i><span>${esc(t)}</span></div>`).join("")
    + (bullets.length ? `<details><summary class="small" style="cursor:pointer">Bullet-by-bullet</summary>${bullets.map((b) => { const v = rx.test(b), n = /\d/.test(b); return `<div class="chk-row"><i style="background:${v && n ? "var(--good)" : v || n ? "var(--ok)" : "var(--bad)"}"></i><span>${esc(b)}${!v ? " <span class='muted'>· start with a strong verb</span>" : ""}${!n ? " <span class='muted'>· add a number or result</span>" : ""}</span></div>`; }).join("")}</details>` : "");
}
const cvSave = () => { save(); cvPreview(); };
["cvName", "cvContact", "cvProfile"].forEach((id) => $("#" + id).addEventListener("input", (e) => { st.cvDoc[{ cvName: "name", cvContact: "contact", cvProfile: "profile" }[id]] = e.target.value; cvSave(); }));
$("#cvStyle").addEventListener("change", (e) => { st.cvDoc.style = e.target.value; cvSave(); });
$("#cvSections").addEventListener("input", (e) => {
  const h = e.target.closest("[data-cvh]"), en = e.target.closest("[data-cve]");
  if (h) st.cvDoc.sections[+h.dataset.cvh].h = h.value;
  if (en) { const [si, ei, k] = en.dataset.cve.split("|"); st.cvDoc.sections[+si].entries[+ei][k] = en.value; }
  cvSave();
});
$("#cvSections").addEventListener("click", (e) => {
  const d = st.cvDoc, b = e.target.closest("button"); if (!b) return;
  if (b.dataset.cvnew != null) d.sections[+b.dataset.cvnew].entries.push({ title: "", org: "", place: "", dates: "", bullets: "" });
  else if (b.dataset.cvx) { const [si, ei] = b.dataset.cvx.split("|").map(Number); d.sections[si].entries.splice(ei, 1); }
  else if (b.dataset.cvdel != null) d.sections.splice(+b.dataset.cvdel, 1);
  else if (b.dataset.cvup != null) { const i = +b.dataset.cvup; if (i > 0) [d.sections[i - 1], d.sections[i]] = [d.sections[i], d.sections[i - 1]]; }
  else return;
  save(); cvForm(); cvPreview();
});
$("#cvAdd").addEventListener("click", () => { st.cvDoc.sections.push({ h: $("#cvAddSel").value, entries: [{ title: "", org: "", place: "", dates: "", bullets: "" }] }); save(); cvForm(); cvPreview(); });
$("#cvReset").addEventListener("click", () => { if (!confirm("Clear your CV and start over?")) return; st.cvDoc = cvBlank(); save(); cvForm(); cvPreview(); });
function cvText() {
  const d = st.cvDoc, L = [d.name, d.contact, ""];
  if (d.profile) L.push("PROFILE", d.profile, "");
  d.sections.forEach((s) => { if (!s.entries.length) return; L.push(s.h.toUpperCase()); s.entries.forEach((e) => { L.push([e.title, e.dates].filter(Boolean).join(" — ")); if (e.org || e.place) L.push([e.org, e.place].filter(Boolean).join(", ")); String(e.bullets || "").split("\n").filter((x) => x.trim()).forEach((b) => L.push("• " + b.replace(/^[-•*]\s*/, ""))); }); L.push(""); });
  return L.join("\n");
}
$("#cvCopy").addEventListener("click", () => copyText(cvText()));
$("#cvPdf").addEventListener("click", async () => {
  const J = window.jspdf && window.jspdf.jsPDF; if (!J) { toast("PDF tool didn't load — use Copy as text"); return; }
  const d = st.cvDoc, pdf = new J({ unit: "pt", format: "a4" }), W = 595, M = 54; let y = 60;
  const clean = (t) => String(t || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/₦/g, "N").replace(/[^\x00-\xFF]/g, "");
  const need = (h) => { if (y + h > 800) { pdf.addPage(); y = 56; } };
  pdf.setFont("times", "bold"); pdf.setFontSize(18); pdf.text(clean(d.name || "Your Name"), M, y); y += 16;
  pdf.setFont("times", "normal"); pdf.setFontSize(10); pdf.splitTextToSize(clean(d.contact), W - 2 * M).forEach((l) => { pdf.text(l, M, y); y += 12; });
  const head = (h) => { need(30); y += 8; pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5); pdf.text(clean(h).toUpperCase(), M, y); y += 4; pdf.setDrawColor(150); pdf.line(M, y, W - M, y); y += 12; };
  const para = (t, size = 10.5, font = "normal", indent = 0) => { pdf.setFont("times", font); pdf.setFontSize(size); pdf.splitTextToSize(clean(t), W - 2 * M - indent).forEach((l) => { need(13); pdf.text(l, M + indent, y); y += 13; }); };
  if (d.profile) { head("Profile"); para(d.profile); }
  d.sections.forEach((s) => {
    if (!s.entries.length) return; head(s.h);
    s.entries.forEach((e) => {
      need(28);
      if (e.title) { pdf.setFont("times", "bold"); pdf.setFontSize(11); pdf.text(clean(e.title).slice(0, 90), M, y); }
      if (e.dates) { pdf.setFont("times", "normal"); pdf.setFontSize(10); pdf.text(clean(e.dates), W - M, y, { align: "right" }); }
      if (e.title || e.dates) y += 13;
      if (e.org || e.place) para([e.org, e.place].filter(Boolean).join(", "), 10.5, "italic");
      String(e.bullets || "").split("\n").map((b) => b.replace(/^[-•*]\s*/, "").trim()).filter(Boolean).forEach((b) => { need(13); pdf.setFont("times", "normal"); pdf.text("•", M + 4, y); para(b, 10.5, "normal", 14); });
      y += 4;
    });
  });
  const out = pdf.output("blob"); const name = (clean(d.name).replace(/\s+/g, "_") || "my") + "_CV.pdf";
  await saveFile(name, out, "application/pdf"); T("cv-pdf", "Downloaded a CV PDF"); addXP(20, "CV exported");
});

/* --- load the auto-refreshed data --- */
Promise.all([getJSON("live.json"), getJSON("watch.json"), getJSON("videos.json")]).then(([l, w, v]) => {
  V4.live = l; V4.watch = w; V4.vids = v;
  renderLive(); renderAtlas(); if (G.data && !$("#gRun").hidden) renderGuide();
});
const _go = go; go = function (v, x) { _go(v, x); cmpSync(); };
cmpSync();
if ((location.hash || "") === "#dojo") loadWinners().then(renderWinners);
if ((location.hash || "") === "#cv") cvInit();

/* ---------------- boot ---------------- */
renderFields(); renderHome(); renderAtlas(); renderReady(); renderPaths(); renderGrade(); renderEmails(); renderGap(); renderScam(); renderTracker(); osShuffle(); raLoad(); wbCheck();
$("#eType").value = "leadership"; loadType(); renderPlan();
if (!getDraft("leadership")) { sampleText = "Ever since I was a child I have been passionate about agriculture. In 2023, as the only engineer at a 40-farmer cooperative in Benue, I saw 30% of our tomato harvest rot before reaching market. I designed a solar dryer from scrap metal and trained 12 farmers to build their own. It was very successful."; $("#eText").value = sampleText; runDojo(); }
booting = false;
const h = (location.hash || "").slice(1), gm = /^guide\/([\w-]+)(?:\/(\d+))?$/.exec(h);
if (gm && DATA.some((x) => x.id === gm[1])) openGuide(gm[1], gm[2] ? +gm[2] - 1 : null);
else go($$(".tab").some((t) => t.dataset.v === h) ? h : "home");
renderPassport();
})();
