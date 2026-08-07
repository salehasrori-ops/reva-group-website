-- Skema database Reva Group (D1/SQLite)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  wa TEXT UNIQUE,                 -- nomor WhatsApp format 62xxxxxxxxxx
  name TEXT NOT NULL,
  pass_hash TEXT,                 -- PBKDF2: iter.salt.hash (base64)
  google_sub TEXT UNIQUE,         -- subject Google bila login Google
  role TEXT NOT NULL DEFAULT 'user',   -- user | admin | owner
  perms TEXT NOT NULL DEFAULT '',      -- izin admin, csv: traffic,settings,users
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,      -- RVA-YYMMDD-XXXX
  user_id INTEGER,
  name TEXT NOT NULL,
  wa TEXT NOT NULL,
  gender TEXT NOT NULL,           -- male | female
  date_key TEXT NOT NULL,         -- yyyy-mm-dd (WAS)
  time_slot TEXT NOT NULL,        -- HH:MM (WAS)
  pax INTEGER NOT NULL,
  total INTEGER NOT NULL,         -- rupiah
  status TEXT NOT NULL DEFAULT 'menunggu_verifikasi',
  -- menunggu_verifikasi | terkonfirmasi | qr_terkirim | dibatalkan | refund
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  type TEXT NOT NULL,             -- pageview | wa_click | pay_open | order_created
  path TEXT DEFAULT '',
  ref TEXT DEFAULT '',            -- referrer host
  utm TEXT DEFAULT '',            -- utm_source/medium/campaign gabung
  vid TEXT DEFAULT '',            -- anon visitor id
  device TEXT DEFAULT ''          -- mobile | desktop
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('ga4_id', ''),
  ('meta_pixel_id', ''),
  ('tiktok_pixel_id', ''),
  ('google_client_id', '');

-- ===== Pengerasan keamanan (mengikuti standar Albalad/AnsarPro) =====

-- Versi token: dinaikkan saat ganti password agar sesi lama otomatis gugur
ALTER TABLE users ADD COLUMN token_ver INTEGER NOT NULL DEFAULT 0;

-- Pembatas laju: lawan brute force login & spam pemesanan
CREATE TABLE IF NOT EXISTS rate_limits (
  k  TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rl ON rate_limits(k, ts);

-- Jejak audit tindakan staf (ubah status pesanan, role, pengaturan)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id INTEGER,
  actor_email TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
