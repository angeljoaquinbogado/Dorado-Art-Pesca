/* DORADO — Vercel observability loader
   Loads Web Analytics + Speed Insights on public pages.
   Safe to include once; both SDKs guard against duplicate initialization. */
(() => {
  "use strict";

  const load = (src, id) => {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.defer = true;
    script.src = src;
    document.head.appendChild(script);
  };

  // Queue APIs so calls made before the SDK finishes loading are preserved.
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  window.si = window.si || function () {
    (window.siq = window.siq || []).push(arguments);
  };

  load("/_vercel/insights/script.js", "vercel-web-analytics");
  load("/_vercel/speed-insights/script.js", "vercel-speed-insights");
})();