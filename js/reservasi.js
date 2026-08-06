// Widget Reservasi Rawdah — Reva Group
// Data ketersediaan diambil dari branch `data` repo ini, yang diperbarui otomatis
// setiap ±10 menit oleh GitHub Actions (lihat .github/workflows/availability.yml).
// API key TIDAK pernah ada di sini — hanya di GitHub Secrets.

(() => {
  const DATA_URL = "https://raw.githubusercontent.com/salehasrori-ops/reva-group-website/data/availability.json";
  const PRICE = 165000;
  const WA_NUMBER = "6287708770871";
  const BANK = { name: "BCA", no: "4744188999", holder: "PT. REVA SARIF GROUP" };
  const MAX_PAX_FALLBACK = 10; // batas pax saat slot tidak melaporkan sisa kuota

  const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const HARI_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  const $ = (sel) => document.querySelector(sel);
  const el = {
    panel: $("#slotPanel"),
    panelTitle: $("#panelTitle"),
    btnFemale: $("#btnFemale"),
    btnMale: $("#btnMale"),
    monthTabs: $("#monthTabs"),
    statusPill: $("#statusPill"),
    updatedAt: $("#updatedAt"),
    btnRefresh: $("#btnRefresh"),
    dateStrip: $("#dateStrip"),
    timeList: $("#timeList"),
    paxMinus: $("#paxMinus"),
    paxPlus: $("#paxPlus"),
    paxVal: $("#paxVal"),
    sumSesi: $("#sumSesi"),
    sumTanggal: $("#sumTanggal"),
    sumJam: $("#sumJam"),
    sumPax: $("#sumPax"),
    sumTotal: $("#sumTotal"),
    btnBook: $("#btnBook"),
    errBox: $("#bookingError"),
    widget: $("#bookingWidget"),
    // modal pembayaran
    payModal: $("#payModal"),
    payClose: $("#payClose"),
    payBack: $("#payBack"),
    btnPaid: $("#btnPaid"),
    btnCopy: $("#btnCopy"),
    pmSesi: $("#pmSesi"),
    pmTanggal: $("#pmTanggal"),
    pmJam: $("#pmJam"),
    pmPax: $("#pmPax"),
    pmTotal: $("#pmTotal"),
    payName: $("#payName"),
    payWa: $("#payWa"),
    payAlert: $("#payAlert"),
  };

  const state = {
    data: null,          // {generatedAt, days: {date: {male: [[time,count,flag]], female: ...}}}
    gender: "female",
    months: [],          // [{y, m}] — 3 bulan mulai bulan berjalan
    monthIdx: 0,
    date: null,          // "yyyy-mm-dd"
    time: null,          // "HH:MM"
    timeLeft: 0,         // sisa kuota slot terpilih (0 = tidak dilaporkan)
    pax: 1,
  };

  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const rupiah = (n) => "Rp " + n.toLocaleString("id-ID");

  // Jadwal memakai Waktu Arab Saudi (UTC+3) — "hari ini" dan "jam lewat"
  // dihitung terhadap jam Saudi, bukan jam perangkat pengunjung.
  function saudiNow() {
    const d = new Date(Date.now() + 3 * 3600 * 1000);
    return {
      dateKey: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      hhmm: pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()),
    };
  }

  function tanggalLabel() {
    if (!state.date) return "—";
    const [yy, mm, dd] = state.date.split("-").map(Number);
    const dt = new Date(yy, mm - 1, dd);
    return `${HARI_FULL[dt.getDay()]}, ${dd} ${BULAN[mm - 1]} ${yy}`;
  }

  function genderLabel() {
    return state.gender === "female" ? "Wanita" : "Pria";
  }

  function allSlotsFor(dateKey, gender) {
    const day = state.data && state.data.days && state.data.days[dateKey];
    return ((day && day[gender]) || []).slice().sort((a, b) => a[0].localeCompare(b[0]));
  }

  // "open"    → bisa dipilih
  // "past"    → jamnya sudah lewat (WAS)
  // "soldout" → kuota habis / ditutup
  function slotStatus(dateKey, slot) {
    const now = saudiNow();
    if (dateKey < now.dateKey) return "past";
    if (dateKey === now.dateKey && slot[0] <= now.hhmm) return "past";
    if (slot[2] !== 1) return "soldout";
    return "open";
  }

  function openSlotsFor(dateKey, gender) {
    return allSlotsFor(dateKey, gender).filter((s) => slotStatus(dateKey, s) === "open");
  }

  function monthHasSlot({ y, m }) {
    const dim = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      if (openSlotsFor(keyOf(y, m, d), state.gender).length) return true;
    }
    return false;
  }

  // ---------- render ----------
  function renderGender() {
    el.btnFemale.className = state.gender === "female" ? "active-female" : "";
    el.btnMale.className = state.gender === "male" ? "active-male" : "";
    el.panel.className = "slot-panel " + state.gender;
    el.panelTitle.textContent = "Sesi " + genderLabel();
  }

  function renderMonths() {
    el.monthTabs.innerHTML = "";
    state.months.forEach((mo, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${BULAN[mo.m]} ${mo.y}`;
      b.className = i === state.monthIdx ? "active" : "";
      b.addEventListener("click", () => {
        state.monthIdx = i;
        pickFirstAvailableDate();
        renderAll();
      });
      el.monthTabs.appendChild(b);
    });
  }

  function renderStatus() {
    const has = monthHasSlot(state.months[state.monthIdx]);
    el.statusPill.textContent = has ? "Tersedia bulan ini" : "Penuh / belum dibuka";
    el.statusPill.className = "status-pill" + (has ? "" : " empty");
    if (state.data && state.data.generatedAt) {
      const t = new Date(state.data.generatedAt);
      el.updatedAt.textContent = "Update " + pad(t.getHours()) + "." + pad(t.getMinutes());
    }
  }

  function renderDates() {
    const { y, m } = state.months[state.monthIdx];
    const dim = new Date(y, m + 1, 0).getDate();
    el.dateStrip.innerHTML = "";
    for (let d = 1; d <= dim; d++) {
      const k = keyOf(y, m, d);
      const open = openSlotsFor(k, state.gender);
      const b = document.createElement("button");
      b.type = "button";
      // Tanggal lewat, habis, atau tanpa jadwal → abu-abu dan tidak bisa dipilih
      b.disabled = open.length === 0;
      b.className = (open.length ? "has-slot" : "") + (state.date === k ? " selected" : "");
      b.innerHTML = `<span class="d-num">${d}</span><span class="d-day">${HARI[new Date(y, m, d).getDay()]}</span><span class="d-dot"></span>`;
      b.addEventListener("click", () => {
        state.date = k;
        state.time = null;
        renderAll();
      });
      el.dateStrip.appendChild(b);
    }
    const sel = el.dateStrip.querySelector(".selected");
    if (sel) sel.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function renderTimes() {
    el.timeList.innerHTML = "";
    const all = state.date ? allSlotsFor(state.date, state.gender) : [];
    if (!all.length) {
      el.timeList.innerHTML = `<div class="time-empty">${state.date ? "Tidak ada jadwal sesi ini pada tanggal tersebut — pilih tanggal lain." : "Pilih tanggal terlebih dahulu."}</div>`;
      return;
    }
    for (const s of all) {
      const [time, count] = s;
      const st = slotStatus(state.date, s);
      const b = document.createElement("button");
      b.type = "button";
      if (st === "open") {
        b.className = "time-row" + (state.time === time ? " selected" : "");
        b.innerHTML = `<span class="t-time">${time} WAS</span><span class="t-left">${count > 0 ? "Sisa " + count + " jamaah" : "Tersedia"}</span>`;
        b.addEventListener("click", () => {
          state.time = time;
          state.timeLeft = count;
          const cap = count > 0 ? count : MAX_PAX_FALLBACK;
          if (state.pax > cap) state.pax = cap;
          renderAll();
        });
      } else {
        b.className = "time-row sold-out";
        b.disabled = true;
        b.innerHTML = `<span class="t-time">${time} WAS</span><span class="t-left">${st === "past" ? "Waktu lewat" : "Habis"}</span>`;
      }
      el.timeList.appendChild(b);
    }
  }

  function renderPaxSummary() {
    const cap = state.timeLeft > 0 ? state.timeLeft : MAX_PAX_FALLBACK;
    el.paxVal.textContent = state.pax;
    el.paxMinus.disabled = state.pax <= 1;
    el.paxPlus.disabled = state.pax >= cap;

    el.sumSesi.textContent = genderLabel();
    el.sumTanggal.textContent = tanggalLabel();
    el.sumJam.textContent = state.time ? state.time + " WAS" : "—";
    el.sumPax.textContent = state.pax + " jamaah";
    el.sumTotal.textContent = rupiah(PRICE * state.pax);
    el.btnBook.disabled = !(state.date && state.time);
  }

  function renderAll() {
    renderGender();
    renderMonths();
    renderStatus();
    renderDates();
    renderTimes();
    renderPaxSummary();
  }

  function pickFirstAvailableDate() {
    const { y, m } = state.months[state.monthIdx];
    const dim = new Date(y, m + 1, 0).getDate();
    state.date = null;
    state.time = null;
    for (let d = 1; d <= dim; d++) {
      const k = keyOf(y, m, d);
      if (openSlotsFor(k, state.gender).length) { state.date = k; return; }
    }
  }

  // ---------- modal pembayaran ----------
  function openPayModal() {
    if (!(state.date && state.time)) return;
    el.pmSesi.textContent = genderLabel();
    el.pmTanggal.textContent = tanggalLabel();
    el.pmJam.textContent = state.time + " WAS";
    el.pmPax.textContent = state.pax + " jamaah";
    el.pmTotal.textContent = rupiah(PRICE * state.pax);
    // prefill dari akun bila sedang login
    const u = window.RVA && RVA.user();
    if (u) {
      if (!el.payName.value) el.payName.value = u.name || "";
      if (!el.payWa.value && u.wa) el.payWa.value = "0" + String(u.wa).slice(2);
    }
    el.payAlert.hidden = true;
    el.payModal.hidden = false;
    document.body.style.overflow = "hidden";
    if (window.RVA) { RVA.track("pay_open"); RVA.fireMarketing("begin_checkout", { value: PRICE * state.pax, currency: "IDR" }); }
  }

  function closePayModal() {
    el.payModal.hidden = true;
    document.body.style.overflow = "";
  }

  function buildPaidWaLink(orderCode, name) {
    const msg =
      `Assalamu'alaikum, saya sudah melakukan pembayaran untuk reservasi Rawdah:\n` +
      (orderCode ? `• Kode Pesanan: ${orderCode}\n` : "") +
      `• Nama: ${name}\n` +
      `• Sesi: ${genderLabel()}\n` +
      `• Tanggal: ${tanggalLabel()}\n` +
      `• Jam: ${state.time} WAS\n` +
      `• Jumlah jamaah: ${state.pax}\n` +
      `• Total: ${rupiah(PRICE * state.pax)} (${state.pax} × ${rupiah(PRICE)})\n` +
      `Transfer ke ${BANK.name} ${BANK.no} a.n. ${BANK.holder}.\n` +
      `Berikut saya lampirkan bukti transfernya.`;
    return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  async function submitPaid() {
    const name = el.payName.value.trim();
    const wa = el.payWa.value.trim();
    if (name.length < 2) {
      el.payAlert.textContent = "Isi nama lengkap terlebih dahulu.";
      el.payAlert.hidden = false;
      return;
    }
    if (wa.replace(/\D/g, "").length < 9) {
      el.payAlert.textContent = "Isi nomor WhatsApp aktif (contoh: 08xxxxxxxxxx).";
      el.payAlert.hidden = false;
      return;
    }
    el.payAlert.hidden = true;
    el.btnPaid.disabled = true;
    const prevLabel = el.btnPaid.textContent;
    el.btnPaid.textContent = "Menyimpan pesanan…";
    let code = "";
    try {
      // simpan pesanan ke sistem (guest boleh; akun terlampir bila login)
      const res = await (window.RVA
        ? RVA.authFetch("/orders", {
            method: "POST",
            body: JSON.stringify({ name, wa, gender: state.gender, dateKey: state.date, timeSlot: state.time, pax: state.pax }),
          })
        : Promise.reject());
      if (res && res.ok) {
        const data = await res.json();
        code = data.order && data.order.code ? data.order.code : "";
        if (window.RVA) RVA.fireMarketing("order_created", { value: PRICE * state.pax, currency: "IDR" });
      }
    } catch (e) { /* jika API gagal, tetap lanjut ke WA tanpa kode */ }
    el.btnPaid.disabled = false;
    el.btnPaid.textContent = prevLabel;
    window.open(buildPaidWaLink(code, name), "_blank", "noopener");
    closePayModal();
  }

  async function copyRekening() {
    const feedback = () => {
      const prev = el.btnCopy.textContent;
      el.btnCopy.textContent = "Tersalin ✓";
      setTimeout(() => { el.btnCopy.textContent = prev; }, 2000);
    };
    try {
      await navigator.clipboard.writeText(BANK.no);
      feedback();
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = BANK.no;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      feedback();
    }
  }

  // ---------- data ----------
  async function load() {
    try {
      el.btnRefresh.disabled = true;
      const res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.data = await res.json();

      const now = new Date();
      state.months = [0, 1, 2].map((i) => {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        return { y: d.getFullYear(), m: d.getMonth() };
      });
      if (!state.date) pickFirstAvailableDate();

      el.errBox.hidden = true;
      el.widget.hidden = false;
      renderAll();
    } catch (err) {
      el.widget.hidden = true;
      el.errBox.hidden = false;
    } finally {
      el.btnRefresh.disabled = false;
    }
  }

  // ---------- event ----------
  el.btnFemale.addEventListener("click", () => { state.gender = "female"; state.monthIdx = 0; pickFirstAvailableDate(); renderAll(); });
  el.btnMale.addEventListener("click", () => { state.gender = "male"; state.monthIdx = 0; pickFirstAvailableDate(); renderAll(); });
  el.btnRefresh.addEventListener("click", load);
  el.paxMinus.addEventListener("click", () => { if (state.pax > 1) { state.pax--; renderPaxSummary(); } });
  el.paxPlus.addEventListener("click", () => { state.pax++; renderPaxSummary(); });

  el.btnBook.addEventListener("click", openPayModal);
  el.payClose.addEventListener("click", closePayModal);
  el.payBack.addEventListener("click", closePayModal);
  el.payModal.addEventListener("click", (e) => { if (e.target === el.payModal) closePayModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.payModal.hidden) closePayModal(); });
  el.btnCopy.addEventListener("click", copyRekening);
  el.btnPaid.addEventListener("click", submitPaid);

  load();
})();
