// LARA: website logic.
const CFG = window.LARA_CONFIG || {};
const I = window.LARA_I18N;
const t = (k, v) => I.t(k, v);
const configured = !!CFG.SUPABASE_URL && !/YOUR-/.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY);
let sb = null;
if (configured) {
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  } catch (e) {
    console.error("Could not load Supabase", e);
  }
}

const S = { user: null, profile: null, requests: [], stats: null, filter: "open", doi: "", lookup: null, emailOn: false, refs: [], composer: null };
const $ = (id) => document.getElementById(id);
const SITE = location.origin + location.pathname.replace(/index\.html$/, "");
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
const STATUS_KEYS = { open: "st_open", working: "st_working", author: "st_author", link: "st_link", done: "st_done", closed: "st_closed" };
const ROUTE_KEYS = { oa: "route_oa", r4l: "route_r4l", author: "route_author", library: "route_library", other: "route_other" };
const REQUEST_SELECT =
  "*, requester:profiles!requests_requester_fk(name,institution,location,country,field,verified_academic), volunteer:profiles!requests_volunteer_fk(name,verified_academic), notes:request_notes(id,body,created_at,author_id,author:profiles(name))";
const AFRICA = ["Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cabo Verde","Cameroon","Central African Republic","Chad","Comoros","Congo","Côte d'Ivoire","Democratic Republic of the Congo","Djibouti","Egypt","Equatorial Guinea","Eritrea","Eswatini","Ethiopia","Gabon","Gambia","Ghana","Guinea","Guinea-Bissau","Kenya","Lesotho","Liberia","Libya","Madagascar","Malawi","Mali","Mauritania","Mauritius","Morocco","Mozambique","Namibia","Niger","Nigeria","Rwanda","São Tomé and Príncipe","Senegal","Seychelles","Sierra Leone","Somalia","South Africa","South Sudan","Sudan","Tanzania","Togo","Tunisia","Uganda","Zambia","Zimbabwe"];

// ---------- helpers ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function toast(msg) { const el = $("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4000); }
function normDoi(s) { return (s || "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").replace(/[.,;]+$/, "").toLowerCase(); }
function ago(ts) {
  if (!ts) return "";
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (d < 1) return t("today"); if (d === 1) return t("yesterday"); if (d < 30) return t("days_ago", { n: d });
  return new Date(ts).toLocaleDateString(I.lang);
}
function isVol() { return !!S.profile && (S.profile.role === "volunteer" || S.profile.role === "both"); }
function verText(v) {
  if (!v) return "";
  const k = /^Published/.test(v) ? "ver_pub_t" : /^Accepted/.test(v) ? "ver_aam_t" : /^Preprint/.test(v) ? "ver_pre_t" : /^Deposited/.test(v) ? "ver_deposit" : null;
  return k ? t(k) + (/title match/.test(v) ? " (" + t("title_match") + ")" : "") : v;
}
function link(text, href) { return h("a", { href, target: "_blank", rel: "noopener" }, text); }
function setNote(msg, kind) { const n = $("statusNote"); if (!msg) { n.hidden = true; return; } n.className = "notice" + (kind ? " " + kind : ""); n.textContent = msg; n.hidden = false; }
function friendly(err) { return (err && (err.message || err.error_description)) || t("err_generic"); }
async function copyText(text) { try { await navigator.clipboard.writeText(text); toast(t("copied")); } catch { toast(t("copy_fail")); } }
function badge(p) { return p && p.verified_academic ? h("span", { class: "vbadge", title: t("verified_title") }, "✓ " + t("verified")) : null; }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } }
async function callFn(name, body) {
  if (!sb) return { error: { message: t("not_connected_short") } };
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) { let msg = t("err_generic"), code; try { const j = await error.context.json(); msg = j.error || msg; code = j.code; } catch {} return { error: { message: msg, code } }; }
  return { data };
}

// ---------- language ----------
$("langSelect").value = I.lang;
$("langSelect").addEventListener("change", (e) => { I.setLang(e.target.value); renderAll(); if (S.lookup || S.doi) renderCheck(); renderRefs(); });
document.addEventListener("lara:lang", () => { $("countryList").replaceChildren(...AFRICA.map((c) => h("option", { value: c }))); });
$("countryList").replaceChildren(...AFRICA.map((c) => h("option", { value: c })));
const CONTACT = CFG.CONTACT_EMAIL || "lara@shagbaor.com";
document.querySelectorAll("[data-contact]").forEach((el) => { el.replaceChildren(link(CONTACT, "mailto:" + CONTACT)); });

// ---------- tabs ----------
const TABS = ["request", "refs", "journal", "board", "mine", "impact", "profile", "signin", "rules", "admin"];
function showTab() {
  let tab = (location.hash || "#request").slice(1);
  if (!TABS.includes(tab)) tab = "request";
  for (const x of TABS) $("tab-" + x).hidden = x !== tab;
  document.querySelectorAll("nav.tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"));
  if (tab === "impact") loadStats();
  if (tab === "admin") loadReports();
}
window.addEventListener("hashchange", showTab);

