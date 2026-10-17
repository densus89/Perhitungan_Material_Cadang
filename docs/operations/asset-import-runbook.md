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
3. **Unggah dan proses di server** memakai tanda tangan upload yang dibatasi ke path sumber privat. Server memverifikasi ukuran/hash, membaca kembali sumber, memeriksa kesamaan pemetaan/hash, lalu mempersistensikan run secara bertahap, maksimum 1.000 baris per batch.
4. Tinjau error, warning, sumber nilai, kondisi dan bukti estimasi. Saring baris bermasalah. Kesalahan dibetulkan pada workbook atau pemetaan; byte sumber yang berubah harus masuk sebagai impor baru. Baris yang ditolak dan alasan penolakannya tetap perlu direkonsiliasi.
5. `nilaiABC` memakai nilai buku SAP, penyesuaian sah, atau estimasi terdepresiasi. Harga pengadaan baru tersimpan terpisah untuk Optimum Spare A2/B1 pada fase berikutnya. Kelas akhir A1/A2/B1/B2/C belum dihitung oleh importer; C tetap tercatat tanpa alokasi.

Usia hanya berasal dari tanggal operasi, usia yang diberikan, atau median cohort teknis yang kompatibel. Kondisi P0–P4 tidak digunakan untuk mengisi usia. Estimasi usia/nilai membawa bukti dan dapat memerlukan pengakuan manual DIV RST. Error pemblokir harus nol sebelum pengajuan.

## Resume dan gangguan koneksi

Daftar draft memuat file, waktu, stage dan jumlah baris yang tersimpan. Buka **Lanjutkan**, lalu **Periksa status** setelah kehilangan respons. Jika upload sudah tersimpan tetapi verifikasi belum selesai, gunakan **Verifikasi unggahan tersimpan**. Pilih kembali berkas asli bila preview/pemetaan perlu diulang; SHA-256 harus cocok.

Jangan memulai run kedua otomatis setelah timeout. Rute proses dibatasi 300 detik. Tunggu dan periksa stage/current run. Run belum lengkap tidak menjadi hasil draft saat ini. Retry yang disengaja menghasilkan run terisolasi dan mempertahankan hasil sebelumnya. Bila run tetap PROCESSING setelah permintaan berhenti, operator server memverifikasi tidak ada proses berjalan lalu menggunakan `fail_asset_import_run` dengan aktor yang berwenang. Jangan mengedit pointer/current run atau menandai COMPLETE secara manual. Ulangi lewat tindakan pemrosesan setelah status gagal terverifikasi.

Jika finalisasi selesai tetapi perbandingan gagal, muat ulang stage dan lakukan pemrosesan ulang terkontrol. Jangan mengajukan/menyetujui perbandingan yang basis versi aktifnya sudah berubah. Hash dan jumlah persisten harus sesuai; kegagalan diperbaiki melalui run baru.

## Tinjauan dan aktivasi DIV RST

DIV RST membuka **Review Snapshot**, menyaring unit/status/isu/sumber nilai, dan meninjau mapping, kondisi, bukti donor, perbandingan sebelum/sesudah serta audit. Ringkasan seluruh run tidak berubah ketika baris disaring; halaman baris/mapping/perubahan dibatasi 100.

Pengakuan massal hanya berlaku untuk baris terlihat dengan sumber nilai yang kompatibel. Catatan dan konfirmasi keputusan wajib. Promosi pemetaan menjadi profil reusable adalah checkbox terpisah dan hanya berlaku pada fingerprint header identik. Pengembalian menetapkan NEEDS_FIX; unit memperbaiki atau memproses ulang, lalu mengajukan kembali.

Aktivasi mengunci ulang status/run/mapping/perbandingan dan memeriksa error, nilai UNRESOLVED, estimasi yang belum diakui, serta urutan versi. Versi aktif sebelumnya menjadi HISTORICAL. Riwayat dibaca saja. Hanya admin RST boleh memindahkan duplikat/history yang memenuhi syarat ke sampah logis. Versi aktif, sumber dan bukti audit tidak dipurge melalui UI fase ini.

Perubahan aturan tidak menulis ulang snapshot aktif. Buat versi baru, re-preview, proses dengan aturan yang disetujui, bandingkan dan ajukan kembali. Formula dengan cache invalid memiliki provenance formula/alamat dan penanda cache invalid yang konsisten antar-adapter; token persis tetap tersedia pada sumber privat.

