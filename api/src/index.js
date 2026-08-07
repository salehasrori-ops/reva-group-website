// Reva Group API — Cloudflare Worker + D1
// Auth (email/WA + password, Google via settings), pesanan, tracker, stats, settings.

const ALLOWED_ORIGINS = [
  "https://revagroup.co.id",
  "https://www.revagroup.co.id",
  "https://revagroup.pages.dev", // cadangan hosting Cloudflare Pages
  "http://localhost:8317",
  "http://127.0.0.1:8317",
];

const ORDER_STATUSES = ["menunggu_verifikasi", "terkonfirmasi", "qr_terkirim", "dibatalkan", "refund"];
const ADMIN_PERMS = ["orders", "traffic", "settings", "users"];
const PRICE = 165000;

// ---------- util ----------
const enc = new TextEncoder();

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    // Respons API tidak boleh ditebak tipenya, dirujuk, atau disimpan cache
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// Perbandingan waktu-konstan: mencegah kebocoran informasi lewat selisih waktu
function timingSafeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// ---------- pembatas laju (D1) ----------
// Menahan brute force login dan spam pemesanan. Jendela geser sederhana.
async function rateLimit(env, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const since = now - windowSec;
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE k = ? AND ts >= ?")
      .bind(key, since).first();
    if (row && row.n >= limit) return false;
    await env.DB.prepare("INSERT INTO rate_limits (k, ts) VALUES (?, ?)").bind(key, now).run();
    // bersih-bersih sesekali agar tabel tidak menumpuk
    if (Math.random() < 0.02) {
      await env.DB.prepare("DELETE FROM rate_limits WHERE ts < ?").bind(now - 86400).run();
    }
    return true;
  } catch {
    return true; // jangan sampai gangguan DB mengunci pengguna sah
  }
}

function clientIp(req) {
  return req.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

// ---------- jejak audit ----------
async function audit(env, req, actor, action, target, detail) {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_log (actor_id, actor_email, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(actor ? actor.id : null, actor ? actor.email : null, action,
           target ? String(target).slice(0, 120) : null,
           detail ? String(detail).slice(0, 500) : null, clientIp(req)).run();
  } catch { /* audit tidak boleh menggagalkan operasi */ }
}

function err(code, message, status, origin) {
  return json({ error: { code, message } }, status, origin);
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signJwt(payload, secret, days) {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + days * 86400 })));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

