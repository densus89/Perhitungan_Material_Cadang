# Desain Impor Snapshot Aset, Valuasi, dan Template Standar

Tanggal: 15 Oktober 2026
Status: Siap ditinjau
Fase: Pengelolaan data aset sebelum perhitungan ABC dan alokasi material cadang

## 1. Ringkasan keputusan

Sistem akan menerima satu workbook lengkap sebagai snapshot data aset suatu unit. Workbook tidak langsung menggantikan data aktif. Sistem menyimpan file sumber secara privat, membaca struktur secara adaptif, mengubahnya menjadi data kanonis, memvalidasi kualitas data, membandingkannya dengan versi aktif, lalu menunggu persetujuan DIV RST sebelum aktivasi.

Sheet `3400` diperlakukan sebagai salah satu format sumber lama, bukan nama sheet baku. Untuk penggunaan berikutnya, sistem menyediakan template Excel standar. Importer tetap mendukung workbook lama yang kolom, posisi header, atau nama sheet-nya berbeda selama pemetaan dapat ditentukan secara aman.

Nilai untuk klasifikasi ABC menggunakan nilai buku SAP aktual sebagai prioritas. Bila tidak tersedia, sistem menggunakan nilai buku penyesuaian yang diberikan dan dapat dipertanggungjawabkan. Jika keduanya tidak tersedia, sistem menghitung estimasi nilai buku terdepresiasi dari harga referensi, usia aset, dan masa manfaat. Harga referensi dapat diestimasi dari aset sejenis dengan kecocokan teknis sebagai syarat utama dan kedekatan lokasi sebagai urutan pencarian. Harga pengadaan baru tidak dipakai langsung sebagai nilai klasifikasi ABC; nilainya dipertahankan sebagai input tahap inventory policy setelah kelas ABC terbentuk.

Dokumen PERDIR 0299.P/DIR/2016 digunakan sebagai referensi masa manfaat akuntansi, bukan sebagai keputusan teknis bahwa aset harus dipensiunkan pada usia tertentu.

## 2. Tujuan dan kriteria keberhasilan

Fase ini dinyatakan berhasil apabila:

- unit dapat mengunggah workbook lengkap, menyimpan draft, menutup aplikasi, dan melanjutkan prosesnya kemudian;
- sistem dapat mengenali sheet sumber berdasarkan isi dan pola header, tanpa bergantung pada nama `3400`;
- semua nilai kanonis memiliki jejak ke file, sheet, baris, kolom, dan aturan transformasi sumber;
- sistem menghasilkan data aset kanonis beserta error, warning, sumber nilai, dan bukti estimasi;
- pengguna dapat mengunduh template standar untuk pengumpulan data berikutnya;
- DIV RST dapat membandingkan snapshot lama dan baru, meninjau pengecualian, lalu menyetujui aktivasi secara atomik;
- versi lama tetap tersedia sebagai histori dan tidak dihapus otomatis;
- snapshot aktif siap menjadi masukan mesin perhitungan ABC pada fase berikutnya.

## 3. Ruang lingkup

Termasuk dalam fase ini:

- penyimpanan privat workbook sumber;
- deteksi sheet, header, baris data, dan pemetaan kolom;
- template Excel standar untuk snapshot aset;
- normalisasi data aset;
- master masa manfaat dan pemetaan kelas aset;
- resolusi nilai ABC dan estimasi harga pembanding;
- validasi, warning, error, dan persetujuan manual;
- perbandingan versi dan aktivasi snapshot;
- kontrol akses unit dan DIV RST;
- audit perubahan dan keputusan.

Tidak termasuk dalam fase ini:

- mesin lengkap normalisasi RFQ dan perhitungan ABC A1/A2/B1/B2/C;
- pengolahan histori gangguan atau penggantian enam tahun;
- keputusan teknis penghapusan atau retirement aset;
- revaluasi dengan indeks inflasi yang belum memiliki sumber resmi;
- sinkronisasi langsung dengan SAP atau Google Sheets;
- dashboard nasional final dan seluruh logika alokasi material cadang.

### 3.1 Kontrak dengan perhitungan ABC dan inventory policy

Snapshot aset dari fase ini menjadi input bagi mesin ABC pada fase berikutnya. Mesin tersebut wajib menghasilkan tepat lima kelas: `A1`, `A2`, `B1`, `B2`, dan `C`. Seluruh kelas tetap disimpan, ditampilkan, dan dapat diaudit.

