# Agent 4 — Audit Kode & Logika (v4engine.js, paper_live.js, arena.js)

Tidak ada file yang diubah. Tidak ada replay/latih. Uji kecil: `node -e` (matematika swap, flag hook di pools.csv, gas 178 trade). Tabel perbedaan arena vs bot: `04_lampiran_perbedaan.md`.

## PARAH
**P1. Restart bot menulis ulang riwayat akun dengan aturan yang berbeda.** `paper_live.js:607-620`
- Saat putar ulang, gerbang `data basi` (426), `RPC sehat` (438) dan `TUNGGU CEK >10 dtk` (442) dilewati. `killed` masih `false` karena `muatAkun()` baru dipanggil di 620. Gerbang langsung mengembalikan `filterOk` (437).
- Akibatnya koin yang ditolak saat live karena telat atau RPC lambat, lalu tetap disimpan `filterOk:true` oleh `saveDecision`, **dibeli saat putar ulang**. Masuknya juga di harga sebelum jeda cek, bukan di harga yang dipakai live.
- `trades.jsonl` lalu ditimpa dengan hasil putar ulang (615). Equity, `akun_posisi` (bahan latih ulang) dan jumlah trade berubah tiap restart.
- `muatAkun` menambahkan `liveRets` tersimpan di atas `liveRets` yang sudah dibangun ulang oleh putar ulang (404), jadi datanya **ganda**. Tahap Kelly 2% → 9,4% (30 trade) dan → optimasi (100 trade) tercapai di separuh jumlah trade nyata. `recentScores` juga jadi 200, bukan 100 (403).
- Usul: saat putar ulang, jangan buka posisi akun. Pulihkan posisi dan akun dari `account.json` + `events.jsonl` (`akunPos`). Simpan keputusan gerbang final (termasuk basi/tunggu) di `decisions.jsonl`. Jangan tambahkan `liveRets` dua kali.

**P2. Filter ML di arena belajar dari label yang tidak pernah dimiliki bot.** `arena_score.py:16-23` vs `retrain_filter.py:24` + `paper_live.js:331`
- Arena melatih ulang tiap 100 trade simulasi yang sudah tutup dari **semua** koin, termasuk ±2.400 koin yang ditolak.
- Bot hanya menambah label dari koin yang **dibeli akun** (`akun_posisi`), dan melatih ulang tiap 100 trade akun (±10× lebih jarang). Selain itu datanya bias seleksi.
- Keuntungan "model belajar ulang" di uji maju tidak bisa terulang di live.
- Usul: bot menjalankan simulasi bayangan untuk koin yang ditolak (mesin sudah bisa, cukup tanpa akun) dan memakai labelnya. Atau arena meniru live: latih hanya dari trade yang dibeli, dengan jadwal yang sama.

## SEDANG
**S1. Gas tetap tidak dikenakan di 43 trade awal uji maju.** `arena.js:6` hanya memuat `m1/`, `m2/trades.jsonl`. Trade `u_ds5d` dan `u_ds24` mendapat `gasTot=0` (terlihat di `trade_final178.json`). Gas yang terbebankan $0,19, padahal gas nyata $8,16 (posisi rata-rata $4,51). Gas yang kurang: ±5 Sep $3,32 (−$2,70 → ±−$6,0), ±10 Sep $4,64 (+$16 → ±+$11,4). Equity masuk 13 Sep ±7% terlalu tinggi dan ikut berbunga ke $12.746 (perkiraan kasar: hasil akhir turun beberapa persen). Usul: muat `GAS` dari keenam folder, lalu ulang `wf_penuh.sh`.

**S2. Hook afterSwap-returns-delta lolos `safe()`.** `v4engine.js:21` hanya menolak bit 7 (beforeSwap). Bit 6 (afterSwap) dan bit 2 (afterSwapReturnDelta) bisa memotong hasil atau me-revert jual. Potongan itu tidak terlihat di event Swap, `sellVal`, maupun cek honeypot `transfer()`. Data: m1 343/1.950 pool aman (18%) punya bit 2, didominasi satu hook `0xe5e70264…e044`. **11 dari 178 trade** ada di pool seperti ini. Usul: ukur potongan hook itu dengan satu `eth_call` quoter (V4Quoter) lalu bandingkan dengan `sellVal`. Kalau berbeda, tolak bit 2/6 atau modelkan.

