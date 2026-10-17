# Agent 10 — Audit Keandalan / Ops (mode kertas)

Semua uji pada SALINAN `hasil/audit/kerja_10/bot_salinan` (bot asli tidak disentuh, tidak dijalankan).
RPC tiruan offline (`kerja_10/mock_rpc.js`) menyajikan event on-chain asli `data/ags4` seolah chain berjalan —
RPC publik hanya dipakai 2x untuk `cek_siap.js`. Semua proses uji sudah dimatikan (0 node/penjaga sisa).

## Hasil uji

| Uji | Hasil | Bukti |
|---|---|---|
| Kill paksa saat 5 posisi terbuka | **LOLOS (dengan catatan)** | Sebelum kill: blok 40840191, 5 posisi, mtm $101,54. Restart → `putar ulang 239 event -> 7 pool dipantau`; akhir uji equity $106,76 / 9 posisi vs kontrol tanpa kill $106,73 / 10 posisi. 1 koin hilang = koin yang lahir saat bot mati (ditolak "data basi") → benar. Kill saat chain beku: equity & 10 posisi pulih **persis** ($106,73). |
| RPC putus 10 menit | **LOLOS untuk beli, GAGAL untuk lapor** | Tidak ada beli selama putus; setelah pulih mengejar 6.700 blok < 20 dtk. Tapi `lag_blocks` tetap **0** selama 10 menit putus (tip lama dipakai) dan `mode_aman` tetap "mati" → penjaga & pemilik buta. Jual 0x1faca5c3 terisi di blok 40843488 yang lewat **saat bot buta** (ditandai `realtime:false`). |
| 1 baris `trades.jsonl` rusak | **GAGAL** | `FATAL: Unterminated string in JSON` → proses MATI, tiap restart mati lagi. |
| Disk penuh (disimulasikan `penuh.js`, disk TIDAK diisi) | **GAGAL** | Bot mati; `state.json` tersisa **0 byte**; setelah disk dilegakan bot tetap `FATAL: Unexpected end of JSON input` — mati permanen. |
| Penjaga: bot crash | **LOLOS** | dibunuh 01:44:53 → `bot dihidupkan (restart ke-2)` 01:45:14 (21 dtk). |
| Penjaga: bot hang (RPC menggantung) | **LOLOS sebagian** | `BUNUH: status.json basi 191 dtk` lalu hidup lagi; tapi bot baru ikut hang → 3 bunuh-hidup beruntun → `ALARM: 6 restart - jeda 5 menit` (bot mati 5 menit ekstra). |
| Penjaga: bot tertinggal | **GAGAL** | `lag_blocks 4129` (≈7 menit di belakang chain), status segar, **tidak ada restart**. Ambang di `bot/jalankan_windows.ps1:18` = 20.000 blok **dan** uptime > 20 menit; CLAUDE.md menuntut < 300. |
| Penjaga vs start lambat | **GAGAL (uji tambahan)** | Store 368k event: putar ulang 61 dtk (cache dingin) / 19 dtk (panas). Dengan `status.json` berumur > 180 dtk, penjaga membunuh bot tiap ~22 dtk sebelum putar ulang selesai (3x berturut-turut) → lingkaran mati. |

## Temuan

**PARAH**
1. `paper_live.js:403-404` — `muatAkun()` dipanggil **setelah** putar ulang, lalu menambahkan `liveRets`/`recentScores` tersimpan ke atas hasil putar ulang → **duplikat tiap restart**. Bukti: 4 trade nyata, 7 restart → "32 ret", `kelly` melompat 0,02 → **0,094 (4,7x ukuran posisi)**; `recentScores` 15 → 115 (jendela ambang seharusnya 100). Restart sering (log arsip: 15 restart/2 hari) → ukuran taruhan live tidak sama dengan yang diuji. Perbaikan: muat akun **sebelum** putar ulang, atau simpan `nRetsSebelumPutarUlang` dan jangan gabungkan; potong `recentScores` ke 100 setelah muat.
2. `paper_live.js:632` — `state.json` ditulis tanpa tmp+rename (padahal `account.json:396` sudah benar). Disk penuh / mati listrik → file 0 byte → bot **tidak pernah bisa start lagi** (terbukti). Perbaikan: tulis `.tmp` + rename, dan di `:593` bungkus `JSON.parse` dengan try → kalau rusak, mundur ke checkpoint cadangan / mulai dari tip.
3. `paper_live.js:613` (`trades.jsonl`), `:271` (baris CSV terpotong: `Cannot convert undefined to a BigInt`), `:119` (`dev_history.json`) — semua `JSON.parse`/`BigInt` tanpa `try` di jalur start → satu baris rusak = lingkaran mati permanen (penjaga menghidupkan-membunuh selamanya). Perbaikan: try/catch per baris + buang baris terakhir yang tidak berakhir newline.
4. `jalankan_windows.ps1:14-19` — penjaga memakai umur `status.json` (180 dtk) padahal bot **tidak menulis status selama putar ulang** (`paper_live.js:618` baru dipanggil setelah putar ulang). Putar ulang tumbuh ~18 dtk per hari data (6.000 event/dtk, 106k event/hari); dalam ±1 hari sudah > 20 dtk dan ±10 hari > 180 dtk → bot dibunuh sebelum sempat start. Perbaikan: tulis `status.json` (mis. `{fase:"putar ulang"}`) tiap 5 dtk selama putar ulang, dan jangan membunuh proses yang umurnya < 5 menit.
5. `paper_live.js:263-268` — `parseStore` membaca **seluruh** `swaps.csv` sebagai satu string. Ukuran terukur 252 B/baris; laju live terukur 10.552 event / 84.654 blok (sesi 19 Sep) ≈ **106k event/hari ≈ 26 MB/hari**. Batas string Node = 536.870.888 karakter → **±21 hari** lalu `ERR_STRING_TOO_LONG` = bot mati permanen (memori tidak jadi kendala: ±640 B/baris → 1,4 GB dari batas heap 2,35 GB). Perbaikan: baca baris-per-baris (stream) + potong/arsipkan store lebih tua dari 48 jam (pool paling lama dipantau 9 jam).

