/* One shared bar across the free tools.

Gives every tool the same two things at the top of the page: a way back to the
website, and a way to any of the other tools without going back first. Loaded by
traction.js on tool pages only — the website's homepage has its own navigation.

To add a tool later, add one line to TOOLS below. Nothing else needs changing. */
(function () {
"use strict";

var TOOLS = [
  { url: "/tea-studio/",        name: "Techno-Economic Studio", note: "Is it worth building?" },
  { url: "/eia-studio/",        name: "EIA Studio",             note: "Environmental impact assessment" },
  { url: "/symbiosis/",         name: "Symbiosis Workbench",    note: "One site's waste, another's feedstock" },
  { url: "/sustainatable.html", name: "The SustainaTable",      note: "The SDGs as a periodic table" },
  { url: "/laureate/",          name: "Laureate Lab",           note: "Prepare a funding application" },
  { url: "/citadel.html",       name: "Citadel",                note: "Academic writing, made clear" },
  { url: "/forest-atlas/",      name: "Nigeria Forest Reserves Atlas", note: "Forest reserves, parks and wetlands, mapped" },
  { url: "/water-atlas/",       name: "Nigeria Water Resources Atlas", note: "Rivers, dams, groundwater and flood watch" }
];
var HOME = "/#resources";
var HOME_LABEL = "Shagbaor Hycent Amool";

var CSS =
  ".sitebar{font:500 13px/1.2 var(--sb-font,var(--sans,system-ui,-apple-system,'Segoe UI',sans-serif));" +
    "position:sticky;top:0;z-index:60;color:var(--sb-ink,var(--ink,CanvasText));" +
    "background:var(--sb-bg,color-mix(in srgb,var(--bg,var(--paper,var(--surface,Canvas))) 88%,transparent));" +
    "border-bottom:1px solid var(--sb-line,var(--line,color-mix(in srgb,currentColor 18%,transparent)));" +
    "-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}" +
  ".sitebar-in{max-width:var(--sb-max,1120px);margin:0 auto;padding:0 var(--sb-pad,clamp(14px,3vw,24px));" +
    "min-height:36px;display:flex;align-items:center;gap:12px}" +
  ".sitebar a{color:inherit;text-decoration:none;border-radius:6px}" +
  ".sitebar a:focus-visible,.sitebar summary:focus-visible{outline:2px solid currentColor;outline-offset:2px}" +
  ".sb-home{display:inline-flex;align-items:center;gap:6px;padding:7px 8px 7px 4px;margin-left:-4px;white-space:nowrap;min-width:0}" +
  ".sb-home span{overflow:hidden;text-overflow:ellipsis}" +
  ".sb-home:hover{background:var(--sb-hover,color-mix(in srgb,currentColor 8%,transparent))}" +
  ".sb-home svg{flex:none;transition:transform .15s}" +
  ".sb-home:hover svg{transform:translateX(-2px)}" +
  ".sb-pick{order:9;margin-left:auto;position:relative}" +
  ".sb-pick>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;" +
    "padding:7px 10px;border-radius:6px;white-space:nowrap}" +
  ".sb-pick>summary::-webkit-details-marker{display:none}" +
  ".sb-pick>summary:hover{background:var(--sb-hover,color-mix(in srgb,currentColor 8%,transparent))}" +
  ".sb-pick[open]>summary{background:var(--sb-hover,color-mix(in srgb,currentColor 8%,transparent))}" +
  ".sb-pick>summary svg{flex:none;transition:transform .15s}" +
  ".sb-pick[open]>summary svg{transform:rotate(180deg)}" +
  ".sb-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:70;min-width:min(290px,calc(100vw - 28px));" +
    "padding:6px;border-radius:10px;" +
    "background:var(--surface,var(--card,var(--bg,var(--paper,Canvas))));" +
    "border:1px solid var(--line,color-mix(in srgb,currentColor 20%,transparent));" +
    "box-shadow:0 14px 34px rgba(0,0,0,.22)}" +
  ".sb-menu a,.sb-menu .sb-here{display:block;padding:8px 10px;border-radius:7px;line-height:1.3}" +
  ".sb-menu a:hover{background:var(--sb-hover,color-mix(in srgb,currentColor 9%,transparent))}" +
  ".sb-menu b{display:block;font-weight:600}" +
  ".sb-menu i{display:block;font-style:normal;font-size:11.5px;margin-top:2px;opacity:.72}" +
  ".sb-here{opacity:.6}" +
  ".sb-here b::after{content:' · you are here';font-weight:400;font-size:11.5px}" +
  "@media (max-width:560px){.sb-hide{display:none}}" +
  "@media print{.sitebar{display:none}}";

var CHEV_L = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>';
var CHEV_D = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l5 5 5-5"/></svg>';

function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

/* Which tool are we on? Compare on the path only, ignoring index.html. */
function samePage(url) {
  var a = location.pathname.replace(/index\.html$/, "").replace(/\/+$/, "/");
  var b = url.replace(/index\.html$/, "").replace(/\/+$/, "/");
  return a === b || a === b.replace(/\/$/, "");
}

function build() {
  if (document.querySelector(".sb-pick")) return true;      /* already built */
  var body = document.body;
  if (!body) return false;

  var st = document.createElement("style");
  st.id = "sb-css"; st.textContent = CSS;
  document.head.appendChild(st);

  /* Replace any older hand-written bar so every tool looks the same. */
  var old = document.querySelector("nav.sitebar");
  if (old) old.parentNode.removeChild(old);

  var items = TOOLS.map(function (t) {
    var inner = "<b>" + esc(t.name) + "</b>" + (t.note ? "<i>" + esc(t.note) + "</i>" : "");
    return samePage(t.url)
      ? '<span class="sb-here" aria-current="page">' + inner + "</span>"
      : '<a href="' + esc(t.url) + '">' + inner + "</a>";
  }).join("");

  var nav = document.createElement("nav");
  nav.className = "sitebar";
  nav.setAttribute("aria-label", "Site");
  nav.innerHTML =
    '<div class="sitebar-in">' +
      '<a class="sb-home" href="' + HOME + '" title="Back to ' + esc(HOME_LABEL) + "'s website\">" +
        CHEV_L + "<span><span class=\"sb-hide\">Back to </span>" + esc(HOME_LABEL) + "</span></a>" +
      '<details class="sb-pick"><summary aria-label="Other free tools">Free tools' + CHEV_D + "</summary>" +
        '<div class="sb-menu">' + items + "</div></details>" +
    "</div>";
  body.insertBefore(nav, body.firstChild);

  var pick = nav.querySelector(".sb-pick");
  document.addEventListener("click", function (e) {
    if (pick.open && !pick.contains(e.target)) pick.open = false;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && pick.open) { pick.open = false; pick.querySelector("summary").focus(); }
  });
  return true;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
else build();
})();
