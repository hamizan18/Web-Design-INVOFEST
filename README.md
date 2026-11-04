# Smart Waste Route Optimizer · Kota Lhokseumawe

Aplikasi web untuk menyusun **rute dan jadwal pengangkutan sampah** dari titik TPS menuju TPA dengan jarak tempuh terpendek, memantau muatan armada, serta **menyusun ulang rute secara otomatis (re-routing dinamis)** ketika armada penuh.

**Tema:** Smart Ecosystems: Digital Solutions for a Sustainable Future
**Subtema:** Smart City & Urban Innovation (SDG 9 & 11)

## Cara menjalankan

Cukup **buka `index.html` di browser** (klik dua kali). Tidak ada instalasi, server, akun, maupun kunci API.

> Butuh internet untuk menampilkan tile peta dan menghitung jarak jalan nyata (OSRM). Tanpa internet, aplikasi tetap berjalan memakai estimasi jarak garis lurus × 1,3.

Untuk dipublikasikan, unggah seluruh isi folder ke GitHub Pages / Netlify / hosting statis apa pun.

## Fitur

- **Dashboard Admin:** pilih depot, armada, dan TPS → buat rute optimal → lihat KPI (jarak, durasi, penghematan 2-Opt, total muatan, estimasi jumlah rit), itinerary per rit, dan peta interaktif.
- **Portal Driver:** target TPS berikutnya, penanda selesai, meter muatan, **peringatan prediktif** bila TPS berikutnya diperkirakan melebihi kapasitas, tombol menuju depot, dan **re-routing** hanya untuk TPS yang belum selesai.
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
js/data.js            Data depot, armada, dan 15 TPS Lhokseumawe
js/store.js           Penyimpanan kondisi simulasi (localStorage)
js/geo.js             Jarak & rute jalan (OSRM + cadangan estimasi)
js/tsp.js             Algoritma Nearest Neighbor + 2-Opt
js/route-engine.js    Pembuatan rute, kapasitas prediktif, re-routing, ringkasan
js/map.js             Peta Leaflet dan penanda
js/admin.js           Dashboard admin
js/driver.js          Portal driver
js/ui.js              Notifikasi dan dialog
vendor/leaflet/       Pustaka peta Leaflet 1.9.4 (disertakan lokal)
```

## Mengubah data

Semua data ada di `js/data.js`: koordinat depot, kapasitas armada, serta daftar TPS (nama, koordinat, estimasi volume dalam kg, dan status `planned` / `completed`).

## Teknologi dan atribusi

HTML, CSS, dan JavaScript murni. Pustaka pihak ketiga hanya **Leaflet** (lisensi BSD-2, disertakan di `vendor/leaflet/`). Data peta © kontributor OpenStreetMap, tile © CARTO, perutean oleh layanan publik OSRM.
