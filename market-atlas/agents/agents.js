/* Nigeria Market Atlas · Community price agents
   Traders, farmers and extension workers sign up, post prices from their own market, get a public page
   (#agent/<handle>) and a ready-made price card and caption to share on LinkedIn, Facebook and WhatsApp.
   Sign-in and data live in the Supabase project the site already uses for LARA (tables ma_*; see schema.sql).
   Loaded after the main atlas script, so it uses the atlas helpers ($, esc, naira, fmtDate, toast, copyText,
   COMMODITIES, MARKETS, map, showTab, store). */
(function () {
"use strict";

const SB_LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const CONFIG = "/lara/config.js";               // shared site settings: Supabase address and publishable key
const PAGE = "https://shagbaor.com/market-atlas/";
const RESEND_WAIT = 5 * 60 * 1000;              // each new code cancels the last one, so wait before asking again
const MAX_ROWS = 30;
const STATES = [...new Set(MARKETS.map(m => m.state))].sort();
const COMM = Object.entries(COMMODITIES).map(([k, v]) => ({ k, label: v.label, base: v.base })).sort((a, b) => a.label.localeCompare(b.label));
const UNITS = {
  kg:     [["kg", 1], ["25 kg bag", 25], ["50 kg bag", 50], ["100 kg bag", 100]],
  litre:  [["litre", 1], ["25-litre keg", 25]],
  crate:  [["crate of 30", 1]],
  tuber:  [["tuber", 1]],
};
const BASE_WORD = { kg: "kg", litre: "litres", crate: "crates", tuber: "tubers" };

const A = { sb: null, ready: null, user: null, agent: null, editor: false, view: "home", arg: "", feed: null,
            filter: { state: "", c: "" }, au: { mode: "in", email: "", sentAt: 0, type: "" }, rows: null, busy: false };
window.MA_AGENTS = A;

/* ---------------------------------------------------------------- data access */
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); }); }
function connect() {
  if (A.ready) return A.ready;
  A.ready = (async () => {
    if (!window.LARA_CONFIG) await loadScript(CONFIG);
    const C = window.LARA_CONFIG || {};
    if (!C.SUPABASE_URL || /YOUR-/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY)) throw new Error("not configured");
    const { createClient } = await import(SB_LIB);
    A.sb = createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    const { data } = await A.sb.auth.getSession();
    await setUser(data && data.session ? data.session.user : null);
    A.sb.auth.onAuthStateChange((_e, session) => { const u = session ? session.user : null; if ((u && u.id) !== (A.user && A.user.id)) setUser(u).then(render); });
    return A.sb;
  })();
  A.ready.catch(() => { A.ready = null; });
  return A.ready;
}
async function setUser(u) {
  A.user = u; A.agent = null; A.editor = false;
  if (!u) return;
  const [{ data: ag }, { data: ed }] = await Promise.all([
    A.sb.from("ma_agents").select("*").eq("id", u.id).maybeSingle(),
    A.sb.rpc("ma_is_editor"),
  ]);
  A.agent = ag || null; A.editor = !!ed;
}
const POST_COLS = "id,observed_on,created_at,market_id,market_name,state,lga,note,status,agent_id,ma_agents(handle,name,trusted,market_name),ma_prices(id,commodity,item,unit,per,price,price_base,status,flag)";
function friendly(err) {
  const m = ((err && (err.message || err.error_description)) || String(err || "")).toLowerCase();
  if (m.includes("invalid login")) return "That email and password don't match. Check them, or reset your password.";
  if (m.includes("not confirmed")) return "Please confirm your email first: we've sent you a code.";
  if (m.includes("already registered") || m.includes("already been registered")) return "That email already has an account. Sign in instead (the same account works for LARA).";
  if (m.includes("token") && (m.includes("expired") || m.includes("invalid"))) return "That code is wrong or has expired. Use the newest code we sent.";
  if (m.includes("password") && (m.includes("least") || m.includes("weak"))) return "Use a password of at least 8 characters.";
  if (m.includes("rate limit") || m.includes("security purposes")) return "Please wait a few minutes before asking for another code.";
  if (m.includes("duplicate") && m.includes("handle")) return "That page name is taken. Try another.";
  if (m.includes("last 30 days")) return "Prices must be from the last 30 days.";
  if (m.includes("daily limit")) return "You've reached today's limit of 10 posts. Try again tomorrow.";
  if (m.includes("row-level security") || m.includes("permission")) return "You can't do that with this account.";
  if (m.includes("failed to fetch") || m.includes("network")) return "No connection. Check your internet and try again.";
  return "Something went wrong. Please try again.";
}

/* ---------------------------------------------------------------- small helpers */
const P = () => $("#pane-agents");
const commLabel = (c, item) => c === "other" ? (item || "Other item") : ((COMMODITIES[c] && COMMODITIES[c].label) || c) + (item ? ` (${item})` : "");
const unitText = r => `per ${r.unit}`;
const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => localDay(new Date());
const daysAgo = n => localDay(new Date(Date.now() - n * 864e5));
const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
const profileUrl = h => PAGE + "#agent/" + h;
const marketById = id => MARKETS.find(m => m.id === id);
function badge(a) { return a && a.trusted ? ` <span class="ag-badge" title="Posts checked over time by the atlas editor">Trusted</span>` : ""; }
function livePrices(post) { return (post.ma_prices || []).filter(p => p.status === "live"); }
function setHash(h) { const want = "#" + h; if (location.hash !== want) { try { history.pushState(null, "", want); } catch (e) {} } }

