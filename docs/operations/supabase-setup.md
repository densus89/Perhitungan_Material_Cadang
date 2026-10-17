# Operasi Supabase dan Deployment

Panduan ini berlaku untuk autentikasi dan snapshot aset persisten. Gunakan proyek Supabase development terpisah; jangan menaruh project ref, password database, access token, atau API key nyata dalam Git. Alur sumber privat, referensi GI, pemetaan, retry, dan aktivasi dijelaskan pada [runbook impor](asset-import-runbook.md).

## 1. Membuat dan menautkan proyek

1. Buat proyek Supabase Free di **Southeast Asia (Singapore)**.
2. Simpan database password di password manager dan rotasi segera bila pernah terkirim melalui chat atau log.
3. Login CLI lalu tautkan checkout:

   ```sh
   pnpm supabase login
   pnpm supabase link --project-ref <project-ref>
   ```

4. Pastikan proyek masih kosong atau merupakan development project yang memang ditujukan untuk aplikasi ini.

Supabase Free dapat pause saat lama tidak aktif. Bila aplikasi tidak dapat terhubung, cek status proyek di dashboard dan pulihkan proyek sebelum mengubah kode atau kredensial.

## 2. Migrasi, seed, tipe, dan pgTAP

Tinjau migrasi sebelum menerapkannya:

```sh
pnpm supabase db push --linked --dry-run
pnpm supabase db push --linked
pnpm db:types > src/lib/supabase/database.types.ts
pnpm db:test
pnpm db:lint
```

Bandingkan tipe hasil generate sebelum commit. Tes pgTAP berjalan dalam transaksi yang di-rollback. Bila koneksi temporary role terputus, ganti jaringan lalu ulangi; jangan memasukkan password ke source atau command history.

Sebelas Unit Induk kanonis dipasang idempoten oleh migrasi, sehingga `db push` pada proyek hosted baru langsung menghasilkan data referensi yang diperlukan. `supabase/seed.sql` tetap dipertahankan untuk `supabase db reset` lokal; file tersebut bukan langkah deployment hosted tersendiri.

> **Larangan:** jangan pernah menjalankan `supabase db reset --linked` di luar proyek disposable yang secara eksplisit boleh dihapus. Migrasi production harus selalu melalui dry-run, review, lalu push.

## 3. Pengaturan Auth hosted

Konfigurasikan Auth dengan:

- Site URL production aplikasi;
- redirect exact lokal dan production untuk `/auth/callback` dan `/auth/invite`;
- provider email/password **enabled** agar akun undangan dapat masuk, tetapi public signup global tetap **disabled**;
- anonymous sign-in **disabled**;
- email confirmation **enabled**;
- minimum password length **12**;
- secure password change **enabled**.

TOTP MFA tersedia pada Supabase Free tanpa provider SMS. Aplikasi mewajibkan sesi `aal2` untuk `RST_ADMIN` di boundary server dan RLS database; role lain tetap dapat memakai `aal1`. Jangan menonaktifkan TOTP pada proyek hosted.

Undangan default Supabase mendarat di `/auth/invite`, yang membersihkan fragment token dari address bar lalu membentuk cookie session sebelum pengguna membuat kata sandi. Jangan menghapus rute ini tanpa mengganti template/provider email secara terkoordinasi.

Akun normal wajib memakai domain persis `@pln.co.id`. Pengecualian sementara satu-satunya adalah `sitompul89@gmail.com` untuk guest/uji coba pemilik; alamat Gmail lain dan alias `+` tetap ditolak. Public signup tetap disabled, sehingga alamat pengecualian hanya dapat masuk setelah undangan atau bootstrap terkontrol.

Provider email bawaan pada Free tier memiliki batas recipient/rate yang ketat. Jika pengiriman undangan ditolak, konfigurasi custom SMTP yang disetujui organisasi; jangan melemahkan validasi aplikasi atau menambahkan pengguna sebagai anggota organisasi Supabase hanya untuk melewati pembatasan email.

