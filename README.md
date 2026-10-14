# Perencanaan Material Cadang

Aplikasi Next.js untuk fondasi autentikasi, otorisasi, dan mockup perencanaan material cadang. Supabase menyediakan Auth, PostgreSQL, dan Row Level Security; Vercel menjalankan aplikasi secara dinamis.

Tahap ini sudah menyediakan akun invite-only, peran dan penugasan Unit Induk, halaman administrasi DIV RST, sesi server, serta pengujian RLS. Modul impor, RFQ, ABC, inventory policy, prioritas lokasi, dan ekspor masih menggunakan **Data Demo** dan belum membaca spreadsheet operasional.

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
pnpm build
pnpm test:e2e
```

`pnpm db:test` menjalankan seluruh pgTAP pada proyek development Supabase yang tertaut melalui Management API. Jangan menjalankan `db reset --linked` pada proyek yang bukan disposable.

Playwright menjalankan aplikasi dinamis melalui `pnpm dev` secara lokal atau `pnpm start` di CI. E2E membutuhkan empat variabel aplikasi di atas ditambah `E2E_TEST_PASSWORD` dan konfirmasi literal `E2E_CONFIRM_SYNTHETIC_DEV_PROJECT=yes-delete-synthetic-users`. Setup hanya boleh membuat dua akun `*.synthetic@pln.co.id` bertanda khusus dan teardown hanya menghapus identitas persis tersebut. Gunakan `E2E_BASE_URL` untuk menguji deployment eksternal.

## Dokumen

- [Desain persistensi dan akses](docs/superpowers/specs/2026-10-13-persistent-data-and-access-design.md)
- [Rencana fondasi Supabase dan autentikasi](docs/superpowers/plans/2026-10-13-supabase-foundation-auth.md)
- [Panduan operasi Supabase](docs/operations/supabase-setup.md)

## Batas privasi dan fase

Service/secret key tidak boleh masuk browser, Git, log, atau tangkapan layar. File spreadsheet, kredensial, dan dokumen internal diabaikan oleh Git. Data demo bersifat sintetis; keputusan approval dan impor demo masih berada di state browser dan tidak boleh dianggap sebagai data operasional tersimpan.

Fase berikutnya akan menangani persistent import dan approval, kemudian engine RFQ/perhitungan, lalu hasil nasional dan operasi. Detail fase tersedia pada dokumen desain dan rencana.

## Deployment

Production: [perhitungan-material-cadang.vercel.app](https://perhitungan-material-cadang.vercel.app).

Proyek Vercel memerlukan empat variabel aplikasi yang sama pada Development, Preview, dan Production. Lakukan preview dari commit yang telah direview, validasi login, lalu promosikan commit yang sama. Panduan lengkap, bootstrap, rotasi rahasia, dan pemulihan ada di [panduan operasi](docs/operations/supabase-setup.md).
