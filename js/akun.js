// Halaman Akun — profil dan riwayat pesanan (login/daftar ada di masuk.html & daftar.html).
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

  // belum login → arahkan ke halaman masuk
  if (!RVA.token()) {
    location.replace("masuk.html");
    return;
  }

  function showAlert(el, msg, ok) {
    el.textContent = msg;
    el.className = "form-alert " + (ok ? "ok" : "error");
    el.hidden = false;
  }

  async function render() {
    try {
      const res = await RVA.authFetch("/me");
      if (!res.ok) throw new Error();
      const { user } = await res.json();
      RVA.setUser(user);
      showProfile(user);
      loadOrders();
    } catch {
      RVA.clearAuth();
      location.replace("masuk.html");
    }
  }

  function showProfile(user) {
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
        </div>`;
      }).join("");
    } catch {
      wrap.innerHTML = '<p class="order-meta">Gagal memuat pesanan — coba muat ulang halaman.</p>';
    }
  }

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
      // Ganti password menggugurkan token lama; server mengirim token pengganti
      // agar sesi di perangkat ini tetap hidup (perangkat lain otomatis keluar).
      if (data.token) RVA.setAuth(data.token, data.user);
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
    location.replace("masuk.html");
  });

  render();
})();
