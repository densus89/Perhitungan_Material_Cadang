# Desain Persistensi Data dan Akses Multi-Pengguna

**Status:** Disetujui secara konseptual

**Tanggal:** 13 Oktober 2026

**Produk:** Perhitungan Material Cadang

**Cakupan:** Penyimpanan dataset, versioning, autentikasi, approval DIV RST, impor toleran, dan perhitungan nasional

## 1. Latar Belakang

Mockup versi pertama masih menggunakan data demonstrasi dan belum menyimpan data operasional secara permanen. Aplikasi berikutnya harus dapat menerima dataset lengkap dari UIT JBB dan Unit Induk lain, mempertahankan hasil pemrosesan setelah aplikasi ditutup, serta menyediakan alur pembaruan yang dapat ditinjau dan disetujui DIV RST.

Data setiap Unit Induk akan diperbarui dengan mengunggah satu file lengkap, bukan hanya baris yang berubah. Versi baru tidak boleh langsung menggantikan versi aktif. DIV RST harus dapat membandingkan data baru dengan data lama sebelum menyetujui aktivasi.

## 2. Sasaran

1. Menyimpan file sumber, data ternormalisasi, keputusan RFQ, hasil perhitungan, dan prioritas lokasi secara persisten.
2. Mendukung banyak Unit Induk dengan satu versi aktif per Unit Induk.
3. Memungkinkan Operator Unit mengunggah dan memperbaiki data unitnya sendiri.
4. Memungkinkan DIV RST meninjau, membandingkan, menyetujui, menolak, dan menghapus versi.
5. Menampilkan ringkasan nasional kepada semua pengguna yang sah tanpa memberikan hak ubah lintas unit.
6. Menerima variasi struktur spreadsheet tanpa mengorbankan validasi data inti.
7. Memulai dengan layanan gratis dan tetap menyediakan jalur peningkatan kapasitas.

## 3. Bukan Sasaran Tahap Ini

- Integrasi langsung dengan server atau sistem internal PLN.
- Sinkronisasi real-time dengan SAP atau PowerInspect.
- Pendaftaran pengguna secara publik.
- Alokasi otomatis jumlah material ke lokasi tertentu.
- Pengiriman email operasional untuk setiap approval; notifikasi operasional awal berada di dalam aplikasi.
- Penyimpanan rahasia atau kredensial di repository GitHub.

## 4. Keputusan Arsitektur

### 4.1 Komponen utama

- **Aplikasi:** Next.js yang tetap dijalankan di Vercel.
- **Backend persisten:** Supabase dalam region Singapore.
- **Database:** PostgreSQL Supabase untuk data terstruktur dan hasil perhitungan.
- **Penyimpanan file:** bucket Supabase Storage privat untuk file Excel/CSV asli.
- **Autentikasi:** Supabase Auth dengan undangan email.
- **Otorisasi:** PostgreSQL Row Level Security (RLS) dan pemeriksaan peran di API server.
- **Pemrosesan awal:** parsing spreadsheet di browser menggunakan Web Worker, dilanjutkan pengiriman data bertahap ke API untuk validasi server dan penyimpanan.

```text
Browser pengguna
  |-- login / sesi ------------------------------> Supabase Auth
  |-- unggah file asli melalui signed URL ------> Private Storage
  |-- parsing + pemetaan + pratinjau
  `-- kirim batch data --------------------------> Next.js API
                                                     |
                                                     |-- validasi server
                                                     |-- normalisasi RFQ
                                                     |-- perhitungan
                                                     `--> PostgreSQL

Dashboard nasional <--- hanya versi aktif yang disetujui DIV RST
```

### 4.2 Alasan memilih Supabase

Supabase menyediakan PostgreSQL, Auth, Storage, dan RLS dalam satu layanan. Integrasi ini mengurangi jumlah layanan dan kredensial yang harus dikelola dibandingkan kombinasi Neon, penyimpanan objek terpisah, dan penyedia autentikasi lain. Neon tetap merupakan alternatif yang baik jika kebutuhan database branching atau pola biaya berbasis pemakaian menjadi lebih dominan.