## Verifikasi dan rollout

Jalankan tes aplikasi, pgTAP linked, lint database, lint aplikasi, TypeScript, build dan audit client/secret. `pnpm bench:asset-import` membangun workbook sintetis 141.105 baris di direktori sementara dan mengukur fase/waktu/RSS; fixture dibersihkan. Perbandingan dua snapshot 141.105 baris memakai helper authoritative yang sama, join indeks per ID dan grup identitas yang tidak menyalin grup berulang; generasi perubahan, serialisasi batch, dan RSS dilaporkan terpisah. Urutan identitas stabil dan konflik tetap AMBIGUOUS. Gate lokal gabungan 300 detik dan peak proses 1,5 GiB menyisakan ruang sebelum batas 2 GiB, tetapi bukan jaminan memori seluruh persistensi. Waktu jaringan/database, round-trip hash/persistensi dan kapasitas Vercel hanya dibuktikan oleh pengujian hosted; benchmark lokal tidak menggantikannya.

Deploy commit yang sama ke preview proyek Vercel yang sudah ada, verifikasi Fluid Compute dan batas rute 300 detik, lalu jalankan `E2E_BASE_URL=<origin-preview> pnpm test:e2e`. Gunakan origin deployment exact dari system variable `VERCEL_URL` dengan system variables aktif (`VERCEL=1`, `VERCEL_ENV=preview`), bukan alias branch. Guard import/review/admin menolak konfigurasi preview hilang/rusak dan origin lain; request Host/forwarding header tidak dipercaya. Production dan link undangan/pemulihan tetap memakai `NEXT_PUBLIC_SITE_URL` kanonis. Simpan audience/domain dan environment production. Tes aset membuat unit/user/file sintetis ber-ID unik, memverifikasi akses privat dan membersihkan hanya resource ber-marker/ID persis. Jangan menjalankannya pada proyek production operasional.

Untuk pengujian lokal gunakan build yang benar-benar sudah selesai sebelum `CI=1 pnpm test:e2e -- --retries=0 --workers=2`; jangan menjalankan server production saat build masih berlangsung. Assertion navigasi/pemrosesan memakai penantian kondisi halaman yang terbatas (30 detik untuk URL akhir login/MFA dan alur aset, 300 detik untuk respons proses), bukan sleep atau retry mutasi otomatis. Jika proses tidak dimulai, periksa kegagalan create/upload/mapping lebih dahulu; HTTP 403 pada create tidak mengukur durasi pemrosesan. Jalankan benchmark terpisah dari suite UI/browser agar hasil waktu dan timeout tidak didominasi kontensi CPU/memori.

Adapter server mengurutkan metadata sebelum worksheet dan menyediakan cache shared-string kosong virtual bila workbook memakai inline string. Ini mencegah fallback ExcelJS 4.4 yang menulis XML worksheet ke disk sementara; regresi byte nyata memverifikasi tidak ada write-stream file sementara untuk kasus ini. XML asli tidak diubah dan metadata formula diamati dengan backpressure; cache metadata per baris dibuang setelah dikonsumsi, sementara alamat anchor shared formula bertahan sampai akhir sheet. Struktur metadata yang tidak didukung/rusak gagal tertutup, bukan mengubah hasil atau pointer aktif.

Benchmark masih memerlukan ruang disk sementara untuk satu XLSX sintetis terkompresi (sekitar 9,5 MB pada fixture saat ini), ditambah laporan kecil bila diminta. Direktori fixture dibersihkan dalam `finally` saat berhasil/gagal; proses yang dimatikan paksa dapat menyisakan direktori `asset-import-bench-*`. Periksa ownership/path exact dan tidak ada proses aktif sebelum cleanup manual. Kegagalan filesystem/ENOSPC adalah benchmark gagal, bukan hasil kinerja lulus. Jangan memasukkan byte workbook/worksheet atau token ke log error.

Pilot operasional berhenti pada DRAFT/NEEDS_FIX sampai master GI dan selisih baseline disetujui DIV RST. Simpan laporan agregat berisi hash, aturan, jumlah kandidat, alasan penolakan, distribusi input/sumber nilai, usia kosong dan delta baseline. Ekspor baris untuk pemeriksaan bisnis harus tetap privat dan tidak dilampirkan ke Git. Jangan auto-approve atau mengaktifkan pilot.
