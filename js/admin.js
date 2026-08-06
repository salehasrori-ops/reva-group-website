// Panel Admin — seluruh antarmuka dibangun di sini, hanya SETELAH server
// memverifikasi bahwa pengguna benar-benar owner/admin. Non-staf tidak pernah
// melihat menu apa pun: langsung dialihkan ke halaman masuk / akun.
// Data tetap dijaga di sisi server (401/403), ini lapisan tampilannya.

(() => {
  const $ = (s) => document.querySelector(s);
  const root = $("#adminRoot");
  const STATUS_LABEL = {
    menunggu_verifikasi: "Menunggu Verifikasi",
    terkonfirmasi: "Terkonfirmasi",
    qr_terkirim: "QR Terkirim",
    dibatalkan: "Dibatalkan",
    refund: "Refund",
  };
  const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let me = null;
  let orderPage = 1;
  let orderTotal = 0;

  function can(perm) {
    if (!me) return false;
    if (me.role === "owner") return true;
    if (me.role !== "admin") return false;
    if (perm === "orders") return true; // admin selalu boleh kelola pesanan
    return (me.perms || "").split(",").includes(perm);
  }

  // ---------- gerbang akses ----------
  async function init() {
    if (!RVA.token()) return location.replace("masuk.html?next=admin.html");
    let user;
    try {
      const res = await RVA.authFetch("/me");
      if (!res.ok) {
        RVA.clearAuth();
        return location.replace("masuk.html?next=admin.html");
      }
      user = (await res.json()).user;
    } catch {
      root.innerHTML = '<div class="auth-wrap"><div class="form-alert error" style="text-align:center;">Tidak dapat terhubung ke server. Coba muat ulang halaman.</div></div>';
      return;
    }
    // bukan staf → keluar tanpa pernah merender apa pun
    if (user.role !== "owner" && user.role !== "admin") {
      RVA.setUser(user);
      return location.replace("akun.html");
    }
    me = user;
    RVA.setUser(user);
    buildUI();
  }

  // ---------- bangun antarmuka ----------
  function buildUI() {
    const panels = [
      { key: "orders", label: "📋 Pesanan" },
      { key: "traffic", label: "📈 Trafik" },
      { key: "settings", label: "⚙️ Pengaturan" },
      { key: "users", label: "👥 Pengguna" },
    ].filter((p) => can(p.key));

    const hello =
      (me.role === "owner" ? "Owner" : "Admin") + ": " + esc(me.name) +
      (me.role === "admin" ? " — akses: pesanan" + (me.perms ? ", " + esc(me.perms.split(",").join(", ")) : "") : "");

    root.innerHTML = `
      <section class="page-hero" style="padding: 2rem 0;">
        <svg class="pattern" aria-hidden="true">
          <defs>
            <pattern id="geo-page" width="56" height="56" patternUnits="userSpaceOnUse">
              <polygon points="32,22 34.5,29.5 42,32 34.5,34.5 32,42 29.5,34.5 22,32 29.5,29.5" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#geo-page)" />
        </svg>
        <div class="container">
          <h1 style="font-size: clamp(1.375rem, 3vw, 1.75rem);">Panel <span style="color: var(--bronze-light);">Admin</span></h1>
          <p style="margin-top: 0.25rem;">${hello}</p>
        </div>
      </section>

      <div class="admin-layout">
        <nav class="admin-nav" id="adminNav">
          ${panels.map((p, i) => `<button type="button" data-panel="${p.key}" class="${i === 0 ? "active" : ""}">${p.label}</button>`).join("")}
        </nav>
        <div class="admin-panel" id="adminPanels">
          ${panels.map((p, i) => panelMarkup(p.key, i === 0)).join("")}
        </div>
      </div>`;

    wireNav();
    if (can("orders")) { wireOrders(); loadOrders(); }
    if (can("traffic")) loadStats();
    if (can("settings")) { wireSettings(); loadSettings(); }
    if (can("users")) { wireUsers(); loadUsers(""); }
  }

  function panelMarkup(key, first) {
    const hide = first ? "" : " hidden";
    if (key === "orders") {
      return `<section id="panel-orders"${hide}>
        <h2>Pesanan</h2>
        <div class="filter-row" style="margin: 1rem 0;">
          <select id="orderFilter">
            <option value="">Semua status</option>
            ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
          <button type="button" class="btn-line" id="btnReloadOrders">Muat Ulang</button>
          <span class="order-meta" id="orderCount"></span>
        </div>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Kode</th><th>Pemesan</th><th>Jadwal</th><th>Pax</th><th>Total</th><th>Status</th><th>Catatan</th></tr></thead>
            <tbody id="orderRows"><tr><td colspan="7">Memuat&hellip;</td></tr></tbody>
          </table>
        </div>
        <div class="filter-row" style="margin-top: 0.75rem;">
          <button type="button" class="btn-line" id="btnPrevPage">&larr; Sebelumnya</button>
          <span class="order-meta" id="pageInfo"></span>
          <button type="button" class="btn-line" id="btnNextPage">Berikutnya &rarr;</button>
        </div>
      </section>`;
    }
    if (key === "traffic") {
      return `<section id="panel-traffic"${hide}>
        <h2>Trafik &amp; Konversi (14 hari)</h2>
        <div class="stat-tiles" style="margin: 1rem 0;">
          <div class="stat-tile"><div class="n" id="stViews">—</div><div class="l">Tampilan halaman</div></div>
          <div class="stat-tile"><div class="n" id="stVisitors">—</div><div class="l">Pengunjung unik</div></div>
          <div class="stat-tile"><div class="n" id="stWaClicks">—</div><div class="l">Klik WhatsApp</div></div>
          <div class="stat-tile"><div class="n" id="stOrders">—</div><div class="l">Pesanan dibuat</div></div>
        </div>
        <div class="bar-chart" id="chartDaily"></div>
        <div class="profile-grid" style="padding: 1.25rem 0 0; grid-template-columns: 1fr; gap: 1rem;">
          <div class="profile-card"><h2>Halaman Terpopuler</h2><div id="topPages" class="order-meta">—</div></div>
          <div class="profile-card"><h2>Sumber Kunjungan (Referrer)</h2><div id="topRefs" class="order-meta">—</div></div>
          <div class="profile-card">
            <h2>Perangkat &amp; Ringkasan Pesanan</h2>
            <div id="deviceStats" class="order-meta">—</div>
            <div id="orderRecap" class="order-meta" style="margin-top: 0.75rem;">—</div>
          </div>
        </div>
      </section>`;
    }
    if (key === "settings") {
      return `<section id="panel-settings"${hide}>
        <h2>Pengaturan Marketing</h2>
        <p class="settings-note" style="margin: 1rem 0;">
          Tempel ID dari masing-masing platform lalu <strong>Simpan</strong> — pixel langsung aktif
          di seluruh halaman situs tanpa perlu edit kode. Kosongkan untuk menonaktifkan.
          <br />&bull; <strong>GA4</strong>: Google Analytics &rarr; Admin &rarr; Data Streams &rarr; Measurement ID (<code>G-XXXXXXXXXX</code>)
          <br />&bull; <strong>Meta Pixel</strong>: Meta Business Suite &rarr; Events Manager &rarr; Pixel ID
          <br />&bull; <strong>TikTok Pixel</strong>: TikTok Ads Manager &rarr; Assets &rarr; Events &rarr; Pixel ID
          <br />&bull; <strong>Google Client ID</strong>: Google Cloud Console &rarr; Credentials &rarr; OAuth 2.0 Client ID (tombol Login Google)
        </p>
        <form class="profile-card" style="display: grid; gap: 0.875rem; max-width: 34rem;" id="formSettings">
          <div class="form-alert" id="settingsAlert" hidden></div>
          <div class="field"><label for="setGa4">Google Tag / GA4 Measurement ID</label><input id="setGa4" type="text" placeholder="G-XXXXXXXXXX" /></div>
          <div class="field"><label for="setMeta">Meta Pixel ID</label><input id="setMeta" type="text" placeholder="123456789012345" /></div>
          <div class="field"><label for="setTiktok">TikTok Pixel ID</label><input id="setTiktok" type="text" placeholder="XXXXXXXXXXXXXXXXXX" /></div>
          <div class="field"><label for="setGoogleClient">Google OAuth Client ID (Login Google)</label><input id="setGoogleClient" type="text" placeholder="xxxx.apps.googleusercontent.com" /></div>
          <button type="submit" class="btn-book" style="width: auto; padding: 0.7rem 1.5rem;">Simpan Pengaturan</button>
        </form>
      </section>`;
    }
    return `<section id="panel-users"${hide}>
      <h2>Pengguna &amp; Akses</h2>
      <p class="settings-note" style="margin: 1rem 0;">
        <strong>Owner</strong> melihat &amp; mengatur semuanya. <strong>Admin</strong> selalu bisa
        mengelola pesanan; centang izin tambahan (Trafik / Pengaturan / Pengguna) untuk membuka
        menu lain. Hanya owner yang dapat mengubah role dan izin.
      </p>
      <div class="filter-row" style="margin-bottom: 1rem;">
        <input type="text" id="userSearch" placeholder="Cari nama / email / WA…" />
        <button type="button" class="btn-line" id="btnSearchUser">Cari</button>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr><th>Pengguna</th><th>Kontak</th><th>Role</th><th>Izin Admin</th></tr></thead>
          <tbody id="userRows"><tr><td colspan="4">Memuat&hellip;</td></tr></tbody>
        </table>
      </div>
    </section>`;
  }

  function wireNav() {
    const btns = document.querySelectorAll("#adminNav button");
    btns.forEach((b) => {
      b.addEventListener("click", () => {
        btns.forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        document.querySelectorAll("#adminPanels > section").forEach((sec) => {
          sec.hidden = sec.id !== "panel-" + b.dataset.panel;
        });
      });
    });
  }

  // ---------- pesanan ----------
  function wireOrders() {
    $("#orderFilter").addEventListener("change", () => { orderPage = 1; loadOrders(); });
    $("#btnReloadOrders").addEventListener("click", loadOrders);
    $("#btnPrevPage").addEventListener("click", () => { if (orderPage > 1) { orderPage--; loadOrders(); } });
    $("#btnNextPage").addEventListener("click", () => {
      if (orderPage < Math.ceil(orderTotal / 20)) { orderPage++; loadOrders(); }
    });
  }

  async function loadOrders() {
    const status = $("#orderFilter").value;
    const tbody = $("#orderRows");
    tbody.innerHTML = '<tr><td colspan="7">Memuat…</td></tr>';
    try {
      const res = await RVA.authFetch(`/admin/orders?page=${orderPage}${status ? "&status=" + status : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      orderTotal = data.total;
      $("#orderCount").textContent = data.total + " pesanan";
      $("#pageInfo").textContent = "Hal. " + data.page + " / " + Math.max(1, Math.ceil(data.total / data.per));
      if (!data.orders.length) {
        tbody.innerHTML = '<tr><td colspan="7">Tidak ada pesanan.</td></tr>';
        return;
      }
      tbody.innerHTML = data.orders.map((o) => {
        const [y, m, d] = o.date_key.split("-");
        const waLocal = "0" + String(o.wa).slice(2);
        const opts = Object.keys(STATUS_LABEL).map((s) =>
          `<option value="${s}" ${s === o.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("");
        return `<tr>
          <td><strong>${esc(o.code)}</strong><br /><span style="color:#9CA3AF;font-size:.68rem;">${esc(o.created_at)} UTC</span></td>
          <td>${esc(o.name)}<br /><a href="https://wa.me/${esc(o.wa)}" style="color:var(--bronze-dark);font-weight:600;">${esc(waLocal)}</a></td>
          <td>${o.gender === "female" ? "Wanita" : "Pria"}<br />${d}/${m}/${y} &middot; ${esc(o.time_slot)} WAS</td>
          <td>${o.pax}</td>
          <td>${rupiah(o.total)}</td>
          <td><select data-id="${o.id}" class="order-status">${opts}</select></td>
          <td><input type="text" class="order-note" data-id="${o.id}" value="${esc(o.note)}" placeholder="Catatan…" style="border:1px solid #E5E7EB;border-radius:.5rem;padding:.35rem .5rem;font-family:inherit;font-size:.72rem;width:9rem;" /></td>
        </tr>`;
      }).join("");
      tbody.querySelectorAll(".order-status").forEach((sel) => {
        sel.addEventListener("change", () => updateOrder(sel.dataset.id, { status: sel.value }, sel));
      });
      tbody.querySelectorAll(".order-note").forEach((inp) => {
        inp.addEventListener("change", () => updateOrder(inp.dataset.id, { note: inp.value }, inp));
      });
    } catch {
      tbody.innerHTML = '<tr><td colspan="7">Gagal memuat pesanan.</td></tr>';
    }
  }

  async function updateOrder(id, body, el) {
    el.disabled = true;
    try {
      const res = await RVA.authFetch("/admin/orders/" + id, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      el.style.outline = "2px solid #10B981";
      setTimeout(() => { el.style.outline = ""; }, 1200);
    } catch {
      el.style.outline = "2px solid #EF4444";
      alert("Gagal menyimpan perubahan pesanan.");
    } finally {
      el.disabled = false;
    }
  }

  // ---------- trafik ----------
  async function loadStats() {
    try {
      const res = await RVA.authFetch("/admin/stats");
      const s = await res.json();
      if (!res.ok) throw new Error();
      const views = s.daily.reduce((a, d) => a + d.views, 0);
      const visitors = s.daily.reduce((a, d) => a + d.visitors, 0);
      const fun = Object.fromEntries(s.funnel.map((f) => [f.type, f.n]));
      $("#stViews").textContent = views.toLocaleString("id-ID");
      $("#stVisitors").textContent = visitors.toLocaleString("id-ID");
      $("#stWaClicks").textContent = (fun.wa_click || 0).toLocaleString("id-ID");
      $("#stOrders").textContent = (fun.order_created || 0).toLocaleString("id-ID");

      const max = Math.max(1, ...s.daily.map((d) => d.views));
      $("#chartDaily").innerHTML = s.daily.map((d) =>
        `<div class="bar" title="${d.d}: ${d.views} tampilan"><i style="height:${Math.round((d.views / max) * 100)}%"></i><span>${d.d.slice(8)}/${d.d.slice(5, 7)}</span></div>`
      ).join("") || '<p class="order-meta" style="margin:auto;">Belum ada data.</p>';

      $("#topPages").innerHTML = s.pages.map((p) => `${esc(p.path || "/")} — <strong>${p.n}</strong>`).join("<br />") || "Belum ada data.";
      $("#topRefs").innerHTML = s.referrers.map((r) => `${esc(r.ref)} — <strong>${r.n}</strong>`).join("<br />") || "Langsung / belum ada referrer.";
      $("#deviceStats").innerHTML = s.devices.map((d) => `${d.device === "mobile" ? "📱 Mobile" : "💻 Desktop"} — <strong>${d.n}</strong>`).join("<br />") || "—";
      $("#orderRecap").innerHTML = s.orders.map((o) =>
        `${STATUS_LABEL[o.status] || o.status}: <strong>${o.n}</strong> (${rupiah(o.amount || 0)})`).join("<br />") || "Belum ada pesanan.";
    } catch {
      $("#topPages").textContent = "Gagal memuat statistik.";
    }
  }

  // ---------- pengaturan ----------
  function wireSettings() {
    $("#formSettings").addEventListener("submit", async (e) => {
      e.preventDefault();
      const alertBox = $("#settingsAlert");
      try {
        const res = await RVA.authFetch("/admin/settings", {
          method: "PUT",
          body: JSON.stringify({
            ga4_id: $("#setGa4").value,
            meta_pixel_id: $("#setMeta").value,
            tiktok_pixel_id: $("#setTiktok").value,
            google_client_id: $("#setGoogleClient").value,
          }),
        });
        if (!res.ok) throw new Error();
        sessionStorage.removeItem("rva_pixels"); // pixel dimuat ulang dengan setting baru
        alertBox.className = "form-alert ok";
        alertBox.textContent = "Pengaturan tersimpan ✓ — aktif di kunjungan berikutnya.";
        alertBox.hidden = false;
      } catch {
        alertBox.className = "form-alert error";
        alertBox.textContent = "Gagal menyimpan pengaturan.";
        alertBox.hidden = false;
      }
    });
  }

  async function loadSettings() {
    try {
      const res = await RVA.authFetch("/admin/settings");
      const { settings } = await res.json();
      $("#setGa4").value = settings.ga4_id || "";
      $("#setMeta").value = settings.meta_pixel_id || "";
      $("#setTiktok").value = settings.tiktok_pixel_id || "";
      $("#setGoogleClient").value = settings.google_client_id || "";
    } catch { /* biarkan kosong */ }
  }

  // ---------- pengguna ----------
  function wireUsers() {
    $("#btnSearchUser").addEventListener("click", () => loadUsers($("#userSearch").value.trim()));
    $("#userSearch").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); loadUsers(e.target.value.trim()); }
    });
  }

  async function loadUsers(q) {
    const tbody = $("#userRows");
    tbody.innerHTML = '<tr><td colspan="4">Memuat…</td></tr>';
    try {
      const res = await RVA.authFetch("/admin/users" + (q ? "?q=" + encodeURIComponent(q) : ""));
      const { users } = await res.json();
      if (!res.ok) throw new Error();
      const isOwner = me.role === "owner";
      tbody.innerHTML = users.map((u) => {
        const roleCell = isOwner && u.role !== "owner"
          ? `<select data-id="${u.id}" class="user-role"><option value="user" ${u.role === "user" ? "selected" : ""}>Jamaah</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option></select>`
          : (u.role === "owner" ? "👑 Owner" : u.role === "admin" ? "Admin" : "Jamaah");
        const permCell = u.role === "admin"
          ? `<div class="perm-checks">${["traffic", "settings", "users"].map((p) => {
              const on = (u.perms || "").split(",").includes(p);
              return `<label><input type="checkbox" data-id="${u.id}" data-perm="${p}" ${on ? "checked" : ""} ${isOwner ? "" : "disabled"} class="perm-box" /> ${p === "traffic" ? "Trafik" : p === "settings" ? "Pengaturan" : "Pengguna"}</label>`;
            }).join("")}</div>`
          : (u.role === "owner" ? "Semua akses" : "—");
        return `<tr>
          <td><strong>${esc(u.name)}</strong><br /><span style="color:#9CA3AF;font-size:.68rem;">#${u.id} · sejak ${esc((u.created_at || "").slice(0, 10))}</span></td>
          <td>${esc(u.email || "—")}<br />${u.wa ? "0" + esc(String(u.wa).slice(2)) : "—"}</td>
          <td>${roleCell}</td>
          <td>${permCell}</td>
        </tr>`;
      }).join("") || '<tr><td colspan="4">Tidak ada pengguna.</td></tr>';

      tbody.querySelectorAll(".user-role").forEach((sel) => {
        sel.addEventListener("change", async () => {
          await patchUser(sel.dataset.id, { role: sel.value }, sel);
          loadUsers($("#userSearch").value.trim());
        });
      });
      tbody.querySelectorAll(".perm-box").forEach((box) => {
        box.addEventListener("change", () => {
          const id = box.dataset.id;
          const perms = [...tbody.querySelectorAll(`.perm-box[data-id="${id}"]`)]
            .filter((b) => b.checked).map((b) => b.dataset.perm).join(",");
          patchUser(id, { perms }, box);
        });
      });
    } catch {
      tbody.innerHTML = '<tr><td colspan="4">Gagal memuat pengguna.</td></tr>';
    }
  }

  async function patchUser(id, body, el) {
    el.disabled = true;
    try {
      const res = await RVA.authFetch("/admin/users/" + id, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ? d.error.message : "Gagal menyimpan.");
      }
    } catch {
      alert("Tidak dapat terhubung ke server.");
    } finally {
      el.disabled = false;
    }
  }

  init();
})();