// ---------- auth ----------
function renderAuth() {
  const box = $("authBox"); box.replaceChildren();
  if (!sb) return;
  if (S.user) box.append(h("span", { class: "who" }, (S.profile && S.profile.name) || S.user.email || ""),
    h("button", { class: "small ghost", type: "button", onclick: async () => { await sb.auth.signOut(); toast(t("signed_out")); } }, t("sign_out")));
  else box.append(h("a", { href: "#signin", class: "small" }, t("si_h")));
}
// ---------- sign in / create account (email + password, codes by email) ----------
// Codes instead of links: university email scanners "click" links and use them up.
const AU = { mode: "in", email: "", codeType: "", sentAt: 0 };
// University mail systems often hold emails for a few minutes; asking again too soon cancels the code on its way.
const RESEND_WAIT = 5 * 60 * 1000;
// Remember an in-progress code step, so reloading the page doesn't push people into requesting
// another code (each new code cancels the previous one).
function auSave() { try { sessionStorage.setItem("lara_au", JSON.stringify({ mode: AU.mode, email: AU.email, codeType: AU.codeType, sentAt: AU.sentAt })); } catch {} }
function auRestore() {
  try {
    const v = JSON.parse(sessionStorage.getItem("lara_au") || "null");
    if (v && (v.mode === "code" || v.mode === "reset") && v.email && Date.now() - v.sentAt < 3600000) { Object.assign(AU, v); return v.mode; }
  } catch {}
  return "in";
}
function sentClock() { return AU.sentAt ? new Date(AU.sentAt).toLocaleTimeString(I.lang, { hour: "numeric", minute: "2-digit" }) : ""; }
let auTimer = null;
function auCountdown() {
  clearInterval(auTimer);
  const tick = () => {
    const left = Math.ceil((AU.sentAt + RESEND_WAIT - Date.now()) / 1000);
    const a = $("auResend");
    if (left > 0) { a.classList.add("disabled-link"); a.setAttribute("aria-disabled", "true"); a.textContent = t("au_resend_wait", { s: Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0") }); }
    else { a.classList.remove("disabled-link"); a.removeAttribute("aria-disabled"); a.textContent = t("au_resend"); clearInterval(auTimer); }
  };
  tick(); auTimer = setInterval(tick, 1000);
}
const EMAIL_OK = (e) => /^\S+@\S+\.\S+$/.test(e);
function auSay(msg, bad) { $("signinState").textContent = msg || ""; $("signinState").classList.toggle("errtext", !!bad); }
function auError(err) {
  const m = ((err && err.message) || "").toLowerCase();
  if (m.includes("invalid login")) return t("au_e_login");
  if (m.includes("not confirmed")) return t("au_e_unconfirmed");
  if (m.includes("already registered") || m.includes("already been registered")) return t("au_e_exists");
  if (m.includes("expired") || m.includes("invalid") && m.includes("token")) return t("au_e_code");
  if (m.includes("weak") || m.includes("at least") || m.includes("password should")) return t("au_e_weak");
  if (m.includes("security purposes") || m.includes("rate limit") || m.includes("after")) return t("au_e_wait");
  if (m.includes("error sending")) return t("au_e_send");
  return friendly(err);
}
function auView(mode) {
  AU.mode = mode;
  const v = {
    in:     { head: "au_h_in",     lead: "au_lead_in",     btn: "au_btn_in",     pass: true,  code: false, newpass: false, email: true },
    up:     { head: "au_h_up",     lead: "au_lead_up",     btn: "au_btn_up",     pass: true,  code: false, newpass: false, email: true },
    code:   { head: "au_h_code",   lead: "au_lead_code",   btn: "au_btn_code",   pass: false, code: true,  newpass: false, email: false },
    forgot: { head: "au_h_forgot", lead: "au_lead_forgot", btn: "au_btn_forgot", pass: false, code: false, newpass: false, email: true },
    reset:  { head: "au_h_reset",  lead: "au_lead_reset",  btn: "au_btn_reset",  pass: false, code: true,  newpass: true,  email: false },
  }[mode];
  $("auHead").textContent = t(v.head);
  $("auLead").textContent = t(v.lead, { e: AU.email }) + (v.code && AU.sentAt ? " " + t("au_newest", { time: sentClock() }) : "");
  $("auSubmit").textContent = t(v.btn);
  $("auEmailRow").hidden = !v.email; $("auPassRow").hidden = !v.pass;
  $("auCodeRow").hidden = !v.code; $("auNewPassRow").hidden = !v.newpass;
  $("auPassHint").hidden = mode !== "up";
  $("auPass").autocomplete = mode === "up" ? "new-password" : "current-password";
  $("auGoogle").hidden = !(S.googleOn && (mode === "in" || mode === "up"));
  $("auToForgot").hidden = mode !== "in";
  $("auToUp").hidden = mode !== "in";
  $("auToIn").hidden = mode === "in";
  $("auResend").hidden = !(mode === "code" || mode === "reset");
  if (v.code) { $("auCode").value = ""; setTimeout(() => $("auCode").focus(), 50); auCountdown(); }
  auSave();
}
function auBusy(on) { $("auSubmit").disabled = on; }
async function sendCode() {
  if (Date.now() - AU.sentAt < RESEND_WAIT) return { message: "rate limit" };
  const r = AU.codeType === "recovery"
    ? await sb.auth.resetPasswordForEmail(AU.email, { redirectTo: SITE })
    : await sb.auth.resend({ type: "signup", email: AU.email, options: { emailRedirectTo: SITE } });
  if (!r.error) AU.sentAt = Date.now();
  return r.error;
}
$("auForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sb) return;
  const email = $("auEmail").value.trim().toLowerCase(), pass = $("auPass").value;
  auSay("");
  const prevEmail = AU.email;
  if (["in", "up", "forgot"].includes(AU.mode)) {
    if (!EMAIL_OK(email)) { auSay(t("si_bad"), true); $("auEmail").focus(); return; }
    AU.email = email;
    if (prevEmail !== email) AU.sentAt = 0; // a different address gets its own code straight away
  }
  auBusy(true);
  try {
    if (AU.mode === "in") {
      if (!pass) { auSay(t("au_e_nopass"), true); return; }
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (!error) { auSay(t("au_ok_in")); $("auPass").value = ""; return; }
      if ((error.message || "").toLowerCase().includes("not confirmed")) {
        AU.codeType = "signup"; const e2 = await sendCode();
        auView("code"); auSay(e2 ? auError(e2) : t("au_sent", { e: email }), !!e2); return;
      }
      auSay(auError(error), true);
    } else if (AU.mode === "up") {
      if (pass.length < 8) { auSay(t("au_e_weak"), true); $("auPass").focus(); return; }
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: SITE } });
      if (error) { auSay(auError(error), true); return; }
      if (data && data.session) { auSay(t("au_ok_in")); return; } // email confirmation switched off
      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        auView("in"); $("auEmail").value = email; auSay(t("au_e_exists"), true); return;
      }
      AU.codeType = "signup"; AU.sentAt = Date.now(); $("auPass").value = "";
      auView("code"); auSay(t("au_sent", { e: email }));
    } else if (AU.mode === "code") {
      const token = $("auCode").value.replace(/\D/g, "");
      if (token.length < 6) { auSay(t("au_e_code"), true); return; }
      const { error } = await sb.auth.verifyOtp({ email: AU.email, token, type: "email" });
      if (error) { auSay(auError(error), true); return; }
      AU.sentAt = 0; AU.mode = "in"; auSave(); auSay(t("au_ok_in"));
    } else if (AU.mode === "forgot") {
      if (AU.codeType === "recovery" && prevEmail === email && Date.now() - AU.sentAt < RESEND_WAIT) { auView("reset"); auSay(t("au_already", { time: sentClock() })); return; }
      if (AU.codeType !== "recovery") AU.sentAt = 0;
      AU.codeType = "recovery";
      const error = await sendCode();
      if (error) { auSay(auError(error), true); return; }
      auView("reset"); auSay(t("au_sent", { e: email }));
    } else if (AU.mode === "reset") {
      const token = $("auCode").value.replace(/\D/g, ""), np = $("auNewPass").value;
      if (token.length < 6) { auSay(t("au_e_code"), true); return; }
      if (np.length < 8) { auSay(t("au_e_weak"), true); $("auNewPass").focus(); return; }
      S.resetting = true;
      const { error } = await sb.auth.verifyOtp({ email: AU.email, token, type: "recovery" });
      if (error) { S.resetting = false; auSay(auError(error), true); return; }
      const { error: e3 } = await sb.auth.updateUser({ password: np });
      S.resetting = false; $("auNewPass").value = "";
      if (e3) { auSay(auError(e3), true); return; }
      AU.sentAt = 0; AU.mode = "in"; auSave();
      toast(t("au_ok_reset")); auSay(t("au_ok_reset"));
      if (S.user && location.hash === "#signin") location.hash = S.profile ? "#request" : "#profile";
    }
  } finally { auBusy(false); }
});
$("auShow").addEventListener("click", () => { const p = $("auPass"); p.type = p.type === "password" ? "text" : "password"; $("auShow").textContent = t(p.type === "password" ? "au_show" : "au_hide"); });
$("auToForgot").addEventListener("click", (e) => { e.preventDefault(); auSay(""); auView("forgot"); });
$("auToUp").addEventListener("click", (e) => { e.preventDefault(); auSay(""); auView("up"); });
$("auToIn").addEventListener("click", (e) => { e.preventDefault(); auSay(""); clearInterval(auTimer); auView("in"); });
$("auResend").addEventListener("click", async (e) => {
  e.preventDefault(); if (!AU.email || Date.now() - AU.sentAt < RESEND_WAIT) return;
  const error = await sendCode();
  if (!error) auView(AU.mode);
  auSay(error ? auError(error) : t("au_sent_new", { e: AU.email, time: sentClock() }), !!error);
});
document.addEventListener("lara:lang", () => auView(AU.mode));
auView(auRestore());
// Show "Continue with Google" automatically once Google is switched on in Supabase.
S.googleOn = !!CFG.ENABLE_GOOGLE;
if (configured) {
  fetch(CFG.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/settings", { headers: { apikey: CFG.SUPABASE_ANON_KEY } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.external && j.external.google) { S.googleOn = true; auView(AU.mode); } })
    .catch(() => {});
}
$("googleBtn").addEventListener("click", () => sb && sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: SITE } }));

// ---------- profile ----------
async function loadProfile() {
  S.profile = null;
  if (!S.user) return;
  const { data } = await sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
  S.profile = data || null;
  const p = S.profile || {};
  const meta = (S.user && S.user.user_metadata) || {};
  $("pName").value = p.name || meta.full_name || meta.name || ""; $("pRole").value = p.role || "requester"; $("pInst").value = p.institution || "";
  $("pCountry").value = p.country || ""; $("pLoc").value = p.location || ""; $("pField").value = p.field || "";
  $("pPledge").checked = !!p.pledge; $("pNotify").checked = p.notify !== false; pledgeVis();
  $("verifiedNote").textContent = S.profile ? (p.verified_academic ? t("verified_yes") : t("verified_no")) : "";
  $("adminTab").hidden = !p.is_admin;
}
function pledgeVis() { $("pledgeRow").hidden = $("pRole").value === "requester"; }
$("pRole").addEventListener("change", pledgeVis);
$("saveProfile").addEventListener("click", async () => {
  if (!S.user) { location.hash = "#signin"; return; }
  const p = { name: $("pName").value.trim(), role: $("pRole").value, institution: $("pInst").value.trim(), country: $("pCountry").value.trim(),
    location: $("pLoc").value.trim(), field: $("pField").value.trim(), pledge: $("pPledge").checked, notify: $("pNotify").checked };
  if (!p.name || !p.institution || !p.country) { $("profileState").textContent = t("prof_need"); return; }
  if (p.role !== "requester" && !p.pledge) { $("profileState").textContent = t("prof_need_pledge"); return; }
  const q = S.profile ? sb.from("profiles").update(p).eq("id", S.user.id) : sb.from("profiles").insert({ id: S.user.id, ...p });
  const { error } = await q;
  if (error) { $("profileState").textContent = friendly(error); return; }
  $("profileState").textContent = t("saved"); toast(t("prof_saved"));
  await loadProfile(); renderAll();
});

