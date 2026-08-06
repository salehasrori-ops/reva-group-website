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

## Hosting

- **Utama**: GitHub Pages (branch `main`) → https://revagroup.co.id
- **Cadangan**: Cloudflare Pages project `revagroup` → https://revagroup.pages.dev
  Deploy cadangan: salin `*.html`, `css/`, `js/`, `assets/` ke sebuah folder `dist` (tanpa `api/`),
  lalu `npx wrangler pages deploy dist --project-name revagroup --branch main`.
  Untuk memindahkan domain ke Cloudflare: ganti 4 A record `@` di hPanel Hostinger menjadi CNAME
  ke `revagroup.pages.dev`, dan tambahkan custom domain di dashboard Cloudflare Pages.

## Jadwal Ketersediaan (AnsarPro API)

Halaman `reservasi.html` menampilkan jadwal ketersediaan Rawdah secara berkala:

1. GitHub Actions ([.github/workflows/availability.yml](.github/workflows/availability.yml))
   memanggil `GET /appointments/availability` AnsarPro API tiap ±10 menit.
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