Supabase Free digunakan untuk pengembangan dan uji operasional awal. Aplikasi harus menampilkan penggunaan kapasitas dan tidak mengasumsikan bahwa paket gratis cukup untuk seluruh data nasional dalam jangka panjang.

## 5. Autentikasi dan Hak Akses

### 5.1 Aturan akun

- Tidak ada halaman pendaftaran publik.
- Akun hanya dibuat atau diundang oleh DIV RST Admin.
- Email wajib memiliki domain persis `@pln.co.id`, kecuali satu akun guest/uji coba yang disetujui secara eksplisit: `sitompul89@gmail.com`. Tidak ada Gmail lain atau alias yang diizinkan.
- Pembatasan domain diperiksa di sisi server, bukan hanya di formulir.
- Pengguna menerima tautan verifikasi dan membuat kata sandi sendiri.
- Pemulihan kata sandi dilakukan melalui email PLN.
- MFA diwajibkan untuk DIV RST Admin dan disiapkan untuk peran lain.
- Akun dapat dinonaktifkan tanpa menghapus histori aktivitasnya.
- Akun DIV RST Admin pertama dibuat melalui prosedur bootstrap terkontrol; setelah itu seluruh undangan dilakukan dari aplikasi.
- Layanan email bawaan Supabase dipakai untuk pilot. SMTP yang disetujui PLN dapat ditambahkan jika volume undangan atau kebutuhan deliverability meningkat.

### 5.2 Peran

| Peran | Kewenangan utama |
| --- | --- |
| DIV RST Admin | Seluruh data; mengundang akun; mengatur peran dan unit; menyetujui dataset; mengelola referensi; menghapus dan memulihkan data |
| DIV RST Reviewer | Meninjau dataset dan RFQ; membandingkan versi; memberi catatan; menyetujui atau menolak; tidak mengelola akun atau purge permanen |
| Operator Unit Induk | Mengunggah, memetakan, memperbaiki, dan mengajukan dataset untuk Unit Induk yang ditugaskan |
| Viewer | Melihat dashboard dan hasil yang diizinkan tanpa hak perubahan |

### 5.3 Batas akses data

- Semua pengguna terverifikasi dapat melihat ringkasan nasional.
- Operator dapat melihat detail dan mengubah draf hanya untuk Unit Induk yang ditugaskan.
- Operator tidak dapat mengaktifkan versi, menghapus versi historis, atau mengubah data unit lain.
- DIV RST dapat melihat detail seluruh Unit Induk.
- Satu pengguna dapat ditugaskan ke lebih dari satu Unit Induk.
- Service-role key hanya tersedia di server dan tidak pernah dikirim ke browser.
- Keputusan akses RLS membaca tabel penugasan dan peran yang dikelola admin, bukan metadata yang dapat diubah sendiri oleh pengguna.

## 6. Model Data Konseptual

### 6.1 Organisasi dan pengguna

- `unit_induk`: kode dan nama Unit Induk.
- `upt`: UPT dan relasinya ke Unit Induk.
- `user_profile`: profil aplikasi yang terhubung ke pengguna Auth.
- `user_unit_assignment`: penugasan satu atau lebih Unit Induk kepada pengguna.
- `role_assignment`: peran aktif pengguna.

### 6.2 Dataset dan versioning

- `dataset`: wadah logis data suatu Unit Induk dan jenis dataset.
- `dataset_version`: satu unggahan lengkap beserta nomor versi dan status.
- `source_file`: metadata file, object key privat, ukuran, checksum, serta pengunggah.
- `import_run`: status parsing, validasi, jumlah baris, dan diagnostik.
- `column_mapping_profile`: pemetaan kolom tersimpan berdasarkan Unit Induk dan versi template.
- `staged_row`: data sementara sebelum versi disetujui.
- `asset_record`: data aset ternormalisasi untuk versi tertentu.
- `history_coverage`: periode sumber histori yang tersedia dan status kelengkapannya, sehingga "sumber tidak tersedia" berbeda dari "sumber tersedia dengan nol kejadian".

