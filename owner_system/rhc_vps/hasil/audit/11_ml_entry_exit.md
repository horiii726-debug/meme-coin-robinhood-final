# Agent 11 — Audit ML, Masuk & Keluar

Semua angka dari data on-chain nyata (`data/arena_feats.csv`, `data/arena_scored.csv`, `data/state_*.csv`, `data/*/liq.csv`,
`data/*/trades.jsonl`, 178 trade uji maju). Skrip: `hasil/audit/kerja_11/`. Tanpa replay mesin, tanpa data sintetis.
Arena versi instrumen (`kerja_11/arena11.js`) mereproduksi persis $100 → **$12.746,32**.
Hipotesis ditulis di kepala tiap skrip sebelum uji; hasil yang gagal tetap dilaporkan.

## 1. Apakah ML terus belajar, dan seberapa efektif per jumlah trade?

**Kapan dilatih ulang.** Filter beli: live tiap 100 trade **tutup** (`paper_live.js:116,330-343` → `retrain_filter.py`),
sumber = `arena_feats.csv` (semua koin, riwayat) + **hanya koin yang dibeli** live. Arena: tiap 100 koin tutup dari
**semua** koin (`arena_score.py:16-23`). Model keluar (p_bahaya, p_naik): **tidak pernah dilatih ulang live** — potret ditulis ke
`snaps_live.jsonl` (`paper_live.js:106-113`) tapi tidak ada satu pun kode yang membacanya; file model di `bot/` tetap versi
"FINAL 205.243 potret".

**Kurva belajar filter (kausal, uji per blok 200 koin, N = trade tutup terbaru untuk latih):**

| N latih | 50 | 100 | 200 | 500 | 1000 | 1500 | semua |
|---|---|---|---|---|---|---|---|
| AUC (blok riwayat ≥1500) | 0,671 | 0,688 | 0,739 | 0,755 | 0,754 | 0,789 | 0,794 |
| presisi 10% teratas | 0,74 | 0,64 | 0,76 | 0,78 | 0,82 | 0,82 | 0,83 |
| ret rata2 10% teratas | 1,42 | 1,31 | 1,38 | 1,48 | 1,50 | 1,48 | 1,49 |

Basis (semua koin): win 0,41 | ret 1,04. Jadi **≥50 label sudah berguna** (ret 10% teratas 1,42 vs 1,04), naik stabil sampai
~500–1000 label, belum mendatar di 2.800. **Model makin baik, bukan melemah** — AUC per blok naik 0,60 (ds24) → 0,83 (m2).

**Skema belajar (uji m1+m2, semua kausal):**

| skema | latih ulang | AUC m1 | AUC m2 | ret koin lolos | win lolos |
|---|---|---|---|---|---|
| A arena (semua koin, tiap 100) | 20× | 0,756 | 0,796 | 1,396 | 77,9% |
| B bot live (hanya koin dibeli, tiap 100) | 3× | 0,732 | 0,663 | 1,399 | 74,1% |
| B20 (hanya dibeli, tiap 20) | 12× | 0,741 | 0,671 | 1,320 | 73,8% |
| F beku (tak pernah latih ulang) | 1× | 0,730 | 0,643 | 1,348 | 74,0% |

Skema realistis-live (B) kehilangan **0,13 AUC di m2** dibanding arena; model beku lebih buruk lagi (drift nyata).
Skema C (B + label koin ditolak yang dihitung setelah koin tutup) **identik dengan A** — tapi belum bisa dijalankan: bot
menghapus sim koin yang ditolak (`paper_live.js:584`), jadi swap koin ditolak tidak pernah disimpan. Catatan jujur: selisih AUC
itu **tidak** terlihat pada ret 10% teratas (1,396 vs 1,399) — untung per trade hampir sama, yang beda win-rate.

**Model keluar (latih hanya dari periode sebelumnya, N = jumlah pool):**

| label | N=50 pool | N=200 | semua (1.749) | beku W3 (136 pool) | tanpa fitur arus |
|---|---|---|---|---|---|
| p_bahaya uji m1 / m2 | 0,755 / 0,671 | 0,817 / 0,711 | 0,832 / **0,720** | 0,756 / **0,638** | 0,835 / 0,710 |
| p_naik uji m1 / m2 | 0,699 / 0,697 | 0,735 / 0,737 | 0,776 / **0,744** | 0,760 / **0,667** | 0,772 / 0,732 |

50 pool (~50 trade) sudah memberi AUC 0,70–0,76; **beku = −0,08 AUC di m2** → model keluar wajib dilatih ulang, dan itu
belum ada di bot.

