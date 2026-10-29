// LARA: report crashes in the visitor's browser, and send "Report a problem" messages.
// Loaded before app.js so it also catches errors that stop the app from starting.
// Sends only the error text, the screen, the browser and the language: never names, emails or page content.
(function () {
  var CFG = window.LARA_CONFIG || {};
  var KEY = CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_KEY || "";
  var URL_ = (CFG.SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/feedback";
  var ok = !!(CFG.SUPABASE_URL && KEY && /^https:/.test(CFG.SUPABASE_URL));

  function context() {
    var lang = "";
    try { lang = (window.LARA_I18N && window.LARA_I18N.lang) || document.documentElement.lang || ""; } catch (e) {}
    return { page: (location.hash || "#request").slice(0, 60), browser: navigator.userAgent.slice(0, 300), lang: lang };
  }

  // body: { action, ... }; token: optional signed-in user's access token
  window.LARA_FEEDBACK = function (body, token) {
    if (!ok) return Promise.resolve({ error: "not_connected" });
    var c = context(), payload = {};
    for (var k in c) payload[k] = c[k];
    for (var k2 in body) payload[k2] = body[k2];
    return fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + (token || KEY) },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return r.ok ? { data: j } : { error: j.error || "Something went wrong. Please try again." }; });
    }).catch(function () { return { error: "Couldn't reach LARA. Check your connection and try again." }; });
  };

  // ---- automatic error reports ----
  var sent = {}, count = 0;
  var here = location.origin + location.pathname.replace(/[^/]*$/, "");
  function ours(src) { return !src || src.indexOf(here) === 0 || src.indexOf("supabase") >= 0 || src.indexOf("jsdelivr") >= 0; }
  function report(message, source, file) {
    message = String(message || "").slice(0, 500);
    if (!message || /ResizeObserver loop|Script error\.?$|Failed to fetch|NetworkError|Load failed|network connection was lost/.test(message)) return; // harmless browser noise
    if (!ours(file === undefined ? source : file)) return; // ignore browser extensions and other sites' scripts
    var key = message + "|" + source;
    if (sent[key] || count >= 5) return;
    sent[key] = 1; count++;
    window.LARA_FEEDBACK({ action: "error", message: message, source: String(source || "").replace(here, "").slice(0, 300) });
  }
  window.addEventListener("error", function (e) {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      var s = e.target.src || e.target.href;
      if (/\.(js|mjs)(\?|$)/.test(s)) report("Could not load " + s.replace(here, ""), s); // a script failed to load
      return;
    }
    report(e.message, (e.filename || "") + (e.lineno ? ":" + e.lineno + ":" + (e.colno || 0) : ""), e.filename || "");
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason || {};
    var stack = String(r.stack || "");
    var m = stack.match(/(https?:\/\/[^\s)]+):\d+:\d+/);
    report("Unhandled: " + (r.message || String(r)), m ? m[0] : "", m ? m[1] : "");
  });
})();
