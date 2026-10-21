# Operasi impor snapshot aset

## Sumber dan arti snapshot

Operator unit mengunduh template melalui **Impor & kualitas data → Unduh template**. Endpoint template memerlukan sesi aktif dan memakai cache privat/no-store. Bagikan template kosong, bukan workbook operasional. Sheet standar adalah `DATA_ASET`; adapter tetap mendeteksi sheet legacy berdasarkan isi.

Satu unggahan selalu mencakup seluruh snapshot aset Unit Induk. Baris yang tidak ada pada versi baru akan terlihat sebagai penghapusan dalam perbandingan. Jangan menghapus dataset atau versi aktif lama untuk “memberi ruang” bagi unggahan baru. Pengajuan belum mengganti data aktif. Hanya persetujuan DIV RST yang memindahkan pointer aktif secara atomik dan mempertahankan versi lama sebagai histori.

Gunakan `.xlsx` tanpa macro, 1 byte–50 MiB, dengan MIME XLSX. `.xls`, `.xlsm`, CSV, dan ekstensi/MIME yang tidak sesuai ditolak. Formula tidak dieksekusi; cache yang hilang/error tetap menjadi masalah. Nol yang valid tidak dianggap kosong. Workbook sumber dan hasil pemeriksaan yang memuat baris operasional tidak boleh masuk Git, log, atau tangkapan layar publik.

Cache formula mempertahankan tipe sumber: boolean bukan angka/nilai buku, tanggal memakai sistem tanggal 1900/1904 dari workbook, dan formula bersama mempertahankan anchor/follower serta bukti yang sama di browser/server. Setelah pembaruan parser, draft dengan bukti formula lama mungkin memerlukan preview dan konfirmasi pemetaan ulang; jangan melewati pemeriksaan hash atau mengubah hasil aktif untuk menyesuaikannya.

## Master koordinat GI

Jalankan dari terminal server terotorisasi. Header CSV wajib persis `No`, `func loc id`, `Unit Induk`, `UPT`, `Nama GI`, `lat`, `long`; quoting RFC 4180 dan BOM didukung. Kolom tambahan boleh ada, tetapi header wajib tidak boleh hilang/ganda. Kunci identitas dan koordinat harus lengkap/valid.

```sh
pnpm reference:gi -- --file <berkas-CSV-lokal-tidak-terlacak> --source-version <versi-disetujui> --dry-run
```

Periksa jumlah sumber, jumlah valid, kunci unik, duplikat identik, error, dan SHA-256. Normalisasi hanya NFKC, kapitalisasi, trim, dan penggabungan whitespace. Kunci GI yang sama dengan koordinat identik boleh digabung. Koordinat berbeda atau functional-location yang bertentangan memblokir konfirmasi. Jangan memilih koordinat pertama/terakhir, mengambil rata-rata, atau membuang konflik tanpa aturan sumber yang disetujui. Perbaiki sumber secara terkontrol dan ulangi dry-run dengan hash baru.

Setelah hasil agregat disetujui dan tidak ada error, sediakan `NEXT_PUBLIC_SUPABASE_URL` serta `SUPABASE_SECRET_KEY` melalui environment server dan identitas UUID admin RST aktif:

```sh
pnpm reference:gi -- --file <berkas-yang-sama> --source-version <versi-disetujui> --actor-id <UUID-admin-RST> --confirm
```

RPC service-only mengulang validasi unit/role/kunci, mengganti **versi sumber yang sama** dan menambahkan audit agregat dalam satu transaksi. Gagal audit berarti seluruh replacement dibatalkan. Kunci yang sudah dimiliki versi referensi lain ditolak agar versi lain tidak tertimpa diam-diam. Perpindahan antarversi memerlukan migrasi terpisah yang ditinjau. Direct INSERT/UPDATE/DELETE master oleh service role dicabut. Script tidak mencetak kredensial, path, atau baris sumber.

## Unggah, pemetaan dan validasi

