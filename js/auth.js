// Halaman Masuk & Daftar — form terpisah, plus tombol Login Google
// (muncul otomatis bila google_client_id diisi di Pengaturan admin).
// Bergantung pada window.RVA dari js/site.js.

(() => {
  const $ = (s) => document.querySelector(s);

  // sudah login? langsung ke halaman akun
  if (RVA.token() && RVA.user()) {
    location.replace("akun.html");
    return;
  }

  function showAlert(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function finishAuth(data) {
    RVA.setAuth(data.token, data.user);
    // kembali ke halaman tujuan bila valid, default ke akun
    const next = new URLSearchParams(location.search).get("next");
    const allowed = ["akun.html", "admin.html", "reservasi.html", "index.html"];
    location.replace(allowed.includes(next) ? next : "akun.html");
  }

  // ---------- masuk ----------
  const formLogin = $("#formLogin");
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#btnLogin");
      btn.disabled = true; btn.textContent = "Memproses…";
      try {
        const res = await fetch(RVA.API + "/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: $("#loginIdent").value, password: $("#loginPass").value }),
        });
        const data = await res.json();
        if (!res.ok) return showAlert($("#loginAlert"), data.error ? data.error.message : "Gagal masuk.");
        finishAuth(data);
      } catch {
        showAlert($("#loginAlert"), "Tidak dapat terhubung ke server.");
      } finally {
        btn.disabled = false; btn.textContent = "Masuk";
      }
    });
  }

  // ---------- daftar ----------
  const formRegister = $("#formRegister");
  if (formRegister) {
    formRegister.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("#btnRegister");
      btn.disabled = true; btn.textContent = "Memproses…";
      try {
        const res = await fetch(RVA.API + "/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: $("#regName").value,
            email: $("#regEmail").value,
            wa: $("#regWa").value,
            password: $("#regPass").value,
          }),
        });
        const data = await res.json();
        if (!res.ok) return showAlert($("#regAlert"), data.error ? data.error.message : "Gagal daftar.");
        finishAuth(data);
      } catch {
        showAlert($("#regAlert"), "Tidak dapat terhubung ke server.");
      } finally {
        btn.disabled = false; btn.textContent = "Daftar";
      }
    });
  }

  // ---------- Login Google ----------
  function initGoogle(cfg) {
    const clientId = cfg && cfg.google_client_id;
    const wrap = $("#googleWrap");
    if (!clientId || !wrap) return;
    // pemisah "atau"
    const sep = document.createElement("p");
    sep.style.cssText = "text-align:center;font-size:.72rem;color:#9CA3AF;margin:0;";
    sep.textContent = "— atau —";
    wrap.parentNode.insertBefore(sep, wrap);

    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      if (!window.google || !google.accounts) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          const alertEl = $("#loginAlert") || $("#regAlert");
          try {
            const res = await fetch(RVA.API + "/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: resp.credential }),
            });
            const data = await res.json();
            if (!res.ok) return showAlert(alertEl, data.error ? data.error.message : "Login Google gagal.");
            finishAuth(data);
          } catch {
            showAlert(alertEl, "Tidak dapat terhubung ke server.");
          }
        },
      });
      google.accounts.id.renderButton(wrap, { theme: "outline", size: "large", text: "continue_with", width: 280 });
    };
    document.head.appendChild(s);
  }
  if (window.RVA && RVA.publicSettings) initGoogle(RVA.publicSettings);
  else document.addEventListener("rva:settings", (e) => initGoogle(e.detail));
})();