async function verifyJwt(token, secret) {
  try {
    const [h, b, s] = token.split(".");
    if (!h || !b || !s) return null;
    // Kunci algoritma ke HS256 — tolak token yang mengaku "none" atau algoritma lain
    const head = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    if (head.alg !== "HS256") return null;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlToBytes(s), enc.encode(`${h}.${b}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(b)));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// PBKDF2-SHA256 berantai.
//
// Cloudflare Workers MENOLAK iterations > 100.000 ("Pbkdf2 failed: iteration
// counts above 100000 are not supported" — diuji 2026-08-07). Untuk tetap
// mencapai faktor kerja setara anjuran OWASP (600.000), keluaran satu putaran
// dijadikan masukan putaran berikutnya: ROUNDS x 100.000 iterasi efektif.
//
// Format hash: "<iter>x<rounds>.<salt>.<hash>" — format lama "<iter>.<salt>.<hash>"
// tetap dikenali sebagai 1 putaran, jadi password lama tidak perlu direset.
const PBKDF2_ITER = 100000;
const PBKDF2_ROUNDS = 6; // 6 x 100.000 = 600.000 iterasi efektif

async function deriveChain(passwordBytes, salt, iter, rounds) {
  let material = passwordBytes;
  let bits;
  for (let i = 0; i < rounds; i++) {
    const key = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
    bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, key, 256);
    material = new Uint8Array(bits);
  }
  return bits;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveChain(enc.encode(password), salt, PBKDF2_ITER, PBKDF2_ROUNDS);
  return `${PBKDF2_ITER}x${PBKDF2_ROUNDS}.${b64url(salt)}.${b64url(bits)}`;
}

async function verifyPassword(password, stored) {
  try {
    const [spec, saltB64, hashB64] = stored.split(".");
    const [iterStr, roundStr] = spec.split("x"); // tanpa "x" = format lama, 1 putaran
    const salt = b64urlToBytes(saltB64);
    const bits = await deriveChain(
      enc.encode(password), salt, parseInt(iterStr, 10), parseInt(roundStr || "1", 10)
    );
    return timingSafeEqual(b64url(bits), hashB64);
  } catch {
    return false;
  }
}

// 08xx / +628xx / 628xx → 628xx
function normalizeWa(wa) {
  let d = String(wa || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (!d.startsWith("62")) d = "62" + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, wa: u.wa, role: u.role, perms: u.perms, hasPassword: !!u.pass_hash };
}

function hasPerm(user, perm) {
  if (user.role === "owner") return true;
  if (user.role !== "admin") return false;
  if (perm === "orders") return true; // admin selalu boleh kelola pesanan
  return (user.perms || "").split(",").includes(perm);
}

async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? row.value : "";
}

// ---------- auth helpers ----------
async function authUser(req, env) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const payload = await verifyJwt(auth.slice(7), env.JWT_SECRET);
  if (!payload) return null;
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.uid).first();
  if (!user) return null;
  // Token terbitan sebelum ganti password otomatis gugur
  if ((payload.tv || 0) !== (user.token_ver || 0)) return null;
  return user;
}

function ownerEmails(env) {
  return (env.OWNER_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
}

async function issueToken(user, env) {
  return signJwt({ uid: user.id, tv: user.token_ver || 0 }, env.JWT_SECRET, 30);
}

// ---------- handlers ----------
async function handleRegister(req, env, origin) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 80);
  const email = String(b.email || "").trim().toLowerCase();
  const wa = normalizeWa(b.wa);
  const password = String(b.password || "");
  if (!name || name.length < 2) return err("VALIDATION", "Nama minimal 2 karakter.", 400, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("VALIDATION", "Format email tidak valid.", 400, origin);
  if (!wa) return err("VALIDATION", "Nomor WhatsApp tidak valid.", 400, origin);
  if (password.length < 8) return err("VALIDATION", "Password minimal 8 karakter.", 400, origin);

  const dupe = await env.DB.prepare("SELECT id FROM users WHERE email = ? OR wa = ?").bind(email, wa).first();
  if (dupe) return err("EXISTS", "Email atau nomor WhatsApp sudah terdaftar. Silakan masuk.", 409, origin);

  const role = ownerEmails(env).includes(email) ? "owner" : "user";
  const pass_hash = await hashPassword(password);
  const res = await env.DB.prepare(
    "INSERT INTO users (email, wa, name, pass_hash, role) VALUES (?, ?, ?, ?, ?) RETURNING *"
  ).bind(email, wa, name, pass_hash, role).first();

  return json({ token: await issueToken(res, env), user: publicUser(res) }, 201, origin);
}

async function handleLogin(req, env, origin) {
  const b = await req.json().catch(() => ({}));
  const ident = String(b.identifier || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!ident || !password) return err("VALIDATION", "Isi email/nomor WA dan password.", 400, origin);

  let user;
  if (ident.includes("@")) {
    user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(ident).first();
  } else {
    const wa = normalizeWa(ident);
    user = wa ? await env.DB.prepare("SELECT * FROM users WHERE wa = ?").bind(wa).first() : null;
  }
  if (!user || !user.pass_hash || !(await verifyPassword(password, user.pass_hash))) {
    return err("INVALID_LOGIN", "Email/nomor WA atau password salah.", 401, origin);
  }
  // promosi owner bila email terdaftar sebagai owner
  if (user.role !== "owner" && ownerEmails(env).includes((user.email || "").toLowerCase())) {
    await env.DB.prepare("UPDATE users SET role = 'owner' WHERE id = ?").bind(user.id).run();
    user.role = "owner";
  }
  return json({ token: await issueToken(user, env), user: publicUser(user) }, 200, origin);
}

async function handleGoogle(req, env, origin) {
  const clientId = await getSetting(env, "google_client_id");
  if (!clientId) return err("DISABLED", "Login Google belum diaktifkan.", 400, origin);
  const b = await req.json().catch(() => ({}));
  const credential = String(b.credential || "");
  if (!credential) return err("VALIDATION", "Credential kosong.", 400, origin);

  const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  if (!r.ok) return err("GOOGLE", "Verifikasi Google gagal.", 401, origin);
  const info = await r.json();
  if (info.aud !== clientId) return err("GOOGLE", "Client ID tidak cocok.", 401, origin);
  // Penerbit harus Google asli
  if (info.iss !== "accounts.google.com" && info.iss !== "https://accounts.google.com") {
    return err("GOOGLE", "Penerbit token tidak sah.", 401, origin);
  }
  // Email WAJIB terverifikasi: tanpa ini, akun Google beralamat email milik orang
  // lain bisa dipakai mengambil alih akun yang sudah ada (pencocokan by email).
  if (info.email_verified !== true && info.email_verified !== "true") {
    return err("GOOGLE", "Email Google belum terverifikasi.", 401, origin);
  }
  const email = String(info.email || "").toLowerCase();
  const sub = String(info.sub || "");
  if (!email || !sub) return err("GOOGLE", "Data Google tidak lengkap.", 401, origin);

  let user = await env.DB.prepare("SELECT * FROM users WHERE google_sub = ? OR email = ?").bind(sub, email).first();
  if (user) {
    if (!user.google_sub) {
      await env.DB.prepare("UPDATE users SET google_sub = ? WHERE id = ?").bind(sub, user.id).run();
    }
  } else {
    const role = ownerEmails(env).includes(email) ? "owner" : "user";
    user = await env.DB.prepare(
      "INSERT INTO users (email, name, google_sub, role) VALUES (?, ?, ?, ?) RETURNING *"
    ).bind(email, String(info.name || email.split("@")[0]).slice(0, 80), sub, role).first();
  }
  return json({ token: await issueToken(user, env), user: publicUser(user), needsWa: !user.wa }, 200, origin);
}

async function handleMe(req, env, origin, user) {
  if (req.method === "GET") return json({ user: publicUser(user) }, 200, origin);
  // PATCH — update profil
  const b = await req.json().catch(() => ({}));
  const name = b.name !== undefined ? String(b.name).trim().slice(0, 80) : user.name;
  let wa = user.wa;
  if (b.wa !== undefined) {
    wa = normalizeWa(b.wa);
    if (!wa) return err("VALIDATION", "Nomor WhatsApp tidak valid.", 400, origin);
    const dupe = await env.DB.prepare("SELECT id FROM users WHERE wa = ? AND id != ?").bind(wa, user.id).first();
    if (dupe) return err("EXISTS", "Nomor WhatsApp sudah dipakai akun lain.", 409, origin);
  }
  let rotated = false;
  if (b.password !== undefined) {
    const password = String(b.password);
    if (password.length < 8) return err("VALIDATION", "Password minimal 8 karakter.", 400, origin);
    const pass_hash = await hashPassword(password);
    // Naikkan versi token: seluruh sesi lama (mis. di perangkat yang hilang) gugur
    await env.DB.prepare("UPDATE users SET name = ?, wa = ?, pass_hash = ?, token_ver = token_ver + 1 WHERE id = ?")
      .bind(name, wa, pass_hash, user.id).run();
    rotated = true;
  } else {
    await env.DB.prepare("UPDATE users SET name = ?, wa = ? WHERE id = ?").bind(name, wa, user.id).run();
  }
  const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  const out = { user: publicUser(fresh) };
  // Ganti password memutus token lama — beri token baru agar sesi ini tetap hidup
  if (rotated) {
    out.token = await issueToken(fresh, env);
    await audit(env, req, user, "password_change", "user:" + user.id, null);
  }
  return json(out, 200, origin);
}

function genOrderCode() {
  const d = new Date(Date.now() + 3 * 3600 * 1000); // tanggal WAS
  const ymd = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RVA-${ymd}-${rand}`;
}

async function handleCreateOrder(req, env, origin, user) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 80);
  const wa = normalizeWa(b.wa);
  const gender = b.gender === "male" ? "male" : b.gender === "female" ? "female" : null;
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dateKey || "")) ? b.dateKey : null;
  const timeSlot = /^\d{2}:\d{2}$/.test(String(b.timeSlot || "")) ? b.timeSlot : null;
  const pax = Math.min(Math.max(parseInt(b.pax, 10) || 0, 1), 100);
  if (!name || name.length < 2) return err("VALIDATION", "Nama minimal 2 karakter.", 400, origin);
  if (!wa) return err("VALIDATION", "Nomor WhatsApp tidak valid.", 400, origin);
  if (!gender || !dateKey || !timeSlot) return err("VALIDATION", "Jadwal tidak lengkap.", 400, origin);

  // kode unik (coba ulang bila tabrakan)
  let code = genOrderCode();
  for (let i = 0; i < 3; i++) {
    const dupe = await env.DB.prepare("SELECT id FROM orders WHERE code = ?").bind(code).first();
    if (!dupe) break;
    code = genOrderCode();
  }

  const total = PRICE * pax;
  const order = await env.DB.prepare(
    "INSERT INTO orders (code, user_id, name, wa, gender, date_key, time_slot, pax, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
  ).bind(code, user ? user.id : null, name, wa, gender, dateKey, timeSlot, pax, total).first();

  await env.DB.prepare("INSERT INTO events (type, path) VALUES ('order_created', ?)").bind(code).run();
  return json({ order }, 201, origin);
}