### 6.3 Referensi dan keputusan RFQ

- `rfq_reference_version`: versi master RFQ yang digunakan.
- `rfq_variant`: katalog MTU, 14 varian trafo, dan referensi lain.
- `rfq_match_candidate`: exact match atau usulan near match beserta alasan/skor.
- `rfq_mapping_decision`: keputusan approve, reject, atau standalone dan audit pembuat keputusan.

### 6.4 Perhitungan dan lokasi

- `calculation_rule_version`: versi aturan A1, A2, B1, B2, dan C.
- `calculation_run`: kombinasi versi dataset, referensi RFQ, aturan, dan waktu proses.
- `material_requirement`: hasil kebutuhan per kelompok spesifikasi/RFQ.
- `location_priority`: kandidat lokasi dan urutan prioritas.
- `gi_location_reference`: referensi Unit Induk, UPT, GI, latitude, dan longitude dengan kunci kanonik gabungan.
- `approval_event`: pengajuan, persetujuan, penolakan, dan catatan per versi.
- `audit_event`: log append-only untuk tindakan penting.
- `notification`: notifikasi dalam aplikasi.

Relasi harus menjaga bahwa hasil perhitungan lama tetap menunjuk ke versi sumber dan aturan yang digunakan saat hasil tersebut dibuat.

## 7. Siklus Dataset

```text
Draft
  |-- ada error wajib --> Needs Fix
  |-- valid -----------> Ready to Submit
                           |
                           `--> Pending RST Approval
                                   |-- reject --> Rejected / returned with notes
                                   `-- approve -> Active
                                                   |
                                                   `--> Historical ketika versi baru aktif