## 2. Reputasi dev

2.651 dari 2.797 koin punya alamat dev; 2.149 dev unik; **136 dev membuat ≥2 koin (638 koin = 24,1%)**. Kausal (riwayat hanya
dari koin yang sudah tutup sebelum keputusan), dengan pengetahuan penuh on-chain: dev **pernah rug → 27,2% rug lagi** (n=169)
vs dev belum dikenal 12,4% (n=2.258) vs dev bersih 6,7% (n=224). Tapi 161 dari 169 ada di m2 dan **satu dev (72 koin, 43% rug)**
mendominasi; tanpa dev itu efeknya 16,2% vs 12,4% — lemah. Di arena & bot riwayat dev hanya dari koin yang **dibeli**
(`arena.js:59`, `paper_live.js:130-134`) → hanya 5 koin punya dev dikenal, **0 penolakan** (log uji maju). Dengan pengetahuan
penuh pun hanya **1** koin lolos-ML yang akan ditolak (ret 0,868). Kesimpulan: aturan dev saat ini **tidak berguna, juga tidak
merugikan**; nilai sebenarnya ada di rug-rate, bukan di reputasi.

## 3. Honeypot

Arena menolak 120 koin karena **tidak ada swap jual di menit-1** (`arena.js:80`) — bukan uji honeypot. Bukti on-chain sesudah
menit-1 (jalur `state_*.csv`): **110/120 ada penjual** (jadi bisa dijual; ret kontrafaktual rata2 1,169, win 79%, rug 14,5%),
3 koin hanya beli tanpa jual (kandidat honeypot asli), 7 tanpa data jalur (6 dari 7 rug). Jadi **≤10 honeypot asli, ≥110 salah
tolak**. Namun membuang aturan ini menurunkan hasil: HONEY=0 → **$9.532, DD 32,7%** (vs $12.746, DD 20,0%) — koin tanpa penjual
di menit-1 memang lebih jelek dan memakan slot. **False negative: 0 terbukti** dari 178 koin yang dibeli (175 terbukti ada
penjual sesudah menit-1, 3 tanpa data); honeypot jenis "hanya dompet tertentu boleh jual" **tidak ada data** (identitas penjual
sesudah menit-1 tidak disimpan). PENTING: bot live memakai uji lain (simulasi transfer `eth_call`, `paper_live.js:506-535`) yang
**akan meloloskan** sebagian dari 110 koin itu → arena menguji aturan yang lebih ketat daripada bot.

## 4. Keluar / TP

Aturan: TP1 jual 60% di 1,2× **kecuali p_naik ≥ 0,5 (ditunda)**; sisa 40% keluar saat p_bahaya ≥ 0,4 (kecuali p_naik ≥ 0,5),
stop bencana 10% puncak, LP ditarik >30%, dump ≥5% LP, tanda pucuk; sebelum TP hard stop −40%; batas 9 jam.

- **TP tidak terlalu dekat** (berkat tunda-TP): TP1 nyata terpicu di median **1,85×**; sesudah TP1 harga hanya naik median
  1,05× lagi, ≥2× cuma 3% kasus. Trade dengan TP ditunda (tp1V>1,3): 101 trade **+$16.066**; TP ≤1,3: 31 trade +$341.
- **Ongkos tunda-TP:** 17 dari 29 trade rug punya puncak ≥1,2× tapi TP1 tidak pernah jalan → **−$2.680**.
- **Model bahaya tidak terlalu cepat maupun terlambat:** keluar praktis di puncak (V_keluar/V_puncak median **1,00**, 6 detik
  sesudah puncak). Kalau sisa posisi dipegang: rata2 **0,79 di +5 menit, 0,59 di +30 menit, 0,53 di +2 jam** (58% rug dalam 2 jam).
  Per periode +30 menit: ds24 0,09 | m1 0,44 | ds5d 0,94 | m2 1,04 (m2 netral).
- **30 trade "batas 9 jam" salah nama.** 29 dari 30 adalah **rug satu blok**: LP ditarik dari <30% ke >80% **di blok yang sama**,
  median **1,4 menit** sesudah masuk (0,1–8,9 menit), ret −0,001. Tanda "berhenti bergerak" **tidak ada** — potret terakhir rata-rata
  ~1,3 menit sesudah masuk lalu nilai langsung 0. Memendekkan batas 9 jam **tidak mengubah PnL sama sekali**; yang rugi bukan
  waktu tahan, melainkan rug. Rug pada koin yang **sudah lolos filter** juga tidak bisa ditebak dari fitur menit-1: model rug
  khusus AUC 0,757 di semua koin m1+m2 tapi **0,40** di antara koin yang dibeli.
