// Panel Admin — pesanan, trafik, pengaturan marketing, pengguna & akses.
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
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let me = null;
  let orderPage = 1;
  let orderTotal = 0;

  function can(perm) {
    if (!me) return false;
    if (me.role === "owner") return true;
    if (me.role !== "admin") return false;
    if (perm === "orders") return true;
    return (me.perms || "").split(",").includes(perm);
  }

  // ---------- gate ----------
  async function init() {
    if (!RVA.token()) return deny();
    try {
      const res = await RVA.authFetch("/me");
      if (!res.ok) return deny();
      const data = await res.json();
      me = data.user;
      if (me.role !== "owner" && me.role !== "admin") return deny();
      $("#adminHello").textContent =
        (me.role === "owner" ? "Owner" : "Admin") + ": " + me.name +
        (me.role === "admin" ? " — akses: pesanan" + (me.perms ? ", " + me.perms.split(",").join(", ") : "") : "");
      $("#adminLayout").hidden = false;
      for (const b of document.querySelectorAll("#adminNav button")) {
        const p = b.dataset.panel;
        b.hidden = !can(p);
      }
      loadOrders();
      if (can("traffic")) loadStats();
      if (can("settings")) loadSettings();
      if (can("users")) loadUsers("");
    } catch {
      deny();
    }
  }

  function deny() {
    $("#adminHello").textContent = "Akses ditolak.";
    $("#deniedBox").hidden = false;
  }

  // ---------- navigasi panel ----------
  document.querySelectorAll("#adminNav button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#adminNav button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      for (const p of ["orders", "traffic", "settings", "users"]) {
        $("#panel-" + p).hidden = p !== b.dataset.panel;
      }
    });
  });

  // ---------- pesanan ----------
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
          <td><select data-id="${o.id}" class="order-status st-sel">${opts}</select></td>
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

  $("#orderFilter").addEventListener("change", () => { orderPage = 1; loadOrders(); });
  $("#btnReloadOrders").addEventListener("click", loadOrders);
  $("#btnPrevPage").addEventListener("click", () => { if (orderPage > 1) { orderPage--; loadOrders(); } });
  $("#btnNextPage").addEventListener("click", () => {
    if (orderPage < Math.ceil(orderTotal / 20)) { orderPage++; loadOrders(); }
  });

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
      sessionStorage.removeItem("rva_pixels"); // supaya pixel termuat ulang dengan setting baru
      alertBox.className = "form-alert ok";
      alertBox.textContent = "Pengaturan tersimpan ✓ — pixel aktif dalam beberapa detik di kunjungan berikutnya.";
      alertBox.hidden = false;
    } catch {
      alertBox.className = "form-alert error";
      alertBox.textContent = "Gagal menyimpan pengaturan.";
      alertBox.hidden = false;
    }
  });

  // ---------- pengguna ----------
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
              const dis = isOwner ? "" : "disabled";
              return `<label><input type="checkbox" data-id="${u.id}" data-perm="${p}" ${on ? "checked" : ""} ${dis} class="perm-box" /> ${p === "traffic" ? "Trafik" : p === "settings" ? "Pengaturan" : "Pengguna"}</label>`;
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

  $("#btnSearchUser").addEventListener("click", () => loadUsers($("#userSearch").value.trim()));
  $("#userSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); loadUsers(e.target.value.trim()); } });

  init();
})();