Kelas `C` tetap merupakan hasil klasifikasi yang sah, tetapi tidak diteruskan ke perhitungan alokasi material cadang. Tidak ada pengecualian berdasarkan jenis peralatan atau lead time setelah suatu kelompok ditetapkan sebagai kelas C.

Nilai klasifikasi ABC dan harga pengadaan baru memiliki fungsi berbeda:

- klasifikasi ABC menggunakan nilai buku SAP, nilai buku penyesuaian yang sah, atau estimasi nilai buku terdepresiasi;
- harga pengadaan baru disimpan terpisah dan digunakan setelah kelas ABC diperoleh;
- pada kebijakan saat ini, harga pengadaan baru digunakan untuk menghitung material cadang ketika inventory policy adalah **Optimum Spare**, yang berlaku untuk kelas `A2` dan `B1`;
- harga pengadaan baru tidak boleh menggantikan nilai buku secara langsung hanya agar suatu kelompok memperoleh kelas ABC tertentu.

## 4. Pendekatan yang dipilih

Pendekatan yang digunakan adalah **template kanonis dengan adapter legacy yang adaptif**.

Template kanonis memberi format yang dapat dibagikan ke seluruh unit, aturan validasi yang jelas, dan proses impor yang konsisten. Adapter legacy memungkinkan data saat ini tetap diproses walaupun nama sheet, posisi header, atau nama kolomnya belum seragam.

Dua pendekatan lain tidak dipilih:

- format baku saja terlalu kaku dan akan menolak banyak workbook lama yang sebenarnya masih dapat dipetakan;
- importer adaptif tanpa format tujuan akan membuat variasi terus bertambah dan menyulitkan audit serta pemeliharaan.

## 5. Temuan pada workbook UIT JBB

Workbook sumber menunjukkan bahwa struktur dapat berubah antarversi. Sheet lama bernama `3400` memiliki kolom lokasi, bay, spesifikasi MARA, nomor aset, group name, jumlah, satuan, nilai buku SAP, usia, dan kondisi aset. Terdapat pula header `MARA` yang muncul dua kali tetapi salah satunya sebenarnya berisi nomor aset. Hal ini membuktikan bahwa nama header saja tidak cukup; posisi, tipe data, dan pola isi juga harus diperiksa.

Workbook revisi ABC mempunyai struktur yang lebih eksplisit:

- A `UPT`
- B `NAMAGI`
- C `BAY_PENGHANTAR`
- D `TID`
- E `MARA`
- F `NO ASSET`
- G `GROUP_NAME`
- H jumlah
- I satuan
- J `nilai_buku_SAP`
- K usia
- L harga pengadaan saat ini
- M nilai buku penyesuaian
- N nilai akhir
- O-Q hasil turunan ABC
- T-W kolom bantu teknis

Kolom turunan ABC dan kolom bantu tidak menjadi masukan kanonis. Hasil analisis terhadap 141.105 kandidat baris data menunjukkan:

- 7.798 baris atau 5,53% memiliki nilai buku SAP yang dapat digunakan;
- 133.015 baris atau 94,27% menggunakan nilai buku penyesuaian;
- 19 baris atau 0,01% hanya memiliki harga pengadaan saat ini;
- 273 baris atau 0,19% belum memiliki nilai yang dapat diselesaikan;
- 1.492 baris tidak memiliki usia, walaupun sebagian nilai penyesuaiannya tetap terisi;
- 8.888 baris berusia sedikitnya 40 tahun dan 8.884 di antaranya memiliki nilai penyesuaian nol;
- terdapat nilai angka yang disimpan sebagai teks dan harus diparse dengan aturan lokal yang aman;
- kolom nilai akhir yang sudah dihitung di workbook tidak cukup konsisten untuk dijadikan sumber kebenaran dan hanya boleh dipakai sebagai pembanding.

Angka tersebut menjadi baseline migrasi awal, bukan aturan bisnis permanen.

## 6. Template Excel standar

Workbook standar terdiri dari:

1. `PETUNJUK`, berisi definisi, contoh, dan aturan pengisian;
2. `DATA_ASET`, berisi satu baris per aset atau kelompok aset yang dapat dipertanggungjawabkan;
3. `REFERENSI`, berisi daftar nilai valid seperti kondisi aset dan satuan untuk data validation.