async function handleMyOrders(env, origin, user) {
  const { results } = await env.DB.prepare(
    "SELECT code, name, gender, date_key, time_slot, pax, total, status, created_at FROM orders WHERE user_id = ? OR wa = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(user.id, user.wa || "-").all();
  return json({ orders: results }, 200, origin);
}

async function handleAdminOrders(req, env, origin, url) {
  const status = url.searchParams.get("status") || "";
  const page = Math.max(parseInt(url.searchParams.get("page"), 10) || 1, 1);
  const per = 20;
  let q, cq;
  if (status && ORDER_STATUSES.includes(status)) {
    q = env.DB.prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(status, per, (page - 1) * per);
    cq = env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = ?").bind(status);
  } else {
    q = env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(per, (page - 1) * per);
    cq = env.DB.prepare("SELECT COUNT(*) AS n FROM orders");
  }
  const [{ results }, cnt] = await Promise.all([q.all(), cq.first()]);
  return json({ orders: results, total: cnt.n, page, per }, 200, origin);
}

async function handleAdminOrderUpdate(req, env, origin, id, actor) {
  const b = await req.json().catch(() => ({}));
  const cur = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!cur) return err("NOT_FOUND", "Pesanan tidak ditemukan.", 404, origin);
  const status = b.status !== undefined ? String(b.status) : cur.status;
  if (!ORDER_STATUSES.includes(status)) return err("VALIDATION", "Status tidak dikenal.", 400, origin);
  const note = b.note !== undefined ? String(b.note).slice(0, 500) : cur.note;
  await env.DB.prepare("UPDATE orders SET status = ?, note = ?, updated_at = datetime('now') WHERE id = ?").bind(status, note, id).run();
  if (status !== cur.status) {
    await audit(env, req, actor, "order_status", cur.code, `${cur.status} -> ${status}`);
  }
  const fresh = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  return json({ order: fresh }, 200, origin);
}

