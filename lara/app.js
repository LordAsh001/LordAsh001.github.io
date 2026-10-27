// LARA: website logic.
const CFG = window.LARA_CONFIG || {};
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

const S = { user: null, profile: null, profileLoaded: false, requests: [], stats: null, filter: "open", doi: "", lookup: null };
const $ = (id) => document.getElementById(id);

const STATUS = { open: "Waiting for a volunteer", working: "Volunteer on it", author: "Author contacted", link: "Legal copy found", done: "Received", closed: "Closed" };
const ROUTES = { oa: "Free legal copy (open access)", r4l: "Research4Life", author: "Sent by the author", library: "A library in my country", other: "Other legal route" };
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
const REQUEST_SELECT =
  "*, requester:profiles!requests_requester_fk(name,institution,location,country,field), volunteer:profiles!requests_volunteer_fk(name), notes:request_notes(id,body,created_at,author_id,author:profiles(name))";

// ---------- small helpers ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3600); }
function normDoi(s) { return (s || "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").replace(/[.,;]+$/, "").toLowerCase(); }
function ago(ts) { if (!ts) return ""; const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000); if (d < 1) return "today"; if (d === 1) return "yesterday"; if (d < 30) return d + " days ago"; return new Date(ts).toLocaleDateString(); }
function isVol() { return !!S.profile && (S.profile.role === "volunteer" || S.profile.role === "both"); }
function link(text, href) { return h("a", { href, target: "_blank", rel: "noopener" }, text); }
function setNote(msg, kind) { const n = $("statusNote"); if (!msg) { n.hidden = true; return; } n.className = "notice" + (kind ? " " + kind : ""); n.textContent = msg; n.hidden = false; }
function friendly(err) { return (err && (err.message || err.error_description)) || "Something went wrong. Please try again."; }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { toast("Select the text and copy it"); }
}

// ---------- tabs ----------
const TABS = ["request", "board", "mine", "impact", "profile", "signin", "rules"];
function showTab() {
  let t = (location.hash || "#request").slice(1);
  if (!TABS.includes(t)) t = "request";
  for (const x of TABS) $("tab-" + x).hidden = x !== t;
  document.querySelectorAll("nav.tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === t ? "page" : "false"));
  if (t === "impact") loadStats();
}
window.addEventListener("hashchange", showTab);

// ---------- auth ----------
function renderAuth() {
  const box = $("authBox");
  box.replaceChildren();
  if (!sb) return;
  if (S.user) {
    box.append(h("span", { class: "who" }, (S.profile && S.profile.name) || S.user.email || "Signed in"),
      h("button", { class: "small ghost", type: "button", onclick: async () => { await sb.auth.signOut(); toast("Signed out"); } }, "Sign out"));
  } else {
    box.append(h("a", { href: "#signin", class: "small" }, "Sign in or join"));
  }
}
$("signinBtn").addEventListener("click", async () => {
  if (!sb) return;
  const email = $("signinEmail").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { $("signinState").textContent = "Enter a valid email address."; return; }
  $("signinBtn").disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  $("signinBtn").disabled = false;
  $("signinState").textContent = error ? friendly(error) : "Check your inbox for a sign-in link from LARA. It may take a minute, and can land in spam.";
});
$("googleBtn").hidden = !CFG.ENABLE_GOOGLE;
$("googleBtn").addEventListener("click", () => sb && sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } }));