Historical --DIV RST--> Trash --DIV RST Admin--> Permanently Deleted
```

Aturan siklus:

1. Upload baru selalu membuat versi baru dan tidak menimpa versi aktif.
2. Aktivasi hanya terjadi setelah persetujuan DIV RST.
3. Aktivasi dilakukan secara atomik dalam transaksi database.
4. Jika validasi atau perhitungan gagal, versi aktif lama tetap digunakan.
5. Tidak ada penghapusan otomatis.
6. Tiga versi terakhir per Unit Induk adalah target pengelolaan, bukan batas keras.
7. Jika versi tersimpan lebih dari tiga, DIV RST menerima peringatan untuk meninjau kapasitas.
8. Penghapusan awal bersifat soft delete ke tempat sampah. Purge permanen hanya oleh DIV RST Admin dan wajib tercatat.

## 8. Impor yang Toleran terhadap Perubahan Format

### 8.1 Tahap impor

1. Pilih Unit Induk dan jenis dataset.
2. Unggah file sumber ke bucket privat.
3. Hitung checksum dan deteksi kemungkinan file identik.
4. Pilih atau deteksi sheet.
5. Petakan header ke skema baku.
6. Jalankan validasi per kolom dan per baris.
7. Tampilkan pratinjau dan dampak perubahan.
8. Simpan sebagai draf atau ajukan kepada DIV RST.

Sistem juga mencatat jenis sumber dan identitas logis aset. Workbook yang berisi aset yang sama tidak boleh dijumlahkan sebagai dua populasi hanya karena berasal dari sheet atau file berbeda. Potensi overlap lintas sumber ditampilkan sebagai blocking error atau warning yang harus diselesaikan sebelum pengajuan.

### 8.2 Tingkatan hasil validasi

- **Fatal:** file rusak, format tidak didukung, atau sheet tidak dapat dibaca.
- **Needs mapping:** struktur dapat dibaca tetapi kolom belum dapat dipastikan.
- **Blocking error:** data disimpan sebagai draf, tetapi tidak dapat diajukan.
- **Warning:** data dapat diajukan, tetapi temuan ditampilkan kepada Operator dan RST.
- **Valid:** siap diajukan.

### 8.3 Pemetaan kolom

- Exact header match dipetakan otomatis.
- Alias seperti `NAMAGI`, `Nama GI`, dan `GI` dapat diarahkan ke field yang sama.
- Fuzzy suggestion tidak pernah dianggap final tanpa konfirmasi jika ambigu.
- Kolom tambahan tidak menyebabkan penolakan dan tetap tersedia dalam data staging/file asli.
- Profil pemetaan dapat disimpan untuk Unit Induk dan versi template tertentu.
- Perubahan struktur template diberi nomor versi.

### 8.4 Draf bermasalah

File yang kehilangan kolom wajib tetap disimpan sebagai draf. Pengguna dapat memetakan ulang atau mengganti file tanpa kehilangan diagnostik. Tombol pengajuan dinonaktifkan sampai semua blocking error selesai.

## 9. Perbandingan Versi dan Approval

DIV RST menerima tampilan perbandingan yang mencakup:

- jumlah baris dan aset;
- aset ditambah, dihapus, atau berubah;
- perubahan populasi, nilai perolehan, dan harga;
- perubahan kondisi aset dan usia;
- perubahan Unit Induk, UPT, atau GI;
- perubahan spesifikasi dan hasil RFQ;
- dampak terhadap kelas ABC;
- dampak terhadap jumlah kebutuhan material;
- dampak terhadap prioritas lokasi.

Reviewer dapat menyetujui, menolak, atau mengembalikan versi kepada Operator dengan catatan. Catatan dan keputusan tidak dapat diubah secara diam-diam; koreksi dibuat sebagai event baru.

Approval dataset dan approval near-match RFQ dicatat sebagai keputusan terpisah. Versi tidak boleh menjadi sumber calculation run nasional final selama masih memiliki near-match wajib yang belum diputuskan. RST dapat menyetujui usulan, menolaknya menjadi kelompok mandiri, atau mengembalikan data untuk diperbaiki.

## 10. Normalisasi RFQ

- Exact match dapat dikelompokkan otomatis.
- Near match menghasilkan usulan dan warning untuk approval manual.
- Approval tersedia untuk satu item, item terpilih, atau semua item dalam filter aktif.
- Mapping yang ditolak atau tidak memiliki referensi menjadi kelompok mandiri menggunakan spesifikasi asal.
- Mapping manual yang telah disetujui dapat digunakan kembali, tetapi tetap memiliki versi dan dapat ditinjau ulang.
- Trafo hanya boleh mengikuti 14 varian yang telah ditetapkan.
- `150/20 kV` dan `150/22/10 kV` adalah varian berbeda dan tidak boleh digabung.
- Peralatan non-trafo tanpa referensi RFQ tetap memakai spesifikasi asal.

## 11. Perhitungan Nasional

Perhitungan nasional menggunakan tepat satu versi aktif dari setiap Unit Induk yang telah disetujui.

- **A1:** `ceil(2% × populasi kelompok)`; histori tidak dibutuhkan.
- **A2:** model optimum berbasis Poisson dan biaya.
- **B1:** histori gangguan/penggantian di atas nol menggunakan model optimum; nol pada sumber enam tahun yang valid menggunakan metode Economic.
- **B2:** `ceil(1% × total penggantian enam tahun)`.
- **C:** selalu nol dan tidak dicadangkan, termasuk jika lead time melebihi tiga bulan.

Data dihitung secara nasional. Lokasi tidak memecah jumlah hasil perhitungan.

### 11.1 Semantik cakupan

- Unit Induk yang belum mengunggah data berstatus **belum tercakup**, bukan bernilai nol.
- Jika sumber histori yang valid telah diunggah tetapi tidak memuat kejadian, histori dianggap nol.
- Jika sumber/periode histori tidak tersedia atau tidak lengkap, sistem menandainya sebagai tidak tersedia dan tidak menyamakannya dengan nol kejadian.
- Dashboard harus menampilkan jumlah dan persentase Unit Induk yang tercakup.
- Setiap calculation run menyimpan daftar versi dataset yang dipakai agar hasil dapat direproduksi.

## 12. Prioritas Lokasi

Daftar calon lokasi diurutkan sebagai berikut:

1. Kondisi aset P0, P1, P2, P3, lalu P4.
2. Dalam kondisi yang sama, usia aset tertua didahulukan jika tersedia.
3. Jika usia tidak tersedia atau sama, gunakan jarak koordinat GI ke Gandul, Depok.
4. Jika masih sama, urutkan berdasarkan nama GI lalu UPT.

Semua lokasi tetap ditampilkan dan dapat difilter. Hasilnya merupakan rekomendasi urutan penempatan, bukan alokasi otomatis jumlah material.

Join referensi lokasi menggunakan kombinasi Unit Induk + UPT + nama GI. Pencocokan hanya berdasarkan nama GI menjadi fallback yang wajib mendeteksi konflik dan meminta konfirmasi. Jarak dihitung dari koordinat referensi menuju titik Unit Induk di Gandul dengan metode geografis yang konsisten.

## 13. Modul Antarmuka

1. Login, verifikasi, pemulihan kata sandi, dan MFA admin.
2. Dashboard Nasional dan cakupan data.
3. Dataset Unit Induk dan riwayat versinya.
4. Wizard impor, pemetaan, validasi, dan pratinjau.
5. Kotak Persetujuan RST dan perbandingan versi.
6. Normalisasi serta approval RFQ.
7. Perhitungan dan riwayat calculation run.
8. Prioritas Lokasi dan filter kondisi aset.
9. Referensi RFQ, formula, lead time, GI, dan koordinat.
10. Manajemen pengguna, peran, dan penugasan Unit Induk.
11. Audit, notifikasi, kapasitas, dan tempat sampah.

## 14. Konsistensi, Keamanan, dan Kegagalan

- Browser tidak dipercaya sebagai satu-satunya validator; API memvalidasi kembali payload.
- Data dikirim dalam batch idempoten agar proses dapat dilanjutkan tanpa menggandakan baris.
- Aktivasi versi dan pergantian versi aktif dilakukan dalam transaksi.
- Tabel aplikasi mengaktifkan RLS dan kebijakan diuji untuk operasi select/insert/update/delete.
- Bucket sumber bersifat privat dan diakses melalui signed URL berumur pendek.
- Rahasia backend hanya disimpan sebagai environment variable Vercel/Supabase.
- Audit log untuk approval, perubahan peran, aktivasi, restore, dan purge bersifat append-only.
- File sumber dipertahankan untuk verifikasi selama versinya belum dihapus permanen.
- Jika pemrosesan terputus, draf dan progress batch dapat dilanjutkan.
- File unggahan yang gagal membentuk draf dicatat sebagai orphan dan hanya dapat dibersihkan melalui prosedur admin setelah masa tenggang; pembersihan tidak boleh menghapus file milik versi yang sah.
- Jika ukuran data melampaui kemampuan browser atau fungsi Vercel, engine pemrosesan dapat dipindahkan ke worker tanpa mengubah lifecycle dataset.

## 15. Pengelolaan Paket Gratis

- Mulai dengan satu proyek Supabase Free.
- Pantau database, object storage, dan egress dari halaman admin.
- Tampilkan peringatan kapasitas bertingkat sebelum limit tercapai.
- Simpan file asli satu kali per versi; hindari salinan antara yang dapat dihitung ulang.
- Gunakan agregat tersimpan untuk dashboard nasional.
- Jangan menghapus versi secara otomatis hanya demi menghemat kapasitas.
- RST memutuskan versi mana yang masuk tempat sampah setelah membandingkan histori.
- Upgrade paket menjadi keputusan operasional ketika data nasional atau kebutuhan availability melampaui Free tier.

## 16. Notifikasi

Tahap pertama memakai notifikasi dalam aplikasi untuk:

- pengajuan baru bagi DIV RST;
- hasil approve/reject bagi Operator;
- catatan perbaikan;
- versi melebihi rekomendasi tiga;
- kapasitas mendekati batas;
- kegagalan validasi atau perhitungan.

Email digunakan untuk undangan akun, verifikasi, dan pemulihan kata sandi. Email operasional approval dapat ditambahkan kemudian tanpa mengubah model data notifikasi.

## 17. Tahapan Implementasi

1. Fondasi Supabase, migrasi database, Auth, RLS, dan seed referensi minimum.
2. Login, undangan akun, peran, serta penugasan Unit Induk.
3. Storage privat, dataset/versioning, dan wizard impor toleran.
4. Validasi, staging, pratinjau, dan perbandingan versi.
5. Approval DIV RST dan aktivasi atomik.
6. Persistensi normalisasi RFQ dan workflow approval.
7. Engine perhitungan nasional serta indikator cakupan.
8. Prioritas lokasi dan dashboard nasional.
9. Audit, notifikasi, kapasitas, tempat sampah, dan restore.
10. Pengujian end-to-end, keamanan RLS, migrasi data awal UIT JBB, dan deployment.

## 18. Kriteria Penerimaan Tingkat Produk

- Operator Unit dapat mengunggah file lengkap dan menutup browser tanpa kehilangan draf yang sudah tersimpan.
- Perbedaan header tidak langsung menolak file; sistem menawarkan mapping dan menyimpan draf bermasalah.
- Dataset baru tidak memengaruhi hasil nasional sebelum disetujui DIV RST.
- RST dapat membandingkan versi baru dengan versi aktif dan melihat dampak perhitungan.
- Setelah approval, pergantian versi aktif terjadi utuh dan versi lama tetap tersedia sebagai histori.
- Pengguna tidak dapat mengubah data Unit Induk yang tidak ditugaskan kepadanya.
- Semua pengguna sah dapat melihat ringkasan nasional, termasuk indikator cakupan data.
- Near-match RFQ tidak diterapkan tanpa approval manual.
- Calculation run nasional final tidak diterbitkan jika keputusan RFQ wajib masih tertunda.
- Unit yang belum mengunggah tidak dianggap memiliki nilai nol.
- Sistem membedakan histori valid dengan nol kejadian dari sumber histori yang tidak tersedia/tidak lengkap.
- Data aset yang overlap antar-file atau antar-sheet tidak dihitung ganda.
- Penghapusan versi hanya dapat dilakukan oleh DIV RST dan tercatat dalam audit.
- Aplikasi tetap berfungsi dengan Supabase Free untuk skala uji coba awal dan memberi peringatan sebelum kapasitas habis.

## 19. Risiko dan Mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Free tier tidak cukup untuk seluruh data nasional | Monitoring kapasitas, agregasi, retensi manual, dan jalur upgrade |
| File spreadsheet berubah format | Alias, mapping interaktif, profil template, dan penyimpanan draf |
| Upload terputus | Direct upload, batch idempoten, dan resume draf |
| Payload browser dimanipulasi | Validasi ulang di server dan RLS |
| Dataset baru merusak dashboard | Approval RST, aktivasi atomik, dan fallback ke versi aktif lama |
| Keputusan RFQ sulit dilacak | Versioned decision dan audit event |
| Domain Vercel diblokir jaringan kantor | Custom domain dan pengajuan allowlist saat masuk produksi |
| File Storage tidak tercakup backup database | Kebijakan backup/ekspor objek dibuat sebelum penggunaan produksi penuh |

## 20. Keputusan yang Telah Disetujui

- Penyimpanan menggunakan layanan eksternal.
- Supabase menjadi pilihan utama untuk MVP.
- Akun bersifat invite-only dan terbatas ke `@pln.co.id`, dengan pengecualian tunggal guest/uji coba `sitompul89@gmail.com`.
- DIV RST membuat akun serta menyetujui dataset.
- Operator dapat melihat ringkasan nasional tetapi hanya mengubah unitnya sendiri.
- Setiap pembaruan merupakan snapshot lengkap.
- Versi baru menunggu persetujuan DIV RST.
- Versi lama tidak dihapus otomatis dan dapat dibandingkan.
- DIV RST berwenang menghapus versi duplikat/tidak diperlukan.
- Target pengelolaan adalah tiga versi terakhir per Unit Induk.
- Perbedaan kolom ditangani melalui impor toleran dan mapping.
- Missing required columns disimpan sebagai draf bermasalah, bukan langsung dibuang.