## 4. Environment aplikasi

Simpan nilai berikut pada `.env.local` yang diabaikan Git serta encrypted environment settings Vercel:

| Variabel | Cakupan | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser/server | URL proyek Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser/server | publishable key modern |
| `SUPABASE_SECRET_KEY` | server only | secret key modern; tandai sensitive |
| `NEXT_PUBLIC_SITE_URL` | server | origin kanonis aplikasi tanpa path |

`SUPABASE_SECRET_KEY` tidak boleh memiliki prefiks `NEXT_PUBLIC_`, muncul di client bundle, response browser, log, atau screenshot. Rotasi secret melalui Supabase dashboard/API, perbarui semua target Vercel, redeploy, lalu cabut kunci lama. Rotasi database password dan access token dilakukan terpisah.

## 5. Bootstrap admin pertama

Jalankan hanya setelah source yang mendukung alur undangan sudah ter-deploy dan redirect `/auth/invite` telah diizinkan.

```sh
BOOTSTRAP_ADMIN_EMAIL=<email-yang-diizinkan> node scripts/bootstrap-admin.mjs --confirm
```

Empat variabel aplikasi juga harus tersedia pada proses. Script menolak admin aktif kedua kecuali operator sengaja menambahkan `--allow-existing`, mempertahankan akun tetap disabled selama assignment, dan mencoba kompensasi bila persistensi gagal. Setelah email diterima, pengguna membuka undangan, menetapkan kata sandi minimal 12 karakter, lalu login. Admin kemudian diarahkan ke `/auth/mfa/`, memindai QR dengan aplikasi autentikator, menyimpan kunci setup TOTP sebagai cadangan pada password manager organisasi, dan memverifikasi kode enam digit sebelum workspace dibuka.

Email akun tidak dapat diubah pada fase 1 karena role terikat pada identitas yang diundang. Untuk mengganti pemilik, undang akun baru, verifikasi aksesnya, lalu nonaktifkan akun lama melalui proses DIV RST; jangan mengedit `auth.users.email` atau `profiles.email` secara langsung.

Untuk pilot ini gunakan `sitompul89@gmail.com`. Jangan bootstrap email lain sebelum DIV RST menentukan pemilik akun dan perannya.

## 6. E2E hosted yang aman

Selain environment aplikasi, buat password sementara minimal 12 karakter di memori proses dan set:

```text
E2E_TEST_PASSWORD=<generated-temporary-password>
E2E_CONFIRM_SYNTHETIC_DEV_PROJECT=yes-delete-synthetic-users
```

Jalankan `pnpm test:e2e` secara lokal atau set `E2E_BASE_URL=<preview-origin>` untuk deployment eksternal. Global setup membersihkan dan membuat ulang hanya dua akun exact `*.synthetic@pln.co.id` dengan marker `material-cadang-e2e-v1`; teardown menolak menghapus akun tanpa kombinasi email dan marker tersebut.

Tes mencakup redirect tanpa sesi, enrollment TOTP dan login AAL2 admin, penolakan admin untuk operator, logout, dan navigasi demo. Helper hanya menghapus faktor milik akun admin sintetis yang marker-nya tepat; faktor dan user sintetis dibersihkan setelah suite. Jika setup gagal, pastikan teardown terverifikasi sebelum menghapus akun secara manual.

## 7. Preview dan production Vercel