async function handleTrack(req, env, origin) {
  const b = await req.json().catch(() => ({}));
  const type = ["pageview", "wa_click", "pay_open"].includes(b.type) ? b.type : "pageview";
  const path = String(b.path || "").slice(0, 200);
  let ref = "";
  try { ref = b.ref ? new URL(b.ref).host : ""; } catch { ref = String(b.ref || "").slice(0, 100); }
  const utm = String(b.utm || "").slice(0, 200);
  const vid = String(b.vid || "").slice(0, 40);
  const ua = req.headers.get("User-Agent") || "";
  const device = /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
  await env.DB.prepare(
    "INSERT INTO events (type, path, ref, utm, vid, device) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(type, path, ref, utm, vid, device).run();
  return json({ ok: true }, 200, origin);
}

async function handleStats(env, origin) {
  const [daily, pages, refs, funnel, devices, orderStats] = await Promise.all([
    env.DB.prepare(
      "SELECT date(ts) AS d, COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors FROM events WHERE type = 'pageview' AND ts >= datetime('now', '-14 days') GROUP BY date(ts) ORDER BY d"
    ).all(),
    env.DB.prepare(
      "SELECT path, COUNT(*) AS n FROM events WHERE type = 'pageview' AND ts >= datetime('now', '-14 days') GROUP BY path ORDER BY n DESC LIMIT 8"
    ).all(),
    env.DB.prepare(
      "SELECT ref, COUNT(*) AS n FROM events WHERE type = 'pageview' AND ts >= datetime('now', '-14 days') AND ref != '' GROUP BY ref ORDER BY n DESC LIMIT 8"
    ).all(),
    env.DB.prepare(
      "SELECT type, COUNT(*) AS n FROM events WHERE ts >= datetime('now', '-14 days') GROUP BY type"
    ).all(),
    env.DB.prepare(
      "SELECT device, COUNT(*) AS n FROM events WHERE type = 'pageview' AND ts >= datetime('now', '-14 days') GROUP BY device"
    ).all(),
    env.DB.prepare(
      "SELECT status, COUNT(*) AS n, SUM(total) AS amount FROM orders GROUP BY status"
    ).all(),
  ]);
  return json({
    daily: daily.results,
    pages: pages.results,
    referrers: refs.results,
    funnel: funnel.results,
    devices: devices.results,
    orders: orderStats.results,
  }, 200, origin);
}

async function handleSettings(req, env, origin, isPublic, actor) {
  const KEYS = ["ga4_id", "meta_pixel_id", "tiktok_pixel_id", "google_client_id"];
  if (req.method === "GET" || isPublic) {
    const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
    const out = {};
    for (const r of results) if (KEYS.includes(r.key)) out[r.key] = r.value;
    return json({ settings: out }, 200, origin);
  }
  const b = await req.json().catch(() => ({}));
  const stmts = [];
  for (const k of KEYS) {
    if (b[k] !== undefined) {
      stmts.push(env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, String(b[k]).trim().slice(0, 120)));
    }
  }
  if (stmts.length) {
    await env.DB.batch(stmts);
    await audit(env, req, actor, "settings_update", null, KEYS.filter((k) => b[k] !== undefined).join(","));
  }
  return handleSettings(new Request(req.url, { method: "GET" }), env, origin, false, actor);
}