1. Pilih unit penugasan dan workbook lengkap. Worker browser menampilkan usulan sheet/header, indeks kolom, jumlah kandidat/penolakan, dan hash. Preview bersifat pendahuluan.
2. Periksa huruf/indeks untuk header ganda seperti `MARA`. Konfirmasikan seluruh target wajib. Jangan menebak UNIT_INDUK, kondisi, usia, kode kelas, atau spesifikasi yang tidak tersedia.
3. **Unggah dan proses di server** memakai tanda tangan upload yang dibatasi ke path sumber privat. Server memverifikasi ukuran/hash, membaca kembali sumber, memeriksa kesamaan pemetaan/hash, lalu mempersistensikan run secara bertahap. Setiap chunk memuat maksimum 2.000 pasangan baris/nilai; satu request memproses maksimum 12 chunk (24.000 baris) dalam jendela dua commit paralel.
4. Tinjau error, warning, sumber nilai, kondisi dan bukti estimasi. Saring baris bermasalah. Kesalahan dibetulkan pada workbook atau pemetaan; byte sumber yang berubah harus masuk sebagai impor baru. Baris yang ditolak dan alasan penolakannya tetap perlu direkonsiliasi.
5. `nilaiABC` memakai nilai buku SAP, penyesuaian sah, atau estimasi terdepresiasi. Harga pengadaan baru tersimpan terpisah untuk Optimum Spare A2/B1 pada fase berikutnya. Kelas akhir A1/A2/B1/B2/C belum dihitung oleh importer; C tetap tercatat tanpa alokasi.

Usia hanya berasal dari tanggal operasi, usia yang diberikan, atau median cohort teknis yang kompatibel. Kondisi P0–P4 tidak digunakan untuk mengisi usia. Estimasi usia/nilai membawa bukti dan dapat memerlukan pengakuan manual DIV RST. Error pemblokir harus nol sebelum pengajuan.

## Resume dan gangguan koneksi

Daftar draft memuat file, waktu, stage dan jumlah baris yang sudah tersimpan dari manifest. Selama stage `PROCESSING`, browser meneruskan request secara berurutan dan menampilkan progress persisten. Satu respons `202` berarti request saat itu selesai dengan aman tetapi masih ada tahap berikutnya. Setelah request lanjutan mengisi chunk terakhir, progress dapat terlihat `100%` tetapi tetap `PROCESSING`: request berikutnya memverifikasi sumber/manifest lalu menjalankan hash global dan finalisasi tanpa parsing, valuasi, atau commit ulang. Bila ada versi aktif, satu request berikutnya dapat menyelesaikan perbandingan. Respons final `200` baru muncul setelah run `COMPLETE` dan perbandingan tersimpan.

Jika koneksi terputus, muat ulang halaman, buka **Lanjutkan** pada draft yang sama, lalu gunakan **Lanjutkan proses**. **Periksa status** hanya membaca state authoritative dan tidak mengulang mutasi. Respons yang hilang setelah commit aman: ID baris, indeks chunk, dan hash deterministik membuat request berikutnya melewati chunk yang sudah tercatat tanpa duplikasi. Jika upload sudah tersimpan tetapi verifikasi belum selesai, gunakan **Verifikasi unggahan tersimpan**. Pilih kembali berkas asli bila preview/pemetaan perlu diulang; SHA-256 harus cocok.

Jangan memulai run kedua otomatis setelah timeout. Rute proses dibatasi 300 detik, sedangkan gate operasional mensyaratkan setiap request selesai di bawah 240 detik. Lease pemrosesan berlaku 240 detik. Konflik lease biasanya berarti tab/request lain masih bekerja: jangan klik berulang; tunggu, gunakan **Periksa status**, lalu lanjutkan setelah lease berakhir atau request pemilik selesai. Lease kedaluwarsa boleh direbut kembali oleh request resmi; token lama tidak boleh dipakai untuk commit, release, fail, atau finalize.

Run belum lengkap tidak menjadi hasil draft saat ini dan tidak dapat diajukan. Retry setelah `FAILED`/`NEEDS_FIX` yang disengaja menghasilkan run terisolasi dan mempertahankan hasil sebelumnya. Bila run tetap `PROCESSING` setelah seluruh request dipastikan berhenti, operator server memeriksa status run, expiry lease, dan manifest terlebih dahulu. Gunakan RPC lifecycle dengan aktor berwenang hanya setelah stale state terbukti. Jangan mengedit `current_run_id`, lease/token, baris manifest, status `COMPLETE`, atau pointer versi aktif secara manual.

Diagnostik aman hanya memuat ID run, status, waktu kedaluwarsa lease, `expected_row_count`, jumlah/index/`row_count` chunk, dan kecocokan hash/jumlah agregat. Jangan mencetak token lease, byte workbook, baris aset, nilai per baris, kredensial, atau signed URL. Lubang indeks manifest harus dilanjutkan dari indeks yang hilang—jangan menyimpulkan progress dari total baris tabel. Finalisasi hanya sah bila indeks gap-free serta jumlah dan hash global tepat.

