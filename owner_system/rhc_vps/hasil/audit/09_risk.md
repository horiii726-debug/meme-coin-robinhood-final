# Audit 09 — Risiko & Portofolio (Agent 9)

Skrip: `hasil/audit/kerja_09/` (`risk09.js` = replay AKUN atas 178 trade, mereproduksi **$12.746,32** tepat; `korelasi09.js`; `usulan09.js`; `mc_asli/`, `mc_gas/` = MC 3.000 jalur, mereproduksi angka resmi ±3%). Tidak ada replay mesin / latih model.

## 1. Aturan akun: bot vs arena vs Monte Carlo
| Aturan | paper_live.js | arena.js (env wf_penuh) | mc_pro.js | Sama? |
|---|---|---|---|---|
| Kelly: 2% <30 trade, 9,4% <100, lalu f*/4 maks 10% | 172-185 (ret **bersih** akun, jendela 500, grid i/200) | 32-41 (ret mesin **kotor**, tanpa jendela, grid 0,01..0,6) | 28-30,55 (f* **tetap dari 178 trade**, di-sampel) | Beda cara; di 178 trade hasil sama (f*=0,595 → semua kena cap 10%) |
| Gas saat tutup (dolar tetap) | 304-305 (`gasTot ?? 0.2`) | 6, 55-57 (**hanya m1,m2**) | 64-66 (dari file; u_ds = 0) | **TIDAK** |
| Cadangan gas saat beli | 323 ×(posisi+1); 350 ×1 | 97 ×1 | 57 ×(posisi+1) | Beda kecil |
| Posisi minimum | 351 `≥ $1` | 103 `≥ $0,25` | 60 `≥ $0,25` | Beda |
| Eksposur maks 50% | 432-435: tolak jika terpakai ≥50% **sebelum** tambah (bisa lewat ±1 posisi) | 84-88: tolak jika terpakai + frac×eq (tanpa rem & cap LP) > 50% | 59: **potong** posisi ke sisa 50% | **3 aturan berbeda** |
| Maks posisi | 88 default **20** (.env 10), 428, 351 | 14 default 20 (wf 10), 82 | 52 hardcode 10 | Sama bila .env terbaca |
| Rem 10/20/30% → ×0,75/0,5/0,25 | 369-375 (**harga pasar**) | 93-96 (harga beli) | 53-54 (harga beli) | Tangga sama, dasar beda |
| Stop darurat 60% | 385-390 `>=`, harga pasar, dicek tiap status | 62 `>`, harga beli, hanya saat tutup | 69 `>=`, harga beli, saat tutup | Beda dasar |
| Cap 1% likuiditas | 96, 550 | 102 | 58 | Sama |

## 2. Temuan
**PARAH-1 — gas tidak dibebankan di 43 trade (±5 & ±10 Sep).** `arena.js:6` memuat gas dari `m1`,`m2` saja; `u_ds5d/u_ds24` dapat `gasTot=0`, padahal `data/u_ds*/trades.jsonl` mencatat $0,19/trade (total $8,16) pada posisi rata-rata $4,51 = **4,2% per trade tak tercatat**. Dampak: hasil jadi **$11.372,92** dengan aturan arena (DD 20,4%, PF 3,45; satu trade ×2,94 +$1.196 tergeser pagar eksposur), **$12.533,63** dengan aturan bot. Periode sepi: ±5 Sep −$2,7 → −$5,5; ±10 Sep +$16,0 → +$11,3. Monte Carlo mewarisi ini: skenario "terburuk (gas 3×)" sebenarnya **gas 0×**. Setelah dikoreksi: median 1 hari/1 minggu/1 bulan **$117/$104/$93 → $93/$40/$40**, jalur rugi **54% → 96%**, stop darurat **82% → 100%**. Realistis: median bulan $60,9k → $59,3k, jalur rugi 0,1% → 4,2%, stop 0,9% → 5,8%. *(Proyeksi, 3.000 jalur.)*

**PARAH-2 — Kelly bot tergandakan setiap restart.** Saat start, putar ulang (607-610) memanggil `onTrade` → `liveRets.push` (308), lalu `muatAkun()` (620→404) menambah lagi `liveRets` tersimpan. Tiap restart (penjaga bisa >5×/jam) menggandakan riwayat: tahap 2% berakhir setelah ±15 trade nyata, bukan 30; f* dihitung dari data berbobot ganda. Belum terjadi (bot belum punya `account.json`), tapi pasti terjadi saat berjalan.

