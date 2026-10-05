/* Traction: privacy-friendly usage counting + optional "Join the community" form.
Shared by the website and all tools (SustainaTable, Symbiosis Workbench, Laureate Lab).

SETUP — fill in these two values, then upload this file again:
1. GOATCOUNTER_CODE: the name you chose at goatcounter.com (for https://shagbaor.goatcounter.com write "shagbaor").
2. TALLY_FORM_ID: the ID at the end of your Tally form link (for https://tally.so/r/w7Xk2p write "w7Xk2p").
Leave a value empty ("") to switch that feature off. */
(function () {
"use strict";
var GOATCOUNTER_CODE = "shagbaor";
var TALLY_FORM_ID = "zxlV4Z";
var PRIVACY_URL = "/privacy.html";

var path = location.pathname;
var TOOL = /\/symbiosis\//.test(path) ? "symbiosis"
  : /sustainatable/.test(path) ? "sustainatable"
  : /\/laureate\//.test(path) ? "laureate"
  : /\/tea-studio\//.test(path) ? "tea-studio"
  : /\/eia-studio\//.test(path) ? "eia-studio"
  : /citadel/.test(path) ? "citadel"
  : "website";

/* ---------- analytics (GoatCounter: no cookies, no personal data) ---------- */
var queue = [], sent = {};
function send(name, title) {
if (!GOATCOUNTER_CODE) return;
var gc = window.goatcounter;
if (gc && gc.count) gc.count({ path: TOOL + "/" + name, title: title || name, event: true });
else queue.push([name, title]);
}
/* track(name) counts an action; once per page visit unless repeat is true */
function track(name, title, repeat) {
if (!repeat && sent[name]) return;
sent[name] = 1; send(name, title);
}
window.SiteTrack = track;

if (GOATCOUNTER_CODE && !/^(localhost|127\.)/.test(location.hostname) && location.protocol !== "file:") {
var s = document.createElement("script");
s.async = true; s.src = "https://gc.zgo.at/count.js";
s.setAttribute("data-goatcounter", "https://" + GOATCOUNTER_CODE + ".goatcounter.com/count");
s.onload = function () { var t = setInterval(function () { if (window.goatcounter && window.goatcounter.count) { clearInterval(t); queue.splice(0).forEach(function (q) { send(q[0], q[1]); }); } }, 200); setTimeout(function () { clearInterval(t); }, 8000); };
document.head.appendChild(s);
}

/* ---------- reader aids on the homepage (glossary + back to top) ---------- */
if (TOOL === "website") {
var en = document.createElement("script");
en.src = "/assets/enhance.js"; en.defer = true;
document.head.appendChild(en);
} else {
/* every tool gets the same bar: back to the website, and across to the others */
var tb = document.createElement("script");
tb.src = "/assets/toolbar.js"; tb.defer = true;
document.head.appendChild(tb);
}

/* per-tool actions, counted without touching each tool's own code */
document.addEventListener("click", function (e) {
var t = e.target.closest ? e.target.closest("button,a,[role=tab]") : null;
if (!t) return;
if (TOOL === "symbiosis") {
if (t.id && /^t-/.test(t.id)) track("section/" + t.id.slice(2), "Opened section: " + t.id.slice(2));
else if (t.matches(".fac-btn,[data-add]")) track("facility-added", "Added a facility to a park");
else if (t.matches('[data-act="connect"]')) track("exchange-connected", "Connected a by-product exchange");
else if (t.id === "autoBtn") track("auto-connect", "Used auto-connect");
else if (t.id === "pngBtn") track("export-png", "Exported park image");
else if (t.id === "startTour" || t.id === "helpTour") track("tour", "Took the tour");
else if (t.matches(".case-btn")) track("case-opened", "Opened a case study");
else if (t.matches(".mm-item")) track("stream-opened", "Opened a waste stream");
else if (t.matches(".qopt")) track("quiz-answered", "Answered a quiz question");
} else if (TOOL === "sustainatable") {
if (t.matches(".el") && !t.matches(".big")) track("goal-opened", "Opened a goal");
else if (t.matches(".modes [data-m]")) track("view/" + t.getAttribute("data-m"), "Switched view: " + t.getAttribute("data-m"));
else if (t.matches(".fam")) track("family-highlighted", "Highlighted a family");
}
}, true);

/* ---------- site bar links: Join + Privacy ---------- */
var css = ".tr-links{display:inline-flex;align-items:center;gap:14px;margin-left:auto;margin-right:16px;white-space:nowrap}" +
".tr-links a,.tr-links button{font:inherit;color:inherit;background:none;border:0;padding:6px 0;cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--sb-line,currentColor)}" +
".tr-join{font-weight:600!important}" +
"@media (max-width:560px){.tr-priv{display:none}.tr-links{margin-right:8px}}" +
".tr-dlg{border:0;padding:0;border-radius:16px;width:min(560px,calc(100% - 24px));max-height:calc(100% - 32px);background:#fff;color:#1d2524;box-shadow:0 24px 60px rgba(0,0,0,.3)}" +
".tr-dlg::backdrop{background:rgba(10,18,17,.55)}" +
".tr-hd{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 8px}" +
".tr-hd h2{font:700 20px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;margin:0}" +
".tr-hd p{margin:6px 0 0;font:14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#4a5654}" +
".tr-x{margin-left:auto;flex:none;width:36px;height:36px;border-radius:50%;border:1px solid #d5dcda;background:none;font-size:20px;line-height:1;cursor:pointer;color:inherit}" +
".tr-dlg iframe{display:block;width:100%;border:0;min-height:560px}" +
".tr-ft{padding:0 20px 16px;font:12.5px/1.4 system-ui,sans-serif;color:#7a8584}.tr-ft a{color:inherit}";
function mount() {
var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
var bar = document.querySelector(".sitebar-in");
var box = document.createElement("span"); box.className = "tr-links";
box.innerHTML = (TALLY_FORM_ID ? '<button type="button" class="tr-join">Join the community</button>' : "") + '<a class="tr-priv" href="' + PRIVACY_URL + '">Privacy</a>';
if (bar) { var more = bar.querySelector(".sb-more"); bar.insertBefore(box, more || null); }
else {
/* pages that build their footer with script (the homepage): wait for it */
var place = function () { var f = document.querySelector("footer"); if (f && !f.contains(box)) { box.style.margin = "0"; f.appendChild(box); return true; } return false; };
if (!place()) { var mo = new MutationObserver(function () { if (place()) mo.disconnect(); }); mo.observe(document.body, { childList: true, subtree: true }); setTimeout(function () { mo.disconnect(); }, 10000); }
}
var jb = box.querySelector(".tr-join"); if (jb) jb.addEventListener("click", openJoin);
document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-join]"); if (b) { e.preventDefault(); openJoin(); } });
}
var dlg;
function openJoin() {
if (!TALLY_FORM_ID) return;
track("join-opened", "Opened the join form");
if (!dlg) {
dlg = document.createElement("dialog"); dlg.className = "tr-dlg"; dlg.setAttribute("aria-label", "Join the community");
var src = "https://tally.so/embed/" + encodeURIComponent(TALLY_FORM_ID) + "?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1&tool=" + TOOL;
dlg.innerHTML = '<div class="tr-hd"><div><h2>Join the community</h2><p>Tell us who you are so we can keep improving these free tools and show funders who they help. It takes under a minute.</p></div><button type="button" class="tr-x" aria-label="Close">×</button></div>' +
'<iframe title="Join the community form" loading="lazy" src="' + src + '"></iframe>' +
'<div class="tr-ft">Your answers are stored with Tally and used only as described in the <a href="' + PRIVACY_URL + '" target="_blank" rel="noopener">privacy notice</a>.</div>';
document.body.appendChild(dlg);
dlg.querySelector(".tr-x").addEventListener("click", function () { dlg.close(); });
dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
window.addEventListener("message", function (e) {
if (e.origin !== "https://tally.so" || typeof e.data !== "string") return;
if (e.data.indexOf("Tally.FormSubmitted") !== -1) track("joined", "Submitted the join form");
});
}
if (dlg.showModal) dlg.showModal(); else window.open("https://tally.so/r/" + TALLY_FORM_ID + "?tool=" + TOOL, "_blank", "noopener");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