**S3. Jeda masuk di live > 3 dtk yang diuji.** `gate` mengembalikan `null` sampai semua cek RPC selesai (log transfer, mint, tx, balanceOf ×3, eth_call; masing-masing 2–4 dtk; `paper_live.js:440-443`). Backtest selalu masuk di `decide+30`. Live masuk di harga terbaru, tapi `e.blk` tetap `tgt` (`v4engine.js:256`), sehingga lama pegang dan `hold` tercatat terlalu pendek. Usul: catat jeda nyata di `events.jsonl`, lalu uji ulang backtest dengan `entryLat` sebesar median jeda tersebut.

**S4. Harga ETH bisa beku permanen.** `paper_live.js:560`: swap yang >10% dari `ethUsd` terakhir ditolak. Satu lonjakan nyata >10% membuat semua swap berikutnya ditolak, sehingga ukuran dan valuasi memakai harga lama selamanya. Usul: terima kalau N swap berturut-turut konsisten, atau bandingkan dengan median 20 swap terakhir. Catatan: replay memakai ETH tetap per pool (`replay.js:68`), sedangkan live dinamis (PnL live ikut terpengaruh ETH/USD).

**S5. Default di kode ≠ setelan uji.** Kalau `node paper_live.js` dijalankan langsung (seperti komentar baris 5, tanpa `--env-file`):
- `FILTER` mati → beli semua koin
- `UP_TH` / `TP_UP` = 1 → model p_naik mati (`v4engine.js:10-11`)
- `MAX_POS` 20 (uji: 10), `EXP_MAX` 0,5
- `QTHR` 0,90 (arena default 0,30)

Usul: bot menolak start kalau `.env` tidak termuat (cek `process.env.FILTER`).

**S6. Aturan akun berbeda antara arena dan live.** Detail di lampiran. Yang terpenting:
- Pagar eksposur: live dicek **sebelum** menambah posisi (bisa >50%), arena **sesudah**.
- Arena memotong `SLIP=1` 2×pos/LP, live tidak.
- Honeypot: arena menolak semua koin tanpa penjual, live menguji `transfer` dan bisa meloloskannya.
- Ambang awal: live `thr_start` in-sample, arena 0,195.
- Kelly: live memakai ret akun (gas nyata), arena memakai ret simulasi.
- Rem dan stop darurat: live pakai harga pasar tiap 5 dtk, arena pakai harga beli saat trade tutup.

**S7. `bot/cek_siap.js` rusak (temuan orchestrator, terkonfirmasi).**
- Tidak memuat `bot/.env` → `DOH_URL`/`RPC_URLS` kosong → cek RPC di PC rumah selalu GAGAL (baris 18-19).
- Mencari `filter_model.json`/`filter_check.json` (6, 9) yang tidak ada → langkah 1 GAGAL, langkah 2 LEWAT. Akibatnya parity `filter_cat` dan `pnaik` tidak pernah dicek.
- Usul: `require` parser `.env` atau jalankan dengan `node --env-file=.env`. Ganti daftar file dengan `filter_cat.json` + `filter_cat_check.json` (via `cat_model.js`) + `pnaik_model.json` + `pnaik_check.json`.

## RINGAN
- Alasan keluar batas 9 jam tercatat sebagai `"akhir data"`, karena `hz≠HZ` (`v4engine.js:343`). Default `"batas 6 jam"` (322) sudah basi.
- Matematika v4 benar (arah beli/jual kedua sisi terverifikasi), tapi hanya satu tick dan pool tidak digeser oleh transaksi sendiri. Beli lalu jual di state yang sama memberi 0,932, bukan 0,994, untuk posisi 1,7% LP. Artinya dampak harga dihitung dua kali (konservatif). Ditambah `SLIP` di arena jadi tiga kali. Live tidak memakai `SLIP`, jadi tidak setara dengan arena.
- Beli gagal (1,85%) tidak memotong gas dari akun live (event `entry` tidak terkirim; `v4engine.js:249-254`).
- Parity dilewati diam-diam kalau `*_check.json` hilang (`paper_live.js:46`). `pnaik_model.json` hilang → `UP_TH` mati tanpa peringatan.
- Loop `tick` bisa memanggil `gate` 50× per blok untuk koin yang menunggu cek (`paper_live.js:582`). Ini hanya membuang CPU.
- Komentar menyesatkan: `paper_live.js:480` "cap 1% dihapus" (padahal `LP_CAP` aktif), 321; `v4engine.js:11`, 55.
- `hold` di arena memakai 0,1013 dtk/blok, di mesin 0,1. Hanya berpengaruh ke laporan.