Nama `DATA_ASET` adalah standar baru. Importer tidak menjadikan nama tersebut sebagai satu-satunya cara mengenali sumber.

### 6.1 Kolom input kanonis

| Kolom | Kebutuhan | Keterangan |
|---|---|---|
| `UNIT_INDUK` | Wajib | Pemilik snapshot, misalnya UIT JBB |
| `UPT` | Wajib | Unit pelaksana |
| `NAMA_GI` | Wajib untuk aset berlokasi | Nama gardu induk/lokasi |
| `BAY_PENGHANTAR` | Kondisional | Bay atau penghantar bila relevan |
| `TID` | Opsional disarankan | Identitas teknis |
| `NO_ASET` | Opsional disarankan | Identitas aset SAP/operasional |
| `NAMA_PERALATAN` | Wajib | Keluarga atau nama peralatan |
| `SPESIFIKASI_MARA` | Wajib | Spesifikasi asli; tidak boleh dihilangkan oleh normalisasi |
| `JUMLAH` | Wajib | Kuantitas positif |
| `SATUAN` | Wajib | Satuan yang sesuai |
| `KONDISI_ASET` | Wajib | P0, P1, P2, P3, atau P4; P0 paling kritis |
| `TANGGAL_OPERASI` | Disarankan | Sumber usia yang paling baik |
| `USIA_ASET_TAHUN` | Kondisional | Digunakan bila tanggal operasi tidak tersedia |
| `KODE_CLASS_ASSET` | Kondisional | Kode klasifikasi untuk masa manfaat |
| `KODE_JENIS` | Kondisional | Kode jenis sesuai referensi |
| `KODE_SUBJENIS` | Kondisional | Kode subjenis sesuai referensi |
| `NILAI_BUKU_SAP` | Kondisional | Sumber nilai utama bila tersedia; nol adalah nilai sah |
| `HARGA_PENGADAAN_SAAT_INI` | Kondisional | Harga pengadaan baru/referensi terkini; disimpan untuk Optimum Spare dan dapat menjadi dasar estimasi nilai buku terdepresiasi bila nilai buku tidak tersedia |
| `TANGGAL_REFERENSI_HARGA` | Kondisional | Tanggal dasar harga |
| `NILAI_BUKU_PENYESUAIAN` | Opsional legacy | Nilai yang diberikan sumber lama, tetap diaudit |
| `KODE_MATERIAL` | Opsional | Kode material bila tersedia |
| `KETERANGAN` | Opsional | Catatan unit |

Minimal satu jalur valuasi harus dapat diselesaikan: nilai buku SAP; nilai buku penyesuaian yang sah; atau harga referensi ditambah data usia dan masa manfaat. Baris yang belum memenuhi jalur tersebut tetap disimpan dalam draft tetapi menjadi error sampai diselesaikan.

### 6.2 Kolom yang dihitung sistem

Kolom berikut tidak diisi atau ditimpa oleh unit:

- `MASA_MANFAAT_TAHUN`
- `NILAI_ABC_FINAL`
- `SUMBER_NILAI`
- status pemetaan dan validasi
- donor harga dan metode estimasi
- rule version serta waktu perhitungan.

## 7. Deteksi sheet, header, dan baris data

Nama sheet hanya menjadi sinyal tambahan. Importer memindai sekurang-kurangnya 50 baris awal setiap sheet, menormalisasi spasi, kapitalisasi, newline, underscore, dan tanda baca, lalu memberi skor berdasarkan kombinasi header dan pola isi.

Aturan utama:

- alias legacy seperti `3400` didukung tetapi tidak diwajibkan;
- header ganda tidak digabung otomatis; sistem memakai posisi, tipe data, dan sampel isi untuk mengusulkan pemetaan;
- pemetaan fuzzy atau ambigu wajib dikonfirmasi pengguna;
- baris contoh, pemisah, subtotal, footer, dan kolom bantu dikeluarkan berdasarkan pola, bukan nomor baris tetap;
- formula tidak dieksekusi oleh aplikasi; nilai cache hanya dapat dipakai jika valid dan tetap ditandai sebagai berasal dari formula;
- file, sheet, nomor baris, header asli, alamat sel, dan keputusan pemetaan disimpan sebagai provenance;
- pemetaan yang disetujui dapat disimpan sebagai profil berversi untuk workbook sejenis.