// ---------- profile ----------
async function loadProfile() {
  S.profile = null; S.profileLoaded = false;
  if (!S.user) { S.profileLoaded = true; return; }
  const { data } = await sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
  S.profile = data || null; S.profileLoaded = true;
  const p = S.profile || {};
  $("pName").value = p.name || ""; $("pRole").value = p.role || "requester"; $("pInst").value = p.institution || "";
  $("pLoc").value = p.location || ""; $("pCountry").value = p.country || ""; $("pField").value = p.field || ""; $("pPledge").checked = !!p.pledge; pledgeVis();
}
function pledgeVis() { $("pledgeRow").hidden = $("pRole").value === "requester"; }
$("pRole").addEventListener("change", pledgeVis);
$("saveProfile").addEventListener("click", async () => {
  if (!S.user) { location.hash = "#signin"; return; }
  const p = { name: $("pName").value.trim(), role: $("pRole").value, institution: $("pInst").value.trim(), country: $("pCountry").value.trim(), location: $("pLoc").value.trim(), field: $("pField").value.trim(), pledge: $("pPledge").checked };
  if (!p.name || !p.institution || !p.country) { $("profileState").textContent = "Add your name, institution and country."; return; }
  if (p.role !== "requester" && !p.pledge) { $("profileState").textContent = "Volunteers need to tick the pledge."; return; }
  const q = S.profile ? sb.from("profiles").update(p).eq("id", S.user.id) : sb.from("profiles").insert({ id: S.user.id, ...p });
  const { error } = await q;
  if (error) { $("profileState").textContent = friendly(error); return; }
  $("profileState").textContent = "Saved."; toast("Profile saved");
  await loadProfile(); renderAll();
});

