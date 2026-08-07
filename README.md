# Reva Group — Website Jasa Reservasi Rawdah

Website statis untuk Reva Group, mengikuti struktur dan tata letak albalad.co.id dengan palet
warna yang diambil dari logo Reva Group (hitam arang + gradasi bronze/copper). Konten disiapkan
agar aman untuk pengajuan merchant payment gateway (DOKU): harga jelas, S&K, kebijakan refund,
kebijakan privasi, dan kontak resmi tersedia; tanpa klaim area layanan lintas negara dan tanpa
tautan sosial placeholder.

## Struktur File

```
reva-group-website/
├── index.html                # Halaman utama (hero, reservasi, konsultasi, informasi)
├── reservasi.html            # Reservasi online: jadwal real-time + pesan via WhatsApp
├── tentang-kami.html         # Profil bisnis (diminta reviewer payment gateway)
├── syarat-ketentuan.html     # Syarat & ketentuan layanan
├── pengembalian-dana.html    # Kebijakan refund
├── kebijakan-privasi.html    # Kebijakan privasi
├── kebijakan-pengiriman.html # Cara penyerahan layanan (digital, tanpa barang fisik)
├── faq.html                  # Pertanyaan yang sering diajukan (termasuk alur bayar)
├── kontak.html               # Halaman kontak
├── css/style.css             # Seluruh styling (palet warna di bagian atas file)
├── js/main.js                # Toggle menu seluler
└── assets/
    ├── reva-logo.png         # Logo Reva Group (dari revagroup.co.id)
    └── hero.jpg              # Foto Masjid Nabawi (atribusi tampil di footer index)
```

## Kontak Terpasang

- WhatsApp: 0877 0877 0871 (tautan `wa.me/6287708770871`)
- Email: revagroupoffice@gmail.com

## Mengubah Warna

Semua warna didefinisikan sebagai CSS variable di bagian atas `css/style.css`:

| Variabel         | Nilai     | Asal                              |
| ---------------- | --------- | --------------------------------- |
| `--charcoal`     | `#1D1E20` | Hitam arang logo                  |
| `--bronze`       | `#A97747` | Bronze tengah logo (aksen utama)  |
| `--bronze-dark`  | `#875A32` | Bronze gelap logo                 |
| `--bronze-light` | `#C89B6A` | Bronze terang logo (aksen gelap)  |
| `--bronze-deep`  | `#6E4A26` | Turunan gelap untuk section info  |
| `--cream`        | `#F8F4EE` | Netral hangat untuk kartu         |

## Status Checklist DOKU

Sudah terpenuhi di situs:

- [x] Deskripsi produk/jasa jelas (jasa reservasi Rawdah) + profil bisnis (Tentang Kami)
- [x] Harga tercantum jelas dalam IDR (Rp 165.000/pax)
- [x] Alur pemesanan & pembayaran dijelaskan (FAQ "Bagaimana alur pemesanan dan pembayarannya?")
- [x] Syarat & Ketentuan
- [x] Kebijakan Pengembalian Dana (kondisi refund + jangka waktu 3–7 hari kerja)
- [x] Kebijakan Privasi (data pembayaran diproses penyedia pembayaran, tidak disimpan)
- [x] Kebijakan Pengiriman (jasa digital — bukti reservasi/QR via WhatsApp & email)
- [x] Kontak resmi: email + WhatsApp di setiap halaman
- [x] Tanpa klaim lintas negara, tanpa tautan sosial placeholder/mati
- [x] Lisensi aset beres: foto CC BY-SA 4.0 dengan atribusi tampil di footer

Masih butuh data dari Reva Group (isi lalu update situs):

- [x] **Harga**: Rp 165.000/pax — sudah dikonfirmasi pemilik (2026-08-05).
- [ ] **Alamat usaha**: DOKU umumnya meminta alamat kantor tercantum di situs. Tambahkan di
      footer (kolom "Info Reva Group") dan halaman Kontak.
- [ ] **Nama badan usaha**: bila pengajuan atas nama PT/CV, cantumkan nama legalnya di footer
      (mis. "PT ... — Reva Group") agar cocok dengan dokumen merchant.
- [ ] **Domain**: deploy ke domain resmi (mis. revagroup.co.id / subdomain) dengan HTTPS —
      review DOKU memeriksa kesesuaian domain dengan data merchant.
- [ ] **Klaim "support 24 jam"**: pastikan memang sanggup; bila tidak, ubah ke jam operasional
      riil (ada di index, faq, kontak).