async function handleUsers(req, env, origin, url) {
  const qs = (url.searchParams.get("q") || "").trim().toLowerCase();
  let rows;
  if (qs) {
    rows = await env.DB.prepare(
      "SELECT id, name, email, wa, role, perms, created_at FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ? OR wa LIKE ? ORDER BY id DESC LIMIT 50"
    ).bind(`%${qs}%`, `%${qs}%`, `%${qs}%`).all();
  } else {
    rows = await env.DB.prepare(
      "SELECT id, name, email, wa, role, perms, created_at FROM users ORDER BY (role = 'owner') DESC, (role = 'admin') DESC, id DESC LIMIT 50"
    ).all();
  }
  return json({ users: rows.results }, 200, origin);
}

async function handleUserUpdate(req, env, origin, id, actor) {
  const target = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  if (!target) return err("NOT_FOUND", "Pengguna tidak ditemukan.", 404, origin);
  if (target.role === "owner" && target.id !== actor.id) {
    return err("FORBIDDEN", "Akun owner lain tidak bisa diubah.", 403, origin);
  }
  const b = await req.json().catch(() => ({}));
  let role = target.role;
  if (b.role !== undefined) {
    if (!["user", "admin", "owner"].includes(b.role)) return err("VALIDATION", "Role tidak dikenal.", 400, origin);
    if (target.id === actor.id && b.role !== "owner") return err("VALIDATION", "Tidak bisa menurunkan role sendiri.", 400, origin);
    role = b.role;
  }
  let perms = target.perms;
  if (b.perms !== undefined) {
    perms = String(b.perms).split(",").map((s) => s.trim()).filter((p) => ADMIN_PERMS.includes(p)).join(",");
  }
  await env.DB.prepare("UPDATE users SET role = ?, perms = ? WHERE id = ?").bind(role, perms, id).run();
  if (role !== target.role || perms !== target.perms) {
    await audit(env, req, actor, "user_access", target.email || ("user:" + id),
      `role ${target.role} -> ${role}; perms "${target.perms}" -> "${perms}"`);
  }
  const fresh = await env.DB.prepare("SELECT id, name, email, wa, role, perms, created_at FROM users WHERE id = ?").bind(id).first();
  return json({ user: fresh }, 200, origin);
}

