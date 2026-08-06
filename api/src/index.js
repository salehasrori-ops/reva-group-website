// Reva Group API — Cloudflare Worker + D1
// Auth (email/WA + password, Google via settings), pesanan, tracker, stats, settings.

const ALLOWED_ORIGINS = [
  "https://revagroup.co.id",
  "https://www.revagroup.co.id",
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
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

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return `100000.${b64url(salt)}.${b64url(bits)}`;
}

async function verifyPassword(password, stored) {
  try {
    const [iterStr, saltB64, hashB64] = stored.split(".");
    const salt = b64urlToBytes(saltB64);
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: parseInt(iterStr, 10), hash: "SHA-256" }, key, 256);
    return b64url(bits) === hashB64;
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
  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.uid).first();
}

function ownerEmails(env) {
  return (env.OWNER_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
}

async function issueToken(user, env) {
  return signJwt({ uid: user.id }, env.JWT_SECRET, 30);
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
  if (b.password !== undefined) {
    const password = String(b.password);
    if (password.length < 8) return err("VALIDATION", "Password minimal 8 karakter.", 400, origin);
    const pass_hash = await hashPassword(password);
    await env.DB.prepare("UPDATE users SET name = ?, wa = ?, pass_hash = ? WHERE id = ?").bind(name, wa, pass_hash, user.id).run();
  } else {
    await env.DB.prepare("UPDATE users SET name = ?, wa = ? WHERE id = ?").bind(name, wa, user.id).run();
  }
  const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  return json({ user: publicUser(fresh) }, 200, origin);
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

async function handleAdminOrderUpdate(req, env, origin, id) {
  const b = await req.json().catch(() => ({}));
  const cur = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
  if (!cur) return err("NOT_FOUND", "Pesanan tidak ditemukan.", 404, origin);
  const status = b.status !== undefined ? String(b.status) : cur.status;
  if (!ORDER_STATUSES.includes(status)) return err("VALIDATION", "Status tidak dikenal.", 400, origin);
  const note = b.note !== undefined ? String(b.note).slice(0, 500) : cur.note;
  await env.DB.prepare("UPDATE orders SET status = ?, note = ?, updated_at = datetime('now') WHERE id = ?").bind(status, note, id).run();
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

async function handleSettings(req, env, origin, isPublic) {
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
  if (stmts.length) await env.DB.batch(stmts);
  return handleSettings(new Request(req.url, { method: "GET" }), env, origin, false);
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
  const fresh = await env.DB.prepare("SELECT id, name, email, wa, role, perms, created_at FROM users WHERE id = ?").bind(id).first();
  return json({ user: fresh }, 200, origin);
}

// ---------- router ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const m = req.method;

    if (m === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    try {
      // publik
      if (m === "POST" && path === "/auth/register") return await handleRegister(req, env, origin);
      if (m === "POST" && path === "/auth/login") return await handleLogin(req, env, origin);
      if (m === "POST" && path === "/auth/google") return await handleGoogle(req, env, origin);
      if (m === "POST" && path === "/track") return await handleTrack(req, env, origin);
      if (m === "GET" && path === "/public/settings") return await handleSettings(req, env, origin, true);
      if (m === "GET" && path === "/health") return json({ ok: true }, 200, origin);

      // pesanan boleh tanpa login (guest) — user terlampir bila ada token
      if (m === "POST" && path === "/orders") {
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
        return await handleAdminOrderUpdate(req, env, origin, parseInt(orderMatch[1], 10));
      }
      if (m === "GET" && path === "/admin/stats") {
        if (!hasPerm(user, "traffic")) return err("FORBIDDEN", "Tidak punya akses trafik.", 403, origin);
        return await handleStats(env, origin);
      }
      if ((m === "GET" || m === "PUT") && path === "/admin/settings") {
        if (!hasPerm(user, "settings")) return err("FORBIDDEN", "Tidak punya akses pengaturan.", 403, origin);
        return await handleSettings(req, env, origin, false);
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
      return err("INTERNAL", "Terjadi kesalahan server.", 500, origin);
    }
  },
};