- Efek samping: posisi mati itu tetap **mengunci slot 9 jam** (lihat §7c).

## 5. Tekanan beli/jual

(a) **Filter beli** (latih pra-m1, uji m1+m2, AUC 0,704): permutation importance terbesar justru fitur tekanan —
`buy_usd` −0,0295 (peringkat 1 dari 34), `flow_lp` −0,0142 (3), `kyle_lambda` −0,0051, `n_sell` −0,0025, `lam_sell` −0,0020;
`n_buy`, `sell_usd`, `n_buyers`, `lam_buy` ≈ noise. Tapi **ablasi**: tanpa 10 fitur tekanan AUC 0,699 vs 0,704 (tumpang tindih
dengan fitur lain); hanya tekanan saja 0,673.

(b) **Selama posisi terbuka tekanan SUDAH dipakai** — model bahaya/naik memakai b60,s60,bu60,su60,net60_lp,sell_surge,
maxsell60_lp,b300,s300,… (`v4engine.js:168-173`). Nilai tambahnya kecil: ablasi tanpa 15 fitur arus hanya −0,010 AUC (p_bahaya m2
0,720→0,710; p_naik 0,744→0,732; di m1 tidak turun). Aturan arus murni satu-satunya, "dump ≥5% LP", **rugi: 9 trade −$246**.
"Jual besar dari holder atas" → **tidak ada data** (identitas penjual sesudah menit-1 tidak disimpan).

(c) **Kausal, AUC univariat per periode (ds5d/ds24/m1/m2):** `b60` (jumlah beli 60 dtk) 0,66–0,71 untuk bahaya **dan** 0,65–0,78
untuk naik → yang diukur adalah keramaian, bukan arah. Rasio penjual `sratio60` 0,375–0,51 dan `sratio300` 0,34–0,50 —
**konsisten di bawah 0,5 di keempat periode**: porsi jual tinggi justru menandakan pasar sepi (bahaya ↓ dan roket ↓), bukan dump.
`maxsell60_lp` 0,52–0,69 (bahaya), `net60_lp` 0,47–0,58. Fitur rasio baru itu sendiri karena itu **tidak menjanjikan** secara
univariat; uji model penuh dengan fitur rasio tambahan **belum selesai** (proses dihentikan batas sesi) — belum ada angkanya.

## 6. "Jangan buang peluru" — aturan berhenti trading

Sinyal yang bisa diketahui saat itu, rata-rata per periode: koin lahir/jam **ds5d 10,4** | ds24 35,2 | m1 42,9 | m2 31,7;
rug-rate 50 koin terakhir yang sudah tutup 0,032 | 0,051 | 0,073 | 0,171; ret median 50 terakhir 0,97 | 0,97 | 1,07 | 1,08;
skor ML rata2 100 terakhir 0,55 | 0,42 | 0,41 | 0,47; hasil 10 trade sendiri terakhir 1,04 | 1,37 | 1,77 | 1,71. **Gas: tidak ada
data** (dipakai konstan $0,06/swap). Korelasi Spearman sinyal↔ret per trade **berganti tanda antar periode** (mis. lahir/jam:
+0,31 ds5d, −0,26 ds24, −0,16 m1, −0,06 m2).

Aturan dipilih di ds5d+ds24, dibuktikan di m1+m2: hanya **"jangan beli kalau koin lahir/jam < 12"** yang lolos — di periode pilih
menaikkan jumlah ret dari +2,15 ke +5,48, di periode bukti hanya melewati **3 dari 135 trade (+$25)**. Semua sinyal lain memotong
untung besar di m1+m2 (mis. aturan ret50 melewati 114/135 trade = $10.631). **Laporan jujur: tidak ada sinyal rezim yang andal**;
bukti untuk aturan lahir/jam hanya dari satu periode (18 trade).

Penyebab rugi ±5 Sep yang benar-benar terukur bukan rezim, melainkan:
1. **Pemanasan filter**: 15 dari 18 trade ds5d dibeli saat ambang masih tetap 0,195 (`arena.js:14`; live memakai `thr_start`
   0,747, `paper_live.js:72`) → rata-rata **−20,5% per trade, −$6,13**.