// ---------- requests ----------
async function loadRequests() {
  if (!S.user) { S.requests = []; renderAll(); return; }
  const { data, error } = await sb.from("requests").select(REQUEST_SELECT).order("created_at", { ascending: false }).limit(500);
  if (error) { console.warn(error); toast(t("load_fail")); return; }
  S.requests = data || [];
  renderAll();
}
let reloadTimer;
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(loadRequests, 400); }
let channel;
function subscribe() {
  if (channel) { sb.removeChannel(channel); channel = null; }
  if (!S.user) return;
  channel = sb.channel("board")
    .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, scheduleReload)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "request_notes" }, scheduleReload)
    .subscribe();
}
function notify(r, event) { if (sb && S.user) callFn("send-email", { action: "notify", request_id: r.id, event }); }
async function updateRequest(r, patch, msg, event, extra) {
  let q = sb.from("requests").update(patch).eq("id", r.id);
  if (extra) q = extra(q);
  const { data, error } = await q.select("id");
  if (error) { toast(friendly(error)); return false; }
  if (!data || !data.length) { toast(t("changed_first")); loadRequests(); return false; }
  toast(msg); if (event) notify(r, event); loadRequests(); return true;
}
async function addNote(r, text) {
  text = (text || "").trim(); if (!text) return;
  const { error } = await sb.from("request_notes").insert({ request_id: r.id, author_id: S.user.id, body: text.slice(0, 500) });
  if (error) toast(friendly(error)); else { toast(t("note_added")); notify(r, "note"); loadRequests(); }
}
async function report(r, reason) {
  reason = (reason || "").trim();
  if (reason.length < 3) { toast(t("report_need")); return; }
  const tok = (await sb.auth.getSession()).data.session?.access_token;
  const res = await window.LARA_FEEDBACK({ action: "problem", request_id: r.id, message: reason.slice(0, 2000) }, tok);
  if (!res.error) { toast(t("report_sent")); return; }
  const { error } = await sb.from("reports").insert({ request_id: r.id, reporter_id: S.user.id, reason: reason.slice(0, 2000) });
  toast(error ? friendly(error) : t("report_sent"));
}

// ---------- report a problem (anyone, signed in or not) ----------
$("problemLink").addEventListener("click", (e) => {
  e.preventDefault();
  $("pbState").textContent = ""; $("pbSend").disabled = false;
  if (S.user && S.user.email && !$("pbEmail").value) $("pbEmail").value = S.user.email;
  const d = $("problem"); if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  $("pbText").focus();
});
$("pbClose").addEventListener("click", () => $("problem").close());
$("pbSend").addEventListener("click", async () => {
  const message = $("pbText").value.trim(), contact = $("pbEmail").value.trim();
  if (message.length < 3) { $("pbState").textContent = t("pb_need"); $("pbText").focus(); return; }
  if (contact && !/^\S+@\S+\.\S+$/.test(contact)) { $("pbState").textContent = t("pb_bad_email"); $("pbEmail").focus(); return; }
  $("pbSend").disabled = true; $("pbState").textContent = t("pb_sending");
  const tok = sb ? (await sb.auth.getSession()).data.session?.access_token : undefined;
  const res = await window.LARA_FEEDBACK({ action: "problem", message, contact }, tok);
  $("pbSend").disabled = false;
  if (res.error) { $("pbState").textContent = res.error === "not_connected" ? t("not_connected_short") : res.error; return; }
  $("pbText").value = "";
  $("pbState").textContent = contact ? t("pb_thanks_reply") : t("pb_thanks");
  toast(t("pb_thanks"));
});

