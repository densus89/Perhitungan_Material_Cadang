# Perencanaan Material Cadang

Aplikasi Next.js untuk fondasi autentikasi, otorisasi, dan mockup perencanaan material cadang. Supabase menyediakan Auth, PostgreSQL, dan Row Level Security; Vercel menjalankan aplikasi secara dinamis.

Tahap ini menyediakan akun invite-only, penugasan Unit Induk, dan alur impor snapshot aset persisten: template, preview Worker, upload privat, pemetaan, valuasi teraudit, resume draft, pengajuan dan aktivasi DIV RST dengan histori. RFQ, mesin klasifikasi ABC, inventory policy, prioritas lokasi, dan ekspor perhitungan masih memakai **Data Demo**.

## Menjalankan lokal

Gunakan Node.js 24.15–24.x dan pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Salin `.env.example` menjadi `.env.local` dan isi:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — hanya server; jangan memakai prefiks `NEXT_PUBLIC_`
- `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` untuk lokal

Pendaftaran publik dinonaktifkan. Akun umumnya harus memakai domain persis `@pln.co.id`; hanya `sitompul89@gmail.com` yang diizinkan sebagai pengecualian guest/uji coba. Pengecualian ini tetap memerlukan undangan atau bootstrap admin.

## Verifikasi

```sh
pnpm test
pnpm db:test
pnpm db:lint
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm test:e2e
pnpm bench:asset-import
```

`pnpm db:test` menjalankan seluruh pgTAP pada proyek development Supabase yang tertaut melalui Management API. Jangan menjalankan `db reset --linked` pada proyek yang bukan disposable.

Playwright menjalankan aplikasi dinamis melalui `pnpm dev` secara lokal atau `pnpm start` di CI setelah build selesai. E2E membutuhkan empat variabel aplikasi di atas ditambah `E2E_TEST_PASSWORD` dan konfirmasi literal `E2E_CONFIRM_SYNTHETIC_DEV_PROJECT=yes-delete-synthetic-users`. Suite autentikasi memakai dua akun exact `*.synthetic@pln.co.id`; suite impor menambahkan tiga akun dan dua unit sintetis ber-ID unik. Cleanup memverifikasi marker dan hanya menghapus resource exact tersebut. Gunakan `E2E_BASE_URL` untuk menguji preview development, bukan database production operasional. Jalankan benchmark terpisah dari suite browser/UI.

## Dokumen

- [Desain persistensi dan akses](docs/superpowers/specs/2026-10-13-persistent-data-and-access-design.md)
- [Rencana fondasi Supabase dan autentikasi](docs/superpowers/plans/2026-10-13-supabase-foundation-auth.md)
- [Panduan operasi Supabase](docs/operations/supabase-setup.md)
- [Runbook impor, referensi GI dan pemulihan](docs/operations/asset-import-runbook.md)

## Batas privasi dan fase

Service/secret key tidak boleh masuk browser, Git, log, atau tangkapan layar. Workbook sumber berada pada bucket privat `source-files`; spreadsheet, kredensial, dan dokumen internal diabaikan Git. Preview browser bersifat pendahuluan; hasil server yang lengkap dan persetujuan DIV RST menentukan snapshot aktif. Pengajuan tidak menghapus atau mengganti versi aktif.

Fase berikutnya menangani normalisasi RFQ yang disetujui dan mesin ABC A1/A2/B1/B2/C. `nilaiABC` adalah nilai buku; harga pengadaan baru tetap terpisah untuk Optimum Spare A2/B1. Kelas C tetap diaudit tanpa alokasi. Impor hanya menerima `.xlsx` 1 byte–50 MiB. Perintah `pnpm reference:gi` wajib dry-run, hash, dan aktor admin RST eksplisit sebelum konfirmasi.

## Deployment

Production: [perhitungan-material-cadang.vercel.app](https://perhitungan-material-cadang.vercel.app).

Proyek Vercel memerlukan empat nama variabel aplikasi yang sama pada Development, Preview, dan Production. Aktifkan system environment variables Vercel untuk preview: mutasi hanya menerima origin HTTPS exact dari `VERCEL_URL` saat `VERCEL=1` dan `VERCEL_ENV=preview`; production tetap memakai `NEXT_PUBLIC_SITE_URL` kanonis. Host/forwarding header dan alias preview lain tidak menjadi sumber kepercayaan. Lakukan preview dari commit yang telah direview, validasi login, lalu promosikan commit yang sama. Panduan lengkap, bootstrap, rotasi rahasia, dan pemulihan ada di [panduan operasi](docs/operations/supabase-setup.md).