// ---------- requests ----------
async function loadRequests() {
  if (!S.user) { S.requests = []; renderAll(); return; }
  const { data, error } = await sb.from("requests").select(REQUEST_SELECT).order("created_at", { ascending: false }).limit(500);
  if (error) { console.warn(error); toast("Couldn't load requests. Refresh to try again."); return; }
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

async function updateRequest(r, patch, msg, extra) {
  let q = sb.from("requests").update(patch).eq("id", r.id);
  if (extra) q = extra(q);
  const { data, error } = await q.select("id");
  if (error) { toast(friendly(error)); return false; }
  if (!data || !data.length) { toast("Someone else changed this request first. The board has been refreshed."); loadRequests(); return false; }
  toast(msg); loadRequests(); return true;
}
async function addNote(r, text) {
  text = (text || "").trim(); if (!text) return;
  const { error } = await sb.from("request_notes").insert({ request_id: r.id, author_id: S.user.id, body: text.slice(0, 500) });
  if (error) toast(friendly(error)); else { toast("Note added"); loadRequests(); }
}

// ---------- DOI check ----------
function searchLinks(doi) {
  const e = encodeURIComponent(doi);
  return [
    ["Publisher page", "https://doi.org/" + doi],
    ["Google Scholar (look for [PDF] and All versions)", "https://scholar.google.com/scholar?q=" + e],
    ["BASE", "https://www.base-search.net/Search/Results?lookfor=" + e],
    ["CORE", "https://core.ac.uk/search?q=doi%3A%22" + e + "%22"],
  ];
}
$("doiInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("checkBtn").click(); });
$("checkBtn").addEventListener("click", async () => {
  const doi = normDoi($("doiInput").value), err = $("doiError");
  if (!DOI_RE.test(doi)) { err.textContent = "That doesn't look like a DOI. A DOI starts with 10. followed by a slash, for example 10.1016/j.watres.2023.120001."; err.hidden = false; return; }
  err.hidden = true; S.doi = doi; S.lookup = null;
  const btn = $("checkBtn"); btn.disabled = true; btn.textContent = "Searching 10 databases…";
  if (sb) {
    const { data, error } = await sb.functions.invoke("doi-lookup", { body: { doi } });
    if (error) {
      let msg = "The database check didn't respond. You can still use the search links below.";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch {}
      S.lookup = { failed: true, message: msg };
    } else S.lookup = data;
  } else S.lookup = { failed: true, message: "This site isn't connected to its database yet, so only the search links are available." };
  btn.disabled = false; btn.textContent = "Check for a legal copy";
  renderCheck();
});

function renderCheck() {
  const doi = S.doi, L = S.lookup || {}, meta = L.meta || {}, box = $("checkResult");
  box.replaceChildren(); box.hidden = false;

  // Step 1: free legal copies
  const s1 = h("div", { class: "meta-box" }, h("div", { class: "label" }, "Step 1 · Free legal copy"));
  if (meta.title) s1.append(h("div", { class: "title" }, meta.title),
    h("div", { class: "small muted" }, [(meta.authors || []).slice(0, 4).join(", ") + ((meta.authors || []).length > 4 ? " et al." : ""), meta.journal, meta.year].filter(Boolean).join(" · ")));
  if (L.failed) s1.append(h("p", { class: "small" }, L.message));
  else if (!L.found) s1.append(h("p", { class: "small" }, "None of the databases recognise this DOI. Check it on the publisher page."));
  if (L.journalInDoaj) s1.append(h("p", { class: "notice ok small" }, "This journal is fully open access (listed in DOAJ). The publisher page should give you the paper for free."));
  const copies = L.copies || [];
  if (copies.length) {
    s1.append(h("p", null, h("span", { class: "oa-yes" }, copies.length === 1 ? "1 free legal copy found." : copies.length + " free legal copies found."), " The first is usually the best."));
    s1.append(h("div", { class: "copies" }, copies.slice(0, 10).map((c) => h("div", { class: "copy" },
      h("div", { class: "host" }, c.host || "Open copy"),
      h("div", { class: "facts" }, h("span", { class: "tag" }, c.kind === "pdf" ? "PDF" : "Web page"), [c.version, c.license ? "Licence: " + c.license : "", "Found by " + c.foundBy.join(", ")].filter(Boolean).join(" · ")),
      h("a", { class: "open", href: c.url, target: "_blank", rel: "noopener" }, "Open")))));
  } else if (L.found) {
    s1.append(h("p", { class: "small" }, "No free copy is listed in the databases we checked. Try these too, since not everything is indexed:"));
  }
  if (!copies.length) s1.append(h("div", { class: "links" }, searchLinks(doi).map(([t, u]) => link(t, u))));
  if (L.sources) {
    s1.append(h("div", { class: "sources", "aria-label": "Databases checked" }, Object.entries(L.sources).filter(([, v]) => !v.skipped)
      .map(([k, v]) => h("span", { class: v.ok ? "ok" : "", title: v.ok ? "Answered" : "No answer" }, (v.ok ? "✓ " : "– ") + k))));
    if (L.cached) s1.append(h("p", { class: "small muted" }, "Saved result from a check of this DOI in the past week."));
  }
  box.append(s1);

  // Step 2: Research4Life
  box.append(h("div", { class: "meta-box" }, h("div", { class: "label" }, "Step 2 · Research4Life"),
    h("p", { class: "small" }, "If your institution is registered with Research4Life, you may be able to read this journal for free. Ask your librarian for the login, or check your institution on the Research4Life site."),
    h("div", { class: "links" }, link("Research4Life", "https://www.research4life.org/"))));

  // Step 3: author email
  box.append(letterBlock(doi, meta, L.corresponding || []));

  // Step 4: post the request
  const s4 = h("div", { class: "meta-box" }, h("div", { class: "label" }, "Step 4 · Ask the volunteers"));
  const existing = S.requests.find((r) => r.doi === doi && r.status !== "closed");
  if (existing) s4.append(h("p", { class: "notice small" }, "Someone has already requested this paper. Its status: " + STATUS[existing.status] + ". You can still add your own request."));
  if (!S.user) {
    s4.append(h("p", { class: "small" }, h("a", { href: "#signin" }, "Sign in or join"), " to post a request to the volunteers."));
  } else if (!S.profile) {
    s4.append(h("p", { class: "small" }, h("a", { href: "#profile" }, "Set up your profile"), " first so volunteers know who is asking."));
  } else {
    const title = h("input", { type: "text", id: "rTitle", value: meta.title || "", placeholder: "Article title", maxlength: "600" });
    const note = h("textarea", { id: "rNote", maxlength: "400", placeholder: "What you need it for (optional, helps volunteers prioritise)" });
    const tried = h("input", { type: "checkbox", id: "rTried" });
    s4.append(h("label", { class: "f" }, "Title", title), h("label", { class: "f" }, "Note for volunteers", note),
      h("label", { class: "check" }, tried, h("span", null, "I checked for a free copy and I've emailed the author or will do so now.")),
      h("div", { class: "row" },
        h("button", { class: "primary", type: "button", onclick: () => { if (!tried.checked) { toast("Tick the box once you've tried steps 1 to 3"); return; } submitRequest(doi, meta, title.value, note.value, "open"); } }, "Post to the request board"),
        copies.length ? h("button", { class: "ghost", type: "button", onclick: () => submitRequest(doi, meta, title.value, "", "done") }, "I got it from a free copy, log it") : null),
      h("p", { class: "small muted" }, "Logging papers you found through a free copy still counts. It shows how often a legal route exists."));
  }
  box.append(s4);
}

function letterBlock(doi, meta, corr) {
  const m = S.profile || {};
  const who = (corr[0] && corr[0].name) || "";
  const last = who ? who.split(" ").slice(-1)[0] : "[Surname]";
  const body = "Dear Dr " + last + ",\n\nI am a researcher at " + (m.institution || "[your institution]") + (m.country ? ", " + m.country : "") + (m.field ? ", working in " + m.field.toLowerCase() : "") +
    ". My institution does not subscribe to " + (meta.journal || "[journal]") + ", and I would be grateful if you could send me a copy of your article:\n\n\"" + (meta.title || "[article title]") +
    "\"\nhttps://doi.org/" + doi + "\n\nI need it for my own research and will not share it further.\n\nThank you for your time and for your work.\n\nKind regards,\n" + (m.name || "[your name]") + "\n" + (m.institution || "[your institution]");
  const full = "Subject: Request for a copy of your article (doi:" + doi + ")\n\n" + body;
  const who_ = corr.length
    ? h("p", { class: "small" }, (corr[0].guess ? "First author (no corresponding author listed): " : "Corresponding author: "),
        corr.map((c, i) => [i ? ", " : "", c.name, c.orcid ? [" (", link("ORCID", c.orcid), ")"] : "", c.affiliation ? ", " + c.affiliation : ""]),
        ". Their email is usually on the article's first page or the publisher page.")
    : h("p", { class: "small" }, "Find the corresponding author's email on the publisher page (marked with * or an envelope icon).");
  return h("div", { class: "meta-box" }, h("div", { class: "label" }, "Step 3 · Ask the author"), who_,
    h("pre", { class: "letter" }, full),
    h("div", { class: "row" }, h("button", { class: "small", type: "button", onclick: () => copyText(full) }, "Copy email")));
}

async function submitRequest(doi, meta, title, note, status) {
  const row = { doi, title: (title || "").trim().slice(0, 600), journal: (meta.journal || "").slice(0, 300), year: meta.year || null,
    authors: (meta.authors || []).slice(0, 8).join(", ").slice(0, 600), note: (note || "").trim().slice(0, 400), requester_id: S.user.id, status,
    route: status === "done" ? "oa" : null, legal_link: status === "done" && S.lookup && S.lookup.copies && S.lookup.copies[0] ? S.lookup.copies[0].url : "" };
  const { error } = await sb.from("requests").insert(row);
  if (error) { toast(friendly(error)); return; }
  toast(status === "done" ? "Logged. Thank you" : "Posted to the request board");
  $("checkResult").hidden = true; $("doiInput").value = "";
  location.hash = status === "done" ? "#impact" : "#mine";
  loadRequests();
}

// ---------- slips ----------
function slip(r) {
  const doi = r.doi || "", i = doi.indexOf("/");
  const req = r.requester || {};
  const stub = h("div", { class: "stub" }, h("span", { class: "no" }, "#" + r.id.slice(0, 5).toUpperCase()), h("span", { class: "pill st-" + r.status }, STATUS[r.status] || r.status), h("span", { class: "small muted" }, ago(r.created_at)));
  const body = h("div", { class: "body" });
  body.append(h("div", { class: "doi" }, h("span", { class: "pre" }, doi.slice(0, i + 1)), doi.slice(i + 1), " ", h("a", { href: "https://doi.org/" + doi, target: "_blank", rel: "noopener", class: "small" }, "publisher ↗")));
  if (r.title) body.append(h("div", { class: "title" }, r.title));
  if (r.journal || r.year) body.append(h("div", { class: "small muted" }, [r.journal, r.year].filter(Boolean).join(" · ")));
  body.append(h("div", { class: "small" }, "Requested by ", h("b", null, req.name || "A member"), ", " + [req.institution, req.location, req.country].filter(Boolean).join(", ") + (req.field ? " · " + req.field : "")));
  if (r.note) body.append(h("p", { class: "small muted" }, "“" + r.note + "”"));
  if (r.volunteer) body.append(h("div", { class: "small" }, "Volunteer: ", h("b", null, r.volunteer.name)));
  if (r.legal_link) body.append(h("div", { class: "small" }, "Legal copy: ", link(r.legal_link.replace(/^https?:\/\//, "").slice(0, 70), r.legal_link)));
  if (r.status === "done" && r.route) body.append(h("div", { class: "small" }, "Obtained via: " + (ROUTES[r.route] || r.route)));
  const notes = (r.notes || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (notes.length) body.append(h("div", { class: "notes" }, notes.map((n) => h("div", null, h("b", null, ((n.author && n.author.name) || "A member") + ": "), n.body, h("span", { class: "muted" }, " · " + ago(n.created_at))))));
  const acts = actions(r); if (acts) body.append(acts);
  return h("article", { class: "slip" }, stub, body);
}

function actions(r) {
  if (!S.user || !S.profile || ["done", "closed"].includes(r.status)) return null;
  const uid = S.user.id, mine = r.requester_id === uid, helping = r.volunteer_id === uid;
  const box = h("div", { class: "actions" });
  if (isVol() && r.status === "open" && !mine && !r.volunteer_id) {
    box.append(h("button", { class: "small primary", type: "button", onclick: () => updateRequest(r, { status: "working", volunteer_id: uid }, "You're on it. The requester can see your name", (q) => q.eq("status", "open").is("volunteer_id", null)) }, "Take this request"));
  }
  if (helping) {
    const url = h("input", { type: "url", placeholder: "Link to open-access copy, preprint or thesis" });
    box.append(url,
      h("button", { class: "small primary", type: "button", onclick: () => { const u = url.value.trim(); if (!/^https?:\/\//i.test(u)) { toast("Paste a web link starting with https://"); return; } updateRequest(r, { status: "link", legal_link: u }, "Shared with the requester"); } }, "Share legal link"),
      h("button", { class: "small", type: "button", onclick: () => updateRequest(r, { status: "author" }, "Marked as author contacted") }, "Author contacted"),
      h("button", { class: "small ghost", type: "button", onclick: () => updateRequest(r, { status: "open", volunteer_id: null }, "Released to the board") }, "Release"),
      h("button", { class: "small ghost", type: "button", onclick: () => updateRequest(r, { status: "closed" }, "Closed as not found") }, "No legal route found"));
  }
  if (mine) {
    const sel = h("select", { "aria-label": "How you received it" }, Object.entries(ROUTES).map(([k, v]) => h("option", { value: k, selected: (r.status === "link" && k === "oa") || (r.status === "author" && k === "author") }, v)));
    box.append(sel,
      h("button", { class: "small primary", type: "button", onclick: () => updateRequest(r, { status: "done", route: sel.value }, "Marked as received") }, "I've received it"),
      h("button", { class: "small ghost", type: "button", onclick: () => updateRequest(r, { status: "closed" }, "Request withdrawn") }, "Withdraw"));
  }
  if (mine || helping) {
    const note = h("input", { type: "text", placeholder: "Add a note", maxlength: "500" });
    box.append(note, h("button", { class: "small", type: "button", onclick: () => { addNote(r, note.value); note.value = ""; } }, "Add note"));
  }
  return box.childNodes.length ? box : null;
}

// ---------- renders ----------
function emptyState(title, sub, a) { return h("div", { class: "empty" }, h("b", { style: "color:var(--ink)" }, title), sub ? h("span", { class: "small" }, sub) : null, a || null); }
function renderBoard() {
  const el = $("boardList"); el.replaceChildren();
  if (!S.user) { $("volHint").textContent = ""; el.append(emptyState("Sign in to see the request board", "Only members can see who is asking for what.", h("a", { href: "#signin" }, "Sign in or join"))); return; }
  const q = $("boardSearch").value.trim().toLowerCase(), f = S.filter;
  const list = S.requests
    .filter((r) => f === "all" || (f === "open" && r.status === "open") || (f === "active" && ["working", "author", "link"].includes(r.status)) || (f === "done" && ["done", "closed"].includes(r.status)))
    .filter((r) => !q || [r.doi, r.title, r.journal, r.requester && r.requester.field, r.requester && r.requester.institution, r.requester && r.requester.country].join(" ").toLowerCase().includes(q));
  $("volHint").textContent = isVol() ? "Take a request to look for a legal copy or reach the author. Never send a PDF from your library login." : S.profile ? "Want to help? Switch your profile to Volunteer." : "";
  if (!list.length) el.append(emptyState(S.requests.length ? "Nothing here for this filter" : "No requests yet", "Requests appear here as soon as someone posts a DOI.", h("a", { href: "#request" }, "Request a paper")));
  else list.forEach((r) => el.append(slip(r)));
}
function renderMine() {
  const a = $("mineList"), b = $("helpList"); a.replaceChildren(); b.replaceChildren();
  if (!S.user) { a.append(emptyState("Sign in to see your requests", "", h("a", { href: "#signin" }, "Sign in or join"))); return; }
  const mine = S.requests.filter((r) => r.requester_id === S.user.id), help = S.requests.filter((r) => r.volunteer_id === S.user.id);
  if (!mine.length) a.append(emptyState("You haven't requested a paper yet", "Start with a DOI and we'll walk you through the legal routes.", h("a", { href: "#request" }, "Request a paper"))); else mine.forEach((r) => a.append(slip(r)));
  if (!help.length) b.append(emptyState(isVol() ? "You're not helping with a request yet" : "Volunteers see requests they've taken here", isVol() ? "Pick one from the board." : "Set your profile to Volunteer to help.", h("a", { href: isVol() ? "#board" : "#profile" }, isVol() ? "Open the board" : "Edit profile")));
  else help.forEach((r) => b.append(slip(r)));
}
function bars(el, pairs) {
  el.replaceChildren();
  if (!pairs.length) { el.append(h("p", { class: "small muted" }, "No data yet.")); return; }
  const max = Math.max(...pairs.map((p) => p[1]), 1);
  pairs.forEach(([k, v]) => el.append(h("div", { class: "bar" }, h("span", { style: "overflow-wrap:anywhere" }, k), h("div", { class: "track" }, h("div", { class: "fill", style: "width:" + ((v / max) * 100).toFixed(1) + "%" })), h("span", { class: "num" }, v))));
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
  const stats = [["Requests", s.requests ?? "–"], ["Papers obtained", s.obtained ?? "–"], ["Success rate", rate], ["Median days to receive", med == null ? "–" : med < 1 ? "<1" : Math.round(med)], ["Members", s.members ?? "–"], ["Volunteers", s.volunteers ?? "–"], ["Countries", s.countries ?? "–"], ["Institutions", s.institutions ?? "–"]];
  $("stats").replaceChildren(...stats.map(([l, v]) => h("div", { class: "stat" }, h("span", { class: "label" }, l), h("span", { class: "v" }, v))));
  bars($("routeBars"), Object.entries(s.routes || {}).map(([k, v]) => [ROUTES[k] || "Not stated", v]).sort((a, b) => b[1] - a[1]));
  bars($("countryBars"), (s.top_countries || []).map((x) => [x.name, x.n]));
  bars($("instBars"), (s.top_institutions || []).map((x) => [x.name, x.n]));
  bars($("fieldBars"), (s.top_fields || []).map((x) => [x.name, x.n]));
}
function renderAll() { renderAuth(); renderBoard(); renderMine(); renderImpact(); }

$("boardFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.filter = b.dataset.f;
  document.querySelectorAll("#boardFilter button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  renderBoard();
});
$("boardSearch").addEventListener("input", renderBoard);

// ---------- start ----------
async function onSession(session) {
  S.user = session ? session.user : null;
  await loadProfile();
  if (S.user && !S.profile) { setNote("Welcome. Set up your profile so you can request papers or volunteer.", "ok"); if (location.hash === "#signin" || !location.hash) location.hash = "#profile"; }
  else setNote("");
  if (S.user && location.hash === "#signin") location.hash = "#request";
  subscribe();
  await loadRequests();
}
showTab(); pledgeVis(); renderAll();
if (!sb) {
  setNote(configured
    ? "We couldn't reach the database. Check your connection and refresh the page. The DOI search links still work."
    : "This site isn't connected to its database yet. Fill in config.js (see README.md). The DOI search links still work.", "warn");
} else {
  const { data } = await sb.auth.getSession();
  await onSession(data.session);
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      if ((session && session.user && session.user.id) !== (S.user && S.user.id)) setTimeout(() => onSession(session), 0);
    }
  });
  loadStats();
}