// ---------- DOI / title check ----------
function searchLinks(doi, title) {
  const e = encodeURIComponent, q = e(title || doi);
  return [
    [t("lk_publisher"), "https://doi.org/" + doi],
    [t("lk_scholar"), "https://scholar.google.com/scholar?q=" + e(doi)],
    ["AJOL", "https://www.ajol.info/index.php/index/search/search?query=" + q],
    ["AfricArXiv", "https://zenodo.org/communities/africarxiv/records?q=" + q],
    ["BASE", "https://www.base-search.net/Search/Results?lookfor=" + e(doi)],
    ["CORE", "https://core.ac.uk/search?q=doi%3A%22" + e(doi) + "%22"],
  ];
}
$("doiInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("checkBtn").click(); });
$("checkBtn").addEventListener("click", () => runCheck($("doiInput").value));

async function runCheck(raw) {
  const err = $("doiError"); err.hidden = true; $("candidates").hidden = true;
  const text = (raw || "").trim();
  if (!text) { err.textContent = t("find_empty"); err.hidden = false; return; }
  const doi = normDoi(text);
  const btn = $("checkBtn");
  if (!DOI_RE.test(doi)) {
    if (text.length < 8) { err.textContent = t("find_short"); err.hidden = false; return; }
    if (!sb) { err.textContent = t("not_connected_short"); err.hidden = false; return; }
    btn.disabled = true; btn.textContent = t("finding");
    const { data, error } = await callFn("doi-lookup", { query: text });
    btn.disabled = false; btn.textContent = t("find_btn");
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    return renderCandidates(data.candidates || []);
  }
  S.doi = doi; S.lookup = null; $("doiInput").value = doi;
  btn.disabled = true; btn.textContent = t("searching");
  if (sb) {
    const { data, error } = await callFn("doi-lookup", { doi });
    S.lookup = error ? { failed: true, message: error.message } : data;
  } else S.lookup = { failed: true, message: t("not_connected_links") };
  btn.disabled = false; btn.textContent = t("find_btn");
  renderCheck();
}

function renderCandidates(list) {
  const box = $("candidates"); box.replaceChildren(); box.hidden = false; $("checkResult").hidden = true;
  if (!list.length) { box.append(h("p", { class: "small" }, t("cand_none"))); return; }
  box.append(h("p", { class: "small" }, t("cand_pick")));
  for (const c of list) {
    box.append(h("div", { class: "copy" },
      h("div", { class: "host" }, c.title || c.doi),
      h("div", { class: "facts" }, [c.authors.join(", "), c.journal, c.year, c.doi].filter(Boolean).join(" · ")),
      h("button", { class: "open", type: "button", onclick: () => runCheck(c.doi) }, t("cand_use"))));
  }
}

function renderCheck() {
  const doi = S.doi, L = S.lookup || {}, meta = L.meta || {}, box = $("checkResult");
  if (!doi) return;
  box.replaceChildren(); box.hidden = false;

  // Step 1
  const s1 = h("div", { class: "meta-box" }, h("div", { class: "label" }, t("step1_label")));
  if (meta.title) s1.append(h("div", { class: "title" }, meta.title),
    h("div", { class: "small muted" }, [(meta.authors || []).slice(0, 4).join(", ") + ((meta.authors || []).length > 4 ? " et al." : ""), meta.journal, meta.year].filter(Boolean).join(" · ")));
  if (L.africanPlatform) s1.append(h("p", null, h("span", { class: "tag africa" }, t("african_pub", { p: L.africanPlatform }))));
  if (L.failed) s1.append(h("p", { class: "small" }, L.message));
  else if (L.meta && !L.found) s1.append(h("p", { class: "small" }, t("not_recognised")));
  if (L.journalInDoaj) s1.append(h("p", { class: "notice ok small" }, t("doaj_note")));
  const copies = L.copies || [];
  if (copies.length) {
    s1.append(h("p", null, h("span", { class: "oa-yes" }, t(copies.length === 1 ? "copies_1" : "copies_n", { n: copies.length })), " ", t("copies_best")));
    s1.append(h("div", { class: "copies" }, copies.slice(0, 10).map((c) => h("div", { class: "copy" },
      h("div", { class: "host" }, c.host || t("open_copy")),
      h("div", { class: "facts" }, h("span", { class: "tag" }, c.kind === "pdf" ? "PDF" : t("web_page")), [verText(c.version), c.license ? t("licence", { l: c.license }) : "", t("found_by", { s: c.foundBy.join(", ") })].filter(Boolean).join(" · ")),
      h("a", { class: "open", href: c.url, target: "_blank", rel: "noopener" }, t("open"))))));
    s1.append(h("p", { class: "small" }, h("a", { href: "#versions" }, t("ver_link"))));
    s1.append(h("div", { class: "row" }, h("button", { class: "small", type: "button", onclick: () => savePaper(doi, meta, copies) }, t("save_paper"))));
  } else if (L.found) {
    s1.append(h("p", { class: "small" }, t("no_copy")));
  }
  if (!copies.length) s1.append(h("div", { class: "links" }, searchLinks(doi, meta.title).map(([x, u]) => link(x, u))));
  if (L.sources) {
    s1.append(h("div", { class: "sources", "aria-label": t("checked") }, Object.entries(L.sources).filter(([, v]) => !v.skipped)
      .map(([k, v]) => h("span", { class: v.ok ? "ok" : "" }, (v.ok ? "✓ " : "– ") + k))));
    if (L.cached) s1.append(h("p", { class: "small muted" }, t("cached")));
  }
  box.append(s1);

  // Step 2
  box.append(h("div", { class: "meta-box" }, h("div", { class: "label" }, t("step2_label")),
    h("p", { class: "small" }, t("r4l_p")), h("div", { class: "links" }, link("Research4Life", "https://www.research4life.org/"))));

  // Step 3: write to the author
  const corr = L.corresponding || [];
  const s3 = h("div", { class: "meta-box" }, h("div", { class: "label" }, t("step3_label")));
  s3.append(corr.length
    ? h("p", { class: "small" }, t(corr[0].guess ? "first_author" : "corr_author"), " ",
        corr.map((c, i) => [i ? ", " : "", c.name, c.orcid ? [" (", link("ORCID", c.orcid), ")"] : "", c.affiliation ? ", " + c.affiliation : ""]), ". ", t("email_where"))
    : h("p", { class: "small" }, t("email_where_none")));
  if (L.sharePolicy) s3.append(h("p", { class: "small" }, policyLine(L.sharePolicy)));
  s3.append(h("div", { class: "row" }, h("button", { class: "primary", type: "button", onclick: () => openComposer({ doi, meta, corr, policy: L.sharePolicy }) }, t("write_author"))));
  box.append(s3);

  // Step 4
  const s4 = h("div", { class: "meta-box" }, h("div", { class: "label" }, t("step4_label")));
  const existing = S.requests.find((r) => r.doi === doi && r.status !== "closed");
  if (existing) s4.append(h("p", { class: "notice small" }, t("already_req", { s: t(STATUS_KEYS[existing.status]) })));
  if (!S.user) s4.append(h("p", { class: "small" }, h("a", { href: "#signin" }, t("si_h")), " ", t("to_post")));
  else if (!S.profile) s4.append(h("p", { class: "small" }, h("a", { href: "#profile" }, t("setup_profile")), " ", t("setup_profile_why")));
  else {
    const title = h("input", { type: "text", value: meta.title || "", maxlength: "600", "aria-label": t("title") });
    const note = h("textarea", { maxlength: "400", placeholder: t("note_ph") });
    const tried = h("input", { type: "checkbox" });
    const share = h("input", { type: "checkbox" });
    s4.append(h("label", { class: "f" }, t("title"), title), h("label", { class: "f" }, t("note_label"), note),
      h("label", { class: "check" }, tried, h("span", null, t("tried"))),
      h("label", { class: "check" }, share, h("span", null, t("share_email"))),
      h("div", { class: "row" },
        h("button", { class: "primary", type: "button", onclick: () => { if (!tried.checked) { toast(t("tick_first")); return; } submitRequest(doi, meta, title.value, note.value, "open", share.checked); } }, t("post_board")),
        copies.length ? h("button", { class: "ghost", type: "button", onclick: () => submitRequest(doi, meta, title.value, "", "done") }, t("log_found")) : null),
      h("p", { class: "small muted" }, t("log_found_why")));
  }
  box.append(s4);
}

function policyLine(p) {
  if (!p) return "";
  if (!p.accepted) return t("pol_no");
  const where = p.where && p.where.length ? t("pol_where", { w: p.where.slice(0, 3).join(", ") }) : "";
  return (p.embargo ? t("pol_embargo", { e: localEmbargo(I.lang, p.embargo) }) : t("pol_yes")) + where;
}

async function submitRequest(doi, meta, title, note, status, share) {
  const row = { doi, title: (title || "").trim().slice(0, 600), journal: (meta.journal || "").slice(0, 300), year: meta.year || null,
    authors: (meta.authors || []).slice(0, 8).join(", ").slice(0, 600), note: (note || "").trim().slice(0, 400), requester_id: S.user.id, status,
    share_email: !!share && status === "open",
    route: status === "done" ? "oa" : null, legal_link: status === "done" && S.lookup && S.lookup.copies && S.lookup.copies[0] ? S.lookup.copies[0].url : "" };
  const { error } = await sb.from("requests").insert(row);
  if (error) { toast(friendly(error)); return; }
  toast(status === "done" ? t("logged") : t("posted"));
  $("checkResult").hidden = true; $("doiInput").value = "";
  location.hash = status === "done" ? "#impact" : "#mine";
  loadRequests();
}

// ---------- saved papers (this device only) ----------
function savePaper(doi, meta, copies) {
  const list = load("lara_saved", []).filter((x) => x.doi !== doi);
  list.unshift({ doi, title: meta.title || doi, journal: meta.journal || "", year: meta.year || "", links: copies.slice(0, 3).map((c) => ({ url: c.url, host: c.host, version: c.version })), at: Date.now() });
  store("lara_saved", list.slice(0, 50)); renderSaved(); toast(t("saved_toast"));
}
function renderSaved() {
  const list = load("lara_saved", []);
  $("savedCount").textContent = list.length || "";
  const box = $("savedList"); box.replaceChildren();
  if (!list.length) { box.append(h("p", { class: "small muted" }, t("saved_none"))); return; }
  for (const p of list) box.append(h("div", { class: "copy" },
    h("div", { class: "host" }, p.title),
    h("div", { class: "facts" }, [p.journal, p.year, p.doi].filter(Boolean).join(" · "), " ", p.links.map((l, i) => [i ? " · " : " ", link(l.host || t("open_copy"), l.url)])),
    h("button", { class: "open ghost", type: "button", onclick: () => { store("lara_saved", load("lara_saved", []).filter((x) => x.doi !== p.doi)); renderSaved(); } }, t("remove"))));
}

// ---------- email composer ----------
// "12 months" -> "12 Monate", "12个月", "12 か月"... using the browser's own number formatting
function localEmbargo(lang, s) {
  const m = /^(\d+)\s*(day|week|month|year)s?/i.exec(s || "");
  if (!m) return s;
  try { return new Intl.NumberFormat(lang, { style: "unit", unit: m[2].toLowerCase(), unitDisplay: "long" }).format(+m[1]); } catch { return s; }
}
function letterLangs() {
  const sel = $("emLang"), langs = (window.LARA_LETTER_LANGS || []).slice();
  if (!langs.length || sel.dataset.filled) return;
  const top = langs.slice(0, 4), rest = langs.slice(4).sort((a, b) => a.e.localeCompare(b.e));
  sel.textContent = "";
  for (const l of [...top, ...rest]) {
    const o = document.createElement("option");
    o.value = l.c; o.textContent = l.n === l.e ? l.n : `${l.n} · ${l.e}`;
    sel.appendChild(o);
  }
  sel.dataset.filled = "1";
}
function letterDir(lang) {
  const l = (window.LARA_LETTER_LANGS || []).find((x) => x.c === lang);
  const dir = l && l.rtl ? "rtl" : "ltr";
  $("emSubject").dir = dir; $("emBody").dir = dir;
}
function letter(lang, ctx) {
  const m = S.profile || {};
  const who = (ctx.corr && ctx.corr[0] && ctx.corr[0].name) || "";
  const last = who ? who.split(" ").slice(-1)[0] : "";
  if (ctx.vol) {
    // A volunteer writing on the requester's behalf: say so plainly.
    const rq = ctx.request.requester || {};
    const v = {
      surname: last || I.tl(lang, "lt_surname"), rname: rq.name || "", rinst: rq.institution || "",
      rcountry: rq.country ? I.tl(lang, "lt_country", { c: rq.country }) : "",
      title: ctx.meta.title || I.tl(lang, "lt_title"), doi: ctx.doi, name: m.name || I.tl(lang, "lt_name"), site: SITE,
      policy: ctx.policy && ctx.policy.accepted ? "\n\n" + I.tl(lang, ctx.policy.embargo ? "lt_policy_emb" : "lt_policy", { e: localEmbargo(lang, ctx.policy.embargo) }) : "",
    };
    v.cc = I.tl(lang, ctx.cc ? "lt_v_cc" : "lt_v_nocc", v);
    return { subject: I.tl(lang, "lt_v_subject", v), body: I.tl(lang, "lt_v_body", v) };
  }
  const vars = {
    surname: last || I.tl(lang, "lt_surname"), inst: m.institution || I.tl(lang, "lt_inst"), country: m.country ? I.tl(lang, "lt_country", { c: m.country }) : "",
    field: m.field ? I.tl(lang, "lt_field", { f: m.field }) : "", journal: ctx.meta.journal || I.tl(lang, "lt_journal"),
    title: ctx.meta.title || I.tl(lang, "lt_title"), doi: ctx.doi, name: m.name || I.tl(lang, "lt_name"),
    policy: ctx.policy && ctx.policy.accepted ? "\n\n" + I.tl(lang, ctx.policy.embargo ? "lt_policy_emb" : "lt_policy", { e: localEmbargo(lang, ctx.policy.embargo) }) : "",
  };
  return { subject: I.tl(lang, "lt_subject", vars), body: I.tl(lang, "lt_body", vars) };
}
function composeLinks() {
  const to = $("emTo").value.trim(), su = $("emSubject").value, body = $("emBody").value;
  const cc = (S.composer && S.composer.cc) || "";
  const e = encodeURIComponent, c = cc ? `&cc=${e(cc)}` : "";
  $("emGmail").href = `https://mail.google.com/mail/?view=cm&fs=1&to=${e(to)}${c}&su=${e(su)}&body=${e(body)}`;
  $("emOutlook").href = `https://outlook.live.com/mail/0/deeplink/compose?to=${e(to)}${c}&subject=${e(su)}&body=${e(body)}`;
  $("emOffice").href = `https://outlook.office.com/mail/deeplink/compose?to=${e(to)}${c}&subject=${e(su)}&body=${e(body)}`;
  $("emYahoo").href = `https://compose.mail.yahoo.com/?to=${e(to)}${c}&subject=${e(su)}&body=${e(body)}`;
  $("emMailto").href = `mailto:${e(to)}?${cc ? `cc=${e(cc)}&` : ""}subject=${e(su)}&body=${e(body)}`;
}
async function openComposer(ctx) {
  const r = ctx.request, uid = S.user && S.user.id;
  ctx.vol = !!(r && uid && r.volunteer_id === uid && r.requester_id !== uid);
  ctx.cc = "";
  if (ctx.vol && r.share_email && sb) {
    const { data } = await sb.rpc("requester_email", { req: r.id });
    if (typeof data === "string" && data.includes("@")) ctx.cc = data;
  }
  S.composer = ctx;
  const lang = I.lang;
  letterLangs();
  $("emLang").value = lang;
  letterDir(lang);
  const l = letter(lang, ctx);
  $("emSubject").value = l.subject; $("emBody").value = l.body;
  $("emTo").value = ctx.to || "";
  $("emWho").textContent = ctx.corr && ctx.corr.length ? t("em_who", { n: ctx.corr.map((c) => c.name).join(", ") }) : t("email_where_none");
  $("emCcRow").hidden = !ctx.cc; $("emCc").value = ctx.cc;
  $("emVol").hidden = !ctx.vol;
  $("emVol").textContent = ctx.vol ? t(ctx.cc ? "em_vol_cc" : "em_vol_nocc", { n: (r.requester && r.requester.name) || t("a_member") }) : "";
  $("emPolicy").textContent = ctx.policy ? policyLine(ctx.policy) : "";
  $("emState").textContent = "";
  $("emSend").hidden = !(S.emailOn && S.user && S.profile);
  $("emSendNote").textContent = S.emailOn ? (S.user && S.profile ? (ctx.cc ? t("em_send_note_cc", { n: (r.requester && r.requester.name) || t("a_member") }) : t("em_send_note")) : t("em_need_signin")) : "";
  composeLinks();
  const d = $("composer");
  if (d.showModal) d.showModal(); else d.setAttribute("open", "");
}
["emTo", "emSubject", "emBody"].forEach((id) => $(id).addEventListener("input", composeLinks));
$("emLang").addEventListener("change", () => { if (!S.composer) return; letterDir($("emLang").value); const l = letter($("emLang").value, S.composer); $("emSubject").value = l.subject; $("emBody").value = l.body; composeLinks(); });
$("emClose").addEventListener("click", () => $("composer").close());
["emGmail", "emOutlook", "emOffice", "emYahoo", "emMailto"].forEach((id) => $(id).addEventListener("click", (e) => {
  if (!$("emTo").value.trim()) { e.preventDefault(); $("emState").textContent = t("em_need_to"); $("emTo").focus(); return; }
  $("emState").textContent = t("em_opened");
  if (S.composer && S.composer.request && S.user) addNote(S.composer.request, t("note_emailed"));
}));
$("emSend").addEventListener("click", async () => {
  const to = $("emTo").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(to)) { $("emState").textContent = t("em_need_to"); $("emTo").focus(); return; }
  $("emSend").disabled = true; $("emState").textContent = t("em_sending");
  const { error } = await callFn("send-email", { action: "author", to, subject: $("emSubject").value, body: $("emBody").value, request_id: S.composer && S.composer.request ? S.composer.request.id : null, cc_requester: !!(S.composer && S.composer.cc) });
  $("emSend").disabled = false;
  if (error) { $("emState").textContent = error.message; if (error.code === "email_not_configured") { S.emailOn = false; $("emSend").hidden = true; } return; }
  $("emState").textContent = t("em_sent");
  toast(t("em_sent"));
  if (S.composer && S.composer.request) loadRequests();
});

