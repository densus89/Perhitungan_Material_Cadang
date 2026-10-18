# Desain Pemrosesan Impor Aset Bertahap dan Resumable

Tanggal: 19 Oktober 2026  
Status: Siap ditinjau  
Fase: Penguatan impor snapshot aset skala unit

## 1. Ringkasan keputusan

Pemrosesan workbook besar tidak lagi bergantung pada satu request Vercel. Satu tindakan pengguna tetap mewakili satu pekerjaan impor, tetapi browser melanjutkan pekerjaan melalui beberapa request pendek. Setiap request mengklaim lease terbatas, membaca ulang sumber privat dan aturan yang sama, memverifikasi hash deterministik, lalu menyelesaikan sejumlah chunk yang belum tersimpan.

Setiap chunk memasukkan pasangan `asset_snapshot_rows` dan `asset_valuations` serta marker chunk dalam satu transaksi database. Retry untuk chunk yang sudah selesai bersifat idempotent. Run baru hanya dapat difinalisasi setelah manifest chunk lengkap, jumlah baris tepat, hash persisten tepat, dan seluruh pemeriksaan lifecycle yang sudah ada tetap lulus.

Desain ini dipilih untuk mempertahankan Vercel dan Supabase Free, tanpa queue atau worker eksternal. Biayanya adalah workbook dapat dibaca ulang pada request lanjutan, tetapi setiap request mempunyai batas waktu yang aman dan proses dapat pulih setelah koneksi atau function terputus.

## 2. Latar belakang dan bukti

Acceptance test hosted memakai workbook sintetis 141.105 baris, sama dengan skala baseline UIT JBB. Batas fungsi Vercel adalah 300 detik. Pipeline satu request telah diuji dengan decoder JSON linear dan beberapa konfigurasi batch:

- batch 2.000 berurutan mencapai sekitar 88.000 baris sebelum timeout;
- batch 2.000 dengan dua request paralel mencapai sekitar 124.000 baris;
- empat request paralel menurunkan hasil menjadi sekitar 48.000 baris karena kontensi database;
- batch 3.000 dengan dua request paralel mencapai sekitar 57.000–60.000 baris karena payload yang lebih mahal.

Parser, valuasi, hashing, dan reservasi membutuhkan sekitar 65 detik pada deployment hosted sebelum insert dimulai. Tidak ada kombinasi tuning yang memberi margin aman terhadap batas 300 detik. Karena kegagalan berasal dari batas arsitektur satu request, menaikkan konkurensi atau ukuran batch bukan solusi yang andal.

## 3. Tujuan dan kriteria keberhasilan

Fitur dinyatakan berhasil apabila:

- pengguna menekan satu tombol untuk memulai dan UI otomatis melanjutkan sampai siap ditinjau;
- tidak ada satu request pemrosesan yang dirancang mendekati batas 300 detik;
- proses 141.105 baris dapat selesai melalui beberapa request pada Vercel dan Supabase Free;
- reload, kehilangan koneksi, atau function timeout tidak menghapus progres yang sudah committed;
- retry tidak membuat baris, valuasi, run, atau chunk duplikat;
- snapshot dan valuasi selalu masuk berpasangan per chunk;
- mapping, source hash, rule version, row hash, dan valuation hash tetap reproducible;
- hanya run lengkap yang dapat berstatus `COMPLETE`, dibandingkan, diajukan, atau diaktifkan;
- UI memperlihatkan progres persisten dan tindakan `Lanjutkan proses` bila otomatisasi terputus;
- seluruh keamanan unit, RLS, audit, review DIV RST, dan histori versi yang sudah ada tetap berlaku.

## 4. Pendekatan yang dipilih

### 4.1 Pilihan: request bertahap dengan manifest chunk

Request pertama membuat atau mengambil run `PROCESSING`, memverifikasi workbook, dan menghitung hasil kanonis deterministik. Request tersebut memproses sebagian chunk. Respons mengembalikan progres persisten. Browser mengirim request berikutnya sampai server mengembalikan hasil final `READY_TO_SUBMIT` atau `NEEDS_FIX`.

Manifest chunk berada di PostgreSQL. Oleh karena itu database, bukan memori function atau browser, menjadi sumber kebenaran progres.

### 4.2 Alternatif yang tidak dipilih

**Worker/queue eksternal** akan memberi eksekusi background yang baik, tetapi menambah layanan, kredensial, biaya operasional, dan failure mode di luar Supabase/Vercel.

**Staging JSON kanonis di object storage** dapat menghindari parse ulang, tetapi menambah format artefak baru, retensi, enkripsi, cleanup, serta validasi integritas antara XLSX dan staging. Optimasi ini dapat ditambahkan kemudian bila data hosted menunjukkan parse ulang menjadi biaya operasional yang tidak dapat diterima.