**SEDANG-3 — equity dasar berbeda.** Bot mengukur ukuran/rem/stop pakai harga pasar (325, 372, 386) dan puncak harga pasar (termasuk untung belum terealisasi → rem lebih cepat aktif); arena & MC pakai harga beli; pagar eksposur bot sendiri pakai harga beli (433). Batas bawah efek (rugi akhir diakui sejak masuk, posisi rugi): **$12.746 → $11.541 (−9,5%)**. Arena/MC tidak menguji perilaku yang dijalankan bot.

**SEDANG-4 — 3 definisi pagar eksposur.** Arena menolak memakai frac×eq sebelum rem & cap LP (lebih ketat), bot mengizinkan sampai ±60%, MC memotong. Terbukti rapuh: perubahan $8 gas mengubah hasil $1.373 karena satu trade ditolak.

**RINGAN-5** — `MAX_POS` default 20 di bot (88) & arena (14) bila env hilang; posisi min $1 vs $0,25; slippage arena = ret mesin (ukuran $132–200) + tambahan 2×pos/LP, bot = mesin di ukuran nyata; KELLY MC di-sampel (tak berdampak karena cap).

## 3. Korelasi (178 trade, akun uji)
- Posisi terbuka saat beli: 1:40 | 2:23 | 3:25 | 4:16 | 5:34 | 6:17 | 7:17 | 8:5 | 9:1 (maks 9). Berbobot waktu (90 jam ada posisi): 1–4 posisi 77%, ≥5 posisi 23%. Eksposur maks 49,8%.
- **Rugi berbarengan terburuk:** 14 Sep 17:24 WIB, 5 posisi terbuka, 4 berakhir rugi = **−$506 = 24,0% equity**. Maks 7 posisi rugi terbuka bersamaan.
- **30 menit terburuk (menurut masuk):** 14 Sep 13:25 WIB, 4 beli, 2 rugi −$185 = **21,3% equity** (bersih +5,6%). Menurut keluar: 12 Sep 07:02, 2 rugi = 10,6%.
- Rugi beruntun: P(rugi)=24,2%, P(rugi | trade sebelumnya rugi)=33,3% (n=42) → rugi mengumpul.
- Batas 9 jam: 30 trade −$3.703, rata-rata 4,6% equity per posisi.

## 4. Usulan (untuk uji maju Agent 7 — angka di bawah hanya sensitivitas di data uji, JANGAN pilih yang terbesar)
| Usulan | Dampak pada 178 trade (akun apa adanya / gas dikoreksi) |
|---|---|
| U0 perbaiki gas `arena.js:6` (muat semua folder) + MC | $12.746 → $11.373; MC terburuk rugi 96% |
| U1 simpan `liveRets` hanya dari live, jangan dobel saat restart | tak terukur di uji (bug live) |
| U2 satu fungsi akun bersama (Kelly, eksposur, equity pasar) untuk bot/arena/MC | aturan bot: $12.534 (gas benar) |
| U3 maks N beli / 30 mnt, N ditetapkan **a priori** = 3 (eksposur 50% ÷ ukuran ±10% ÷ ~2 jendela per jam pegang) | N=2 $7.466 · **N=3 $10.315 (DD 20,6%)** · N=4 $12.435 · N=5 $12.571. Memotong untung, DD tidak turun → tidak dianjurkan kecuali lolos periode lain |
| U4 rem harian: stop beli bila equity < awal hari WIB −15% | 0 trade tertolak (tidak ada hari yang memicu setelah rugi); aman, murah, jaring untuk pasar sepi |
| U5 batas per dev: maks 1 posisi terbuka / dev + belajar reputasi dari **semua** koin terlihat (bukan hanya yang dibeli) | 0 dampak: 169 dev berbeda di 178 trade; dev-rule arena tak pernah menolak (0) karena hanya belajar dari 178 trade yang dibeli. Serial deployer (≥2 koin/24 jam): 1 trade, −$124 |

Pemilihan N (U3) dan ambang harian (U4) wajib dilakukan di periode tuning (mis. ags/±5/±10 Sep) dan dibuktikan di 13–17 Sep (atau sebaliknya) via `wf_penuh.sh` — sampel periode sepi kecil (43 trade), jadi a priori lebih jujur daripada optimasi.