// ---------- reference list ----------
$("refsBtn").addEventListener("click", async () => {
  const text = $("refsInput").value;
  if (text.trim().length < 15) { $("refsState").textContent = t("refs_empty"); return; }
  if (!sb) { $("refsState").textContent = t("not_connected_short"); return; }
  $("refsBtn").disabled = true; $("refsState").textContent = t("refs_working");
  const { data, error } = await callFn("doi-lookup", { references: text });
  $("refsBtn").disabled = false;
  if (error) { $("refsState").textContent = error.message; return; }
  S.refs = (data.results || []).map((r) => ({ ...r, check: null }));
  $("refsState").textContent = t("refs_found", { n: S.refs.filter((r) => r.match).length, m: S.refs.length });
  renderRefs();
});
$("refsCheckAll").addEventListener("click", async () => {
  $("refsCheckAll").disabled = true;
  for (let i = 0; i < S.refs.length; i++) {
    const r = S.refs[i];
    if (!r.match || r.check) continue;
    $("refsState").textContent = t("refs_checking", { i: i + 1, n: S.refs.length });
    await checkRef(i);
  }
  $("refsCheckAll").disabled = false; $("refsState").textContent = t("refs_done");
});
async function checkRef(i) {
  const r = S.refs[i];
  r.check = { loading: true }; renderRefs();
  const { data, error } = await callFn("doi-lookup", { doi: r.match.doi });
  r.check = error ? { error: error.message } : { n: (data.copies || []).length, first: (data.copies || [])[0] || null };
  renderRefs();
}
function renderRefs() {
  const tb = $("refsTable").querySelector("tbody"); tb.replaceChildren();
  $("refsTable").hidden = !S.refs.length; $("refsCheckAll").hidden = !S.refs.some((r) => r.match);
  S.refs.forEach((r, i) => {
    const m = r.match;
    const sure = m && m.match >= 0.8;
    const matchCell = m
      ? h("td", null, h("div", null, m.title || m.doi), h("div", { class: "small muted" }, [m.journal, m.year].filter(Boolean).join(" · "), " · ", link(m.doi, "https://doi.org/" + m.doi)),
          sure ? null : h("div", { class: "small warntext" }, t("refs_unsure")))
      : h("td", { class: "small muted" }, t("refs_nomatch"));
    let st;
    if (!m) st = h("td");
    else if (!r.check) st = h("td", null, h("button", { class: "small", type: "button", onclick: () => checkRef(i) }, t("refs_check")));
    else if (r.check.loading) st = h("td", { class: "small muted" }, "…");
    else if (r.check.error) st = h("td", { class: "small" }, r.check.error);
    else if (r.check.n) st = h("td", null, h("span", { class: "oa-yes small" }, t("refs_free", { n: r.check.n })), " ", link(t("open"), r.check.first.url),
      " · ", h("a", { href: "#request", onclick: () => setTimeout(() => runCheck(m.doi), 50) }, t("refs_details")));
    else st = h("td", null, h("span", { class: "small" }, t("refs_nofree")), " ", h("a", { href: "#request", onclick: () => setTimeout(() => runCheck(m.doi), 50) }, t("refs_next")));
    tb.append(h("tr", null, h("td", { class: "num" }, i + 1), h("td", { class: "small refcell" }, r.ref), matchCell, st));
  });
}