**Tuning batch satu request** ditolak karena sudah diuji dan tidak memberikan margin stabil terhadap hard timeout.

## 5. Model data

### 5.1 Manifest chunk

Tambahkan tabel `asset_import_chunks` dengan kolom minimum:

- `import_run_id uuid not null`;
- `chunk_index integer not null`;
- `start_ordinal integer not null`;
- `row_count integer not null`;
- `rows_hash text not null`;
- `valuations_hash text not null`;
- `completed_at timestamptz not null`;
- `completed_by uuid not null`.

Primary key adalah `(import_run_id, chunk_index)`. Kombinasi `(import_run_id, start_ordinal)` juga unik. Tabel memiliki `unit_induk_id` untuk filtering, RLS, dan cleanup terkontrol. Marker bersifat immutable setelah dibuat dan hanya dapat ditulis oleh RPC service-only yang memverifikasi aktor.

Ukuran chunk persistence dikembalikan ke 2.000 pasangan baris/valuasi karena konfigurasi tersebut paling efisien pada bukti hosted. Satu request memproses paling banyak 12 chunk atau 24.000 baris. Angka ini menghasilkan margin besar setelah parse/valuasi dan dapat diubah melalui konstanta server yang diuji, bukan input klien.

### 5.2 Lease run

Tambahkan ke `asset_import_runs`:

- `processing_protocol_version text not null default 'legacy-v1'`;
- `processing_lease_token uuid`;
- `processing_lease_expires_at timestamptz`;
- `last_progress_at timestamptz`;
- `processing_attempts integer not null default 0`.

Lease diperoleh melalui RPC actor-checked dan berlaku paling lama 240 detik. Request aktif dapat memperpanjang lease hanya menggunakan token yang sama. Lease dilepas saat request selesai. Jika function mati, lease dapat direbut setelah kedaluwarsa. Lease tidak mengubah status run dan tidak boleh melewati pemeriksaan mapping/source/rule.

Run baru memakai `processing_protocol_version='resumable-v1'`. Default `legacy-v1` mempertahankan kompatibilitas run historis dan membuat pemeriksaan manifest dapat diterapkan berdasarkan versi protokol yang eksplisit, bukan berdasarkan waktu pembuatan.

### 5.3 ID deterministik

ID `asset_snapshot_rows` dan pasangan `asset_valuations.asset_row_id` diturunkan secara deterministik menggunakan UUID v5 dari namespace run dan identitas stabil `(import_sheet_id, source_row_number)`. Dengan run, file, mapping, dan rule version yang sama, parsing ulang menghasilkan ID serta global hash yang sama.

Nomor aset tidak menjadi input ID karena dapat kosong, ganda, atau berubah. Urutan fisik chunk mengikuti urutan `(import_sheet_id, source_row_number)` yang sama dengan kontrak hash final.

## 6. Kontrak database

### 6.1 Claim atau resume

RPC `claim_asset_import_processing`:

1. mengunci session/version/run dengan urutan lock lifecycle yang sudah ada;
2. memverifikasi aktor operator untuk unit terkait;
3. menolak mapping revision, layout hash, source hash, atau rule version yang berubah;
4. membuat run baru dari metadata ekspektasi yang telah dihitung server bila belum ada run `PROCESSING`, atau memilih run `PROCESSING` yang kompatibel;
5. menolak klaim bila lease lain masih aktif;
6. menyimpan token, expiry, `last_progress_at`, dan menaikkan attempt;
7. mengembalikan run ID, ekspektasi hash/jumlah, token, serta daftar chunk selesai.

Input klien tidak pernah menentukan ukuran chunk, ordinal, row IDs, expected count, atau expected hashes.

### 6.2 Commit chunk atomik dan idempotent

RPC `commit_asset_import_chunk` menerima aktor, run, lease token, indeks chunk, ordinal awal, packed rows, packed valuations, dan dua hash chunk.

Dalam satu transaksi RPC:

- validasi lease dan status run;
- validasi ukuran maksimum 2.000 dan pasangan row/valuation;
- validasi ordinal sesuai chunk index dan expected row count;
- bila marker sudah ada dengan metadata/hash identik, kembalikan sukses tanpa insert;
- bila marker ada tetapi metadata/hash berbeda, gagal tertutup;
- insert snapshot rows dan valuations;
- insert marker manifest;
- perbarui `last_progress_at`;
- return jumlah baris chunk.

Kegagalan pada salah satu langkah me-rollback seluruh chunk. Tidak ada marker tanpa data dan tidak ada data chunk tanpa marker.

### 6.3 Finalisasi

`finalize_asset_import_run` ditambah pemeriksaan:

- semua indeks chunk yang diharapkan tersedia tanpa celah;
- jumlah `row_count` manifest sama dengan `expected_row_count` dan `expected_valuation_count`;
- jumlah snapshot dan valuation persisten tepat;
- global hash persisten tepat;
- mapping/source/rule masih sama;
- lease token pemanggil masih valid atau finalisasi terjadi di dalam claim yang sama.

Finalisasi, summary, current run, audit, dan pembentukan comparison tetap memakai transaksi serta lock lifecycle yang sudah ada.

### 6.4 Fail dan cleanup

Run hanya dapat ditandai `FAILED` bila lease sudah kedaluwarsa atau pemanggil memiliki lease aktif yang sama. Kegagalan run tidak menghapus chunk agar bukti diagnostik tetap tersedia sampai retry/cleanup yang berwenang. Retry normal melanjutkan run kompatibel; run baru hanya dibuat jika run lama secara eksplisit gagal atau input berubah.

Cleanup sintetis dan operasi admin menghapus marker chunk sebelum row/run induknya, dengan verifikasi marker resource persis seperti mekanisme E2E saat ini.

## 7. Alur server

Setiap `POST /api/imports/[importId]/process` melakukan:

1. autentikasi, origin check, role/unit check, dan load sumber privat;
2. pilih run `PROCESSING` yang kompatibel atau buat candidate run ID bila belum ada;
3. parse ulang workbook dan validasi canonical/layout hash;
4. load reference rules dan donor yang sama;
5. bentuk row/valuation dengan ID deterministik dari run ID terpilih;
6. hitung global expected hashes;
7. claim lease; untuk candidate baru, RPC sekaligus mereservasi run dengan count/hash ekspektasi, sedangkan resume wajib cocok dengan ekspektasi tersimpan;
8. baca manifest chunk selesai;
9. commit maksimal 12 chunk yang masih hilang, memakai window dua RPC paralel;
10. bila masih ada chunk hilang, lepaskan lease dan return HTTP `202` dengan stage `PROCESSING`;
11. bila lengkap, finalisasi, bandingkan, lepaskan lease, lalu return HTTP `200` dengan response final yang sudah ada.

Server tidak menerima offset/progress dari browser sebagai sumber kebenaran. Browser hanya meminta `continue`; database menentukan chunk yang belum selesai.

Jika terjadi error sebelum reservation/claim, tidak ada run baru yang tertinggal. Jika error setelah claim, lease dibiarkan kedaluwarsa atau dilepas pada jalur error yang aman. Batch yang sudah committed tetap dapat dilanjutkan.

## 8. Kontrak respons dan UI

Tambahkan stage `PROCESSING` ke respons workspace dengan objek:

```text
progress = {
  completedRows,
  expectedRows,
  completedChunks,
  expectedChunks,
  percent
}
```

`percent` dihitung server dari manifest dan dibulatkan untuk tampilan; keputusan server tidak pernah memakai nilai percent.

Setelah tombol **Unggah dan proses di server** ditekan:

- UI mengirim satu request pada satu waktu;
- response `202 PROCESSING` memperbarui progress bar dan langsung melanjutkan selama halaman aktif;
- response final menghentikan loop dan membuka ringkasan/review;
- network error menghentikan loop otomatis dan menampilkan **Lanjutkan proses**;
- reload halaman membaca stage/progress persisten lalu menawarkan lanjut;
- response `CONFLICT` karena lease aktif menampilkan bahwa proses sedang berjalan dan menyediakan pemeriksaan status, bukan membuat run baru;
- tombol proses dinonaktifkan selama request aktif untuk mencegah double click.

UI membatasi jumlah kelanjutan otomatis berdasarkan `ceil(expectedChunks / 12) + 2`. Batas ini hanya mencegah loop klien tidak berujung; progres dan kelengkapan tetap ditentukan server.

## 9. Konsistensi, keamanan, dan audit

- Service role tetap hanya berada di server.
- Semua RPC baru `security definer`, `search_path=''`, dicabut dari `public`, `anon`, dan `authenticated`, serta hanya diberikan kepada `service_role`.
- Actor UUID tetap diperiksa terhadap role relational dan unit assignment, bukan metadata klien.
- RLS berlaku pada tabel manifest untuk read yang diizinkan; browser tidak memiliki direct write.
- Lease token tidak dikirim ke browser. Token hanya hidup di request server dan RPC internal.
- Log hanya memuat run ID, fase, counts, duration, dan error code tersanitasi; tidak memuat row, workbook byte, token, atau kredensial.
- Audit final tetap satu kali. Attempt/chunk tidak menambah audit per baris agar audit tidak bising; metadata run menyimpan attempt dan waktu progres.
- Perubahan mapping atau sumber setelah progres dimulai gagal tertutup dan memerlukan fail/reprocess yang diaudit.

## 10. Penanganan kegagalan

