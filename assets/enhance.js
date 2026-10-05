/* Enhance: reader aids that sit on top of the rendered page.
   Loaded by assets/traction.js, so index.html does not need to change.

   1. Glossary — the first time a technical term appears, it gets a dotted
      underline and a plain-language explanation on hover, tap or keyboard focus.
      Edit, add or remove terms in the TERMS list below.
   2. Back to top — a small button that appears once the reader has scrolled.
   3. Photo strips — photos listed in /photos.json are added to the sections they
      belong to, with captions, lazy loading and click-to-enlarge.

   Nothing here changes the words of the site: that stays in content.json. */
(function () {
  "use strict";

  /* ---------- 1. glossary ---------- */
  /* term: [what it matches, the plain explanation]. Keep explanations to one or two short sentences. */
  var TERMS = [
    ["aerobic granular sludge", "Wastewater-treating microbes that grow as dense, sand-like grains instead of loose flakes. The grains sink quickly, so the treatment tank can be much smaller."],
    ["granular sludge", "Wastewater-treating microbes that grow as dense, sand-like grains instead of loose flakes."],
    ["curdlan", "A gel-forming sugar made by bacteria (a β-1,3-glucan). It is used as a thickener and gelling agent in food, and is being studied for medical and materials uses."],
    ["biopolymer", "A large, useful molecule made by living things — starch, cellulose and curdlan are all biopolymers."],
    ["extracellular polymeric substances", "The sticky mix of sugars and proteins that microbes build around themselves. It is what holds a granule together."],
    ["EPS", "Extracellular polymeric substances: the sticky mix of sugars and proteins microbes build around themselves, which holds a granule together."],
    ["flocs", "Loose, fluffy clumps of microbes in wastewater. They settle slowly, which is why granules are so useful."],
    ["aeration", "Blowing air through the tank. It feeds the microbes oxygen and keeps everything mixed."],
    ["circular economy", "Keeping materials in use — repairing, reusing and recovering them — instead of making, using and throwing away."],
    ["resource recovery", "Getting something useful back out of a waste stream instead of paying to dispose of it."],
    ["industrial symbiosis", "An arrangement where one factory's waste, heat or by-product becomes the raw material for another."],
    ["net zero", "Cutting greenhouse gas emissions as far as possible, then balancing what is left by removing the same amount from the air."],
    ["life cycle assessment", "A method for adding up the environmental effects of a product across its whole life, from raw material to disposal."],
    ["environmental impact assessment", "A formal study of how a planned project would affect people and the environment, usually required before it can be approved."],
    ["techno-economic assessment", "A study of whether a technology can pay for itself: what it costs to build and run, and what it brings in."],
    ["climate-smart agriculture", "Farming that raises yields while coping with a changing climate and cutting emissions where it can."],
    ["preprint", "A research paper shared publicly before peer review is finished."],
    ["peer review", "Checking by independent experts in the same field before a paper is published."],
    ["eco-industrial park", "An industrial estate designed so that businesses share energy, water and by-products with each other."]
  ];
  var MAX_PER_TERM = 2;        /* mark at most this many occurrences of each term */
  var SKIP = /^(A|SCRIPT|STYLE|CANVAS|BUTTON|CODE|H1|H2|TIME|TEXTAREA|INPUT|SELECT|OPTION|SVG|ABBR)$/;
  /* places where a dotted underline would just be noise */
  var SKIP_CLASS = ["gloss", "no-gloss", "keywords", "nav", "sdgs", "aud", "subjects", "kit-text", "tag", "kind", "chip"];

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  /* light formatting for captions: **bold**, *italic*, [text](url) */
  function fmt(t) {
    var out = esc(t);
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, txt, u) {
      u = String(u).replace(/&amp;/g, "&");
      if (!/^(https?:|mailto:|\/|#)/i.test(u)) return txt;
      return '<a href="' + esc(u) + '"' + (/^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : '') + '>' + txt + "</a>";
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    return out;
  }

  function rx(term) {
    return new RegExp("(^|[^\\w-])(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![\\w-])", term.length <= 4 ? "" : "i");
  }

  function markTerms(root) {
    var counts = {};
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || n.nodeValue.length < 3) return NodeFilter.FILTER_REJECT;
        for (var p = n.parentNode; p && p !== root; p = p.parentNode) {
          if (p.nodeType === 1 && SKIP.test(p.tagName)) return NodeFilter.FILTER_REJECT;
          if (p.nodeType === 1) {
            for (var c = 0; c < SKIP_CLASS.length; c++) if (p.classList.contains(SKIP_CLASS[c])) return NodeFilter.FILTER_REJECT;
          }
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);

    nodes.forEach(function (node) {
      for (var i = 0; i < TERMS.length; i++) {
        var term = TERMS[i][0], def = TERMS[i][1];
        if ((counts[term] || 0) >= MAX_PER_TERM) continue;
        var m = rx(term).exec(node.nodeValue);
        if (!m) continue;
        var start = m.index + m[1].length;
        var after = node.splitText(start);
        after.splitText(m[2].length);
        var mark = document.createElement("span");
        mark.className = "gloss";
        mark.setAttribute("tabindex", "0");
        mark.setAttribute("role", "button");
        mark.setAttribute("aria-label", m[2] + ": " + def);
        mark.dataset.def = def;
        mark.dataset.term = m[2];
        mark.textContent = after.nodeValue;
        after.parentNode.replaceChild(mark, after);
        counts[term] = (counts[term] || 0) + 1;
        return; /* one mark per text node keeps the page calm */
      }
    });
    return counts;
  }

  var tip, tipFor;
  function hideTip() {
    if (tip) { tip.hidden = true; }
    if (tipFor) { tipFor.setAttribute("aria-expanded", "false"); tipFor = null; }
  }
  function showTip(el) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "gloss-tip";
      tip.setAttribute("role", "tooltip");
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    tip.innerHTML = '<b>' + esc(el.dataset.term) + '</b>' + esc(el.dataset.def) +
      '<span class="gloss-tip-note">Plain-language note</span>';
    tip.hidden = false;
    var r = el.getBoundingClientRect();
    var w = Math.min(320, window.innerWidth - 24);
    tip.style.width = w + "px";
    var left = Math.min(Math.max(12, r.left + window.scrollX - 8), window.scrollX + window.innerWidth - w - 12);
    var th = tip.offsetHeight;
    var above = r.top > th + 16;
    tip.style.left = left + "px";
    tip.style.top = (above ? r.top + window.scrollY - th - 10 : r.bottom + window.scrollY + 10) + "px";
    el.setAttribute("aria-expanded", "true");
    tipFor = el;
    if (window.SiteTrack) window.SiteTrack("glossary-opened", "Opened a plain-language note", true);
  }

  function wireGlossary() {
    document.addEventListener("pointerover", function (e) {
      var g = e.target.closest && e.target.closest(".gloss");
      if (g && g !== tipFor) showTip(g);
    });
    document.addEventListener("pointerout", function (e) {
      var g = e.target.closest && e.target.closest(".gloss");
      if (g && g === tipFor && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".gloss-tip"))) hideTip();
    });
    document.addEventListener("click", function (e) {
      var g = e.target.closest && e.target.closest(".gloss");
      if (g) { e.preventDefault(); g === tipFor ? hideTip() : showTip(g); return; }
      if (!(e.target.closest && e.target.closest(".gloss-tip"))) hideTip();
    });
    document.addEventListener("focusin", function (e) {
      var g = e.target.closest && e.target.closest(".gloss");
      if (g) showTip(g); else if (!(e.target.closest && e.target.closest(".gloss-tip"))) hideTip();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hideTip();
      if ((e.key === "Enter" || e.key === " ") && document.activeElement && document.activeElement.classList.contains("gloss")) {
        e.preventDefault(); document.activeElement === tipFor ? hideTip() : showTip(document.activeElement);
      }
    });
    window.addEventListener("scroll", hideTip, { passive: true });
    window.addEventListener("resize", hideTip);
  }

  /* ---------- 2. back to top ---------- */
  function backToTop() {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "to-top";
    b.setAttribute("aria-label", "Back to top");
    b.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 13V3.5M3.5 8 8 3.4 12.5 8"/></svg><span>Top</span>';
    b.addEventListener("click", function () {
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      var skip = document.querySelector(".mark");
      if (skip) skip.focus({ preventScroll: true });
    });
    document.body.appendChild(b);
    var show = function () { b.classList.toggle("on", window.scrollY > 700); };
    window.addEventListener("scroll", show, { passive: true });
    show();
  }


  /* ---------- 3. photos, placed next to what they show ---------- */
  /* Photos live in /photos.json, so they can be added without touching this file:
     { "research": { "items": [
         { "src": "/images/x.jpg", "alt": "...", "caption": "...",
           "anchor": "A motorised hand-held rice harvester",   // text from the card it belongs beside
           "focus": "50% 30%",                                  // which part of the photo to keep when cropped
           "ratio": "4/3" } ] } }
     The key is the section's link ID (research, work, resources, teaching …).
     anchor: part of a card's title puts the photo inside that card; "body" puts it after the
     section's opening text; leaving it out puts it at the end of the section.
     Every photo is cropped to the same shape so rows stay even — set "focus" if a crop cuts
     off the wrong part, or "ratio" for a photo that deserves its own shape. */
  function photoStrips() {
    fetch("/photos.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data) placePhotos(data); })
      .catch(function () { /* no photos file yet: nothing to do */ });
  }

  function figureFor(p) {
    var fig = document.createElement("figure");
    fig.className = "shot";
    var img = document.createElement("img");
    img.src = p.src;
    img.style.aspectRatio = p.ratio || "4 / 3";
    if (p.focus) img.style.objectPosition = p.focus;
    img.alt = p.alt || p.caption || "";
    img.loading = "lazy";
    img.decoding = "async";
    fig.appendChild(img);
    if (p.caption) {
      var cap = document.createElement("figcaption");
      cap.innerHTML = fmt(p.caption);
      fig.appendChild(cap);
    }
    fig.tabIndex = 0;
    fig.setAttribute("role", "button");
    fig.setAttribute("aria-label", "Enlarge photo: " + (p.alt || p.caption || "photo"));
    fig.addEventListener("click", function () { openShot(p); });
    fig.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openShot(p); }
    });
    return fig;
  }

  /* find the card inside a section whose heading contains the anchor text */
  function cardFor(sec, anchor) {
    var want = String(anchor).toLowerCase();
    var heads = sec.querySelectorAll("h3");
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].textContent.toLowerCase().indexOf(want) > -1) {
        return heads[i].closest("article, .proj, .res-card, .quote") || heads[i].parentNode;
      }
    }
    return null;
  }

  function placePhotos(data) {
    Object.keys(data).forEach(function (id) {
      var sec = document.getElementById(id);
      var group = data[id] || {};
      var items = (group.items || []).filter(function (p) { return p && p.src && !p.hidden; });
      if (!sec || !items.length) return;
      var body = sec.children[1] || sec;

      /* keep photos that name the same anchor together */
      var groups = {}, order = [];
      items.forEach(function (p) {
        var key = p.anchor || "";
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(p);
      });

      order.forEach(function (key) {
        var list = groups[key];
        var wrap = document.createElement("div");
        wrap.className = "shots" + (list.length === 1 ? " one" : "");
        var grid = document.createElement("div");
        grid.className = "shots-grid";
        list.forEach(function (p) { grid.appendChild(figureFor(p)); });
        wrap.appendChild(grid);

        var card = key && key !== "body" && key !== "end" ? cardFor(sec, key) : null;
        if (card) {
          wrap.classList.add("in-card");
          var foot = card.querySelector(".res-foot");           /* tool cards keep their link last */
          if (foot) card.insertBefore(wrap, foot); else card.appendChild(wrap);
          return;
        }
        if (key === "body") {
          var prose = sec.querySelector(".prose, .lede");
          wrap.classList.add("beside-text");
          if (prose && prose.parentNode) { prose.parentNode.insertBefore(wrap, prose.nextSibling); return; }
        }
        if (group.title) {
          var h = document.createElement("p");
          h.className = "shots-title mono";
          h.textContent = group.title;
          wrap.insertBefore(h, grid);
        }
        body.appendChild(wrap);
      });
    });
  }

  var shotBox;
  function openShot(p) {
    if (!shotBox) {
      shotBox = document.createElement("div");
      shotBox.className = "shot-box";
      shotBox.setAttribute("role", "dialog");
      shotBox.setAttribute("aria-modal", "true");
      shotBox.innerHTML = '<button type="button" class="shot-x" aria-label="Close">\u00d7</button><img alt=""><p></p>';
      document.body.appendChild(shotBox);
      shotBox.addEventListener("click", function (e) {
        if (e.target === shotBox || e.target.classList.contains("shot-x")) closeShot();
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeShot(); });
    }
    var img = shotBox.querySelector("img");
    img.src = p.src; img.alt = p.alt || p.caption || "";
    shotBox.querySelector("p").innerHTML = fmt(p.caption || "");
    shotBox.classList.add("on");
    document.documentElement.style.overflow = "hidden";
    shotBox.querySelector(".shot-x").focus();
    if (window.SiteTrack) window.SiteTrack("photo-opened", "Enlarged a photo", true);
  }
  function closeShot() {
    if (!shotBox) return;
    shotBox.classList.remove("on");
    document.documentElement.style.overflow = "";
  }

  /* ---------- styles ---------- */
  var CSS =
    ".gloss{border-bottom:1px dotted color-mix(in srgb,var(--accent,#1D6A5A) 70%,transparent);cursor:help;background:none;padding:0}" +
    ".gloss:hover{border-bottom-style:solid;color:var(--accent,#1D6A5A)}" +
    ".gloss:focus-visible{outline:2px solid var(--accent,#1D6A5A);outline-offset:2px;border-radius:2px}" +
    ".gloss-tip{position:absolute;z-index:120;background:var(--card,#F6F5EE);color:var(--ink,#17201C);border:1px solid var(--rule,#CAC9B8);border-radius:6px;padding:12px 14px;" +
      "font:15px/1.5 var(--sans,system-ui);box-shadow:0 10px 30px rgba(0,0,0,.14);max-width:min(320px,calc(100vw - 24px))}" +
    ".gloss-tip b{display:block;font:600 13px/1.3 var(--sans,system-ui);margin-bottom:4px}" +
    ".gloss-tip-note{display:block;margin-top:8px;font-family:var(--mono,ui-monospace);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5B635D)}" +
    ".shots{margin-top:28px}" +
    ".shots.in-card{margin-top:auto;padding-top:14px}" +
    ".shots.beside-text{margin-top:32px;max-width:760px}" +
    ".shots.in-card .shot figcaption{font-size:12.5px}" +
    ".shots-title{color:var(--muted,#5B635D);text-transform:uppercase;margin:0 0 12px}" +
    ".shots-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px;align-items:start}" +
    ".shots.one .shots-grid{grid-template-columns:minmax(0,1fr)}" +
    ".shots.beside-text.one .shots-grid{grid-template-columns:minmax(0,620px)}" +
    ".shot{margin:0;cursor:zoom-in}" +
    ".shot img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;object-position:50% 50%;border:1px solid var(--rule,#CAC9B8);border-radius:3px;background:var(--card,#F6F5EE)}" +
    ".shot figcaption{margin-top:8px;font-size:13.5px;line-height:1.5;color:var(--muted,#5B635D)}" +
    ".shot:hover img{border-color:var(--accent,#1D6A5A)}" +
    ".shot:focus-visible{outline:2px solid var(--accent,#1D6A5A);outline-offset:4px;border-radius:4px}" +
    ".shot-box{position:fixed;inset:0;z-index:200;display:none;place-items:center;gap:14px;padding:24px;background:rgba(10,18,17,.82);backdrop-filter:blur(3px)}" +
    ".shot-box.on{display:grid}" +
    ".shot-box img{max-width:min(1100px,92vw);max-height:76vh;object-fit:contain;border-radius:4px;background:#000}" +
    ".shot-box p{max-width:min(760px,92vw);color:#F4F3EC;font:15px/1.55 var(--sans,system-ui);text-align:center;margin:0}" +
    ".shot-x{position:absolute;top:14px;right:16px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.35);color:#fff;font-size:22px;line-height:1;cursor:pointer}" +
    ".shot-x:hover{border-color:#fff}" +
    "@media print{.shot-box{display:none!important}.shot{break-inside:avoid}}" +
    ".to-top{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:90;" +
      "display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;border:1px solid var(--rule,#CAC9B8);" +
      "background:var(--card,#F6F5EE);color:var(--ink,#17201C);font:500 13px var(--sans,system-ui);cursor:pointer;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.12);opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .2s,border-color .15s}" +
    ".to-top.on{opacity:1;transform:none;pointer-events:auto}" +
    ".to-top:hover{border-color:var(--accent,#1D6A5A);color:var(--accent,#1D6A5A)}" +
    ".to-top svg{width:14px;height:14px}" +
    "@media (max-width:560px){.to-top span{display:none}.to-top{padding:11px}}" +
    "@media (prefers-reduced-motion:reduce){.to-top{transition:none}}" +
    "@media print{.to-top,.gloss-tip{display:none!important}.gloss{border-bottom:0}}";

  function addStyles() {
    var st = document.createElement("style");
    st.id = "enhance-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- start once the page has rendered its sections ---------- */
  function run() {
    var main = document.getElementById("top");
    if (!main) return;
    addStyles();
    markTerms(main);
    wireGlossary();
    backToTop();
    photoStrips();
  }

  function whenReady() {
    var main = document.getElementById("top");
    if (main && main.querySelector("section")) { run(); return; }
    var mo = new MutationObserver(function () {
      var m = document.getElementById("top");
      if (m && m.querySelector("section")) { mo.disconnect(); run(); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 15000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", whenReady);
  else whenReady();
})();