## Akun, Pesanan, & Panel Admin

Backend: **Cloudflare Worker** `revagroup-api` (folder [api/](api/)) + database **D1**
`revagroup-db`, akun Cloudflare salehasrori@gmail.com. URL API:
`https://revagroup-api.salehasrori.workers.dev` (dibatasi CORS ke revagroup.co.id).

- **Akun jamaah** (`akun.html`): daftar dengan nama + email + nomor WA aktif + password;
  masuk pakai email ATAU nomor WA. Login Google aktif otomatis begitu Google OAuth Client ID
  diisi di Settings admin.
- **Pesanan**: tombol "Saya Sudah Bayar" menyimpan pesanan (kode `RVA-YYMMDD-XXXX`) sebelum
  membuka WhatsApp. Status: Menunggu Verifikasi → Terkonfirmasi → QR Terkirim / Dibatalkan /
  Refund — diubah dari panel admin, terlihat jamaah di halaman akunnya.
- **Panel admin** (`admin.html`): Pesanan (semua admin), Trafik / Pengaturan / Pengguna
  (owner, atau admin yang diberi izin). Email di `OWNER_EMAILS` (api/wrangler.jsonc) otomatis
  menjadi **owner** saat mendaftar.
- **Tracker internal**: `js/site.js` mencatat pageview + klik WA ke D1 (dashboard Trafik);
  juga memuat pixel GA4 / Meta / TikTok sesuai isian Settings — tanpa edit kode.
- Deploy ulang API: `cd api && npx wrangler deploy`. Ganti secret: `npx wrangler secret put JWT_SECRET`.

## Alur Pesanan & Pembelian Slot

Dua jalur masuk pesanan, keduanya bermuara ke proses yang sama:

1. **Jamaah memesan sendiri** di `reservasi.html` → pilih slot → modal pembayaran (BCA) →
   tombol "Saya Sudah Bayar" membuka WhatsApp.
2. **Admin membuatkan pesanan** di panel admin tab **➕ Pesanan Baru** (untuk jamaah yang
   menghubungi lewat telepon/WA) → isi nama, nomor WA, slot, jumlah → sistem membuat pesanan
   dan **menyusun pesan tagihan siap kirim** (kode pesanan, jadwal, total, rekening resmi).
   Tersedia tombol "Kirim via WhatsApp" (langsung ke nomor jamaah) dan "Salin Pesan".

Lalu di tab **Pesanan**:

3. Jamaah transfer → admin **unggah bukti transfer** pada baris pesanan (gambar dikompres di
   browser, maksimal 600 KB, tersimpan di tabel `proofs`).
4. Admin menekan **Konfirmasi & Beli Slot** → sistem membeli slot Rawdah sungguhan, lalu status
   menjadi Terkonfirmasi dan `rawdah_order_id` tersimpan.

**Pengaman pembelian** (pembelian slot TIDAK BISA dibatalkan — API Rawdah tak punya endpoint batal):

| Risiko | Penanganan |
| --- | --- |
| Pembelian ganda saat koneksi ngadat | `Idempotency-Key` = kode pesanan (stabil saat diulang) |
| Pesanan dibeli dua kali | Ditolak bila `rawdah_order_id` sudah terisi |
| Membeli sebelum dibayar | Ditolak bila belum ada bukti transfer |
| Status berbohong soal slot | Status `terkonfirmasi` **tidak bisa** dipilih manual dari dropdown |
| `genderId` salah bentuk | Dikirim sebagai string `"Male"`/`"Female"` (khusus endpoint beli) |
| Pembelian gagal | Status tidak diubah; alasan asli ditampilkan & dicatat di `audit_log` |

## Keamanan

Diselaraskan dengan standar sistem Albalad/AnsarPro (`04 Engineering/Security Review.md`).
Diaudit dan diuji 2026-08-07 — 18/18 pengujian otomatis lulus.