// ---------- slips ----------
function volunteerRecord(id) { return S.requests.filter((r) => r.volunteer_id === id && r.status === "done").length; }
function slip(r) {
  const doi = r.doi || "", i = doi.indexOf("/");
  const req = r.requester || {};
  const stub = h("div", { class: "stub" }, h("span", { class: "no" }, "#" + r.id.slice(0, 5).toUpperCase()), h("span", { class: "pill st-" + r.status }, t(STATUS_KEYS[r.status] || r.status)), h("span", { class: "small muted" }, ago(r.created_at)));
  const body = h("div", { class: "body" });
  body.append(h("div", { class: "doi" }, h("span", { class: "pre" }, doi.slice(0, i + 1)), doi.slice(i + 1), " ", h("a", { href: "https://doi.org/" + doi, target: "_blank", rel: "noopener", class: "small" }, t("publisher") + " ↗")));
  if (r.title) body.append(h("div", { class: "title" }, r.title));
  if (r.journal || r.year) body.append(h("div", { class: "small muted" }, [r.journal, r.year].filter(Boolean).join(" · ")));
  body.append(h("div", { class: "small" }, t("requested_by") + " ", h("b", null, req.name || t("a_member")), " ", badge(req), ", " + [req.institution, req.location, req.country].filter(Boolean).join(", ") + (req.field ? " · " + req.field : "")));
  if (r.note) body.append(h("p", { class: "small muted" }, "“" + r.note + "”"));
  if (r.volunteer) { const n = volunteerRecord(r.volunteer_id); body.append(h("div", { class: "small" }, t("volunteer") + ": ", h("b", null, r.volunteer.name), " ", badge(r.volunteer), n ? " · " + t("helped_n", { n }) : "")); }
  if (r.share_email && S.user && (r.requester_id === S.user.id || r.volunteer_id === S.user.id) && !["done", "closed"].includes(r.status)) body.append(h("div", { class: "small muted" }, "✉ " + t("share_badge")));
  if (r.legal_link) body.append(h("div", { class: "small" }, t("legal_copy") + ": ", link(r.legal_link.replace(/^https?:\/\//, "").slice(0, 70), r.legal_link)));
  if (r.status === "done" && r.route) body.append(h("div", { class: "small" }, t("obtained_via") + ": " + t(ROUTE_KEYS[r.route] || "route_other")));
  const notes = (r.notes || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (notes.length) body.append(h("div", { class: "notes" }, notes.map((n) => h("div", null, h("b", null, ((n.author && n.author.name) || t("a_member")) + ": "), n.body, h("span", { class: "muted" }, " · " + ago(n.created_at))))));
  const acts = actions(r); if (acts) body.append(acts);
  body.append(extras(r));
  return h("article", { class: "slip" }, stub, body);
}
function extras(r) {
  const wa = `https://wa.me/?text=${encodeURIComponent(t("wa_text", { title: r.title || r.doi, doi: r.doi, site: SITE }))}`;
  const box = h("div", { class: "row extras" }, link(t("wa_share"), wa));
  if (S.user && S.profile) {
    const det = h("details", { class: "report" }, h("summary", { class: "small" }, t("report")));
    const ta = h("input", { type: "text", maxlength: "500", placeholder: t("report_ph") });
    det.append(h("div", { class: "row" }, ta, h("button", { class: "small", type: "button", onclick: () => { report(r, ta.value); det.open = false; ta.value = ""; } }, t("report_send"))));
    box.append(det);
  }
  return box;
}
function actions(r) {
  if (!S.user || !S.profile || ["done", "closed"].includes(r.status)) return null;
  const uid = S.user.id, mine = r.requester_id === uid, helping = r.volunteer_id === uid;
  const box = h("div", { class: "actions" });
  if (isVol() && r.status === "open" && !mine && !r.volunteer_id) {
    box.append(h("button", { class: "small primary", type: "button", onclick: () => updateRequest(r, { status: "working", volunteer_id: uid }, t("took"), "taken", (q) => q.eq("status", "open").is("volunteer_id", null)) }, t("take")));
  }
  if (mine || helping) {
    box.append(h("button", { class: "small", type: "button", onclick: () => openComposer({ doi: r.doi, meta: { title: r.title, journal: r.journal }, corr: [], policy: null, request: r }) }, t("write_author")));
  }
  if (helping) {
    const url = h("input", { type: "url", placeholder: t("link_ph") });
    box.append(url,
      h("button", { class: "small primary", type: "button", onclick: () => { const u = url.value.trim(); if (!/^https?:\/\//i.test(u)) { toast(t("link_bad")); return; } updateRequest(r, { status: "link", legal_link: u }, t("shared"), "link"); } }, t("share_link")),
      h("button", { class: "small", type: "button", onclick: () => updateRequest(r, { status: "author" }, t("marked_author"), "author") }, t("author_contacted")),
      h("button", { class: "small ghost", type: "button", onclick: () => updateRequest(r, { status: "open", volunteer_id: null }, t("released"), "released") }, t("release")),
      h("button", { class: "small ghost", type: "button", onclick: () => updateRequest(r, { status: "closed" }, t("closed_nf"), "notfound") }, t("no_route")));
  }
  if (mine) {
    const sh = h("input", { type: "checkbox", checked: !!r.share_email, onchange: async () => {
      sh.disabled = true;
      const { error } = await sb.from("requests").update({ share_email: sh.checked }).eq("id", r.id);
      sh.disabled = false;
      if (error) { sh.checked = !sh.checked; toast(friendly(error)); } else { r.share_email = sh.checked; toast(t("share_saved")); }
    } });
    box.append(h("label", { class: "check small" }, sh, h("span", null, t("share_email"))));
    const sel = h("select", { "aria-label": t("how_received") }, Object.entries(ROUTE_KEYS).map(([k, v]) => h("option", { value: k, selected: (r.status === "link" && k === "oa") || (r.status === "author" && k === "author") }, t(v))));
    box.append(sel,
      h("button", { class: "small primary", type: "button", onclick: () => updateRequest(r, { status: "done", route: sel.value }, t("marked_received"), "received") }, t("received")),
      h("button", { class: "small ghost", type: "button", onclick: () => updateRequest(r, { status: "closed" }, t("withdrawn"), "withdrawn") }, t("withdraw")));
  }
  if (mine || helping) {
    const note = h("input", { type: "text", placeholder: t("add_note"), maxlength: "500" });
    box.append(note, h("button", { class: "small", type: "button", onclick: () => { addNote(r, note.value); note.value = ""; } }, t("add_note_btn")));
  }
  return box.childNodes.length ? box : null;
}


// ---------- find a journal ----------
const JF = { data: null, shown: 12 };
const FEE_ORDER = { none: 0, subscription: 1, optional: 2, unknown: 3, apc: 4 };
function money(amount, currency) {
  try { return new Intl.NumberFormat(I.lang, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(amount); }
  catch { return (currency || "US$") + " " + Math.round(amount); }
}
function feeLine(j) {
  const f = j.fee || {};
  const price = f.usd ? money(f.usd, "USD") : f.prices && f.prices[0] ? money(f.prices[0].price, f.prices[0].currency) : "";
  if (f.model === "none") return { cls: "fee-free", text: t("jf_fee_none") };
  if (f.model === "subscription") return { cls: "fee-free", text: t("jf_fee_sub") };
  if (f.model === "optional") return { cls: "fee-free", text: t("jf_fee_optional", { p: price }) };
  if (f.model === "apc") return { cls: "fee-paid", text: price ? t("jf_fee_apc", { p: price }) : t("jf_fee_apc_np") };
  return { cls: "fee-unknown", text: t("jf_fee_unknown") };
}
function freeToPublish(j) { return ["none", "subscription", "optional"].includes(j.fee && j.fee.model); }
function jfFiltered(list) {
  let out = list.filter((j) => (!$("jfFree").checked || freeToPublish(j)) && (!$("jfOpen").checked || j.openAccess)
    && (!$("jfDoaj").checked || j.doaj) && (!$("jfAfrica").checked || j.african));
  const s = $("jfSort").value;
  const fee = (j) => (freeToPublish(j) ? 0 : j.fee && j.fee.usd != null ? j.fee.usd : 1e9);
  if (s === "fee") out = out.slice().sort((a, b) => fee(a) - fee(b) || b.score - a.score);
  if (s === "fast") out = out.slice().sort((a, b) => (a.weeks || 999) - (b.weeks || 999) || b.score - a.score);
  if (s === "cited") out = out.slice().sort((a, b) => (b.cited2y || 0) - (a.cited2y || 0));
  if (s === "africa") out = out.slice().sort((a, b) => b.africaPapers - a.africaPapers || b.score - a.score);
  return out;
}
function journalCard(j, simple) {
  const fee = feeLine(j);
  const n = (x) => new Intl.NumberFormat(I.lang).format(x);
  const facts = [];
  if (j.fieldPapers) facts.push(t("jf_fact_field", { n: n(j.fieldPapers) }) + (j.africaPapers ? " " + t("jf_fact_africa", { n: n(j.africaPapers) }) : ""));
  if (j.weeks) facts.push(t("jf_fact_weeks", { n: j.weeks }));
  if (j.review) facts.push(t("jf_fact_review", { r: j.review }));
  if (j.cited2y != null) facts.push(t("jf_fact_cited", { n: j.cited2y }));
  const doajLink = "https://doaj.org/search/journals?source=" + encodeURIComponent(JSON.stringify({ query: { query_string: { query: j.issn || j.name, default_operator: "AND" } } }));
  return h("article", { class: "panel journal" },
    h("div", { class: "jhead" },
      h("div", null,
        h("h3", null, j.homepage ? link(j.name, j.homepage) : j.name),
        h("div", { class: "small muted" }, [j.publisher, j.country ? countryName(j.country) : ""].filter(Boolean).join(" · "))),
      h("div", { class: "badges" },
        h("span", { class: "pill " + fee.cls }, fee.text),
        j.openAccess ? h("span", { class: "pill st-done" }, t("jf_b_open")) : h("span", { class: "pill" }, t("jf_b_sub")),
        j.doaj ? h("span", { class: "pill st-done" }, "DOAJ ✓") : null,
        j.african ? h("span", { class: "pill st-link" }, j.ajol ? t("jf_b_ajol") : t("jf_b_africa")) : null)),
    j.fee && j.fee.model === "apc" && j.waiver ? h("p", { class: "small" }, j.waiver.has ? h("span", null, "✓ " + t("jf_waiver_yes") + " ", j.waiver.url ? link(t("jf_waiver_link"), j.waiver.url) : null) : t("jf_waiver_no")) : null,
    facts.length ? h("p", { class: "small" }, facts.join(" · ")) : null,
    !simple && j.lists && j.lists.length ? h("p", { class: "small muted" }, t("jf_lists") + ": " + j.lists.join(", ")) : null,
    !simple && j.example && j.example.title ? h("p", { class: "small muted" }, t("jf_example") + " ", j.example.doi ? link(j.example.title, "https://doi.org/" + j.example.doi) : j.example.title, j.example.year ? " (" + j.example.year + ")" : "") : null,
    h("div", { class: "row wrap" },
      j.guide ? h("a", { class: "btn small primary", href: j.guide, target: "_blank", rel: "noopener" }, t("jf_guide")) : null,
      j.homepage ? h("a", { class: "btn small" + (j.guide ? "" : " primary"), href: j.homepage, target: "_blank", rel: "noopener" }, j.guide ? t("jf_site") : t("jf_site_guide")) : null,
      j.doaj ? h("a", { class: "btn small ghost", href: doajLink, target: "_blank", rel: "noopener" }, t("jf_doaj_rec")) : null,
      j.fee && j.fee.url ? h("a", { class: "btn small ghost", href: j.fee.url, target: "_blank", rel: "noopener" }, t("jf_fee_page")) : null));
}
let countryNames;
function countryName(cc) {
  try { countryNames = countryNames || new Intl.DisplayNames([I.lang], { type: "region" }); return countryNames.of(cc) || cc; } catch { return cc; }
}
function renderJournals() {
  const d = JF.data; if (!d) return;
  const verified = d.journals.filter((j) => j.verified), unverified = d.journals.filter((j) => !j.verified);
  $("jfResults").hidden = false;
  const kind = $("jfKind").value;
  $("jfMatched").textContent = (d.topics && d.topics.length ? t("jf_matched", { t: d.topics.join(" · ") }) : "") + (kind !== "research" ? " " + t("jf_tip_" + kind) : "");
  const list = jfFiltered(verified);
  const box = $("jfList"); box.replaceChildren();
  if (!list.length) box.append(emptyState(verified.length ? t("jf_none_filter") : t("jf_none"), verified.length ? t("jf_none_filter_p") : t("jf_none_p")));
  list.slice(0, JF.shown).forEach((j) => box.append(journalCard(j)));
  $("jfMore").hidden = list.length <= JF.shown;
  const ul = jfFiltered(unverified);
  $("jfUnverifiedBox").hidden = !ul.length;
  $("jfUnvCount").textContent = ul.length;
  $("jfUnverified").replaceChildren(...ul.map((j) => journalCard(j, true)));
}
["jfFree", "jfOpen", "jfDoaj", "jfAfrica", "jfSort"].forEach((id) => $(id).addEventListener("change", () => { JF.shown = 12; renderJournals(); }));
$("jfMore").addEventListener("click", () => { JF.shown += 12; renderJournals(); });
$("jfForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const topic = $("jfTopic").value.trim();
  if (topic.split(/\s+/).filter(Boolean).length < 2) { $("jfState").textContent = t("jf_e_short"); $("jfTopic").focus(); return; }
  $("jfBtn").disabled = true; $("jfState").textContent = t("jf_searching");
  const { data, error } = await callFn("journals", { topic, kind: $("jfKind").value });
  $("jfBtn").disabled = false;
  if (error) { $("jfState").textContent = error.message; return; }
  $("jfState").textContent = "";
  JF.data = data; JF.shown = 12;
  $("jfGuide").open = false;
  renderJournals();
  $("jfResults").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.addEventListener("lara:lang", () => { countryNames = null; renderJournals(); });

// ---------- renders ----------
function emptyState(title, sub, a) { return h("div", { class: "empty" }, h("b", { class: "ink" }, title), sub ? h("span", { class: "small" }, sub) : null, a || null); }
function renderBoard() {
  const el = $("boardList"); el.replaceChildren();
  if (!S.user) { $("volHint").textContent = ""; el.append(emptyState(t("board_signin"), t("board_signin_p"), h("a", { href: "#signin" }, t("si_h")))); return; }
  const q = $("boardSearch").value.trim().toLowerCase(), f = S.filter;
  const list = S.requests
    .filter((r) => f === "all" || (f === "open" && r.status === "open") || (f === "active" && ["working", "author", "link"].includes(r.status)) || (f === "done" && ["done", "closed"].includes(r.status)))
    .filter((r) => !q || [r.doi, r.title, r.journal, r.requester && r.requester.field, r.requester && r.requester.institution, r.requester && r.requester.country].join(" ").toLowerCase().includes(q));
  $("volHint").textContent = isVol() ? t("vol_hint") : S.profile ? t("vol_invite") : "";
  if (!list.length) el.append(emptyState(S.requests.length ? t("board_none_filter") : t("board_none"), t("board_none_p"), h("a", { href: "#request" }, t("tab_request"))));
  else list.forEach((r) => el.append(slip(r)));
}
function renderMine() {
  const a = $("mineList"), b = $("helpList"); a.replaceChildren(); b.replaceChildren();
  if (!S.user) { a.append(emptyState(t("mine_signin"), "", h("a", { href: "#signin" }, t("si_h")))); return; }
  const mine = S.requests.filter((r) => r.requester_id === S.user.id), help = S.requests.filter((r) => r.volunteer_id === S.user.id);
  if (!mine.length) a.append(emptyState(t("mine_none"), t("mine_none_p"), h("a", { href: "#request" }, t("tab_request")))); else mine.forEach((r) => a.append(slip(r)));
  if (!help.length) b.append(emptyState(isVol() ? t("help_none") : t("help_none_req"), isVol() ? t("help_none_p") : t("help_none_req_p"), h("a", { href: isVol() ? "#board" : "#profile" }, isVol() ? t("tab_board") : t("tab_profile"))));
  else help.forEach((r) => b.append(slip(r)));
}
function bars(el, pairs) {
  el.replaceChildren();
  if (!pairs.length) { el.append(h("p", { class: "small muted" }, t("no_data"))); return; }
  const max = Math.max(...pairs.map((p) => p[1]), 1);
  pairs.forEach(([k, v]) => el.append(h("div", { class: "bar" }, h("span", { class: "barlabel" }, k), h("div", { class: "track" }, h("div", { class: "fill", style: "width:" + ((v / max) * 100).toFixed(1) + "%" })), h("span", { class: "num" }, v))));
}
async function loadStats() {
  if (!sb) { renderImpact(); return; }
  const { data, error } = await sb.rpc("public_stats");
  if (!error) S.stats = data;
  renderImpact();
}
function renderImpact() {
  const s = S.stats || {};
  const med = s.median_days;
  const rate = s.resolved ? Math.round((s.obtained / s.resolved) * 100) + "%" : "–";
  const stats = [["stat_requests", s.requests], ["stat_obtained", s.obtained], ["stat_rate", rate], ["stat_median", med == null ? null : med < 1 ? "<1" : Math.round(med)],
    ["stat_open", s.open_now], ["stat_unmet", s.unmet], ["stat_members", s.members], ["stat_volunteers", s.volunteers], ["stat_countries", s.countries], ["stat_inst", s.institutions]];
  $("stats").replaceChildren(...stats.map(([l, v]) => h("div", { class: "stat" }, h("span", { class: "label" }, t(l)), h("span", { class: "v" }, v ?? "–"))));
  const mb = $("monthBars"); mb.replaceChildren();
  const months = s.monthly || [];
  if (!months.length) mb.append(h("p", { class: "small muted" }, t("no_data")));
  else { const max = Math.max(...months.map((m) => m.requests), 1);
    months.forEach((m) => mb.append(h("div", { class: "month", title: `${m.month}: ${m.requests} / ${m.obtained}` },
      h("div", { class: "mcol" }, h("div", { class: "mreq", style: `height:${(m.requests / max) * 100}%` }, h("div", { class: "mgot", style: `height:${m.requests ? (m.obtained / m.requests) * 100 : 0}%` }))),
      h("span", { class: "mlabel" }, m.month.slice(2)), h("span", { class: "mnum" }, m.requests))));
    mb.append(h("p", { class: "small muted legend" }, h("span", { class: "key req" }), t("leg_req"), " ", h("span", { class: "key got" }), t("leg_got"))); }
  bars($("routeBars"), Object.entries(s.routes || {}).map(([k, v]) => [t(ROUTE_KEYS[k] || "route_unstated"), v]).sort((a, b) => b[1] - a[1]));
  bars($("countryBars"), (s.top_countries || []).map((x) => [x.name, x.n]));
  bars($("instBars"), (s.top_institutions || []).map((x) => [x.name, x.n]));
  bars($("fieldBars"), (s.top_fields || []).map((x) => [x.name, x.n]));
}
$("exportBtn").addEventListener("click", async () => {
  if (!sb) return;
  const { data, error } = await sb.rpc("public_export");
  if (error) { toast(friendly(error)); return; }
  const cols = ["month", "country", "institution", "field", "journal", "year", "status", "route", "close_reason", "days_to_resolve"];
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [cols.join(","), ...(data || []).map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `lara-requests-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
});

// ---------- admin ----------
S.adminFilter = "open";
document.querySelectorAll("#adminFilter button").forEach((b) => b.addEventListener("click", () => {
  S.adminFilter = b.dataset.f;
  document.querySelectorAll("#adminFilter button").forEach((x) => x.classList.toggle("ghost", x !== b));
  loadReports();
}));
async function loadReports() {
  const box = $("reportList"); box.replaceChildren();
  const ebox = $("errorList"); ebox.replaceChildren();
  backupState();
  if (!S.profile || !S.profile.is_admin) { box.append(emptyState(t("admin_only"), "")); return; }
  let q = sb.from("reports").select("*, request:requests(id,doi,title,status), reporter:profiles(name,institution,country)").order("created_at", { ascending: false }).limit(200);
  if (S.adminFilter === "open") q = q.eq("status", "open");
  const { data, error } = await q;
  if (error) { box.append(h("p", null, friendly(error))); return; }
  if (!data.length) box.append(emptyState(t("admin_none"), ""));
  for (const rp of data) {
    const r = rp.request || {};
    const who = rp.reporter ? [rp.reporter.name, rp.reporter.institution, rp.reporter.country].filter(Boolean).join(", ") : t("admin_anon");
    const kind = rp.kind === "problem" ? t("admin_k_problem") : t("admin_k_request");
    box.append(h("div", { class: "panel stack" },
      h("div", { class: "row" },
        h("span", { class: "pill " + (rp.status === "open" ? "st-open" : "st-done") }, rp.status === "open" ? t("admin_open") : t("admin_resolved")),
        h("span", { class: "pill" }, kind),
        h("span", { class: "small muted" }, ago(rp.created_at) + " · " + who)),
      h("p", { style: "white-space:pre-wrap" }, rp.reason),
      rp.request_id ? h("p", { class: "small" }, (r.title || "") + " · ", link(r.doi || "", "https://doi.org/" + (r.doi || "")), " · " + t(STATUS_KEYS[r.status] || "st_open")) : null,
      (rp.page || rp.browser || rp.lang) ? h("p", { class: "small muted" }, [rp.page && t("admin_screen", { s: rp.page }), rp.lang && t("admin_lang", { l: rp.lang }), rp.browser && browserName(rp.browser)].filter(Boolean).join(" · ")) : null,
      h("div", { class: "row" },
        rp.contact ? h("a", { class: "btn small", href: `mailto:${encodeURIComponent(rp.contact)}?subject=${encodeURIComponent(t("admin_reply_subj"))}&body=${encodeURIComponent("\n\n> " + rp.reason.split("\n").join("\n> "))}` }, t("admin_reply", { e: rp.contact })) : null,
        rp.status === "open" ? h("button", { class: "small", type: "button", onclick: async () => { await sb.from("reports").update({ status: "resolved" }).eq("id", rp.id); loadReports(); } }, t("admin_mark")) : null,
        r.id && !["done", "closed"].includes(r.status) ? h("button", { class: "small ghost", type: "button", onclick: async () => { const { error: e } = await sb.from("requests").update({ status: "closed", close_reason: "not-found", resolved_at: new Date().toISOString() }).eq("id", r.id); toast(e ? friendly(e) : t("admin_closed")); loadReports(); loadRequests(); } }, t("admin_close")) : null,
        h("button", { class: "small ghost", type: "button", onclick: async () => { if (!confirm(t("admin_del_confirm"))) return; await sb.from("reports").delete().eq("id", rp.id); loadReports(); } }, t("admin_delete")))));
  }
  // errors
  const { data: errs, error: e2 } = await sb.from("client_errors").select("*").order("last_at", { ascending: false }).limit(100);
  if (e2) { ebox.append(h("p", { class: "small" }, friendly(e2))); return; }
  if (!errs.length) { ebox.append(emptyState(t("err_none"), "")); return; }
  ebox.append(h("div", { class: "row" }, h("button", { class: "small ghost", type: "button", onclick: async () => { if (!confirm(t("err_clear_confirm"))) return; await sb.from("client_errors").delete().gte("id", 0); loadReports(); } }, t("err_clear"))));
  for (const er of errs) {
    ebox.append(h("div", { class: "panel" },
      h("div", { class: "row" }, h("span", { class: "pill st-open" }, t("err_times", { n: er.count })), h("span", { class: "small muted" }, t("err_last", { a: ago(er.last_at), f: ago(er.first_at) }))),
      h("p", { class: "small", style: "word-break:break-word;font-family:var(--f-mono)" }, er.message),
      h("p", { class: "small muted" }, [er.source, er.page, er.lang, browserName(er.browser || "")].filter(Boolean).join(" · ")),
      h("div", { class: "row" }, h("button", { class: "small ghost", type: "button", onclick: async () => { await sb.from("client_errors").delete().eq("id", er.id); loadReports(); } }, t("err_fixed")))));
  }
}
// ---------- backup (admins) ----------
function backupState() {
  let last = 0; try { last = +localStorage.getItem("lara_last_backup") || 0; } catch {}
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  $("bkState").textContent = last ? t("bk_last", { a: ago(new Date(last).toISOString()) }) + (days >= 7 ? " · " + t("bk_due") : "") : t("bk_never");
  $("bkState").classList.toggle("errtext", !last || days >= 7);
}
$("bkBtn").addEventListener("click", async () => {
  $("bkBtn").disabled = true; $("bkState").textContent = t("bk_making");
  const { data, error } = await sb.rpc("admin_backup");
  $("bkBtn").disabled = false;
  if (error) { $("bkState").textContent = friendly(error); return; }
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "lara-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  try { localStorage.setItem("lara_last_backup", String(Date.now())); } catch {}
  backupState(); toast(t("bk_done"));
});

function browserName(ua) {
  const m = ua.match(/(Edg|OPR|Firefox|SamsungBrowser|Chrome|Version)\/(\d+)/);
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  if (!m) return os || ua.slice(0, 40);
  const name = { Edg: "Edge", OPR: "Opera", Version: "Safari", SamsungBrowser: "Samsung Internet" }[m[1]] || m[1];
  return `${name} ${m[2]}${os ? " · " + os : ""}`;
}

function renderAll() { renderAuth(); renderBoard(); renderMine(); renderImpact(); renderSaved(); }

$("boardFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.filter = b.dataset.f;
  document.querySelectorAll("#boardFilter button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  renderBoard();
});
$("boardSearch").addEventListener("input", renderBoard);

// ---------- browser extension: one-click store button once the store links exist ----------
// Fill these in after each store approves LARA. Until then the manual download is shown.
const EXT_STORES = {
  chrome: "",   // https://chromewebstore.google.com/detail/...
  edge: "",     // https://microsoftedge.microsoft.com/addons/detail/...
  firefox: "",  // https://addons.mozilla.org/firefox/addon/...
};
(function extensionButton() {
  const ua = navigator.userAgent;
  const which = /Edg\//.test(ua) ? "edge" : /Firefox\//.test(ua) ? "firefox" : /Chrome\//.test(ua) ? "chrome" : "";
  const url = EXT_STORES[which] || "";
  if (!url) return;
  const label = { chrome: "Chrome", edge: "Edge", firefox: "Firefox" }[which];
  $("extStoreBtn").href = url;
  $("extStoreBtn").textContent = t("ext_add", { b: label });
  $("extStore").hidden = false;
  $("extManual").hidden = true;
})();

// ---------- bookmarklet ----------
(function () {
  const code = `javascript:(function(){var m=document.querySelector('meta[name="citation_doi"],meta[name="dc.identifier"],meta[name="DC.identifier"],meta[name="prism.doi"],meta[name="dc.Identifier"]');var v=m&&m.content||'';if(!/10\\.\\d{4,9}\\//.test(v)){var x=(location.href+' '+(document.body?document.body.innerText.slice(0,30000):'')).match(/10\\.\\d{4,9}\\/[^\\s"'<>]+/);v=x?x[0]:''}v=v.replace(/^(https?:\\/\\/(dx\\.)?doi\\.org\\/|doi:)/i,'');window.open('${SITE}?doi='+encodeURIComponent(v)+'#request','_blank')})();`;
  $("bookmarklet").setAttribute("href", code);
  $("bookmarklet").addEventListener("click", (e) => { e.preventDefault(); toast(t("bm_drag")); });
})();

// ---------- offline support ----------
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- start ----------
async function onSession(session) {
  S.user = session ? session.user : null;
  await loadProfile();
  if (S.user && !S.profile) { setNote(t("welcome"), "ok"); if ((location.hash === "#signin" && !S.resetting) || !location.hash) location.hash = "#profile"; }
  else setNote("");
  if (S.user && location.hash === "#signin" && !S.resetting) location.hash = "#request";
  subscribe();
  await loadRequests();
}
I.apply(document);
showTab(); pledgeVis(); renderAll();
const params = new URLSearchParams(location.search);
const startDoi = params.get("doi") || params.get("q");
if (!sb) {
  setNote(configured ? t("not_reachable") : t("not_connected"), "warn");
} else {
  const { data } = await sb.auth.getSession();
  await onSession(data.session);
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      if ((session && session.user && session.user.id) !== (S.user && S.user.id)) setTimeout(() => onSession(session), 0);
    }
  });
  loadStats();
  callFn("send-email", { action: "status" }).then(({ data }) => { S.emailOn = !!(data && data.configured); });
}
if (startDoi) { $("doiInput").value = startDoi; if (location.hash !== "#request") location.hash = "#request"; runCheck(startDoi); history.replaceState(null, "", location.pathname + "#request"); }
