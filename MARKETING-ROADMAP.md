# Roadmap Marketing Reva Group

Dokumen ini merangkum rekomendasi untuk meningkatkan jangkauan, kepercayaan, konversi, dan pendapatan website `revagroup.co.id`.

## Tujuan Utama

1. Membawa lebih banyak calon pelanggan yang relevan ke website.
2. Mengubah lebih banyak pengunjung menjadi pemesan.
3. Mengurangi pelanggan yang berhenti sebelum membayar.
4. Mengukur sumber pelanggan sampai ke pembayaran terverifikasi.
5. Membangun jaringan referral dari travel, pembimbing, agen, dan pelanggan lama.

## 1. Pengukuran Marketing

Aktifkan:

- Google Analytics 4.
- Meta Pixel.
- TikTok Pixel.
- Google Search Console.
- Pelacakan server-side untuk transaksi penting.

Event yang perlu dicatat:

- `view_reservation`: melihat halaman reservasi.
- `select_gender`: memilih sesi pria atau wanita.
- `select_schedule`: memilih tanggal dan jam.
- `begin_checkout`: membuka proses pembayaran.
- `draft_order_created`: membuat draft pesanan.
- `order_created`: pesanan berhasil disimpan.
- `payment_link_opened`: membuka tautan pembayaran.
- `payment_success`: pembayaran berhasil diverifikasi.
- `whatsapp_click`: mengeklik WhatsApp.
- `login`: berhasil masuk.
- `sign_up`: berhasil mendaftar.
- `qr_sent`: QR/tasreh sudah dikirim.
- `refund`: pembayaran dikembalikan.

Setiap event transaksi sebaiknya menyimpan sumber UTM, kode pesanan, nilai transaksi, jumlah jamaah, dan metode pembayaran. Jangan pernah mengirim password, token login, paspor, bukti transfer, atau data sensitif lain ke platform analytics.

## 2. Sepuluh Tool Akuisisi Pelanggan

### 1. Google Search Console

Gunakan untuk melihat keyword, halaman, impresi, klik, CTR, posisi pencarian, dan masalah indexing. Prioritaskan keyword dengan impresi tinggi tetapi CTR rendah.

### 2. Google Business Profile

Jika Reva Group memenuhi ketentuan bisnis fisik atau service-area, tampilkan alamat/area layanan, jam operasional, website, nomor WhatsApp, foto, informasi perusahaan, dan review pelanggan di Google Search dan Maps.

### 3. Google Keyword Planner dan Google Trends

Gunakan untuk riset keyword dan musim permintaan, misalnya:

- reservasi Rawdah;
- booking Rawdah wanita;
- jadwal Rawdah pria;
- jasa tasreh Rawdah;
- cara masuk Rawdah;
- cara mendapatkan QR Rawdah.

### 4. Semrush atau Ahrefs

Gunakan untuk menganalisis keyword kompetitor, backlink, posisi pencarian, kesenjangan konten, dan peluang landing page baru.

### 5. Google Ads Search

Targetkan orang dengan niat tinggi yang sedang mencari layanan reservasi Rawdah. Setiap kelompok iklan harus diarahkan ke landing page yang sesuai, bukan seluruhnya ke homepage.

### 6. Meta Ads Manager

Gunakan Facebook dan Instagram Ads untuk video edukasi, testimoni, retargeting, lookalike audience, dan iklan Click-to-WhatsApp.

Audiens yang perlu dipisahkan:

- pengunjung baru;
- pengunjung halaman reservasi;
- pelanggan yang belum menyelesaikan pembayaran;
- pelanggan yang sudah membayar;
- pelanggan dari mitra travel;
- lookalike dari pembeli terverifikasi.

### 7. TikTok Creative Center dan TikTok Ads

Gunakan Creative Center untuk menemukan tren, hashtag, gaya video, dan contoh iklan. Materi yang relevan mencakup tutorial reservasi, persiapan masuk Rawdah, perbedaan jadwal pria/wanita, kesalahan umum jamaah, dan proses penerimaan QR.

### 8. WhatsApp Business Platform dan CRM

Pertimbangkan penyedia resmi seperti Mekari Qontak, WATI, respond.io, atau SleekFlow. Fitur yang dibutuhkan:

- inbox untuk beberapa staf;
- label sumber pelanggan;
- template pesan resmi;
- follow-up otomatis;
- pengingat pembayaran;
- riwayat percakapan;
- pembagian lead ke staf;
- laporan waktu respons dan penjualan.

### 9. Canva dan Meta Business Suite

Gunakan Canva untuk membuat template visual yang konsisten dan Meta Business Suite untuk menjadwalkan konten Instagram dan Facebook. Siapkan template testimoni, FAQ, jadwal tersedia, panduan, kebijakan refund, dan promo referral.

### 10. Sistem Referral dan Affiliate

Berikan tautan atau kode unik kepada travel umrah, pembimbing, agen, kreator konten, serta pelanggan lama, misalnya:

```text
https://revagroup.co.id/reservasi.html?ref=TRAVELABC
```

Catat kunjungan, draft pesanan, pembayaran terverifikasi, refund, nilai komisi, dan status pencairan. Komisi hanya dihitung setelah pembayaran benar-benar berhasil dan tidak direfund.

## 3. Tool untuk Meningkatkan Konversi dan Pendapatan

### Payment Gateway

Pertimbangkan Midtrans atau Xendit untuk:

- QRIS dinamis;
- Virtual Account;
- dompet digital;
- payment link;
- status pembayaran melalui webhook;
- masa berlaku pembayaran;
- rekonsiliasi otomatis.

Status pesanan hanya boleh berubah menjadi lunas berdasarkan webhook yang valid, bukan berdasarkan klik tombol pelanggan.

### Microsoft Clarity

Gunakan session recording dan heatmap untuk menemukan titik ketika pelanggan berhenti, salah klik, tidak menemukan tombol, atau kesulitan menggunakan checkout. Masking wajib diterapkan pada nama, WhatsApp, email, password, dan data pembayaran.

### A/B Testing

Pertimbangkan PostHog, VWO, atau Optimizely untuk menguji:

- headline;
- teks tombol;
- posisi testimoni;
- susunan checkout;
- penjelasan refund;
- harga per jamaah versus paket;
- tombol WhatsApp versus checkout langsung.

Ukuran keberhasilan utama adalah pembayaran terverifikasi, bukan hanya klik.

### Dashboard Pendapatan

Gunakan dashboard admin internal, Looker Studio, atau Metabase untuk melihat:

- pendapatan harian dan bulanan;
- conversion rate;
- biaya per pelanggan;
- pendapatan per kampanye;
- pesanan belum dibayar;
- payment failure rate;
- refund rate;
- rata-rata jumlah jamaah;
- slot paling laku;
- waktu respons WhatsApp;
- performa setiap referral.

### Enhanced Conversions dan Offline Conversion

Kirim status pembayaran terverifikasi kembali ke Google Ads dan Meta agar algoritma iklan belajar dari pelanggan yang benar-benar membayar, bukan hanya orang yang membuka halaman atau WhatsApp. Data pelanggan harus dinormalisasi, di-hash, dikirim sesuai izin pelanggan, dan mengikuti kebijakan privasi platform.

## 4. Pengembangan Website untuk Marketing

### Bukti Kepercayaan

Tambahkan:

- testimoni pelanggan asli;
- label "Pelanggan Terverifikasi";
- contoh QR/tasreh yang sudah disamarkan;
- legalitas dan identitas PT;
- alamat/area layanan yang valid;
- rekening resmi perusahaan;
- foto atau video tim;
- jumlah jamaah terbantu hanya jika datanya nyata.

Hindari testimoni palsu, jumlah pelanggan rekaan, countdown palsu, dan kelangkaan slot yang tidak berasal dari data nyata.

### Landing Page SEO

Pertimbangkan halaman berikut:

- `/reservasi-rawdah-wanita`;
- `/reservasi-rawdah-pria`;
- `/cara-masuk-rawdah`;
- `/jadwal-rawdah`;
- `/panduan-rawdah-untuk-jamaah-umrah`.

Setiap halaman harus mempunyai satu tujuan utama: memulai reservasi atau konsultasi WhatsApp.

### Konten Edukasi

Buat artikel dan video tentang:

- cara melakukan reservasi Rawdah;
- jadwal pria dan wanita;
- dokumen yang harus dibawa;
- alasan QR tidak muncul;
- langkah ketika slot penuh;
- waktu terbaik melakukan pemesanan;
- persiapan sebelum masuk Rawdah;
- kebijakan pembayaran dan refund.