**SEDANG**
6. `paper_live.js:419` — selama RPC putus, `tip` lama dipakai sehingga `lag_blocks` = 0 dan file status tetap segar; `mode_aman` hanya dihitung di dalam `gate()` (`:438`) jadi tidak pernah aktif kalau tidak ada koin baru. Status "sehat" padahal bot buta 10 menit. Perbaikan: `lag_blocks` dari umur `lastOkPoll` (detik), panggil `cekRpcSehat()` di loop utama.
7. Keluar retroaktif: setelah RPC pulih, order jual terisi di blok-blok yang lewat saat bot buta (bukti di atas). Di kertas ini membuat hasil terlalu bagus (stop −40% terisi di −40%, bukan di harga saat bot melihat lagi). Perbaikan: saat mengejar setelah jeda > 1 menit, isi jual di harga blok **pertama yang terlihat lagi**, bukan harga blok deadline.
8. Reorg tidak ditangani: `paper_live.js:624-630` mengambil sampai `tip` tanpa kedalaman konfirmasi, field `removed` pada log diabaikan, blockHash tidak dicek, dan event yang sudah tersimpan tidak pernah diperiksa ulang. Perbaikan: proses sampai `tip - 5` (atau bandingkan blockHash) dan buang event ber-`removed`.
9. Tidak ada `fsync` di mana pun (`store():288` `writeSync`, `:632` state). Mati listrik bisa menyisakan checkpoint lebih maju dari data → lubang data diam-diam (tidak pernah diambil ulang). Perbaikan: `fs.fsyncSync` pada fd store sebelum menulis checkpoint.
10. `jalankan_windows.ps1:10,33` mengenali bot dari `CommandLine -match 'paper_live\.js'` → **salinan bot mana pun** (mis. folder audit) dianggap bot asli: penjaga bisa "melihat" proses asing dan tidak pernah menghidupkan bot miliknya, dan saat `stop.txt` ia mematikan semua salinan. Perbaikan: cocokkan juga `WorkingDirectory`/path skrip, atau pakai file PID.
11. `cek_siap.js` (catatan orkestrator, terbukti): tanpa `.env` → tanpa DoH → `GAGAL ... tidak menjawab`; dengan `--env-file=bot/.env` → `OK chainId 4663, 1783 ms`. Selain itu masih mewajibkan `filter_model.json` (sudah tidak dipakai; `GAGAL` palsu → selalu "BELUM SIAP") dan tidak memeriksa `filter_cat.json`/`pnaik_model.json` + `*_check.json` yang justru dipakai bot.

**RINGAN**
12. `snaps_live.jsonl` tidak dirotasi: batas `nSnapTulis > 2e6` (`:111`) dihitung per proses dan **direset tiap restart**. Laju kecil (±0,5 MB/hari) jadi belum mendesak, tapi tetap tanpa batas. Sama untuk `live.log`, `events.jsonl`, `feats_live.jsonl`.
13. Setelah kill, potongan yang belum selesai diproses ulang: `trades.jsonl` ditulis ulang bersih (`:615`) tapi `events.jsonl` (`:356`), `feats_live.jsonl`, `snaps_live.jsonl`, dan `dev_history.json` (`catatDev`) bisa berisi baris ganda.
14. `jalankan_windows.ps1:27` menimpa `runner_err.log` tiap restart → alasan crash (mis. `dev_history.json` rusak, yang mati sebelum sempat menulis `live.log`) hilang. Tambahkan timestamp pada nama file.

## Belum diuji
- Reorg sungguhan (chain uji tidak bisa dibuat reorg) — kesimpulan dari kode.
- Perilaku > 21 hari (batas string) hanya ekstrapolasi dari laju terukur, bukan uji jalan panjang.