Sebuah baris dianggap kandidat data apabila memiliki identitas/lokasi yang memadai dan setidaknya nama peralatan atau spesifikasi, jumlah, serta satuan. Baris yang hampir cocok tidak dibuang; baris tersebut masuk draft dengan alasan penolakan yang terlihat.

## 8. Master masa manfaat

PERDIR 0299.P/DIR/2016 menjadi referensi masa manfaat akuntansi dan berlaku sesuai periode efektif yang tercantum dalam dokumen. Masa manfaat tidak disederhanakan menjadi satu angka global.

Master masa manfaat disimpan berdasarkan:

- fungsi aset;
- kode class asset;
- kode jenis;
- kode subjenis;
- masa manfaat dalam tahun;
- tanggal mulai dan akhir berlaku;
- dokumen sumber dan versi aturan;
- pihak yang menyetujui pemetaan.

Untuk fungsi transmisi, contoh keluarga peralatan transmisi daya, gardu induk, saluran udara tegangan tinggi, dan kabel tanah dapat memiliki masa manfaat 40 tahun. Kelompok lain dapat berbeda, misalnya transformator distribusi 25 tahun, peralatan data/telekomunikasi sekitar 10 tahun, dan peralatan umum sekitar 5 tahun sesuai klasifikasi resminya. Nilai contoh ini tidak menggantikan tabel referensi lengkap.

Urutan pemetaan kelas aset:

1. kode kelas/jenis/subjenis yang tepat;
2. alias peralatan yang telah dikurasi dan disetujui;
3. keputusan manual DIV RST.

Pemetaan yang ambigu memblokir estimasi nilai otomatis pada baris terkait, tetapi tidak menghilangkan draft atau menggagalkan seluruh upload.

## 9. Resolusi nilai ABC

Nama internal yang digunakan untuk nilai klasifikasi adalah `nilaiABC`, bukan `acquisitionValue`, karena angka yang dipakai harus berupa nilai buku atau estimasi nilai buku terdepresiasi. Harga pengadaan baru disimpan pada field terpisah dan tidak masuk langsung ke agregasi nilai klasifikasi.

Urutan sumber nilai:

1. `SAP_BOOK_VALUE`: nilai buku SAP aktual;
2. `PROVIDED_ADJUSTED_VALUE`: nilai buku penyesuaian dari sumber yang lolos validasi;
3. `SYSTEM_DEPRECIATION`: estimasi nilai buku terdepresiasi dari harga referensi aktual;
4. `ESTIMATED_SAME_GI`: harga pembanding teknis dari GI yang sama;
5. `ESTIMATED_SAME_UPT`: harga pembanding dari UPT yang sama;
6. `ESTIMATED_NEAREST_LOCATION`: harga pembanding dari lokasi terdekat;
7. `ESTIMATED_NATIONAL`: harga pembanding nasional;
8. `UNRESOLVED`: belum dapat dihitung.

Status tambahan seperti `AGE_IMPUTED` dan `MANUAL_APPROVAL_REQUIRED` dapat menyertai sumber nilai tersebut.

Rumus depresiasi garis lurus untuk estimasi adalah:

```text
nilaiABC = max(0, hargaReferensi × (1 - min(usiaAset, masaManfaat) / masaManfaat))
```

Aturan penting:

- nilai nol sah untuk aset yang telah terdepresiasi penuh dan aset tetap dihitung dalam populasi;
- nilai negatif, tak hingga, token error, atau teks yang tidak dapat diparse adalah tidak sah;
- nilai buku SAP nol tidak dianggap kosong;
- nilai akhir hasil formula workbook lama bukan sumber kebenaran dan hanya dipakai untuk rekonsiliasi;
- harga pengadaan baru mentah tidak dipakai langsung untuk menentukan kelas ABC;
- setelah klasifikasi selesai, harga pengadaan baru dapat dikonsumsi oleh perhitungan Optimum Spare untuk kelas A2 dan B1;
- kondisi P0-P4 tidak digunakan untuk menebak usia;
- setiap hasil menyimpan sumber nilai, rule version, input, dan waktu perhitungan.

## 10. Penanganan usia yang tidak tersedia

Jika tanggal operasi dan usia sama-sama kosong, sistem mengestimasi usia menggunakan median cohort yang kompatibel, dengan urutan:

1. spesifikasi/RFQ yang sama pada GI yang sama;
2. spesifikasi/RFQ yang sama pada UPT yang sama;
3. spesifikasi/RFQ yang sama pada unit induk yang sama;
4. spesifikasi/RFQ yang sama secara nasional.

RFQ pada konteks ini hanya boleh dipakai jika pengelompokan teknisnya sudah disetujui. Usia donor tidak disalin satu per satu; median cohort digunakan agar lebih tahan terhadap pencilan. Hasil diberi `AGE_IMPUTED`, warning yang jelas, bukti cohort, dan memerlukan persetujuan DIV RST sebelum aktivasi.

Jika tidak ada cohort yang layak, baris tetap `UNRESOLVED`.

## 11. Estimasi harga pembanding

Kecocokan teknis adalah hard gate sebelum kedekatan lokasi. Kandidat harus memiliki spesifikasi ternormalisasi yang sama atau berada dalam kelompok RFQ yang telah disetujui, unit yang kompatibel, dan keluarga peralatan yang sama. Kemiripan spesifikasi yang belum disetujui tidak pernah diterima otomatis.

Setelah lolos kecocokan teknis, urutan lokasi adalah:

1. GI yang sama;
2. UPT yang sama;
3. unit induk yang sama;
4. GI terdekat berdasarkan koordinat;
5. nasional.

Dalam satu tingkat lokasi:

- harga dengan tanggal referensi paling baru diprioritaskan;
- bila ada beberapa kandidat yang setara, sistem menggunakan median;
- satu kandidat dapat digunakan tetapi diberi warning;
- jumlah kandidat, rentang harga, median, pencilan, lokasi, jarak, dan tanggal harga ditampilkan;
- kandidat yang sudah usang atau memiliki sebaran terlalu tinggi memerlukan pemeriksaan manual.

Jika donor memiliki harga pengadaan saat ini, usia donor tidak memengaruhi harga dasar; depresiasi diterapkan menggunakan usia target. Jika donor hanya memiliki nilai buku, sistem hanya boleh menurunkan harga dasar bila usia donor tersedia dan faktor sisa manfaat cukup stabil. Donor yang hampir atau sudah habis masa manfaat tidak layak untuk proses gross-up karena hasilnya tidak andal.

Sistem tidak menambahkan inflasi atau eskalasi harga pada MVP tanpa indeks resmi dan aturan efektif yang disetujui.

## 12. Validasi dan klasifikasi masalah

### 12.1 Error pemblokir baris atau kelompok

- nama peralatan/spesifikasi, jumlah, atau satuan tidak tersedia;
- nilai tidak tersedia dan tidak ada pembanding yang layak;
- kelas masa manfaat ambigu;
- formula/error token tidak memiliki nilai cache yang sah;
- nilai negatif atau bukan angka;
- satuan tidak kompatibel;
- kondisi aset di luar P0-P4;
- nomor aset yang sama memiliki data identitas yang bertentangan.

### 12.2 Warning yang wajib terlihat

- header dipetakan melalui alias atau fuzzy match;
- nilai atau usia diestimasi;
- donor berasal dari UPT lain, lokasi terdekat, atau nasional;
- hanya ada satu donor;
- sebaran harga tinggi atau tanggal harga sudah lama;
- nilai nol karena depresiasi penuh;
- angka berasal dari teks berformat lokal;
- nomor aset/TID tidak tersedia;
- nilai buku penyesuaian diberikan sumber lama tanpa rincian rumus.

Draft tetap tersimpan walaupun memiliki error. Pengajuan ke DIV RST memerlukan nol error pemblokir, kecuali jenis pengecualian tersebut secara eksplisit diizinkan oleh kebijakan dan disetujui DIV RST. Nilai kosong atau error tidak pernah diam-diam diubah menjadi nol.

## 13. Model data konseptual

Desain memanfaatkan tabel yang telah ada seperti `datasets`, `dataset_versions`, `approval_events`, dan `audit_events`. Tanggung jawab tambahan dibagi menjadi entitas berikut:

