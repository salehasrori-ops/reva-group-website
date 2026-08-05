// Widget Reservasi Rawdah — Reva Group
// Data ketersediaan diambil dari branch `data` repo ini, yang diperbarui otomatis
// setiap ±10 menit oleh GitHub Actions (lihat .github/workflows/availability.yml).
// API key TIDAK pernah ada di sini — hanya di GitHub Secrets.

(() => {
  const DATA_URL = "https://raw.githubusercontent.com/salehasrori-ops/reva-group-website/data/availability.json";
  const PRICE = 165000;
  const WA_NUMBER = "6287708770871";
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

  function todayKey() {
    const t = new Date();
    return keyOf(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function slotsFor(dateKey, gender) {
    const day = state.data && state.data.days && state.data.days[dateKey];
    const list = (day && day[gender]) || [];
    return list.filter((s) => s[2] === 1);
  }

  function monthHasSlot({ y, m }) {
    const dim = new Date(y, m + 1, 0).getDate();
    const today = todayKey();
    for (let d = 1; d <= dim; d++) {
      const k = keyOf(y, m, d);
      if (k >= today && slotsFor(k, state.gender).length) return true;
    }
    return false;
  }

  // ---------- render ----------
  function renderGender() {
    el.btnFemale.className = state.gender === "female" ? "active-female" : "";
    el.btnMale.className = state.gender === "male" ? "active-male" : "";
    el.panel.className = "slot-panel " + state.gender;
    el.panelTitle.textContent = state.gender === "female" ? "Sesi Wanita" : "Sesi Pria";
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
    const today = todayKey();
    el.dateStrip.innerHTML = "";
    for (let d = 1; d <= dim; d++) {
      const k = keyOf(y, m, d);
      const av = k >= today ? slotsFor(k, state.gender) : [];
      const b = document.createElement("button");
      b.type = "button";
      b.className = (av.length ? "has-slot" : "") + (state.date === k ? " selected" : "");
      b.disabled = k < today;
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
    const av = state.date ? slotsFor(state.date, state.gender) : [];
    if (!av.length) {
      el.timeList.innerHTML = `<div class="time-empty">${state.date ? "Tidak ada jadwal sesi ini pada tanggal tersebut — pilih tanggal lain." : "Pilih tanggal terlebih dahulu."}</div>`;
      return;
    }
    av.sort((a, b2) => a[0].localeCompare(b2[0]));
    for (const [time, count] of av) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "time-row" + (state.time === time ? " selected" : "");
      b.innerHTML = `<span class="t-time">${time} WAS</span><span class="t-left">${count > 0 ? "Sisa " + count + " jamaah" : "Tersedia"}</span>`;
      b.addEventListener("click", () => {
        state.time = time;
        state.timeLeft = count;
        const cap = count > 0 ? count : MAX_PAX_FALLBACK;
        if (state.pax > cap) state.pax = cap;
        renderAll();
      });
      el.timeList.appendChild(b);
    }
  }

  function renderPaxSummary() {
    const cap = state.timeLeft > 0 ? state.timeLeft : MAX_PAX_FALLBACK;
    el.paxVal.textContent = state.pax;
    el.paxMinus.disabled = state.pax <= 1;
    el.paxPlus.disabled = state.pax >= cap;

    const genderLabel = state.gender === "female" ? "Wanita" : "Pria";
    el.sumSesi.textContent = genderLabel;
    if (state.date) {
      const [yy, mm, dd] = state.date.split("-").map(Number);
      const dt = new Date(yy, mm - 1, dd);
      el.sumTanggal.textContent = `${HARI_FULL[dt.getDay()]}, ${dd} ${BULAN[mm - 1]} ${yy}`;
    } else {
      el.sumTanggal.textContent = "—";
    }
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
    const today = todayKey();
    state.date = null;
    state.time = null;
    for (let d = 1; d <= dim; d++) {
      const k = keyOf(y, m, d);
      if (k >= today && slotsFor(k, state.gender).length) { state.date = k; return; }
    }
  }

  // ---------- aksi ----------
  function buildWaLink() {
    const genderLabel = state.gender === "female" ? "Wanita" : "Pria";
    const [yy, mm, dd] = state.date.split("-").map(Number);
    const dt = new Date(yy, mm - 1, dd);
    const tanggal = `${HARI_FULL[dt.getDay()]}, ${dd} ${BULAN[mm - 1]} ${yy}`;
    const msg =
      `Assalamu'alaikum, saya ingin memesan jasa reservasi Rawdah:\n` +
      `• Sesi: ${genderLabel}\n` +
      `• Tanggal: ${tanggal}\n` +
      `• Jam: ${state.time} WAS\n` +
      `• Jumlah jamaah: ${state.pax}\n` +
      `• Total: ${rupiah(PRICE * state.pax)} (${state.pax} × ${rupiah(PRICE)})\n` +
      `Mohon diproses, terima kasih.`;
    return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  async function load(fresh) {
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
  el.btnRefresh.addEventListener("click", () => load(true));
  el.paxMinus.addEventListener("click", () => { if (state.pax > 1) { state.pax--; renderPaxSummary(); } });
  el.paxPlus.addEventListener("click", () => { state.pax++; renderPaxSummary(); });
  el.btnBook.addEventListener("click", () => {
    if (state.date && state.time) window.open(buildWaLink(), "_blank", "noopener");
  });

  load(false);
})();
