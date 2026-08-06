// Halaman Akun — login, daftar, profil, dan riwayat pesanan.
// Bergantung pada window.RVA dari js/site.js.

(() => {
  const $ = (s) => document.querySelector(s);
  const STATUS_LABEL = {
    menunggu_verifikasi: "Menunggu Verifikasi",
    terkonfirmasi: "Terkonfirmasi",
    qr_terkirim: "QR Terkirim",
    dibatalkan: "Dibatalkan",
    refund: "Refund",
  };
  const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

  function showAlert(el, msg, ok) {
    el.textContent = msg;
    el.className = "form-alert " + (ok ? "ok" : "error");
    el.hidden = false;
  }

  // ---------- render halaman sesuai status login ----------
  async function render() {
    const token = RVA.token();
    if (!token) return showAuth();
    // validasi token ke server
    try {
      const res = await RVA.authFetch("/me");
      if (!res.ok) throw new Error();
      const { user } = await res.json();
      RVA.setUser(user);
      showProfile(user);
      loadOrders();
    } catch {
      RVA.clearAuth();
      showAuth();
    }
  }

  function showAuth() {
    $("#authSection").hidden = false;
    $("#profileSection").hidden = true;
    $("#pageSub").textContent = "Masuk untuk melihat profil dan status pesanan reservasi Rawdah Anda.";
  }

  function showProfile(user) {
    $("#authSection").hidden = true;
    $("#profileSection").hidden = false;
    $("#pageSub").textContent = "Assalamu'alaikum, " + (user.name || "").split(" ")[0] + " 👋";
    $("#pfName").textContent = user.name || "—";
    $("#pfEmail").textContent = user.email || "—";
    $("#pfWa").textContent = user.wa ? "0" + String(user.wa).slice(2) : "— (lengkapi!)";
    $("#pfRole").textContent = user.role === "owner" ? "Owner" : user.role === "admin" ? "Admin" : "Jamaah";
    $("#btnAdminLink").hidden = !(user.role === "owner" || user.role === "admin");
    $("#editName").value = user.name || "";
    $("#editWa").value = user.wa ? "0" + String(user.wa).slice(2) : "";
    const label = document.querySelector(".nav-akun-label");
    if (label) label.textContent = (user.name || "Akun").split(" ")[0];
    // bila daftar via Google tanpa WA, langsung buka form lengkapi profil
    if (!user.wa) {
      $("#editCard").hidden = false;
      showAlert($("#editAlert"), "Lengkapi nomor WhatsApp aktif Anda — QR kunjungan dikirim ke nomor ini.", false);
    }
  }

  async function loadOrders() {
    const wrap = $("#ordersList");
    try {
      const res = await RVA.authFetch("/me/orders");
      const { orders } = await res.json();
      if (!orders || !orders.length) {
        wrap.innerHTML = '<p class="order-meta">Belum ada pesanan. Yuk buat reservasi pertama Anda!</p>';
        return;
      }
      wrap.innerHTML = orders.map((o) => {
        const [y, m, d] = o.date_key.split("-");
        return `
        <div class="order-card">
          <div class="order-top">
            <span class="order-code">${o.code}</span>
            <span class="status-badge st-${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
          </div>
          <p class="order-meta">
            Sesi <strong>${o.gender === "female" ? "Wanita" : "Pria"}</strong> &middot;
            <strong>${d}/${m}/${y}</strong> jam <strong>${o.time_slot} WAS</strong> &middot;
            ${o.pax} jamaah &middot; <strong>${rupiah(o.total)}</strong>
          </p>
          <p class="order-meta" style="font-size: 0.7rem;">Dipesan ${o.created_at} UTC</p>
        </div>`;
      }).join("");
    } catch {
      wrap.innerHTML = '<p class="order-meta">Gagal memuat pesanan — coba muat ulang halaman.</p>';
    }
  }

  // ---------- tab ----------
  $("#tabLogin").addEventListener("click", () => {
    $("#tabLogin").classList.add("active");
    $("#tabRegister").classList.remove("active");
    $("#formLogin").hidden = false;
    $("#formRegister").hidden = true;
  });
  $("#tabRegister").addEventListener("click", () => {
    $("#tabRegister").classList.add("active");
    $("#tabLogin").classList.remove("active");
    $("#formRegister").hidden = false;
    $("#formLogin").hidden = true;
  });

  // ---------- login ----------
  $("#formLogin").addEventListener("submit", async (e) => {
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
      if (!res.ok) return showAlert($("#loginAlert"), data.error ? data.error.message : "Gagal masuk.", false);
      RVA.setAuth(data.token, data.user);
      render();
    } catch {
      showAlert($("#loginAlert"), "Tidak dapat terhubung ke server.", false);
    } finally {
      btn.disabled = false; btn.textContent = "Masuk";
    }
  });

  // ---------- daftar ----------
  $("#formRegister").addEventListener("submit", async (e) => {
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
      if (!res.ok) return showAlert($("#regAlert"), data.error ? data.error.message : "Gagal daftar.", false);
      RVA.setAuth(data.token, data.user);
      render();
    } catch {
      showAlert($("#regAlert"), "Tidak dapat terhubung ke server.", false);
    } finally {
      btn.disabled = false; btn.textContent = "Daftar";
    }
  });

  // ---------- ubah profil ----------
  $("#btnEditProfile").addEventListener("click", () => { $("#editCard").hidden = !$("#editCard").hidden; });
  $("#btnCancelEdit").addEventListener("click", () => { $("#editCard").hidden = true; });
  $("#formEdit").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: $("#editName").value, wa: $("#editWa").value };
    const pass = $("#editPass").value;
    if (pass) body.password = pass;
    try {
      const res = await RVA.authFetch("/me", { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) return showAlert($("#editAlert"), data.error ? data.error.message : "Gagal menyimpan.", false);
      RVA.setUser(data.user);
      showAlert($("#editAlert"), "Profil tersimpan ✓", true);
      showProfile(data.user);
      loadOrders();
    } catch {
      showAlert($("#editAlert"), "Tidak dapat terhubung ke server.", false);
    }
  });

  // ---------- keluar ----------
  $("#btnLogout").addEventListener("click", () => {
    RVA.clearAuth();
    location.reload();
  });

  // ---------- Google login (aktif bila google_client_id diisi di Settings admin) ----------
  function initGoogle(cfg) {
    const clientId = cfg && cfg.google_client_id;
    if (!clientId) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      if (!window.google || !google.accounts) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          try {
            const res = await fetch(RVA.API + "/auth/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: resp.credential }),
            });
            const data = await res.json();
            if (!res.ok) return showAlert($("#loginAlert"), data.error ? data.error.message : "Login Google gagal.", false);
            RVA.setAuth(data.token, data.user);
            render();
          } catch {
            showAlert($("#loginAlert"), "Tidak dapat terhubung ke server.", false);
          }
        },
      });
      for (const wrapId of ["googleWrapLogin", "googleWrapReg"]) {
        const wrap = document.getElementById(wrapId);
        if (wrap) google.accounts.id.renderButton(wrap, { theme: "outline", size: "large", text: "continue_with", width: 280 });
      }
    };
    document.head.appendChild(s);
  }
  if (window.RVA && RVA.publicSettings) initGoogle(RVA.publicSettings);
  else document.addEventListener("rva:settings", (e) => initGoogle(e.detail));

  render();
})();