// ---------- jadwal ketersediaan Rawdah ----------
// Diambil berkala oleh cron Worker (lihat wrangler.jsonc) lalu disimpan di D1,
// sehingga situs tidak bergantung pada GitHub Actions yang bisa mati.
async function refreshAvailability(env) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const now = new Date();
  const startDate = fmt(now);
  const endDate = fmt(new Date(now.getTime() + 90 * 86400000));
  const res = await fetch(
    `https://api.rawdahnabawi.com/api/appointments/availability?startDate=${startDate}&endDate=${endDate}`,
    { headers: { Authorization: "Bearer " + env.ANSARPRO_API_KEY } }
  );
  if (!res.ok) throw new Error("upstream " + res.status);
  const raw = await res.json();
  const days = {};
  for (const s of raw.slots || []) {
    if (!days[s.dateKey]) days[s.dateKey] = {};
    if (!days[s.dateKey][s.gender]) days[s.dateKey][s.gender] = [];
    days[s.dateKey][s.gender].push([s.timeSlot, s.availableCount, s.isAvailable ? 1 : 0]);
  }
  const payload = { generatedAt: new Date().toISOString(), startDate, endDate, days };
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('availability_json', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(JSON.stringify(payload)).run();
  return payload;
}

async function handleAvailability(env, origin) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'availability_json'").first();
  if (row && row.value) {
    const cached = JSON.parse(row.value);
    const ageMin = (Date.now() - new Date(cached.generatedAt).getTime()) / 60000;
    // cukup segar → langsung sajikan
    if (ageMin < 20) return json(cached, 200, origin);
    // sudah tua → coba perbarui, tapi tetap sajikan cache lama bila API bermasalah
    try {
      return json(await refreshAvailability(env), 200, origin);
    } catch {
      return json(cached, 200, origin);
    }
  }
  try {
    return json(await refreshAvailability(env), 200, origin);
  } catch {
    return err("UPSTREAM", "Jadwal belum tersedia.", 503, origin);
  }
}