Jika finalisasi selesai tetapi perbandingan gagal, muat ulang stage dan lakukan pemrosesan ulang terkontrol. Jangan mengajukan/menyetujui perbandingan yang basis versi aktifnya sudah berubah. Hash dan jumlah persisten harus sesuai; kegagalan diperbaiki melalui run baru.

## Tinjauan dan aktivasi DIV RST

DIV RST membuka **Review Snapshot**, menyaring unit/status/isu/sumber nilai, dan meninjau mapping, kondisi, bukti donor, perbandingan sebelum/sesudah serta audit. Ringkasan seluruh run tidak berubah ketika baris disaring; halaman baris/mapping/perubahan dibatasi 100.

Pengakuan massal hanya berlaku untuk baris terlihat dengan sumber nilai yang kompatibel. Catatan dan konfirmasi keputusan wajib. Promosi pemetaan menjadi profil reusable adalah checkbox terpisah dan hanya berlaku pada fingerprint header identik. Pengembalian menetapkan NEEDS_FIX; unit memperbaiki atau memproses ulang, lalu mengajukan kembali.

Aktivasi mengunci ulang status/run/mapping/perbandingan dan memeriksa error, nilai UNRESOLVED, estimasi yang belum diakui, serta urutan versi. Versi aktif sebelumnya menjadi HISTORICAL. Riwayat dibaca saja. Hanya admin RST boleh memindahkan duplikat/history yang memenuhi syarat ke sampah logis. Versi aktif, sumber dan bukti audit tidak dipurge melalui UI fase ini.

Perubahan aturan tidak menulis ulang snapshot aktif. Buat versi baru, re-preview, proses dengan aturan yang disetujui, bandingkan dan ajukan kembali. Formula dengan cache invalid memiliki provenance formula/alamat dan penanda cache invalid yang konsisten antar-adapter; token persis tetap tersedia pada sumber privat.

## Verifikasi dan rollout

Jalankan tes aplikasi, pgTAP linked, lint database, lint aplikasi, TypeScript, build dan audit client/secret. `pnpm bench:asset-import` membangun workbook sintetis 141.105 baris di direktori sementara dan mengukur fase/waktu/RSS; fixture dibersihkan. Perbandingan dua snapshot 141.105 baris memakai helper authoritative yang sama, join indeks per ID dan grup identitas yang tidak menyalin grup berulang; generasi perubahan, serialisasi batch, dan RSS dilaporkan terpisah. Urutan identitas stabil dan konflik tetap AMBIGUOUS. Gate lokal gabungan 300 detik dan peak proses 1,5 GiB menyisakan ruang sebelum batas 2 GiB, tetapi bukan jaminan memori seluruh persistensi. Waktu jaringan/database, round-trip hash/persistensi dan kapasitas Vercel hanya dibuktikan oleh pengujian hosted; benchmark lokal tidak menggantikannya.

Deploy commit yang sama ke preview proyek Vercel yang sudah ada, verifikasi Fluid Compute dan batas rute 300 detik, lalu jalankan `E2E_BASE_URL=<origin-preview> pnpm test:e2e`. Gate skala menggunakan `E2E_SCALE_ROWS=141105`, harus melihat beberapa respons `202`, setiap respons proses di bawah 240 detik, progress monoton, hasil akhir 141.105 baris dan 141.105 nilai, run `COMPLETE`, serta perbandingan exact. Gunakan origin deployment exact dari system variable `VERCEL_URL` dengan system variables aktif (`VERCEL=1`, `VERCEL_ENV=preview`), bukan alias branch. Guard import/review/admin menolak konfigurasi preview hilang/rusak dan origin lain; request Host/forwarding header tidak dipercaya. Production dan link undangan/pemulihan tetap memakai `NEXT_PUBLIC_SITE_URL` kanonis. Simpan audience/domain dan environment production. Tes aset membuat unit/user/file sintetis ber-ID unik, memverifikasi akses privat dan membersihkan hanya resource ber-marker/ID persis. Jangan menjalankannya pada proyek production operasional.

