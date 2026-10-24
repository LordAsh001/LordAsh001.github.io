/* Legal notices shared by every tool. Loaded by traction.js.

1. A short disclaimer for each tool: shown as a dismissible notice (again every 30 days)
   and as a permanent line in the page footer, both linking to /terms.html.
2. Photo credits on the Nigeria Literature Landscape: the photographer and licence of
   each Wikimedia photo are fetched from Wikimedia Commons and shown under the photo.

To change a tool's wording, edit NOTES below. */
(function () {
"use strict";
var TERMS = "/terms.html";
var path = location.pathname;
var MAP = "Not an official survey: boundaries and locations are approximate, from open data, and not for land, legal, navigation or engineering use.";
var TOOLNOTE = "For learning and research: built-in values are general guidance, not professional advice. Check the laws, standards and sources that apply to you.";
var NOTES = [
  [/\/forest-atlas\//, MAP + " Threats and field reports are the cited source's or the reporter's account, not verified findings."],
  [/\/water-atlas\//, MAP + " Flood information is not an official warning: follow NIHSA, NiMet, NEMA and your state emergency agency."],
  [/\/market-atlas\//, MAP + " Prices are indicative and dated to their source; they are not quotes or trading advice."],
  [/\/energy-atlas\//, MAP + " Site locations are approximate and the data are not for engineering or investment use."],
  [/\/peoples-atlas\//, "Cultural areas, histories and rulers are indicative, from the sources cited. The atlas takes no position on land, chieftaincy or boundary questions. Map boundaries are approximate and not official."],
  [/\/waste-atlas\//, MAP + " A mapped site shows visible waste on the date given; it does not mean any person, community or company broke the law."],
  [/\/literature-landscape\//, "Profiles come from public sources such as Wikidata and Wikipedia; inclusion or ranking is not an endorsement. Photos are from Wikimedia Commons, credited with each photo."],
  [/\/(tea-studio|eia-studio|symbiosis)\//, TOOLNOTE],
  [/\/laureate\//, "Free preparation resource, not affiliated with any funder. Deadlines, eligibility and requirements change: always check the funder's official page before you apply."],
  [/sustainatable|citadel/, "Free learning resource. Summaries of goals, guidelines and conventions are simplified: check the official source or your institution's rules before relying on them."]
];
var note = null;
for (var i = 0; i < NOTES.length; i++) if (NOTES[i][0].test(path)) { note = NOTES[i][1]; break; }

var css = ".lg-bar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483000;width:min(760px,calc(100% - 24px));display:flex;gap:12px;align-items:flex-start;" +
  "background:#1d2524;color:#eef3f1;border-radius:12px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.28);font:13.5px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}" +
  ".lg-bar p{margin:0;flex:1;color:inherit}.lg-bar a{color:#9fe3c9}" +
  ".lg-bar button{flex:none;font:600 13px/1 system-ui,sans-serif;background:#9fe3c9;color:#10201b;border:0;border-radius:8px;padding:9px 14px;cursor:pointer}" +
  ".lg-foot{display:block;width:100%;margin:8px 0 0;font-size:12.5px;line-height:1.45;opacity:.85}.lg-foot a{color:inherit}" +
  ".lg-credit{margin:6px 0 0;font-size:12px;line-height:1.4;opacity:.8}.lg-credit a{color:inherit}";

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

function mountNotice() {
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  if (!note) return;
  var link = ' <a href="' + TERMS + '">Terms and disclaimers</a>.';
  /* permanent line in the footer, where the page has one */
  var f = document.querySelector("footer");
  if (f && !f.querySelector(".lg-foot")) {
    var fp = document.createElement("span"); fp.className = "lg-foot"; fp.innerHTML = note + link; f.appendChild(fp);
  }
  /* dismissible notice, shown again after 30 days */
  var key = "lg-ok:" + path.split("/")[1], last = +store(key) || 0;
  if (Date.now() - last < 30 * 864e5) return;
  var bar = document.createElement("div"); bar.className = "lg-bar"; bar.setAttribute("role", "note");
  bar.innerHTML = "<p>" + note + link + '</p><button type="button">OK</button>';
  bar.querySelector("button").addEventListener("click", function () { store(key, String(Date.now())); bar.remove(); });
  document.body.appendChild(bar);
}

/* ---------- photo credits (Literature Landscape) ---------- */
var cache = {};
function fileOf(src) {
  var m = /Special:FilePath\/([^?#]+)/.exec(src);
  if (m) return { name: decodeURIComponent(m[1]).replace(/_/g, " "), api: "https://commons.wikimedia.org" };
  m = /upload\.wikimedia\.org\/wikipedia\/([a-z]+)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(src);
  if (m) return { name: decodeURIComponent(m[2]).replace(/_/g, " "), api: m[1] === "commons" ? "https://commons.wikimedia.org" : "https://" + m[1] + ".wikipedia.org" };
  return null;
}
function strip(h) { var d = document.createElement("div"); d.innerHTML = h || ""; return (d.textContent || "").replace(/\s+/g, " ").trim(); }
function credit(f) {
  var k = f.api + "|" + f.name;
  if (!cache[k]) cache[k] = fetch(f.api + "/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl&titles=" + encodeURIComponent("File:" + f.name))
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var p = j && j.query && j.query.pages, pg = p && p[Object.keys(p)[0]], md = pg && pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].extmetadata || {};
      return { artist: strip(md.Artist && md.Artist.value), lic: strip(md.LicenseShortName && md.LicenseShortName.value), licUrl: md.LicenseUrl && md.LicenseUrl.value };
    }).catch(function () { return {}; });
  return cache[k];
}
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function pageUrl(f) { return f.api + "/wiki/File:" + encodeURIComponent(f.name.replace(/ /g, "_")); }
function creditImg(img) {
  if (img.dataset.lg) return; img.dataset.lg = "1";
  var f = fileOf(img.currentSrc || img.src); if (!f) return;
  var big = img.closest(".dr-top");
  if (!big) { img.title = "Photo: Wikimedia Commons. Open the profile for photographer and licence."; return; }
  var cap = document.createElement("p"); cap.className = "lg-credit";
  cap.innerHTML = 'Photo: <a href="' + pageUrl(f) + '" target="_blank" rel="noopener">Wikimedia Commons</a>';
  big.parentNode.insertBefore(cap, big.nextSibling);
  credit(f).then(function (c) {
    if (!c.artist && !c.lic) return;
    cap.innerHTML = "Photo: " + esc(c.artist || "Unknown author") + (c.lic ? " · " + (c.licUrl ? '<a href="' + esc(c.licUrl) + '" target="_blank" rel="noopener">' + esc(c.lic) + "</a>" : esc(c.lic)) : "") +
      ' · <a href="' + pageUrl(f) + '" target="_blank" rel="noopener">Wikimedia Commons</a>';
  });
}
function scanPhotos(root) { (root.querySelectorAll ? root : document).querySelectorAll("img").forEach(function (im) { if (/wikimedia\.org/.test(im.src)) creditImg(im); }); }

function start() {
  mountNotice();
  if (/\/literature-landscape\//.test(path)) {
    scanPhotos(document);
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.tagName === "IMG") { if (/wikimedia\.org/.test(n.src)) creditImg(n); } else scanPhotos(n); } }); }); })
      .observe(document.body, { childList: true, subtree: true });
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