/* ---------------------------------------------------------------- routing */
function route(h, push) {
  h = (h || "").replace(/^#/, "");
  if (!push && h === A.lastHash && Date.now() - A.lastRoute < 400) return;   // the atlas and this module both react to Back
  A.lastHash = h; A.lastRoute = Date.now();
  let view = "home", arg = "";
  if (h.startsWith("agent/")) { view = "agent"; arg = decodeURIComponent(h.slice(6)); }
  else if (h.startsWith("agents/")) { const [v, a] = h.slice(7).split("/"); view = ["join", "post", "share", "admin", "edit"].includes(v) ? v : "home"; arg = a || ""; }
  A.view = view; A.arg = arg;
  if (push) setHash(view === "agent" ? "agent/" + arg : view === "home" ? "agents" : "agents/" + view + (arg ? "/" + arg : ""));
  render();
}
function go(view, arg) { route(view === "agent" ? "agent/" + arg : view === "home" ? "agents" : "agents/" + view + (arg ? "/" + arg : ""), true); P().scrollTop = 0; }
window.addEventListener("popstate", () => {
  const h = location.hash.slice(1);
  if (h === "agents" || h.startsWith("agents/") || h.startsWith("agent/")) {
    if ($("#t-agents").getAttribute("aria-selected") !== "true") _origShowTab("agents");
    route(h, false);
  }
});

/* ---------------------------------------------------------------- render */
async function render() {
  const el = P(); if (!el) return;
  if (!A.sb) {
    el.innerHTML = `<div class="small muted">Loading community prices…</div>`;
    try { await connect(); } catch (e) {
      el.innerHTML = intro() + `<div class="card"><p class="small">Community prices can't load right now${e.message === "not configured" ? "" : " (check your internet connection)"}. The rest of the atlas works as usual.</p><div class="btns"><button class="btn ghost" type="button" id="agRetry">Try again</button></div></div>`;
      $("#agRetry") && ($("#agRetry").onclick = render); return;
    }
  }
  const v = A.view;
  if (v === "join" || v === "edit") return renderJoin();
  if (v === "post") return renderPost();
  if (v === "share") return renderShare(A.arg);
  if (v === "agent") return renderAgent(A.arg);
  if (v === "admin") return renderAdmin();
  return renderHome();
}
function intro() {
  return `<div><h2>Community price agents</h2><p class="small muted">Traders, farmers, extension workers and market reporters post prices from their own markets. Each agent has a public page and a ready-made price card to share on LinkedIn, Facebook and WhatsApp.</p></div>`;
}
function meBar() {
  if (!A.user) return `<div class="btns"><button class="btn" type="button" data-ag="join">Become a price agent</button><button class="btn ghost" type="button" data-ag="signin">Sign in</button></div>`;
  if (!A.agent) return `<div class="btns"><button class="btn" type="button" data-ag="join">Finish your agent profile</button><button class="btn ghost" type="button" data-ag="signout">Sign out</button></div>`;
  return `<div class="btns"><button class="btn" type="button" data-ag="post">Post today's prices</button><button class="btn ghost" type="button" data-agent="${esc(A.agent.handle)}">My page</button>${A.editor ? `<button class="btn ghost" type="button" data-ag="admin">Review</button>` : ""}<button class="btn ghost" type="button" data-ag="signout">Sign out</button></div>`;
}
function wire(el) {
  el.querySelectorAll("[data-ag]").forEach(b => b.onclick = async e => {
    e.preventDefault(); const k = b.dataset.ag;
    if (k === "signout") { await A.sb.auth.signOut(); await setUser(null); toast("Signed out"); go("home"); return; }
    if (k === "signin") { A.au.mode = "in"; go("join"); return; }
    if (k === "back") { history.length > 1 ? history.back() : go("home"); return; }
    go(k, b.dataset.arg || "");
  });
  el.querySelectorAll("[data-agent]").forEach(b => b.onclick = e => { e.preventDefault(); go("agent", b.dataset.agent); });
  el.querySelectorAll("[data-share]").forEach(b => b.onclick = e => { e.preventDefault(); go("share", b.dataset.share); });
}
function postCard(post, opts = {}) {
  const ag = post.ma_agents || {}; const own = A.user && post.agent_id === A.user.id;
  const rows = (post.ma_prices || []).filter(p => p.status !== "removed" && (p.status === "live" || own || A.editor));
  const m = marketById(post.market_id);
  return `<article class="card ag-post">
    <div class="ag-head">${opts.noAgent ? "" : `<a href="#agent/${esc(ag.handle)}" data-agent="${esc(ag.handle)}" class="ag-name">${esc(ag.name || "Agent")}</a>${badge(ag)}<span class="muted"> · </span>`}<span class="${opts.noAgent ? "ag-name" : ""}">${esc(post.market_name)}</span><span class="muted">, ${esc(post.state)}</span></div>
    <div class="small muted">${fmtDate(post.observed_on)}${post.note ? " · " + esc(post.note) : ""}</div>
    <table class="ag-table"><tbody>${rows.map(p => `<tr${p.status === "held" ? ' class="held"' : ""}><td>${esc(commLabel(p.commodity, p.item))}<div class="small muted">${esc(unitText(p))}${p.status === "held" ? ` · waiting for a check (${esc(p.flag || "unusual price")})` : ""}</div></td><td class="num">${naira(p.price)}</td></tr>`).join("")}</tbody></table>
    ${own || A.editor ? `<div class="btns">${own ? `<button class="btn ghost small" type="button" data-share="${post.id}">Share</button>` : ""}<button class="btn ghost small" type="button" data-remove="${post.id}">Remove post</button></div>` : ""}
      </article>`;
}
function wireRemove(el, after) {
  el.querySelectorAll("[data-remove]").forEach(b => b.onclick = async () => {
    if (!confirm("Remove this post from the atlas? It can't be undone.")) return;
    const { error } = await A.sb.from("ma_posts").update({ status: "removed" }).eq("id", +b.dataset.remove);
    if (error) { toast(friendly(error)); return; }
    toast("Post removed"); A.feed = null; after();
  });
}

/* ---------- home: feed ---------- */
async function renderHome() {
  const el = P();
  const f = A.filter;
  el.innerHTML = intro() + meBar() + `
    <div class="card"><div class="ag-filters">
      <div class="field"><label for="agState">State</label><select id="agState"><option value="">All states</option>${STATES.map(s => `<option${s === f.state ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      <div class="field"><label for="agComm">Item</label><select id="agComm"><option value="">All items</option>${COMM.map(c => `<option value="${c.k}"${c.k === f.c ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select></div>
    </div></div>
    <div id="agFeed" class="ag-feed"><p class="small muted">Loading the latest prices…</p></div>
    <p class="note">Community reports are posted by the agents themselves and are not verified by the atlas. Prices far outside the usual range wait for a check before they appear. They also feed the Prices tab as “Community price agents” after the daily update.</p>`;
  wire(el);
  $("#agState").onchange = e => { f.state = e.target.value; loadFeed(); };
  $("#agComm").onchange = e => { f.c = e.target.value; loadFeed(); };
  loadFeed();
}
async function loadFeed() {
  const box = $("#agFeed"); if (!box) return;
  const f = A.filter;
  let q = A.sb.from("ma_posts").select(f.c ? POST_COLS.replace("ma_prices(", "ma_prices!inner(") : POST_COLS).eq("status", "live");
  if (f.state) q = q.eq("state", f.state);
  if (f.c) q = q.eq("ma_prices.commodity", f.c);
  const { data, error } = await q.order("observed_on", { ascending: false }).order("id", { ascending: false }).limit(30);
  if (!$("#agFeed")) return;
  if (error) { box.innerHTML = `<p class="small bad">${esc(friendly(error))}</p>`; return; }
  const posts = (data || []).filter(p => livePrices(p).length || (A.user && p.agent_id === A.user.id));
  box.innerHTML = posts.length ? posts.map(p => postCard(p)).join("") :
    `<div class="card"><p class="small">No community prices ${f.state || f.c ? "match these filters" : "yet"}. ${A.agent ? "Be the first: post today's prices from your market." : "Become a price agent and be the first to post from your market."}</p></div>`;
  wire(box); wireRemove(box, loadFeed);
}

/* ---------- agent page ---------- */
async function renderAgent(handle) {
  const el = P();
  el.innerHTML = `<p class="small muted">Loading…</p>`;
  const { data: ag, error } = await A.sb.from("ma_agents").select("*").eq("handle", String(handle).toLowerCase()).maybeSingle();
  if (A.view !== "agent") return;
  if (error || !ag) { el.innerHTML = `<div class="card"><h3>Agent not found</h3><p class="small">This page may have been renamed or removed.</p><div class="btns"><button class="btn ghost" type="button" data-ag="home">All community prices</button></div></div>`; wire(el); return; }
  const own = A.user && A.user.id === ag.id;
  const { data: posts } = await A.sb.from("ma_posts").select(POST_COLS).eq("agent_id", ag.id).neq("status", "removed").order("observed_on", { ascending: false }).order("id", { ascending: false }).limit(60);
  if (A.view !== "agent") return;
  const list = (posts || []).filter(p => livePrices(p).length || own);
  // latest live price per item
  const latest = {};
  list.forEach(p => livePrices(p).forEach(r => { const k = r.commodity + "|" + (r.item || "") + "|" + r.unit; if (!latest[k]) latest[k] = { ...r, date: p.observed_on }; }));
  const m = marketById(ag.market_id);
  const links = ag.links || {};
  el.innerHTML = `
    <div class="btns"><button class="btn ghost small" type="button" data-ag="home">← All community prices</button></div>
    <div class="card ag-profile">
      <div><h2 style="margin:0">${esc(ag.name)}${badge(ag)}</h2><div class="small">Community price agent · ${esc(ag.market_name)}, ${esc(ag.state)}${ag.lga ? ` (${esc(ag.lga)} LGA)` : ""}</div></div>
      ${ag.bio ? `<p class="small" style="margin:0">${esc(ag.bio)}</p>` : ""}
      <div class="small muted">${list.length} post${list.length === 1 ? "" : "s"} · agent since ${fmtDate(localDay(new Date(ag.created_at)))}${ag.suspended ? " · <b>suspended</b>" : ""}</div>
      <div class="btns">
        <button class="btn ghost small" type="button" id="agCopyLink">Copy page link</button>
        ${m ? `<button class="btn ghost small" type="button" id="agShowMap">Show market on map</button>` : ""}
        ${links.linkedin ? `<a class="btn ghost small" href="${esc(links.linkedin)}" target="_blank" rel="noopener nofollow">LinkedIn</a>` : ""}
        ${links.facebook ? `<a class="btn ghost small" href="${esc(links.facebook)}" target="_blank" rel="noopener nofollow">Facebook</a>` : ""}
        ${own ? `<button class="btn small" type="button" data-ag="post">Post prices</button><button class="btn ghost small" type="button" data-ag="edit">Edit profile</button>` : ""}
        ${A.editor && !own ? `<button class="btn ghost small" type="button" id="agTrust">${ag.trusted ? "Remove trusted badge" : "Mark as trusted"}</button><button class="btn ghost small" type="button" id="agSuspend">${ag.suspended ? "Restore" : "Suspend"}</button>` : ""}
      </div>
    </div>
    ${Object.keys(latest).length ? `<div class="card"><h3 style="margin:0">Latest prices</h3><table class="ag-table"><tbody>${Object.values(latest).map(r => `<tr><td>${esc(commLabel(r.commodity, r.item))}<div class="small muted">${esc(unitText(r))} · ${fmtDate(r.date)}</div></td><td class="num">${naira(r.price)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <h3 style="margin:4px 0 0">Price updates</h3>
    ${list.length ? list.map(p => postCard(p, { noAgent: true })).join("") : `<p class="small muted">No price updates yet.</p>`}`;
  wire(el); wireRemove(el, () => renderAgent(handle));
  $("#agCopyLink").onclick = () => copyText(profileUrl(ag.handle));
  if (m && $("#agShowMap")) $("#agShowMap").onclick = () => { try { map.flyTo([m.lat, m.lng], 11); } catch (e) {} if (innerWidth < 900) document.querySelector(".mapwrap")?.scrollIntoView({ behavior: "smooth" }); };
  if ($("#agTrust")) $("#agTrust").onclick = async () => { const { error } = await A.sb.from("ma_agents").update({ trusted: !ag.trusted }).eq("id", ag.id); toast(error ? friendly(error) : "Saved"); renderAgent(handle); };
  if ($("#agSuspend")) $("#agSuspend").onclick = async () => { if (!ag.suspended && !confirm("Suspend this agent? Their page and posts will be hidden.")) return; const { error } = await A.sb.from("ma_agents").update({ suspended: !ag.suspended }).eq("id", ag.id); toast(error ? friendly(error) : "Saved"); renderAgent(handle); };
}

/* ---------- sign in / join / edit profile ---------- */
function renderJoin() {
  if (!A.user) return renderAuth();
  const el = P(); const a = A.agent || {};
  const mk = MARKETS.slice().sort((x, y) => (x.state + x.name).localeCompare(y.state + y.name));
  const editing = !!A.agent;
  el.innerHTML = `
    <div class="btns"><button class="btn ghost small" type="button" data-ag="${editing ? "back" : "home"}">← Back</button></div>
    <div><h2>${editing ? "Edit your agent profile" : "Set up your agent page"}</h2><p class="small muted">${editing ? "Changes show on your public page straight away." : "This is what people see on your public page and price cards. Your email is never shown."}</p></div>
    <form id="agProfile" class="card ag-form" novalidate>
      <div class="field"><label for="apName">Your name (as you want it shown)</label><input id="apName" required maxlength="80" value="${esc(a.name || "")}" autocomplete="name"></div>
      <div class="field"><label for="apMarket">Your main market</label><select id="apMarket"><option value="">Choose your market…</option>${STATES.map(s => `<optgroup label="${esc(s)}">${mk.filter(m => m.state === s).map(m => `<option value="${esc(m.id)}"${m.id === a.market_id ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</optgroup>`).join("")}<option value="__other"${editing && !a.market_id ? " selected" : ""}>My market isn't listed</option></select></div>
      <div id="apOther" class="ag-grid2" ${editing && !a.market_id ? "" : "hidden"}>
        <div class="field"><label for="apMarketName">Market name</label><input id="apMarketName" maxlength="120" value="${esc(!a.market_id ? a.market_name || "" : "")}" placeholder="e.g. Wurukum Market"></div>
        <div class="field"><label for="apState">State</label><select id="apState"><option value="">Choose…</option>${STATES.map(s => `<option${s === a.state && !a.market_id ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
        <div class="field"><label for="apLga">LGA (optional)</label><input id="apLga" maxlength="60" value="${esc(!a.market_id ? a.lga || "" : "")}"></div>
      </div>
      <div class="field"><label for="apHandle">Your page address</label><div class="ag-handle"><span class="small muted">…/market-atlas/#agent/</span><input id="apHandle" maxlength="40" value="${esc(a.handle || "")}" pattern="[a-z0-9][a-z0-9-]{2,39}" autocapitalize="off" spellcheck="false"></div><span class="small muted">Lower-case letters, numbers and dashes.</span></div>
      <div class="field"><label for="apBio">About you (optional)</label><textarea id="apBio" rows="2" maxlength="400" placeholder="e.g. Grain trader at Dawanau since 2015. I post maize, sorghum and soybean prices every market day.">${esc(a.bio || "")}</textarea></div>
      <div class="ag-grid2">
        <div class="field"><label for="apLi">LinkedIn profile link (optional)</label><input id="apLi" type="url" maxlength="200" value="${esc((a.links || {}).linkedin || "")}" placeholder="https://www.linkedin.com/in/…"></div>
        <div class="field"><label for="apFb">Facebook profile link (optional)</label><input id="apFb" type="url" maxlength="200" value="${esc((a.links || {}).facebook || "")}" placeholder="https://www.facebook.com/…"></div>
      </div>
      ${editing ? "" : `<label class="small ag-check"><input type="checkbox" id="apAgree"> I will post only prices I have seen or paid myself, and I agree that my posts are published on the atlas and shared as open data (CC BY 4.0) with my name. See the <a href="/privacy.html#price-agents" target="_blank" rel="noopener">privacy notice</a>.</label>`}
      <div class="btns"><button class="btn" type="submit">${editing ? "Save changes" : "Create my agent page"}</button></div>
      <div id="apMsg" class="small" role="status"></div>
    </form>
    <p class="small muted">Signed in as ${esc(A.user.email || "")}. <a href="#" data-ag="signout">Sign out</a></p>`;
  wire(el);
  const sel = $("#apMarket");
  sel.onchange = () => { $("#apOther").hidden = sel.value !== "__other"; autoHandle(); };
  $("#apName").oninput = autoHandle;
  let touched = !!a.handle;
  $("#apHandle").oninput = () => { touched = true; };
  function autoHandle() {
    if (touched) return;
    const m = marketById(sel.value);
    const place = m ? m.name.replace(/\b(international|main|central|grain|market|modern)\b/gi, "") : $("#apMarketName").value;
    $("#apHandle").value = slug(($("#apName").value.split(" ")[0] || "") + " " + place).slice(0, 40);
  }
  $("#agProfile").onsubmit = async e => {
    e.preventDefault(); const msg = $("#apMsg"); msg.className = "small";
    const name = $("#apName").value.trim(); const mid = sel.value; const m = marketById(mid);
    const row = {
      id: A.user.id, name, handle: slug($("#apHandle").value).replace(/^-/, ""),
      market_id: m ? m.id : null,
      market_name: m ? m.name : $("#apMarketName").value.trim(),
      state: m ? m.state : $("#apState").value,
      lga: m ? (m.lga || null) : ($("#apLga").value.trim() || null),
      bio: $("#apBio").value.trim() || null,
      links: Object.fromEntries([["linkedin", $("#apLi").value.trim()], ["facebook", $("#apFb").value.trim()]].filter(([, v]) => /^https:\/\/([a-z]+\.)?(linkedin\.com|facebook\.com|fb\.com)\//i.test(v))),
    };
    const bad = name.length < 2 ? "Enter your name." : !mid ? "Choose your market." : row.market_name.length < 2 ? "Enter your market's name." : !row.state ? "Choose the state." :
      !/^[a-z0-9][a-z0-9-]{2,39}$/.test(row.handle) ? "Choose a page address of 3–40 letters, numbers or dashes." :
      (!editing && !$("#apAgree").checked) ? "Please tick the box to agree to how posts are shared." : "";
    if (bad) { msg.textContent = bad; msg.classList.add("bad"); return; }
    const { data, error } = editing
      ? await A.sb.from("ma_agents").update(row).eq("id", A.user.id).select().single()
      : await A.sb.from("ma_agents").insert(row).select().single();
    if (error) { msg.textContent = (error.code === "23505" ? "That page address is taken. Try another." : friendly(error)); msg.classList.add("bad"); return; }
    A.agent = data; toast(editing ? "Profile saved" : "Your agent page is ready");
    try { window.SiteTrack && window.SiteTrack(editing ? "agent-edited" : "agent-joined", editing ? "Edited a price agent profile" : "Became a price agent"); } catch (e) {}
    go(editing ? "agent" : "post", editing ? data.handle : "");
  };
}
function renderAuth() {
  const el = P(); const au = A.au;
  const T = {
    in: ["Sign in", "Use your email and password. Already use LARA? It's the same account.", "Sign in"],
    up: ["Become a price agent", "Create a free account with any email address. We'll send a 6-digit code to confirm it. The email comes from LARA, which looks after sign-in for the tools on shagbaor.com.", "Create account"],
    code: ["Check your email", `Enter the 6-digit code we sent to ${au.email}. The email is headed “LARA”, which looks after sign-in for shagbaor.com. It can take a few minutes to arrive; check spam too.`, "Confirm"],
    forgot: ["Reset your password", "Enter your email and we'll send you a 6-digit code.", "Send code"],
    reset: ["Choose a new password", `Enter the code we sent to ${au.email} and your new password.`, "Save new password"],
  }[au.mode];
  el.innerHTML = `
    <div class="btns"><button class="btn ghost small" type="button" data-ag="home">← Community prices</button></div>
    <div><h2>${T[0]}</h2><p class="small muted">${esc(T[1])}</p></div>
    <form id="agAuth" class="card ag-form" novalidate>
      ${["in", "up", "forgot"].includes(au.mode) ? `<div class="field"><label for="auEmail">Email</label><input id="auEmail" type="email" autocomplete="email" required value="${esc(au.email)}"></div>` : ""}
      ${["in", "up"].includes(au.mode) ? `<div class="field"><label for="auPass">Password</label><input id="auPass" type="password" autocomplete="${au.mode === "up" ? "new-password" : "current-password"}" required minlength="8">${au.mode === "up" ? `<span class="small muted">At least 8 characters.</span>` : ""}</div>` : ""}
      ${["code", "reset"].includes(au.mode) ? `<div class="field"><label for="auCode">6-digit code</label><input id="auCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></div>` : ""}
      ${au.mode === "reset" ? `<div class="field"><label for="auNew">New password</label><input id="auNew" type="password" autocomplete="new-password" minlength="8" required></div>` : ""}
      <div class="btns"><button class="btn" type="submit" id="auGo">${T[2]}</button></div>
      <div id="auMsg" class="small" role="status"></div>
      <div class="small ag-links">
        ${au.mode === "in" ? `<a href="#" data-au="up">New here? Create an account</a> · <a href="#" data-au="forgot">Forgot password?</a>` : ""}
        ${au.mode === "up" ? `<a href="#" data-au="in">Already have an account? Sign in</a>` : ""}
        ${["code", "reset"].includes(au.mode) ? `<a href="#" id="auResend">Send a new code</a> · <a href="#" data-au="in">Back to sign in</a>` : ""}
        ${au.mode === "forgot" ? `<a href="#" data-au="in">Back to sign in</a>` : ""}
      </div>
    </form>
    <p class="small muted">Your email is used only to sign you in and is never shown on the atlas. See the <a href="/privacy.html#price-agents" target="_blank" rel="noopener">privacy notice</a>.</p>`;
  wire(el);
  el.querySelectorAll("[data-au]").forEach(a => a.onclick = e => { e.preventDefault(); A.au.mode = a.dataset.au; renderAuth(); });
  const say = (t, bad) => { const m = $("#auMsg"); m.textContent = t || ""; m.className = "small" + (bad ? " bad" : ""); };
  const sendCode = async () => {
    if (Date.now() - au.sentAt < RESEND_WAIT) { const s = Math.ceil((au.sentAt + RESEND_WAIT - Date.now()) / 60000); return { message: `wait:${s}` }; }
    const r = au.type === "recovery" ? await A.sb.auth.resetPasswordForEmail(au.email) : await A.sb.auth.resend({ type: "signup", email: au.email });
    if (!r.error) au.sentAt = Date.now(); return r.error;
  };
  if ($("#auResend")) $("#auResend").onclick = async e => { e.preventDefault(); const err = await sendCode(); say(err ? (String(err.message).startsWith("wait:") ? `You can ask for a new code in about ${err.message.slice(5)} min. The last one is still on its way.` : friendly(err)) : "A new code is on its way. Use only the newest one.", !!err); };
  $("#agAuth").onsubmit = async e => {
    e.preventDefault(); if (A.busy) return; A.busy = true; $("#auGo").disabled = true; say("");
    try {
      if (["in", "up", "forgot"].includes(au.mode)) {
        const em = $("#auEmail").value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(em)) { say("Enter a valid email address.", true); return; }
        if (em !== au.email) au.sentAt = 0; au.email = em;
      }
      if (au.mode === "in") {
        const { error } = await A.sb.auth.signInWithPassword({ email: au.email, password: $("#auPass").value });
        if (error && /not confirmed/i.test(error.message)) { au.type = "signup"; const e2 = await sendCode(); au.mode = "code"; renderAuth(); say(e2 ? friendly(e2) : "", !!e2); return; }
        if (error) { say(friendly(error), true); return; }
        await afterSignIn();
      } else if (au.mode === "up") {
        const pw = $("#auPass").value; if (pw.length < 8) { say("Use a password of at least 8 characters.", true); return; }
        const { data, error } = await A.sb.auth.signUp({ email: au.email, password: pw, options: { data: { market_agent: true } } });
        if (error) { say(friendly(error), true); return; }
        if (data && data.session) { await afterSignIn(); return; }
        if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) { au.mode = "in"; renderAuth(); say("That email already has an account. Sign in instead (the same account works for LARA).", true); return; }
        au.type = "signup"; au.sentAt = Date.now(); au.mode = "code"; renderAuth();
      } else if (au.mode === "code") {
        const token = $("#auCode").value.replace(/\D/g, ""); if (token.length < 6) { say("Enter the 6-digit code.", true); return; }
        const { error } = await A.sb.auth.verifyOtp({ email: au.email, token, type: "email" });
        if (error) { say(friendly(error), true); return; }
        await afterSignIn();
      } else if (au.mode === "forgot") {
        au.type = "recovery"; const err = await sendCode();
        if (err && !String(err.message).startsWith("wait:")) { say(friendly(err), true); return; }
        au.mode = "reset"; renderAuth();
      } else if (au.mode === "reset") {
        const token = $("#auCode").value.replace(/\D/g, ""), np = $("#auNew").value;
        if (token.length < 6) { say("Enter the 6-digit code.", true); return; }
        if (np.length < 8) { say("Use a password of at least 8 characters.", true); return; }
        const { error } = await A.sb.auth.verifyOtp({ email: au.email, token, type: "recovery" });
        if (error) { say(friendly(error), true); return; }
        const { error: e3 } = await A.sb.auth.updateUser({ password: np });
        if (e3) { say(friendly(e3), true); return; }
        toast("Password changed"); await afterSignIn();
      }
    } catch (err) { say(friendly(err), true); }
    finally { A.busy = false; const b = $("#auGo"); if (b) b.disabled = false; }
  };
}
async function afterSignIn() {
  const { data } = await A.sb.auth.getSession();
  await setUser(data && data.session ? data.session.user : null);
  A.au = { mode: "in", email: "", sentAt: 0, type: "" };
  toast("Signed in");
  if (A.agent) go("post"); else go("join");
}

/* ---------- post prices ---------- */
function blankRow() { return { c: "", item: "", unit: "", per: "", price: "" }; }
function renderPost() {
  if (!A.user) { A.au.mode = "in"; return renderAuth(); }
  if (!A.agent) return renderJoin();
  const el = P(); const ag = A.agent;
  if (!A.rows) A.rows = store.get("agentDraft", null) || [blankRow(), blankRow(), blankRow()];
  const mk = MARKETS.slice().sort((x, y) => (x.state + x.name).localeCompare(y.state + y.name));
  el.innerHTML = `
    <div class="btns"><button class="btn ghost small" type="button" data-agent="${esc(ag.handle)}">← My page</button></div>
    <div><h2>Post prices</h2><p class="small muted">Add the prices you saw or paid today. Give the price for one unit (one bag, one litre, one crate…).</p></div>
    <form id="agPost" class="card ag-form" novalidate>
      <div class="ag-grid2">
        <div class="field"><label for="ppDate">Date seen</label><input id="ppDate" type="date" value="${today()}" min="${daysAgo(30)}" max="${today()}"></div>
        <div class="field"><label for="ppMarket">Market</label><select id="ppMarket"><option value="__mine">${esc(ag.market_name)} (my market)</option>${STATES.map(s => `<optgroup label="${esc(s)}">${mk.filter(m => m.state === s && m.id !== ag.market_id).map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</optgroup>`).join("")}</select></div>
      </div>
      <div id="ppRows" class="ag-rows"></div>
      <div class="btns"><button class="btn ghost small" type="button" id="ppAdd">+ Add another item</button></div>
      <div class="field"><label for="ppNote">Note (optional)</label><input id="ppNote" maxlength="300" placeholder="e.g. Prices for new-harvest maize, good quality"></div>
      <div class="btns"><button class="btn" type="submit" id="ppGo">Post prices</button></div>
      <div id="ppMsg" class="small" role="status"></div>
    </form>`;
  wire(el); drawRows();
  $("#ppAdd").onclick = () => { if (A.rows.length >= MAX_ROWS) return toast(`Up to ${MAX_ROWS} items per post`); A.rows.push(blankRow()); drawRows(); };
  $("#agPost").onsubmit = submitPost;
}
function drawRows() {
  const box = $("#ppRows"); if (!box) return;
  box.innerHTML = A.rows.map((r, i) => {
    const c = COMMODITIES[r.c]; const units = c ? UNITS[c.base] || [] : [];
    const custom = r.c === "other" || (r.c && r.unit === "__custom");
    return `<div class="ag-row" data-i="${i}">
      <div class="field"><label>Item</label><select data-f="c"><option value="">Choose…</option>${COMM.map(x => `<option value="${x.k}"${x.k === r.c ? " selected" : ""}>${esc(x.label)}</option>`).join("")}<option value="other"${r.c === "other" ? " selected" : ""}>Something else…</option></select></div>
      ${r.c === "other" ? `<div class="field"><label>What item?</label><input data-f="item" maxlength="60" value="${esc(r.item)}" placeholder="e.g. Catfish (smoked)"></div>` : ""}
      ${r.c && r.c !== "other" ? `<div class="field"><label>Unit</label><select data-f="unit">${units.map(([u]) => `<option${u === r.unit ? " selected" : ""}>${esc(u)}</option>`).join("")}<option value="__custom"${r.unit === "__custom" ? " selected" : ""}>Other measure…</option></select></div>` : ""}
      ${custom ? `<div class="field"><label>Unit name</label><input data-f="uname" maxlength="40" value="${esc(r.uname || "")}" placeholder="${r.c === "other" ? "e.g. basket, carton, piece" : "e.g. mudu, paint bucket"}"></div>` : ""}
      ${custom && r.c !== "other" ? `<div class="field"><label>How many ${BASE_WORD[COMMODITIES[r.c].base] || "units"}? (if known)</label><input data-f="per" inputmode="decimal" value="${esc(r.per)}" placeholder="e.g. 1.3"></div>` : ""}
      <div class="field"><label>Price (₦)</label><input data-f="price" inputmode="numeric" value="${esc(r.price)}" placeholder="e.g. 45000"></div>
      <button type="button" class="ag-x" data-del="${i}" aria-label="Remove this item">×</button>
    </div>`;
  }).join("");
  box.querySelectorAll(".ag-row").forEach(rowEl => {
    const r = A.rows[+rowEl.dataset.i];
    rowEl.querySelectorAll("[data-f]").forEach(inp => {
      const f = inp.dataset.f;
      const upd = () => {
        r[f] = inp.value;
        if (f === "c") { const c = COMMODITIES[r.c]; r.unit = c ? (UNITS[c.base] || [[""]])[c.base === "kg" ? Math.min(2, (UNITS[c.base] || []).length - 1) : 0][0] : ""; r.per = ""; drawRows(); }
        if (f === "unit") drawRows();
        store.set("agentDraft", A.rows);
      };
      inp.onchange = upd; if (inp.tagName === "INPUT") inp.oninput = () => { r[f] = inp.value; store.set("agentDraft", A.rows); };
    });
  });
  box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { A.rows.splice(+b.dataset.del, 1); if (!A.rows.length) A.rows.push(blankRow()); drawRows(); store.set("agentDraft", A.rows); });
}
const num = s => { const n = parseFloat(String(s || "").replace(/[₦,\s]/g, "")); return isFinite(n) ? n : NaN; };
async function submitPost(e) {
  e.preventDefault(); if (A.busy) return;
  const msg = $("#ppMsg"); msg.className = "small"; msg.textContent = "";
  const ag = A.agent; const mv = $("#ppMarket").value; const m = mv === "__mine" ? null : marketById(mv);
  const filled = A.rows.filter(r => r.c || r.price);
  const out = []; const problems = [];
  filled.forEach((r, i) => {
    const n = i + 1; const price = num(r.price);
    if (!r.c) return problems.push(`Item ${n}: choose what it is.`);
    if (!(price > 0)) return problems.push(`Item ${n}: enter the price in naira.`);
    if (r.c === "other") {
      if (!r.item.trim()) return problems.push(`Item ${n}: say what the item is.`);
      if (!(r.uname || "").trim()) return problems.push(`Item ${n}: give the unit (e.g. basket).`);
      return out.push({ commodity: "other", item: r.item.trim(), unit: r.uname.trim(), per: null, price });
    }
    if (r.unit === "__custom") {
      if (!(r.uname || "").trim()) return problems.push(`Item ${n}: give the measure (e.g. mudu).`);
      const pr = num(r.per);
      return out.push({ commodity: r.c, item: null, unit: r.uname.trim(), per: pr > 0 ? pr : null, price });
    }
    const u = (UNITS[COMMODITIES[r.c].base] || []).find(x => x[0] === r.unit) || [r.unit, null];
    out.push({ commodity: r.c, item: null, unit: u[0], per: u[1], price });
  });
  if (!out.length && !problems.length) problems.push("Add at least one price.");
  if (problems.length) { msg.innerHTML = problems.map(esc).join("<br>"); msg.classList.add("bad"); return; }
  A.busy = true; $("#ppGo").disabled = true; msg.textContent = "Posting…";
  try {
    const post = { agent_id: ag.id, observed_on: $("#ppDate").value || today(), note: $("#ppNote").value.trim() || null,
      market_id: m ? m.id : ag.market_id, market_name: m ? m.name : ag.market_name, state: m ? m.state : ag.state, lga: m ? (m.lga || null) : ag.lga };
    const { data: p, error } = await A.sb.from("ma_posts").insert(post).select("id").single();
    if (error) throw error;
    const { data: rows, error: e2 } = await A.sb.from("ma_prices").insert(out.map(o => ({ ...o, post_id: p.id, agent_id: ag.id }))).select("status");
    if (e2) throw e2;
    A.rows = null; store.set("agentDraft", null);
    const held = (rows || []).filter(r => r.status === "held").length;
    toast(held ? `Posted. ${held} price${held > 1 ? "s" : ""} will show after a quick check` : "Prices posted");
    try { window.SiteTrack && window.SiteTrack("agent-posted", "Posted community prices", true); } catch (e) {}
    go("share", String(p.id));
  } catch (err) { msg.textContent = friendly(err); msg.classList.add("bad"); }
  finally { A.busy = false; const b = $("#ppGo"); if (b) b.disabled = false; }
}

/* ---------- share ---------- */
async function renderShare(id) {
  const el = P();
  el.innerHTML = `<p class="small muted">Preparing your price card…</p>`;
  const { data: post, error } = await A.sb.from("ma_posts").select(POST_COLS).eq("id", +id).maybeSingle();
  if (A.view !== "share") return;
  if (error || !post) { el.innerHTML = `<div class="card"><p class="small">This post isn't available.</p><div class="btns"><button class="btn ghost" type="button" data-ag="home">Community prices</button></div></div>`; wire(el); return; }
  const ag = post.ma_agents || A.agent || {};
  const rows = livePrices(post);
  const held = (post.ma_prices || []).filter(p => p.status === "held").length;
  const link = profileUrl(ag.handle);
  const caption = captionFor(post, rows, link);
  el.innerHTML = `
    <div class="btns"><button class="btn ghost small" type="button" data-agent="${esc(ag.handle)}">← My page</button><button class="btn ghost small" type="button" data-ag="post">Post more prices</button></div>
    <div><h2>Share your prices</h2><p class="small muted">Download the card and post it with the caption. LinkedIn and Facebook don't let websites fill in your post text, so copy the caption first, then paste it.</p></div>
    ${held ? `<p class="note">${held} price${held > 1 ? "s are" : " is"} waiting for a quick check because ${held > 1 ? "they look" : "it looks"} unusual, so ${held > 1 ? "they're" : "it's"} not on the card yet.</p>` : ""}
    ${rows.length ? `<div class="card"><canvas id="agCard" width="1080" height="1350" class="ag-canvas" aria-label="Price card image"></canvas>
      <div class="btns"><button class="btn" type="button" id="agDl">Download image</button>${navigator.canShare ? `<button class="btn ghost" type="button" id="agSys">Share image…</button>` : ""}</div></div>` : ""}
    <div class="card"><h3 style="margin:0">Caption</h3><textarea id="agCap" rows="9" class="ag-cap">${esc(caption)}</textarea>
      <div class="btns"><button class="btn" type="button" id="agCopy">Copy caption</button></div>
      <div class="btns ag-share">
        <a class="btn ghost small" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}">LinkedIn</a>
        <a class="btn ghost small" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}">Facebook</a>
        <a class="btn ghost small" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(caption)}">WhatsApp</a>
        <a class="btn ghost small" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(caption.slice(0, 230))}">X</a>
        <button class="btn ghost small" type="button" id="agLink">Copy my page link</button>
      </div></div>`;
  wire(el);
  $("#agCopy").onclick = () => copyText($("#agCap").value, $("#agCap"));
  $("#agLink").onclick = () => copyText(link);
  el.querySelectorAll(".ag-share a").forEach(a => a.addEventListener("click", () => { try { window.SiteTrack && window.SiteTrack("agent-share/" + a.textContent.trim().toLowerCase(), "Shared community prices: " + a.textContent.trim(), true); } catch (e) {} }));
  if (!rows.length) return;
  await drawCard($("#agCard"), post, rows, ag);
  const fname = `prices-${slug(post.market_name)}-${post.observed_on}.png`;
  $("#agDl").onclick = () => $("#agCard").toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fname; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }, "image/png");
  if ($("#agSys")) $("#agSys").onclick = () => $("#agCard").toBlob(async b => {
    const file = new File([b], fname, { type: "image/png" });
    try { if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: $("#agCap").value }); else toast("Your browser can't share images directly: download it instead"); } catch (e) {}
  }, "image/png");
}
function captionFor(post, rows, link) {
  const lines = rows.slice(0, 15).map(r => `• ${commLabel(r.commodity, r.item)}: ${naira(r.price)} per ${r.unit}`);
  const more = rows.length > 15 ? `\n…and ${rows.length - 15} more on my page.` : "";
  return `${post.market_name}, ${post.state} market prices, ${fmtDate(post.observed_on)}:\n${lines.join("\n")}${more}\n\nI post prices from my market as a community price agent on the Nigeria Market Atlas. See all my updates: ${link}\n\n#NigeriaMarketPrices #FoodPrices #${post.state.replace(/[^A-Za-z]/g, "")}`;
}
async function drawCard(cv, post, rows, ag) {
  try { await document.fonts.ready; } catch (e) {}
  const max = rows.length > 9 ? 8 : 9; const shown = rows.slice(0, max);
  const more = rows.length > shown.length ? 50 : 0;
  cv.width = 1080; cv.height = Math.max(1080, Math.min(1350, 350 + shown.length * 110 + more + 40 + 230));
  const x = cv.getContext("2d"); const W = cv.width, H = cv.height;
  const indigo = "#2c3e9e", ink = "#14181f", muted = "#5b6472", soft = "#eef0f7", leaf = "#2f7d4f";
  const F = (w, s) => `${w} ${s}px "Inter", "Segoe UI", Roboto, Arial, sans-serif`;
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  x.fillStyle = indigo; x.fillRect(0, 0, W, 300);
  x.fillStyle = "#ffffff"; x.font = F(600, 34); x.fillText("MARKET PRICES · " + fmtDate(post.observed_on).toUpperCase(), 70, 92);
  x.font = F(800, fit(x, post.market_name, 940, 76, 44)); x.fillText(post.market_name, 70, 185);
  x.font = F(500, 38); x.fillStyle = "rgba(255,255,255,.85)"; x.fillText(post.state + " State" + (post.lga ? " · " + post.lga + " LGA" : ""), 70, 248);
  // rows
  const top = 350, rowH = Math.min(110, Math.floor((H - 350 - more - 40 - 230) / Math.max(shown.length, 1)));
  shown.forEach((r, i) => {
    const y = top + i * rowH;
    if (i % 2 === 0) { x.fillStyle = soft; x.fillRect(50, y - 4, W - 100, rowH - 6); }
    x.fillStyle = ink; x.font = F(600, Math.min(40, rowH * 0.42)); x.fillText(clip(x, commLabel(r.commodity, r.item), 520), 80, y + rowH * 0.42);
    x.fillStyle = muted; x.font = F(400, Math.min(28, rowH * 0.3)); x.fillText("per " + r.unit, 80, y + rowH * 0.78);
    x.fillStyle = ink; x.font = F(800, Math.min(46, rowH * 0.5)); x.textAlign = "right"; x.fillText(naira(r.price), W - 80, y + rowH * 0.6); x.textAlign = "left";
  });
  if (rows.length > shown.length) { x.fillStyle = muted; x.font = F(500, 30); x.fillText(`+ ${rows.length - shown.length} more on my page`, 80, top + shown.length * rowH + 30); }
  // footer
  x.fillStyle = soft; x.fillRect(0, H - 230, W, 230);
  x.fillStyle = ink; x.font = F(700, 36); x.fillText(clip(x, "Reported by " + (ag.name || "a community agent"), 940), 70, H - 160);
  x.fillStyle = leaf; x.font = F(600, 30); x.fillText("Community price agent · Nigeria Market Atlas", 70, H - 115);
  x.fillStyle = muted; x.font = F(500, 28); x.fillText(clip(x, "shagbaor.com/market-atlas/#agent/" + ag.handle, 940), 70, H - 70);
  x.font = F(400, 22); x.fillText("Community report. Prices vary with quality, quantity and day.", 70, H - 32);
  function fit(ctx, t, w, big, small) { for (let s = big; s >= small; s -= 2) { ctx.font = F(800, s); if (ctx.measureText(t).width <= w) return s; } return small; }
  function clip(ctx, t, w) { if (ctx.measureText(t).width <= w) return t; while (t.length > 3 && ctx.measureText(t + "…").width > w) t = t.slice(0, -1); return t + "…"; }
}

/* ---------- editor review ---------- */
async function renderAdmin() {
  const el = P();
  if (!A.editor) { el.innerHTML = `<div class="card"><p class="small">Only the atlas editor can review prices.</p></div>`; return; }
  const { data, error } = await A.sb.from("ma_prices").select("id,commodity,item,unit,per,price,flag,observed_on,state,post_id,ma_agents(handle,name),ma_posts(market_name)").eq("status", "held").order("id", { ascending: true }).limit(100);
  if (A.view !== "admin") return;
  el.innerHTML = `<div class="btns"><button class="btn ghost small" type="button" data-ag="home">← Community prices</button></div>
    <div><h2>Prices waiting for a check</h2><p class="small muted">These were held because they look unusual. Approve the ones that are right; remove the rest. To trust or suspend an agent, open their page.</p></div>
    ${error ? `<p class="small bad">${esc(friendly(error))}</p>` : !data.length ? `<div class="card"><p class="small">Nothing to check.</p></div>` :
      `<div class="list">${data.map(p => `<div class="item"><span></span><span class="t"><b>${esc(commLabel(p.commodity, p.item))}: ${naira(p.price)} per ${esc(p.unit)}</b><span>${esc(p.ma_posts ? p.ma_posts.market_name : "")}, ${esc(p.state || "")} · ${fmtDate(p.observed_on)} · <a href="#agent/${esc(p.ma_agents ? p.ma_agents.handle : "")}" data-agent="${esc(p.ma_agents ? p.ma_agents.handle : "")}">${esc(p.ma_agents ? p.ma_agents.name : "")}</a> · ${esc(p.flag || "")}${p.per ? ` · ${naira(p.price / p.per)}/${esc((COMMODITIES[p.commodity] || {}).base || "unit")}` : ""}</span></span><span class="r"><button class="btn small" type="button" data-ok="${p.id}">Approve</button> <button class="btn ghost small" type="button" data-no="${p.id}">Remove</button></span></div>`).join("")}</div>`}`;
  wire(el);
  const act = async (id, status) => { const { error } = await A.sb.from("ma_prices").update({ status }).eq("id", id); toast(error ? friendly(error) : status === "live" ? "Approved" : "Removed"); renderAdmin(); };
  el.querySelectorAll("[data-ok]").forEach(b => b.onclick = () => act(+b.dataset.ok, "live"));
  el.querySelectorAll("[data-no]").forEach(b => b.onclick = () => act(+b.dataset.no, "removed"));
}

/* ---------------------------------------------------------------- hook into the atlas tabs */
const _origShowTab = showTab;
showTab = function (t) {
  _origShowTab(t);
  if (t === "agents") { const h = location.hash.slice(1); route(h.startsWith("agent") ? h : "agents", false); }
};
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
// open straight to a shared link: #agent/<handle>, #agents, #agents/post …
const h0 = location.hash.slice(1);
if (h0 === "agents" || h0.startsWith("agents/") || h0.startsWith("agent/")) showTab("agents");
})();