1. Isi empat environment variables untuk Development, Preview, dan Production. Pertahankan `NEXT_PUBLIC_SITE_URL` sebagai origin kanonis untuk link undangan/pemulihan dan proteksi mutasi production; jangan menggantinya dengan request Host.
   Validasi nilainya tanpa mencetak isi: jangan menyertakan CR/LF atau whitespace pembungkus dari file/pipeline. Kasus preview 2026-10-17 pulih setelah CRLF dibersihkan dari `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan `NEXT_PUBLIC_SUPABASE_URL` pada ketiga target lalu commit yang sama di-rebuild/redeploy; probe create berubah dari 403 menjadi 200. Jangan melonggarkan guard untuk menutupi setting rusak. Nilai `NEXT_PUBLIC_*` yang sudah dibundel tidak berubah hanya dengan memperbarui setting.
2. Aktifkan **Enable access to System Environment Variables** pada proyek Vercel, lalu deploy preview dari commit yang telah direview. Pada `VERCEL=1` + `VERCEL_ENV=preview`, proteksi mutasi import/review/admin memakai hanya `https://<VERCEL_URL>` exact (hostname deployment `*.vercel.app`, tanpa scheme/path/port pada nilai env). Nilai hilang/rusak ditolak; Host/`x-forwarded-host`, domain production, dan alias branch bukan fallback preview. Production/lokal tetap memakai origin kanonis yang dikonfigurasi. Lihat [kontrak system variables Vercel](https://vercel.com/docs/environment-variables/system-environment-variables).
3. Validasi halaman login, redirect workspace, admin authorization, logout, callback yang diizinkan, dan tidak adanya secret pada client bundle/network response.
4. Promosikan atau deploy **commit yang sama** ke production.
5. Jalankan smoke/E2E terhadap production sesuai kebijakan; jangan menjalankan skenario destruktif synthetic-user pada database production yang berisi pengguna operasional.

Jika jaringan kantor memblokir `*.vercel.app`, verifikasi melalui jaringan lain dan ajukan custom domain/allowlist sebagai pekerjaan operasional terpisah.

Pengujian login menunggu URL akhir `/auth/mfa/` atau `/ringkasan/` sampai 30 detik, tanpa sleep/retry sign-in. Redirect antara melalui `/` belum merupakan kegagalan autentikasi. Periksa status mutasi pertama `/api/imports/` sebelum menyimpulkan rute `/process/` macet; penolakan 403 sebelum draft dibuat tidak pernah memulai proses 300 detik.

## 8. Pemulihan dan batas fase

- Bila secret bocor: rotasi, perbarui Vercel, redeploy, cabut yang lama, dan audit log.
- Bila undangan gagal: cek rate limit/default provider, redirect allowlist, dan status proyek; jangan mengaktifkan public signup.
- Bila user salah assignment: admin mengubah akses melalui UI; RPC database menyelesaikan replacement secara atomik/fail-closed.
- Bila admin kehilangan autentikator: operator Supabase yang berwenang memverifikasi identitas pemilik, menghapus faktor MFA akun tersebut melalui Auth Admin, lalu meminta admin enrollment ulang. Penghapusan faktor mengakhiri sesi aktif; catat tindakan sebagai insiden operasional sampai UI recovery khusus tersedia.
- Bila Free tier mendekati batas: review database/storage/egress dan upgrade secara sadar; jangan menghapus histori otomatis.

Snapshot aset dan approval dipersistensikan. Keputusan RFQ demo, hasil ABC/policy demo, dan prioritas lokasi demo tetap terpisah dari snapshot aktif. Jangan menghapus versi aktif/histori untuk mengosongkan ruang. Perubahan aturan menghasilkan versi baru untuk review.

Migrasi GI menambahkan RPC service-only `replace_gi_location_reference`, mencabut direct write master, dan mengaudit replacement secara atomik. Gunakan aktor admin RST aktif dan dry-run CSV sesuai runbook. Semua perubahan schema berikutnya harus berupa migrasi maju; jangan mengubah migrasi yang sudah diterapkan.

Suite aset hosted menggunakan tiga akun dan dua unit sintetis ber-ID unik, selain dua akun exact suite autentikasi. Cleanup memverifikasi kode unit, UUID, email, marker dan run ID, menghapus objek sumber yang tepat, lalu membersihkan data sintetis lewat transaksi koneksi development khusus dan menghapus user terkait. Laporan/log fixture dan workbook tidak boleh dipublikasikan. Jika cleanup gagal, pertahankan ID run dan lakukan recovery hanya pada resource exact tersebut.