- `source_files`: metadata file sumber privat, hash, ukuran, uploader, dan storage path;
- `import_sessions`: proses upload, parser version, status, dan unit pemilik;
- `import_sheets`: hasil deteksi setiap sheet;
- `mapping_profiles`: profil pemetaan berversi yang dapat digunakan ulang;
- `import_column_mappings`: pemetaan kolom aktual untuk satu sesi;
- `staged_asset_rows`: hasil parse sementara beserta status validasi;
- `asset_snapshot_rows`: baris kanonis pada versi snapshot;
- `useful_life_rules`: master masa manfaat berversi;
- `asset_class_mappings`: pemetaan peralatan ke kelas masa manfaat;
- `valuation_candidates`: kandidat donor harga/usia dan bukti seleksi;
- `valuation_resolutions`: keputusan akhir nilai setiap baris;
- `version_comparisons`: ringkasan serta rincian perubahan antarversi.

Workbook mentah disimpan satu kali di storage privat. Database menyimpan kolom kanonis yang diperlukan untuk pencarian dan agregasi serta provenance yang ringkas. Sistem menghindari duplikasi seluruh JSON mentah pada setiap baris agar tetap efisien untuk Supabase Free dan snapshot sekitar 141 ribu baris.

Status versi mengikuti alur `draft` → `validated` → `submitted` → `approved` → `active`. Versi aktif sebelumnya menjadi `historical` setelah aktivasi baru. Penghapusan logis dan pembersihan permanen hanya tersedia bagi DIV RST sesuai kebijakan retensi.

## 14. Arsitektur parsing dan validasi

Alur teknis yang dipilih:

1. browser membaca workbook dalam Web Worker untuk memberi preview cepat, mendeteksi struktur, dan menghitung hash;
2. file asli diunggah ke bucket privat;
3. backend mem-parsing ulang file yang tersimpan memakai parser dan aturan berversi;
4. data kanonis dimuat secara bertahap/chunk agar dapat dilanjutkan bila koneksi terputus;
5. backend mengulangi validasi sebelum submit dan sebelum persetujuan;
6. hanya hasil server yang dapat diaktifkan.

Excel diperlakukan sebagai input tidak tepercaya. Sistem tidak menjalankan macro, external link, atau formula. Formula disimpan hanya sebagai bukti sumber bila diperlukan; nilai cache harus lolos validasi. File sumber yang memakai formula impor eksternal harus direkonstruksi dari nilai mentah jika cache-nya tidak lengkap.

Setiap proses menyimpan versi parser, versi aturan, hash file, dan hash hasil kanonis agar hasil dapat direproduksi.

## 15. Alur antarmuka

1. Pengguna memilih unit induk dan dataset aset.
2. Pengguna mengunggah workbook lengkap atau mengunduh template standar.
3. Sistem mendeteksi sheet, header, dan baris data.
4. Pengguna mengonfirmasi pemetaan yang ambigu.
5. Sistem menampilkan preview, jumlah baris, error, warning, dan kelengkapan data.
6. Sistem menyelesaikan kelas masa manfaat, nilai, serta kandidat pembanding.
7. Pengguna meninjau resolusi dan melengkapi data yang masih error.
8. Sistem membandingkan draft dengan snapshot aktif.
9. Unit mengajukan versi lengkap kepada DIV RST.
10. DIV RST menyaring warning, melihat bukti estimasi, dan menyetujui atau mengembalikan draft.
11. Persetujuan mengaktifkan seluruh snapshot secara atomik.

DIV RST dapat melakukan bulk approval hanya pada kumpulan baris yang sudah difilter dan kompatibel. Tindakan massal tetap mencatat aktor, ruang lingkup, waktu, serta alasan.

## 16. Perbandingan versi dan aktivasi

Perbandingan menampilkan setidaknya:

- jumlah baris dan aset;
- aset ditambahkan, dihapus dari snapshot baru, atau berubah;
- perubahan lokasi dan kondisi P0-P4;
- perubahan spesifikasi, jumlah, dan satuan;
- perubahan nilai dan sumber nilai;
- distribusi metode estimasi;
- jumlah error, warning, dan unresolved;
- total nilai ABC serta perubahan terhadap versi aktif.

Aktivasi berlangsung dalam satu transaksi logis. Tidak boleh ada kondisi ketika sebagian snapshot baru sudah aktif sementara sebagian lain masih memakai versi lama. Perubahan master atau aturan tidak menulis ulang snapshot aktif secara diam-diam; sistem membuat proses revalidasi/reprocessing yang menghasilkan versi baru untuk ditinjau.

## 17. Keamanan dan otorisasi

