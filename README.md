# Smart Waste Route Optimizer · Kota Lhokseumawe

Aplikasi web untuk menyusun **rute dan jadwal pengangkutan sampah** dari titik TPS menuju TPA dengan jarak tempuh terpendek, memantau muatan armada, serta **menyusun ulang rute secara otomatis (re-routing dinamis)** ketika armada penuh.

**Tema:** Smart Ecosystems: Digital Solutions for a Sustainable Future
**Subtema:** Smart City & Urban Innovation (SDG 9 & 11)

## Cara menjalankan

Cukup **buka `index.html` di browser** (klik dua kali). Tidak ada instalasi, server, akun, maupun kunci API.

> Butuh internet untuk menampilkan tile peta dan menghitung jarak jalan nyata (OSRM). Tanpa internet, aplikasi tetap berjalan memakai estimasi jarak garis lurus × 1,3.

Untuk dipublikasikan, unggah seluruh isi folder ke GitHub Pages / Netlify / hosting statis apa pun. Jika peta dasar kosong saat dibuka langsung dari berkas, jalankan lewat server lokal atau hosting (lihat `PANDUAN.md`, bagian C).

**Panduan lengkap alur penggunaan dan cara mengubah isi aplikasi: [`PANDUAN.md`](PANDUAN.md).**

## Fitur

- **Jadwal Shift:** admin mengatur tiap truk (nama, plat, kapasitas, aktif/nonaktif) dan jam shift (mis. Truk A Pagi, Truk B Siang, Truk C Sore) pada bagan jadwal harian, plus lama layanan per TPS, lama bongkar, dan jam simulasi untuk demo.
- **Dashboard Admin:** pilih truk dan TPS → buat rute optimal per truk (atau **bagi otomatis ke semua truk**) → lihat KPI, itinerary dengan **perkiraan jam tiba** dan nomor rit, peringatan bila melewati jam shift, dan peta interaktif.
- **Portal Driver:** pilih truk, target TPS berikutnya, penanda selesai, meter muatan, **peringatan prediktif** bila TPS berikutnya diperkirakan melebihi kapasitas, tombol menuju depot, dan **re-routing** hanya untuk TPS yang belum selesai.
- **Ringkasan perjalanan** dengan riwayat muatan per TPS.
- **Responsif** (HP, tablet, desktop), navigasi keyboard, label aksesibilitas, dan mendukung `prefers-reduced-motion`.
- Kondisi simulasi tersimpan di browser (localStorage); tombol **Reset Simulasi** mengembalikan ke awal.

## Cara kerja algoritma

1. Ambil matriks jarak antar titik dari **OSRM** (jaringan jalan nyata).
2. **Nearest Neighbor** membentuk rute awal.
3. **2-Opt** memperbaiki rute dengan menghilangkan jalur bersilangan.
4. Garis rute jalan digambar di peta; muatan dipantau per TPS.
5. Saat armada penuh, driver menuju depot, muatan di-reset, lalu rute **dihitung ulang** untuk TPS yang tersisa (TPS berstatus *completed* tidak ikut dihitung).

## Struktur folder

```
index.html            Halaman utama
css/style.css         Seluruh gaya antarmuka (CSS murni)
js/data.js            Data depot, truk & shift, pengaturan, dan 15 TPS Lhokseumawe
js/time.js            Fungsi jam dan status shift
js/store.js           Penyimpanan kondisi simulasi (localStorage)
js/geo.js             Jarak & rute jalan (OSRM + cadangan estimasi)
js/tsp.js             Algoritma Nearest Neighbor + 2-Opt
js/route-engine.js    Rute per truk, jam tiba, kapasitas prediktif, re-routing, bagi otomatis
js/map.js             Peta Leaflet (3 sumber peta dengan cadangan otomatis) dan penanda
js/admin.js           Dashboard admin
js/schedule.js        Tab Jadwal Shift
js/driver.js          Portal driver
js/ui.js              Notifikasi dan dialog
vendor/leaflet/       Pustaka peta Leaflet 1.9.4 (disertakan lokal)
```

## Mengubah data

Data awal ada di `js/data.js`: koordinat depot, truk beserta jam shift, pengaturan waktu, serta daftar TPS (nama, koordinat, estimasi volume dalam kg, dan status `planned` / `completed`). Jadwal juga dapat diubah langsung dari tab Jadwal Shift.

## Teknologi dan atribusi

HTML, CSS, dan JavaScript murni. Pustaka pihak ketiga hanya **Leaflet** (lisensi BSD-2, disertakan di `vendor/leaflet/`). Data peta © kontributor OpenStreetMap, tile © CARTO, perutean oleh layanan publik OSRM.
