# Perencanaan Material Cadang — Mockup v1

Antarmuka demonstrasi berbahasa Indonesia untuk ringkasan, impor metadata, review pemetaan RFQ, analisis ABC, inventory policy, prioritas lokasi, dan ekspor demo. Seluruh angka, spesifikasi, dan nama GI / UPT adalah skenario sintetis yang ditulis khusus untuk mockup. Label **Data Demo** selalu ditampilkan.

## Menjalankan lokal

Gunakan Node.js 24.15–24.x dan pnpm 11.25.0 sesuai `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Buka `http://localhost:3000/ringkasan/`. Navigasi sidebar menggunakan tautan klien sehingga keputusan approval dan tahapan impor bertahan saat berpindah halaman. Refresh atau membuka tab baru memulai sesi demo baru; tombol reset mengembalikan fixture awal.

## Verifikasi dan hasil statis

```sh
pnpm test
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm build` menghasilkan `out/` dengan semua rute, termasuk `/ekspor/`. Jalankan build sebelum e2e: Playwright menyajikan folder `out/` pada `127.0.0.1:3000`. Port harus kosong. Untuk preview manual setelah build, jalankan `node tests/e2e/serve-static.mjs`. Jangan membuka HTML langsung melalui `file://` karena navigasi dan aset memerlukan HTTP. Laporan Playwright dan hasil build diabaikan oleh Git.

## Batas privasi dan ekspor

Impor lokal hanya menyimpan nama, ukuran, dan jenis berkas dalam memori browser. Isi spreadsheet tidak dibaca, diunggah, atau dihitung. Nama yang dipilih pengguna hanya terlihat dalam panel impor pada sesi tersebut.

Ekspor JSON memuat snapshot sintetis lengkap: audit approval (status dan metode), ABC, policy, dan lokasi. CSV terpisah tersedia untuk audit, policy, dan lokasi. Keputusan approval saat ini memengaruhi audit dan status draft/final policy; filter tabel tidak membatasi snapshot. Exporter mengambil teks dan identitas dari fixture demo, serta hanya menerima status/metode yang dikenal dan target RFQ demo. Metadata berkas lokal, path, dan pengenal sumber tidak masuk unduhan. CSV memakai UTF-8 BOM, sel berpetik, dan baris CRLF.

Setiap lokasi membawa satu `idealQuantityReference` dan `allocationStatus: REFERENCE_ONLY`. Referensi policy material dapat berulang pada beberapa lokasi, tetapi tidak boleh dijumlahkan atau dikalikan untuk menghasilkan alokasi GI / UPT. P0–P4, umur, dan jarak Haversine ke titik acuan Gandul menentukan urutan demonstrasi.

## Fitur yang belum untuk produksi

Tidak ada autentikasi, penyimpanan server, parsing Excel, koneksi data operasional, atau mesin perhitungan produksi. Nilai ABC dan policy adalah ilustrasi tetap. Mockup tidak mengklaim kesetaraan perhitungan Excel. Approval adalah keputusan sementara di browser, bukan persetujuan organisasi. Koordinat lokasi adalah sintetis; titik acuan Gandul dipakai hanya sebagai acuan jarak. Alokasi per lokasi tidak dihitung.

Aksesibilitas mencakup tautan lewati ke konten, label filter, focus ring, tabel dengan header/caption, dan dialog modal native dengan Escape serta pengembalian fokus. Tabel lebar dan navigasi mobile dapat digulir horizontal; data grafik juga disajikan dalam tabel.

## Deploy ke Vercel

Impor repositori sebagai proyek Next.js, pilih Node.js 24.x, jalankan `pnpm install --frozen-lockfile` dan build `pnpm build`, lalu gunakan direktori output `out` jika konfigurasi proyek meminta direktori statis. `next.config.ts` sudah memakai `output: "export"` dan `trailingSlash: true`. Deploy hanya sumber aplikasi yang dilacak Git dan hasil `out/`; jangan sertakan dokumen internal, berkas lokal pengguna, screenshot QA, atau direktori perencanaan. Tidak diperlukan variabel rahasia atau layanan backend.
