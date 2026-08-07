// Reva Group — util bersama: API, auth token, tracker internal, loader pixel marketing.
// Dimuat di semua halaman SEBELUM main.js / akun.js / admin.js / reservasi.js.

(() => {
  const API = "https://revagroup-api.salehasrori.workers.dev";

  // ---------- auth helpers ----------
  const RVA = {
    API,
    token: () => localStorage.getItem("rva_token") || "",
    user: () => {
      try { return JSON.parse(localStorage.getItem("rva_user") || "null"); } catch { return null; }
    },
    setAuth: (token, user) => {
      localStorage.setItem("rva_token", token);
      localStorage.setItem("rva_user", JSON.stringify(user));
    },
    setUser: (user) => localStorage.setItem("rva_user", JSON.stringify(user)),
    clearAuth: () => {
      localStorage.removeItem("rva_token");
      localStorage.removeItem("rva_user");
    },
    authFetch: (path, opts = {}) => {
      // X-Requested-With: header khusus yang tidak bisa dipasang formulir lintas
      // situs — lapis tambahan anti-CSRF, sejalan standar Albalad.
      const headers = Object.assign(
        { "Content-Type": "application/json", "X-Requested-With": "RevaGroup" },
        opts.headers || {}
      );
      const t = RVA.token();
      if (t) headers["Authorization"] = "Bearer " + t;
      return fetch(API + path, Object.assign({}, opts, { headers }));
    },
    isStaff: () => {
      const u = RVA.user();
      return !!u && (u.role === "admin" || u.role === "owner");
    },
  };
  window.RVA = RVA;

  // ---------- tracker internal ----------
  function vid() {
    let v = localStorage.getItem("rva_vid");
    if (!v) {
      v = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("rva_vid", v);
    }
    return v;
  }

  function utmString() {
    const p = new URLSearchParams(location.search);
    const parts = [];
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) {
      if (p.get(k)) parts.push(k.replace("utm_", "") + "=" + p.get(k));
    }
    return parts.join("&");
  }

  RVA.track = (type, path) => {
    try {
      const body = JSON.stringify({
        type,
        path: path || location.pathname,
        ref: document.referrer || "",
        utm: utmString(),
        vid: vid(),
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API + "/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch(API + "/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
      }
    } catch (e) { /* tracking tidak boleh mengganggu halaman */ }
  };

  // pageview sekali per muat halaman — kunjungan panel admin tidak dihitung
  // agar statistik trafik tetap mencerminkan pengunjung asli.
  if (!/admin\.html$/.test(location.pathname)) RVA.track("pageview");

  // klik tautan WhatsApp
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href*="wa.me"]');
    if (a) {
      RVA.track("wa_click");
      RVA.fireMarketing("wa_click", {});
    }
  });

  // ---------- pixel marketing (GA4 / Meta / TikTok) ----------
  let pixels = { ga4: false, meta: false, tiktok: false };

  RVA.fireMarketing = (eventName, params) => {
    try {
      if (pixels.ga4 && window.gtag) gtag("event", eventName, params || {});
      if (pixels.meta && window.fbq) fbq("trackCustom", eventName, params || {});
      if (pixels.tiktok && window.ttq) ttq.track(eventName, params || {});
    } catch (e) { /* abaikan */ }
  };

  function loadGa4(id) {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", id);
    pixels.ga4 = true;
  }

  function loadMeta(id) {
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", id);
    fbq("track", "PageView");
    pixels.meta = true;
  }

  function loadTiktok(id) {
    !(function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = (w[t] = w[t] || []);
      ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
      ttq.setAndDefer = function (t2, e) { t2[e] = function () { t2.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.load = function (e, n) {
        var i2 = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i2; ttq._t = ttq._t || {}; ttq._t[e] = +new Date();
        ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        var o = document.createElement("script"); o.type = "text/javascript"; o.async = !0; o.src = i2 + "?sdkid=" + e + "&lib=" + t;
        var a = document.getElementsByTagName("script")[0]; a.parentNode.insertBefore(o, a);
      };
      ttq.load(id);
      ttq.page();
    })(window, document, "ttq");
    pixels.tiktok = true;
  }

  async function loadPixels() {
    try {
      let cfg = null;
      const cached = sessionStorage.getItem("rva_pixels");
      if (cached) {
        const c = JSON.parse(cached);
        if (Date.now() - c.t < 10 * 60 * 1000) cfg = c.s;
      }
      if (!cfg) {
        const res = await fetch(API + "/public/settings");
        cfg = (await res.json()).settings || {};
        sessionStorage.setItem("rva_pixels", JSON.stringify({ t: Date.now(), s: cfg }));
      }
      if (cfg.ga4_id) loadGa4(cfg.ga4_id);
      if (cfg.meta_pixel_id) loadMeta(cfg.meta_pixel_id);
      if (cfg.tiktok_pixel_id) loadTiktok(cfg.tiktok_pixel_id);
      RVA.publicSettings = cfg;
      document.dispatchEvent(new CustomEvent("rva:settings", { detail: cfg }));
    } catch (e) { /* situs tetap jalan tanpa pixel */ }
  }
  loadPixels();

  // ---------- status login di header ----------
  // Belum login → tombol header mengarah ke masuk.html; sudah login → akun.html + nama depan.
  function initHeader() {
    const u = RVA.user();
    const pill = document.querySelector("a.nav-pill.outline");
    const label = document.querySelector(".nav-akun-label");
    const mob = document.querySelector('.nav-mobile a[href="akun.html"]');
    if (u) {
      if (label) label.textContent = (u.name || "Akun").split(" ")[0];
      if (mob) mob.textContent = "Akun: " + (u.name || "").split(" ")[0];
    } else {
      if (pill) pill.setAttribute("href", "masuk.html");
      if (mob) { mob.setAttribute("href", "masuk.html"); mob.textContent = "Masuk"; }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeader);
  } else {
    initHeader();
  }
})();