- operator unit hanya dapat membuat dan mengubah draft milik unitnya;
- operator tidak dapat menghapus versi aktif atau histori;
- DIV RST dapat meninjau lintas unit, memutuskan pengecualian, mengaktifkan versi, dan mengelola duplikat;
- pengguna terautentikasi dapat melihat ringkasan nasional sesuai kebijakan, tetapi akses baris rinci mengikuti unit dan role;
- bucket file sumber bersifat privat;
- service role tidak pernah dikirim ke browser;
- download file sumber menggunakan otorisasi server dan URL bertanda tangan berumur pendek;
- setiap override, perubahan mapping, persetujuan, penolakan, dan aktivasi masuk audit log.

## 18. Pengujian dan kriteria penerimaan

Fixture pengujian memakai data sintetis; workbook operasional tidak dimasukkan ke repository.

Skenario minimum:

- sheet sumber diganti nama dan header berpindah baris;
- header `MARA` ganda dibedakan berdasarkan isi;
- baris contoh, pemisah, subtotal, dan kolom bantu tidak dianggap data;
- formula tanpa cache, error token, dan angka teks lokal terdeteksi;
- nol valid dibedakan dari nilai kosong;
- masa manfaat berbeda, termasuk contoh 40, 25, 10, dan 5 tahun;
- donor dipilih berurutan dari GI, UPT, unit induk, lokasi terdekat, lalu nasional;
- spesifikasi mendekati tetapi belum disetujui tidak dipakai otomatis;
- usia kosong memakai median cohort, bukan kondisi P0-P4;
- error satu baris tidak menghilangkan draft keseluruhan;
- RLS mencegah unit mengubah snapshot unit lain;
- persetujuan mengaktifkan versi secara atomik dan mempertahankan histori;
- parsing ulang dengan file dan rule version yang sama menghasilkan hash kanonis yang sama;
- performa diuji dengan sedikitnya 141 ribu baris pada perangkat representatif.

Untuk migrasi awal UIT JBB, sistem harus dapat merekonsiliasi distribusi sumber nilai terhadap baseline analisis. Selisih harus dapat dijelaskan melalui aturan parsing atau perbaikan data. Sebanyak 273 baris unresolved dan 1.492 baris dengan usia kosong menjadi daftar pemeriksaan awal, bukan angka yang dipaksakan tetap sama.

## 19. Rollout

1. Aktifkan adapter legacy untuk workbook UIT JBB.
2. Jalankan impor awal dalam mode draft dan rekonsiliasi dengan workbook perhitungan saat ini.
3. DIV RST meninjau pemetaan, 273 kandidat unresolved, estimasi usia, dan sumber nilai.
4. Setelah hasil diterima, aktifkan snapshot awal UIT JBB.
5. Publikasikan template standar kepada unit lain.
6. Pertahankan adapter legacy untuk transisi, tetapi arahkan upload baru menggunakan template.
7. Tambahkan unit berikutnya sebagai dataset terpisah dengan alur persetujuan yang sama.

## 20. Risiko dan pengendalian

- **Header sangat bervariasi:** gunakan fingerprint, preview, dan konfirmasi pemetaan.
- **Nilai penyesuaian lama tidak transparan:** tandai sumbernya dan jangan menyamarkannya sebagai SAP aktual.
- **Estimasi terlihat seperti fakta:** tampilkan label, donor, metode, dan approval requirement di seluruh UI dan ekspor.
- **Salah kelas masa manfaat:** pakai master berversi dan blokir pemetaan ambigu.
- **Workbook besar pada paket gratis:** simpan file mentah sekali, lakukan ingest bertahap, dan hindari raw JSON berulang.
- **Formula eksternal tidak memiliki cache:** jangan mengeksekusi formula; minta nilai sumber atau hitung ulang dengan aturan sistem.
- **Aturan berubah:** hasil aktif tidak ditimpa; reprocessing selalu menghasilkan versi baru.

## 21. Batas interpretasi

Nilai hasil proses ini adalah basis analisis ABC dan perencanaan material cadang, bukan pengganti buku besar SAP, penilaian akuntansi resmi, atau keputusan kelayakan teknis aset. Kondisi aset P0-P4 dipakai untuk prioritas lokasi penempatan material cadang—P0 paling kritis dan P4 paling baik—bukan untuk menentukan usia, masa manfaat, atau depresiasi.