Urutan cleanup sintetis wajib: verifikasi marker unit dan metadata tiga akun; hapus objek storage pada path unit exact; di satu transaksi hapus perubahan/metadata, `asset_import_chunks`, valuasi, baris snapshot, run, mapping/perbandingan/sheet/session/source, versi/dataset, assignment, lalu unit; buktikan manifest dan unit tersisa nol; terakhir hapus tiga akun Auth yang sudah diverifikasi. Manifest harus dihapus eksplisit sebelum akun karena cleanup memakai suppression trigger lokal dan tidak boleh mengandalkan cascade. Jangan melakukan cleanup berbasis wildcard atau marker global.

Nilai environment harus bebas CR/LF dan whitespace pembungkus. Insiden preview 2026-10-17: CRLF pada konfigurasi publik membuat create ditolak meski login dan system variables tersedia; pembersihan nilai `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan `NEXT_PUBLIC_SUPABASE_URL` di ketiga environment Vercel serta redeploy commit yang sama memulihkan create HTTP 200. Guard tetap fail-closed; jangan mengubahnya untuk menerima konfigurasi rusak. Periksa nilai hanya dalam memori dan laporkan hasil validasi/keberadaan, bukan kredensial atau URL/header mentah. Karena `NEXT_PUBLIC_*` dibekukan saat build, pembaruan setting harus diikuti rebuild/redeploy. Log diagnostik origin sementara telah dihapus setelah sebab konfigurasi terbukti.

Untuk pengujian lokal gunakan build yang benar-benar sudah selesai sebelum `CI=1 pnpm test:e2e -- --retries=0 --workers=2`; jangan menjalankan server production saat build masih berlangsung. Assertion navigasi/pemrosesan memakai penantian kondisi halaman yang terbatas (30 detik untuk URL akhir login/MFA dan alur aset, 300 detik **per respons proses**), bukan satu timeout untuk seluruh rangkaian, sleep, atau retry mutasi otomatis. Gate skala memberi keseluruhan perjalanan waktu hingga 35 menit tetapi tetap menolak respons individual di atas 240 detik. Jika proses tidak dimulai, periksa kegagalan create/upload/mapping lebih dahulu; HTTP 403 pada create tidak mengukur durasi pemrosesan. Jalankan benchmark terpisah dari suite UI/browser agar hasil waktu dan timeout tidak didominasi kontensi CPU/memori.

Hanya tes admin MFA dan dua tes QA viewport yang memakai `test.slow(Boolean(process.env.E2E_BASE_URL), ...)`: perjalanan hosted dengan beberapa navigasi autentikasi atau dua belas navigasi/screenshot mendapat budget keseluruhan 90 detik, sementara lokal tetap 30 detik. Assertion kondisi, seluruh pemeriksaan visual/fokus/filter, dan timeout global tidak berubah; tidak ada sleep atau retry tambahan.

Adapter server mengurutkan metadata sebelum worksheet dan menyediakan cache shared-string kosong virtual bila workbook memakai inline string. Ini mencegah fallback ExcelJS 4.4 yang menulis XML worksheet ke disk sementara; regresi byte nyata memverifikasi tidak ada write-stream file sementara untuk kasus ini. XML asli tidak diubah dan metadata formula diamati dengan backpressure; cache metadata per baris dibuang setelah dikonsumsi, sementara alamat anchor shared formula bertahan sampai akhir sheet. Struktur metadata yang tidak didukung/rusak gagal tertutup, bukan mengubah hasil atau pointer aktif.

Benchmark masih memerlukan ruang disk sementara untuk satu XLSX sintetis terkompresi (sekitar 9,5 MB pada fixture saat ini), ditambah laporan kecil bila diminta. Direktori fixture dibersihkan dalam `finally` saat berhasil/gagal; proses yang dimatikan paksa dapat menyisakan direktori `asset-import-bench-*`. Periksa ownership/path exact dan tidak ada proses aktif sebelum cleanup manual. Kegagalan filesystem/ENOSPC adalah benchmark gagal, bukan hasil kinerja lulus. Jangan memasukkan byte workbook/worksheet atau token ke log error.

Pilot operasional berhenti pada DRAFT/NEEDS_FIX sampai master GI dan selisih baseline disetujui DIV RST. Simpan laporan agregat berisi hash, aturan, jumlah kandidat, alasan penolakan, distribusi input/sumber nilai, usia kosong dan delta baseline. Ekspor baris untuk pemeriksaan bisnis harus tetap privat dan tidak dilampirkan ke Git. Jangan auto-approve atau mengaktifkan pilot.
