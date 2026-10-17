# Lampiran Agent 4 — Perbedaan aturan arena.js vs paper_live.js

Arena dijalankan oleh `wf_penuh.sh` dengan `MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01/0.02` (default lain dari kode). Live memakai `bot/.env`. Mesin keluar (TP/stop/model/9 jam/gas/gagal tx) sama: `AUDIT` di wf = `REALISTIC` + `HZ_LIVE` 324000.

| Aturan | arena.js:baris | paper_live.js:baris | Dampak |
|---|---|---|---|
| Biaya gas | 6, 55-57: gas $ tetap **hanya untuk m1/m2**. Periode lain gas ikut skala ukuran simulasi ($200) | 304-305: gas $ tetap dari `gasTot` di semua trade | 43 trade awal kurang gas $7,96 (lihat S1) |
| Dampak harga | 53: `SLIP=1` potong tambahan `min(0.9, 2·pos/LP)`. Ret dari simulasi di ukuran min($200, 1% LP), diskalakan linear | 550: mesin menghitung dampak di ukuran akun sebenarnya, tanpa SLIP | Live ±2·pos/LP lebih optimis dari arena per trade |
| Batas LP | 102: `LPCAP·lp_m1` (LP di menit-1) | 550: `LP_CAP·lpUsd(state saat masuk)` | Kecil, LP berbeda ±3 dtk |
| Pagar eksposur | 84-88: tolak kalau `terpakai + min(f·eq, kas) > 0.5·eq`, dicek **sesudah** menambah posisi, `f` tanpa rem/LPCAP | 432-435: tolak hanya kalau `locked ≥ 0.5·E`, dicek **sebelum** menambah | Live bisa >50% eksposur. Arena menolak lebih banyak |
| Dasar equity untuk ukuran | 89: kas + posisi harga beli | 325: harga pasar (MTM) | Live lebih kecil saat rugi belum terealisasi, lebih besar saat untung |
| Rem drawdown | 93-96: dd dari harga beli, puncak diperbarui hanya saat trade tutup | 369-375: dd harga pasar, dicek tiap ukuran dihitung | Live lebih cepat mengerem |
| Stop darurat 60% | 62: `>` KILL, harga beli, hanya saat trade tutup | 385-390: `≥` KILL_DD, harga pasar, tiap ±5 dtk. Status disimpan di `account.json` | Live bisa kena stop yang tidak pernah terjadi di arena |
| Kelly: data | 33: `t.ret` simulasi (gas skala simulasi), semua trade | 172-176, 308: `back/pos` akun (gas $ nyata), 500 terakhir. Bisa ganda setelah restart (404) | Live ret lebih jelek di posisi kecil. Tahap Kelly maju dua kali lebih cepat setelah restart |
| Kelly: grid | 37: f 0,01–0,6 step 0,005 (float akumulatif), awal 0,02 | 178-179: f 0,005–0,995, awal 0,01 | Tidak berdampak (dua-duanya dibatasi 0,10/0,01) |
| Kelly: tahap | 34-35: <30 → 2%, <100 → 9,4% | 174-175: sama | Sama |
| Cadangan gas | 90, 97: kas − $0,21 | 323: kas − $0,21·(posisi terbuka+1); 350: kas − $0,21 | Live sedikit lebih kecil |
| Posisi minimum | 16, 103: $0,25 | 549 `minUsd:1`, 351 `pos ≥ 1` | Live melewati posisi $0,25–1 (fase awal $100) |
| Maks posisi | 14: MAXPOS (wf=10) | 88: MAX_POS (.env 10, default kode 20) | Sama kalau `.env` termuat |
| Ambang ML | 70: <30 skor → THR0 0,195, lalu kuantil 0,90 dari 100 terakhir | 190-194: <30 skor → `thr_start` (kuantil 0,90 in-sample), lalu sama. Setelah restart jendela jadi 200 (403) | Awal live jauh lebih ketat |
| Isi jendela skor | 69: semua koin berskor | 485: hanya koin yang sampai `siapkanFilter` (koin basi/cek gagal tidak masuk) | Distribusi ambang sedikit berbeda |
| Model belum siap | 68: tolak (noskor, 70 koin) | model selalu ada sejak start | — |
| Latih ulang filter | arena_score.py 16-23: tiap 100 trade simulasi tutup dari **semua** koin, label semua koin | 331 + retrain_filter.py 24: tiap 100 trade **akun** tutup, label hanya koin yang dibeli + riwayat statis. Tanpa uji mutu | Lihat P2. Arena belajar ±10× lebih sering dengan label yang tidak dimiliki live |
| Honeypot | 80: `jual_m1 = 0` → tolak | 506-535: ada penjual → aman. Kalau tidak ada, uji `transfer` ke PM (eth_call), RPC gagal → tolak | Live bisa membeli koin tanpa penjual yang tidak pernah diuji di arena |
| Reputasi dev | 59, 79: riwayat hanya dari trade yang **dibeli** arena | 130-134, 300: riwayat dari semua trade v4 mesin (juga yang akun tidak ikut, dan beli gagal), mulai dari `dev_history.json` | Live punya daftar hitam lebih banyak |
| Data basi / RPC mati / tunggu cek | tidak ada | 426, 438, 441-443, 454: tolak | Live melewati koin yang dibeli arena |
| Waktu masuk | 43, 104: kas dipotong di blok `decide` | enterAt di `decide+30` atau lebih lambat (gate `null`) | Lihat S3 |
| Urutan di blok yang sama | 44: tutup dulu, baru beli | tick → processBlock → finalize (583-584): finalize sesudah pembelian di blok itu | Kas dari trade yang tutup di blok yang sama belum tersedia di live |
| Beli gagal (1,85%) | ikut sebagai baris ret≈1−gas/size, kalau ada di data skor | 249-254 mesin: tidak ada event `entry` → akun tidak dipotong gas | Live sedikit lebih optimis |
| Harga ETH | ret dari replay dengan ETH tetap per pool | 562: ETH diperbarui di tiap pool, dengan pagar 10% | PnL live mengandung pergerakan ETH/USD |
| Lama pegang | 58: 0,1013 dtk/blok | mesin 0,1 | Hanya laporan |