| Aspek | Penerapan di Reva Group |
| --- | --- |
| Hash password | PBKDF2-SHA256 **berantai 6 x 100.000 = 600.000 iterasi efektif** (setara anjuran OWASP). Cloudflare menolak `iterations` > 100.000, sehingga keluaran tiap putaran jadi masukan putaran berikutnya. Format lama tetap terbaca — password lama tidak perlu direset. |
| Perbandingan hash | Waktu-konstan (`timingSafeEqual`) |
| Sesi | JWT HS256, algoritma dikunci (token `alg: none` ditolak). Kolom `token_ver` naik saat ganti password → seluruh sesi lama gugur, perangkat ini dapat token pengganti. |
| Anti-CSRF | Permintaan non-GET dengan `Origin` di luar daftar izin ditolak **403**. Frontend juga mengirim `X-Requested-With` (lapis kedua). |
| Pembatas laju | D1: login 15/IP + 8/akun per 15 menit, daftar 5/jam, Google 20/15 menit, pesanan 12/jam, tracker 300/jam |
| Login Google | Wajib `email_verified` **dan** penerbit `accounts.google.com` — tanpa ini akun bisa diambil alih lewat pencocokan email |
| Otorisasi | Diputuskan di server (frontend hanya kosmetik). Owner ≠ admin; admin hanya melihat menu yang diberi izin. Owner lain tak bisa diubah, role sendiri tak bisa diturunkan. |
| Jejak audit | Tabel `audit_log`: ubah status pesanan, ubah role/izin, ubah pengaturan, ganti password, login kena limit |
| Injeksi SQL | Seluruh kueri D1 memakai parameter terikat (`.bind()`) |
| XSS | Semua data pengguna di panel admin melewati `esc()` sebelum masuk DOM |
| Kebocoran error | Detail teknis hanya ke log server (`console.error`); pengguna menerima pesan umum |
| Header situs | CSP, `X-Frame-Options: DENY`, HSTS, `Permissions-Policy`, `nosniff`, `Referrer-Policy` lewat `_headers` (**hanya aktif di Cloudflare Pages** — GitHub Pages tidak mendukung header khusus) |

**Risiko yang diterima (bukan bug):**

1. Token disimpan di `localStorage`. Aman dari CSRF, tetapi bisa dicuri lewat XSS — karena itu CSP dan `esc()` menjadi pertahanan utama.
2. Belum ada 2FA untuk akun owner.
3. Belum ada rotasi refresh-token seperti Albalad; sebagai gantinya `token_ver` memberi pemutusan sesi menyeluruh saat ganti password.

## Hosting

- **Utama**: GitHub Pages (branch `main`) → https://revagroup.co.id
- **Cadangan**: Cloudflare Pages project `revagroup` → https://revagroup.pages.dev
  Deploy cadangan: salin `*.html`, `css/`, `js/`, `assets/` ke sebuah folder `dist` (tanpa `api/`),
  lalu `npx wrangler pages deploy dist --project-name revagroup --branch main`.
  Untuk memindahkan domain ke Cloudflare: ganti 4 A record `@` di hPanel Hostinger menjadi CNAME
  ke `revagroup.pages.dev`, dan tambahkan custom domain di dashboard Cloudflare Pages.

## Jadwal Ketersediaan (API Slot Rawdah)

Halaman `reservasi.html` menampilkan jadwal ketersediaan Rawdah secara berkala:

1. GitHub Actions ([.github/workflows/availability.yml](.github/workflows/availability.yml))
   memanggil `GET /appointments/availability` API slot Rawdah tiap ±10 menit.
2. API key tersimpan **hanya** di repo secret `ANSARPRO_API_KEY` — jangan pernah menaruh key
   `ansar_live_…` di file situs; situs ini publik dan key tersebut bisa dipakai belanja.
3. Hasilnya diterbitkan sebagai `availability.json` di branch `data` (satu commit, force push).
4. `js/reservasi.js` membaca file itu via raw.githubusercontent.com dan merender kalender.
   Pemesanan final tetap via WhatsApp — endpoint purchase API sengaja tidak dipakai dari situs.

Ganti key: `gh secret set ANSARPRO_API_KEY` lalu jalankan ulang workflow
(`gh workflow run availability.yml`).

## Menjalankan & Deploy

Situs sepenuhnya statis — buka `index.html` langsung di browser, atau unggah seluruh folder ke
Netlify / Vercel / Cloudflare Pages / hosting cPanel apa pun. Tidak ada build step.

## Atribusi

- Foto hero: ["Masjid Nabwi 14"](https://commons.wikimedia.org/wiki/File:Masjid_Nabwi_14.jpg)
  oleh Tahir mq, lisensi [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
  via Wikimedia Commons. Atribusi ini wajib dipertahankan bila foto tetap digunakan.
- Logo: milik Reva Group (revagroup.co.id).
- Font: [Poppins](https://fonts.google.com/specimen/Poppins) via Google Fonts (butuh koneksi
  internet; ada fallback ke font sistem).