Satu artikel dapat diolah menjadi video TikTok, Instagram Reel, carousel, FAQ, dan WhatsApp Broadcast.

### SEO Teknis

Tambahkan dan verifikasi:

- `robots.txt`;
- `sitemap.xml`;
- favicon;
- canonical URL;
- meta title dan description unik;
- Open Graph image;
- structured data `Organization` atau `LocalBusiness` jika memenuhi syarat;
- structured data FAQ yang sesuai kebijakan mesin pencari;
- performa mobile dan Core Web Vitals.

### Penawaran Utama

Contoh headline:

> Reservasi Rawdah Lebih Mudah
>
> Pilih jadwal pria atau wanita, selesaikan pembayaran, dan terima tasreh melalui WhatsApp.

Di dekat CTA, jelaskan:

- apa yang pelanggan dapatkan;
- estimasi waktu penerimaan QR;
- jadwal terakhir diperbarui;
- dukungan WhatsApp;
- harga total tanpa biaya tersembunyi;
- ketentuan jika reservasi tidak berhasil.

## 5. Checkout dan Follow-up

Alur yang disarankan:

```text
Pengunjung memilih slot
-> memasukkan nama dan WhatsApp
-> sistem membuat draft pesanan
-> sistem mengunci slot untuk waktu terbatas
-> pelanggan menerima payment link
-> webhook memverifikasi pembayaran
-> status pesanan diperbarui otomatis
-> pelanggan menerima konfirmasi WhatsApp
-> QR/tasreh dikirim
-> pelanggan diminta memberikan testimoni
```

Follow-up otomatis:

- 15 menit setelah draft dibuat tetapi belum dibayar;
- ketika payment link hampir kedaluwarsa;
- ketika pembayaran berhasil;
- ketika QR tersedia;
- ketika slot habis dengan rekomendasi tanggal lain;
- setelah layanan selesai untuk meminta review;
- program referral setelah pelanggan selesai dilayani.

Pesan promosi dan broadcast hanya boleh dikirim kepada pelanggan yang telah memberikan persetujuan.

## 6. Roadmap Prioritas

### Fase 1 — Fondasi Akuisisi

1. Pasang Google Search Console.
2. Tambahkan `robots.txt`, `sitemap.xml`, favicon, canonical, dan meta SEO.
3. Buat Google Business Profile jika bisnis memenuhi persyaratan.
4. Aktifkan GA4 dan definisikan event funnel.
5. Tambahkan Microsoft Clarity dengan masking data sensitif.

### Fase 2 — Konversi dan Pembayaran

1. Integrasikan payment gateway dan webhook.
2. Buat draft checkout dan penguncian slot sementara.
3. Terapkan abandoned-payment recovery.
4. Integrasikan WhatsApp CRM.
5. Tambahkan bukti kepercayaan dan testimoni terverifikasi.

### Fase 3 — Pertumbuhan Berbayar

1. Jalankan Google Ads Search.
2. Jalankan Meta Click-to-WhatsApp dan retargeting.
3. Uji konten serta iklan TikTok.
4. Kirim conversion terverifikasi kembali ke platform iklan.
5. Pantau biaya per pembayaran, bukan sekadar biaya per klik.

### Fase 4 — Pertumbuhan Organik dan Mitra

1. Bangun landing page SEO.
2. Terbitkan konten edukasi secara rutin.
3. Jalankan program referral travel dan pembimbing.
4. Bangun dashboard affiliate.
5. Lakukan A/B testing setelah trafik mencukupi.

## 7. KPI Utama

Pantau KPI berikut setiap minggu:

- jumlah pengunjung baru;
- sumber trafik;
- CTR organik Google;
- persentase pengunjung yang memilih jadwal;
- persentase yang membuka checkout;
- persentase draft menjadi pembayaran;
- jumlah klik WhatsApp;
- waktu respons staf;
- cost per paid order;
- pendapatan per channel;
- refund rate;
- repeat dan referral rate.

North-star metric yang disarankan adalah **jumlah pembayaran reservasi yang terverifikasi**, disertai pendapatan bersih setelah biaya iklan, payment gateway, komisi, dan refund.