// ---------- router ----------
export default {
  // Cron: perbarui jadwal secara berkala (dikonfigurasi di wrangler.jsonc)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshAvailability(env).catch(() => {}));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const m = req.method;

    if (m === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    // Kunci lintas situs: permintaan yang mengubah data hanya diterima dari asal
    // yang dikenal. Formulir dari situs lain selalu mengirim Origin miliknya,
    // sehingga tertolak di sini (browser mengirim Origin pada setiap POST).
    if (m !== "GET" && origin && !ALLOWED_ORIGINS.includes(origin)) {
      return err("FORBIDDEN_ORIGIN", "Asal permintaan tidak dikenal.", 403, origin);
    }

    const ip = clientIp(req);

    try {
      // publik
      if (m === "POST" && path === "/auth/register") {
        if (!(await rateLimit(env, "reg:" + ip, 5, 3600))) {
          return err("RATE_LIMIT", "Terlalu banyak percobaan pendaftaran. Coba lagi nanti.", 429, origin);
        }
        return await handleRegister(req, env, origin);
      }
      if (m === "POST" && path === "/auth/login") {
        // dua lapis: per alamat IP dan per akun yang dituju
        const body = await req.clone().json().catch(() => ({}));
        const ident = String(body.identifier || "").trim().toLowerCase().slice(0, 80);
        const okIp = await rateLimit(env, "login:ip:" + ip, 15, 900);
        const okId = ident ? await rateLimit(env, "login:id:" + ident, 8, 900) : true;
        if (!okIp || !okId) {
          await audit(env, req, null, "login_rate_limited", ident || null, null);
          return err("RATE_LIMIT", "Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.", 429, origin);
        }
        return await handleLogin(req, env, origin);
      }
      if (m === "POST" && path === "/auth/google") {
        if (!(await rateLimit(env, "goog:" + ip, 20, 900))) {
          return err("RATE_LIMIT", "Terlalu banyak percobaan. Coba lagi nanti.", 429, origin);
        }
        return await handleGoogle(req, env, origin);
      }
      if (m === "POST" && path === "/track") {
        if (!(await rateLimit(env, "trk:" + ip, 300, 3600))) return json({ ok: true }, 200, origin);
        return await handleTrack(req, env, origin);
      }
      if (m === "GET" && path === "/public/settings") return await handleSettings(req, env, origin, true);
      if (m === "GET" && path === "/availability") return await handleAvailability(env, origin);
      if (m === "GET" && path === "/health") return json({ ok: true }, 200, origin);

      // pesanan boleh tanpa login (guest) — user terlampir bila ada token
      if (m === "POST" && path === "/orders") {
        if (!(await rateLimit(env, "ord:" + ip, 12, 3600))) {
          return err("RATE_LIMIT", "Terlalu banyak pemesanan dari perangkat ini. Hubungi kami via WhatsApp.", 429, origin);
        }
        const user = await authUser(req, env);
        return await handleCreateOrder(req, env, origin, user);
      }

      // butuh login
      const user = await authUser(req, env);
      if (!user) return err("UNAUTHORIZED", "Silakan masuk terlebih dahulu.", 401, origin);

      if ((m === "GET" || m === "PATCH") && path === "/me") return await handleMe(req, env, origin, user);
      if (m === "GET" && path === "/me/orders") return await handleMyOrders(env, origin, user);

      // area staf
      const staff = user.role === "owner" || user.role === "admin";
      if (!staff) return err("FORBIDDEN", "Khusus admin.", 403, origin);

      if (m === "GET" && path === "/admin/orders") {
        if (!hasPerm(user, "orders")) return err("FORBIDDEN", "Tidak punya akses pesanan.", 403, origin);
        return await handleAdminOrders(req, env, origin, url);
      }
      const orderMatch = path.match(/^\/admin\/orders\/(\d+)$/);
      if (m === "PATCH" && orderMatch) {
        if (!hasPerm(user, "orders")) return err("FORBIDDEN", "Tidak punya akses pesanan.", 403, origin);
        return await handleAdminOrderUpdate(req, env, origin, parseInt(orderMatch[1], 10), user);
      }
      if (m === "GET" && path === "/admin/stats") {
        if (!hasPerm(user, "traffic")) return err("FORBIDDEN", "Tidak punya akses trafik.", 403, origin);
        return await handleStats(env, origin);
      }
      if ((m === "GET" || m === "PUT") && path === "/admin/settings") {
        if (!hasPerm(user, "settings")) return err("FORBIDDEN", "Tidak punya akses pengaturan.", 403, origin);
        return await handleSettings(req, env, origin, false, user);
      }
      if (m === "GET" && path === "/admin/users") {
        if (!hasPerm(user, "users")) return err("FORBIDDEN", "Tidak punya akses pengguna.", 403, origin);
        return await handleUsers(req, env, origin, url);
      }
      const userMatch = path.match(/^\/admin\/users\/(\d+)$/);
      if (m === "PATCH" && userMatch) {
        if (user.role !== "owner") return err("FORBIDDEN", "Hanya owner yang bisa mengubah role/akses.", 403, origin);
        return await handleUserUpdate(req, env, origin, parseInt(userMatch[1], 10), user);
      }

      return err("NOT_FOUND", "Endpoint tidak ditemukan.", 404, origin);
    } catch (e) {
      // Detail teknis hanya ke log server; pengguna cukup menerima pesan umum.
      console.error("API error", m, path, e && e.message, e && e.stack);
      return err("INTERNAL", "Terjadi kesalahan server.", 500, origin);
    }
  },
};