2. **Gas relatif posisi**: posisi median ds5d **$1,99** dengan gas $0,21 = **10,6% per trade** (m1/m2 hanya 0,1%).
   Arena bahkan tidak membebankan gas nyata di ds5d/ds24 (`arena.js:6` hanya m1,m2) — setelah dikoreksi hasil akhir
   **$12.746 → $11.373 (−10,8%)**, ds5d −$5,54, ds24 +$11,32.

## 7. Tambahan permintaan pemilik

**(a) Roket.** Dari jalur nyata 2.381 pool: **411 koin pernah ≥3×** dan **62 koin pernah ≥10×** dalam 9 jam. Dibeli: 66 dari 411
(16%), dan **hanya 1 dari 62 koin ≥10×** — koin itu (puncak 20,3×) malah kena stop −40% dengan posisi $2 (−$0,98). 57 koin ≥10×
ditolak filter ML, skor median 0,347 (rendah), ret kontrafaktual strategi v4 atas koin itu **rata-rata 4,22× (median 2,51×)**.
Filter bukan sekadar melewatkan roket, **urutannya terbalik**: AUC skor untuk "puncak ≥10×" = **0,318 di m1**, 0,459 ds24,
0,56 ds5d (≥3× masih benar: 0,58–0,63). Penyebab: label latih `win = ret>1` (`build_feats2.js:26`) tidak membedakan 1,2× dari 20×.
Untung tertinggal (hindsight) pada 66 roket yang dibeli: untung nyata **$10.680**, sisa di meja **≈$14.606**, rasio tangkap
ret/puncak median **0,63**. **TP pertama bukan penyebabnya** — 57 dari 66 keluar lewat *model bahaya* di ~2,2–2,3× saat puncak
3,1–3,6×, dan memegang sesudah sinyal bahaya rata-rata rugi (0,59 di +30 menit). Yang kurang adalah sinyal khusus roket
(model "moon" ada di `pipeline/arena_score_moon.py`, tapi MOONQ=0 alias mati di uji maju).

**(b) Kualitas trade.** Per kuartil margin skor (skor − ambang saat itu), ret bersih rata-rata setelah gas nyata:
M1 tipis 0,451 | M2 0,547 | M3 0,507 | **M4 paling tebal 0,313** — tidak monoton, margin skor **tidak** memisahkan trade bagus.
Kelompok yang konsisten rugi hanya: 15 trade pemanasan (−20,5%/trade, −$6,13) dan seluruh periode akun kecil
(ds5d ret bersih **−15,5%**/trade, ds24 +19,7% dengan gas 10% dari posisi). Di m1/m2 tidak ada kuartil skor yang rugi.

**(c) Maksimal 5 posisi + 1/4 Kelly.** Dengan gas nyata: 10 slot $11.373 (DD 20,4%) → **5 slot $9.139 (DD 23,6%)**, 21 penolakan
karena slot; koin yang ditolak slot justru **lebih baik** (ret kontrafaktual rata2 1,611 vs 1,481 yang dibeli). Aturan prioritas
yang diuji **semuanya gagal**: prioritas skor (dipilih di ds5d+ds24 → di m1+m2 hasil $1.745–$6.167 tergantung kuantil yang tidak
bisa dipilih jujur) dan prioritas fitur (n_holders/n_buy rendah, top1 tinggi — korelasi kuat di m1 −0,56/+0,34 dan m2 −0,50/+0,51)
memperburuk periode pilih m1 ($880–$1.375 vs $1.557 dasar) dan tidak mengubah m2. **Yang berhasil bukan prioritas, melainkan
membebaskan slot mati**: menutup posisi begitu rug terdeteksi (LP >80% ditarik; enginenya sudah menghitung `rugBlk`,
`v4engine.js:99`, tapi tidak pernah menutup posisi) → **5 slot: $9.139 → $11.570, DD 23,6% → 17,9%, penolakan slot 21 → 0**;
10 slot: $11.373 → $11.570. Uang hasilnya tetap 0 pada koin rug — yang didapat adalah slot & modal 9 jam lebih awal.

## Temuan

**PARAH**
1. `arena.js:80` vs `paper_live.js:506-535` — aturan honeypot arena (tak ada jual menit-1) **lebih ketat** dari bot live
   (simulasi `eth_call`). Tanpa aturan arena: $9.532, DD 32,7%. Hasil resmi $12.746 memakai pagar yang bot tidak punya.
2. `build_feats2.js:26` + `arena_score.py` — label `win = ret>1` membuat filter **anti-korelasi dengan roket**
   (AUC 0,318 untuk ≥10× di m1). 61 dari 62 koin ≥10× tidak dibeli, ret kontrafaktualnya rata2 4,22×.