| Kondisi | Perilaku |
|---|---|
| Request terputus sebelum chunk commit | Tidak ada progres baru; lease kedaluwarsa lalu dapat dilanjutkan |
| Request mati setelah beberapa chunk commit | Marker chunk tersimpan; resume melewati chunk tersebut |
| Respons hilang setelah commit | Retry membaca marker dan bersifat idempotent |
| Dua tab mencoba lanjut | Hanya satu lease aktif; tab lain menerima conflict/progress |
| Mapping/source/rule berubah | Run lama tidak dilanjutkan; proses gagal tertutup |
| Hash hasil parse berubah | Tidak ada chunk baru dan run ditandai membutuhkan intervensi |
| Satu insert row/valuation gagal | Seluruh chunk rollback, marker tidak dibuat |
| Finalisasi gagal | Chunk tetap tersimpan; finalisasi dapat dicoba ulang setelah penyebab aman |
| Lease kedaluwarsa | Request baru dapat claim; token lama tidak dapat commit |

## 11. Pengujian

### 11.1 Unit dan service

- UUID deterministik stabil dan berbeda untuk run/baris berbeda;
- pemilihan chunk hilang menangani lubang manifest, bukan hanya count;
- satu request tidak memproses lebih dari 12 chunk/24.000 baris;
- client loop berhenti pada final, network error, conflict, dan batas attempt;
- progress dihitung dari marker server;
- stage reload menampilkan progres yang sama.

### 11.2 pgTAP dan concurrency

- claim lease actor-checked, unit-scoped, dan mutually exclusive;
- lease lama tidak dapat commit setelah expiry/reclaim;
- commit chunk memasukkan rows, valuations, dan marker secara atomik;
- replay identik sukses tanpa duplikasi;
- replay dengan hash berbeda ditolak;
- chunk di luar range atau terlalu besar ditolak;
- finalisasi menolak manifest berlubang, count salah, hash salah, dan lease salah;
- failure/submit/review tetap mengikuti lock order tanpa deadlock;
- RLS dan grants untuk manifest/RPC baru fail closed.

### 11.3 E2E hosted

Acceptance test 141.105 baris wajib membuktikan:

- lebih dari satu response `202` diterima sebelum final;
- setiap request proses selesai di bawah 240 detik;
- hasil final memiliki 141.105 snapshot dan 141.105 valuations;
- run `COMPLETE`, summary dan comparison tepat;
- reload di tengah proses dapat melanjutkan;
- simulasi response hilang tidak menduplikasi data;
- semua unit, user, file, run, chunk, row, valuation, dan source object sintetis dibersihkan berdasarkan marker persis.

Suite aplikasi, pgTAP linked, database lint, ESLint, TypeScript, dan production build tetap menjadi gate wajib.

## 12. Rollout dan observability

1. Terapkan tabel/kolom/RPC baru melalui migrasi additive.
2. Deploy server yang dapat membaca stage lama dan baru.
3. Aktifkan UI continuation pada preview branch.
4. Jalankan E2E kecil untuk satu dan beberapa chunk.
5. Jalankan acceptance hosted 141.105 baris dan cleanup proof.
6. Perbarui runbook operasi dengan lease, resume, dan failure recovery.
7. Setelah bukti hosted lulus, gunakan pipeline resumable untuk seluruh impor; endpoint lama tidak memiliki mode satu-request terpisah.

Log fase mencatat `claimed`, `parsed`, `hashed`, `chunk_started`, `chunk_completed`, `partial_return`, `finalized`, dan `compared`, masing-masing dengan duration/count tanpa data sensitif. Dashboard awal tidak diperlukan; log Vercel dan query agregat run/chunk cukup untuk rollout.

## 13. Kompatibilitas dan batas ruang lingkup

- Format workbook, pemetaan legacy, valuasi, review, submit, dan aktivasi tidak berubah.
- Draft/run `COMPLETE` yang sudah ada tetap valid tanpa marker chunk historis; pemeriksaan manifest hanya berlaku untuk run `processing_protocol_version='resumable-v1'`.
- Run `PROCESSING` lama harus ditandai gagal secara terkontrol sebelum rollout; tidak dimigrasikan secara otomatis.
- Tidak ada background worker, cron, message queue, atau perubahan paket layanan.
- Tidak ada perubahan algoritme ABC A1/A2/B1/B2/C atau inventory policy dalam pekerjaan ini.
- Optimasi staging kanonis dapat dipertimbangkan setelah pipeline resumable terbukti dan metrik nyata menunjukkan kebutuhan.

## 14. Definisi selesai

Pekerjaan selesai hanya bila commit aplikasi dan migrasi yang sama sudah berada di GitHub, preview Vercel sukses, seluruh verifikasi lokal/database hijau, acceptance hosted 141.105 baris lulus dengan setiap request di bawah 240 detik, dan cleanup membuktikan tidak ada resource sintetis tersisa.