3. `v4engine.js:99,341` — posisi yang sudah rug tetap dipegang sampai batas 9 jam dan mengunci slot. Dengan 5 slot:
   −$2,4 ribu (mis. $9.139 vs $11.570).
4. `paper_live.js:106-113` — model keluar **tidak pernah dilatih ulang** di bot (potret ditulis, tak ada pembacanya).
   Model beku kehilangan ~0,08 AUC dalam sebulan (p_bahaya m2 0,720 → 0,638).

**SEDANG**
5. `retrain_filter.py:187-202` + `paper_live.js:584` — latih ulang live hanya dari koin yang dibeli; koin ditolak dibuang dari
   memori, jadi label kontrafaktualnya tidak pernah ada. AUC m1+m2 0,711 (live) vs 0,771 (arena), m2 0,663 vs 0,796.
6. `arena.js:6` — gas nyata hanya dipasang untuk m1,m2 → hasil resmi terlalu tinggi 10,8% ($12.746 → $11.373).
7. `arena.js:14` vs `paper_live.js:72` — ambang pemanasan 0,195 (arena) vs 0,747 (live); 15 trade pemanasan, −20,5%/trade.
8. `arena.js:59,79` + `paper_live.js:124-134` — aturan reputasi dev inert (0 penolakan); efek nyata dikuasai 1 dev di m2.
9. `v4engine.js:194` — tunda-TP (disetel di m2): +$16.066 di 101 trade, tapi −$2.680 di 17 trade yang rug sebelum TP1.

**RINGAN**
10. `v4engine.js:204` — aturan "dump ≥5% LP": 9 trade, −$246 (satu-satunya aturan arus murni, hasilnya negatif).
11. Fitur arus menambah ≤0,01 AUC ke model keluar dan ~0,005 ke filter (ablasi) — sebagian besar redundan.
12. `v4engine.js:322,343` — label alasan keluar salah ("akhir data"/"batas 6 jam"). Akibatnya "batas 9 jam = kebocoran
    terbesar" di CLAUDE.md sebenarnya **"rug satu blok"** (29/30 trade, median 1,4 menit sesudah masuk).

## Usulan uji untuk Agent 7 (butuh replay)

| # | Hipotesis | Perubahan | Periode pilih | Periode bukti |
|---|---|---|---|---|
| U1 | Menutup posisi begitu rug terdeteksi (LP >80% ditarik) tidak mengubah PnL per trade tapi membebaskan slot & modal; dengan 5 slot hasil naik | tutup paksa di `rugBlk` (`v4engine.js`), alasan "rug" | ds5d+ds24 | m1, m2 (arena: 5 slot $9.139 → $11.570, DD 23,6→17,9%) |
| U2 | Tunda-TP tetap untung kalau sebagian kecil (25%) tetap dijual di 1,2× → memangkas −$2.680 rug tanpa membuang +$16.066 | `TP_UP` tetap 0,5 tapi jual 25% di 1,2× walau ditunda | ds24+m1 | m2 (tunda-TP disetel di m2, jangan dipilih di sana) |
| U3 | Filter dengan label bertingkat (`ret≥3` / log-ret) menangkap roket tanpa merusak win-rate | label latih baru di `build_feats2.js`/`arena_score.py`, plus jalur MOONQ | ds24+m1 | m2 |
| U4 | Bot live yang menyimpan swap koin **ditolak** sampai koin tutup, lalu memakai label kontrafaktualnya, mengembalikan AUC arena (0,663 → 0,796 di m2) | simpan sim koin ditolak sampai `init+HZ` (`paper_live.js:584`), hitung ret kontrafaktual, masukkan ke `retrain_filter.py` | m1 | m2 |
| U5 | Latih ulang model KELUAR secara berkala (dari `snaps_live.jsonl`) menahan drift 0,08 AUC | pipeline latih ulang p_bahaya/p_naik tiap N trade | ds24 | m1, m2 |
| U6 | Aturan honeypot live (eth_call) sama ketatnya dengan aturan arena | replay dengan aturan arena vs aturan live pada koin `jual_m1=0` | ds5d+ds24 | m1, m2 (arena HONEY=0 = $9.532) |
| U7 | Melarang beli saat pemanasan (ambang belum punya 30 skor) menghapus rugi ±5 Sep tanpa biaya | ambang pemanasan = `thr_start`, bukan 0,195 | ds5d | ds24, m1, m2 |
| U8 | Gas nyata di semua periode (koreksi `arena.js:6`) — angka resmi harus $11.373, bukan $12.746 | perbaiki arena | — | seluruh garis waktu |
