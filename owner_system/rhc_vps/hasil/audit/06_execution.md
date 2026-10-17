# Audit 06 — Eksekusi (dampak harga, urutan blok, antrean nonce, gas nyata, latensi)

Semua angka dari rantai uji maju yang dijalankan ulang di salinan `hasil/audit/kerja_06/` (mesin + skrip disalin,
`bot/` dan `pipeline/` asli TIDAK diubah, `data/*/trades.jsonl` asli tidak ditimpa).
Pemeriksaan wajib: replay salinan dengan opsi mati menghasilkan trades.jsonl **identik byte** untuk 6 periode
(ags4 = 75 trade) dan arena menghasilkan persis **$12.746,32 / 178 trade** → pembanding sah.

## Tabel penyusutan $12.746,32

| # | Perbaikan | Equity akhir | Δ | Trade | Win | PF | DD maks |
|---|---|---|---|---|---|---|---|
| — | Hasil resmi (pembanding) | **$12.746,32** | — | 178 | 75,8% | 3,72 | 20,0% |
| a | Jual kita menggerakkan harga pool (pool bayangan) | **$9.264,08** | **−27,3%** | 177 | 75,1% | 2,96 | 20,4% |
| b | Jual diisi di swap TERAKHIR blok target | $12.593,77 | −1,2% | 182 | 75,3% | 3,32 | 16,9% |
| c | Antrean nonce 1 dompet (beli→approve→TP1→jual berurutan) | $13.714,53 | +7,6% | 186 | 78,0% | 3,52 | 20,0% |
| d1 | Gas dolar dipasang untuk SEMUA periode (bug `arena.js:6`) | **$11.372,92** | **−10,8%** | 177 | 75,7% | 3,45 | 20,4% |
| d2 | d1 + gas NYATA per tx dari receipt on-chain | **$11.098,44** | **−12,9%** | 177 | 75,7% | 3,42 | 20,4% |
| a+b+c | gabungan tanpa gas | $10.923,69 | −14,3% | 180 | 76,1% | 3,49 | 19,8% |
| **a+b+c+d** | **gabungan penuh** | **$10.439,91** | **−18,1%** | 180 | 76,1% | 3,47 | 20,6% |
| L | Latensi p90 nyata (110 blok, bukan 30) — sendiri | $20.755,76 | +62,8% | 204 | 76,5% | 4,77 | 15,0% |
| a+b+c+d+L | gabungan penuh + latensi p90 | $16.715,81 | +31,1% | 193 | 72,0% | 4,59 | 18,2% |

Pita derau: perubahan kecil pada label trade menggeser pilihan ML beberapa koin, jadi selisih **< ±10% bukan sinyal**
(bukti: (c) hanya menunda 30 dari 451 tx, maksimal 5,5 dtk — mustahil menguntungkan — tapi equity naik 7,6%).

## Temuan

**PARAH — penjualan kita tidak menggerakkan harga pool** (`bot/v4engine.js:84` `realize()`, `:123` `V[i]`,
`:234` `realizeNow`, `:341` `finalize`). TP1 menjual 60% lalu sisa 40% dinilai pada harga historis yang belum
menyerap jualan kita. Dengan pool bayangan (token yang kita jual tetap di pool; dampak beli tetap dianggap
diserap pasar = asumsi longgar): rata-rata **ret per trade −0,043** (129 dari 178 trade turun, terburuk −0,57);
equity **−27,3%**. Ini kebocoran terbesar yang saya ukur.

**PARAH — gas hanya dipasang untuk m1/m2** (`pipeline/arena.js:6`). Periode ±5 Sep & ±10 Sep memakai gas yang
terskala ukuran replay ($50–200), padahal posisi arena saat itu $2–10 → gas ditagih ±$0,19 total, bukan ±$8–33
nyata (sejalan temuan Agent 4). Perbaikan saja: **−10,8%**.

**SEDANG — gas datar $0,06/tx tidak cocok dengan pasar.** Gas nyata diambil dari receipt on-chain
(`eth_getTransactionReceipt` lewat DoH, `gasUsed × effectiveGasPrice × ETH/USD saat itu`, 1.141 receipt swap di
pool yang sama dengan trade kita):

| Periode | n | median | p90 | p99 | maks | jam ramai (10% jam tersibuk) median / p90 | gasPrice gwei med |
|---|---|---|---|---|---|---|---|
| ags1 | 4 | $0,0085 | $0,0089 | $0,0089 | $0,0089 | $0,0085 / $0,0089 | 0,0202 |
| ags4 | 38 | $0,0059 | $0,0094 | $0,0481 | $0,0481 | $0,0059 / $0,0094 | 0,0202 |
| ±5 Sep (ds5d) | 154 | **$0,2149** | $0,4671 | $1,1281 | $1,4620 | $0,2389 / $0,5645 | 0,4061 |
| ±10 Sep (ds24) | 217 | $0,0474 | $0,0666 | $0,2698 | $0,9945 | $0,0466 / $0,0829 | 0,1128 |
| 13–15 Sep (m1) | 368 | $0,0326 | $0,0433 | $0,3306 | $0,4858 | $0,0304 / $0,0375 | 0,0755 |
| 16–17 Sep (m2) | 279 | $0,0209 | $0,0265 | $0,0957 | $0,2680 | $0,0209 / $0,0273 | 0,0500 |

Gas **tidak** melonjak di jam ramai (median jam sibuk = median biasa); yang berubah adalah level harian —
±5 Sep 8× lebih mahal dari 16–17 Sep. Jadi asumsi $0,06 terlalu MAHAL di m1/m2 dan terlalu MURAH di ±5 Sep
(p99 $1,13/tx). Gas dinamis per trade: median $0,124, p90 $0,475, maks $4,39 (asumsi lama 3×$0,06+$0,03 = $0,21).
Catatan jujur: tidak ada receipt untuk tx `approve` kita → approve dihargai = 1 tx swap saat itu (batas atas);
3 dari 178 trade tidak punya receipt pasangan → tetap memakai gas tetap.

**SEDANG — hasil rapuh terhadap latensi.** Latensi observasi diukur dari `hasil/paper_live/*/events.jsonl`
(`e.lag = tip − blok`, `bot/paper_live.js:355`), 776 event saat bot benar-benar real-time: **p50 19 blok (1,9 dtk),
p90 80 blok (8,0 dtk), p99 1.531 blok**; p90 per sesi 34–192 blok. Mesin memakai `latb = entryLat = 30` yang
menurut catatan hanya kirim→mine, jadi total realistis ≈ **110 blok**. Memakai 110 blok justru menaikkan equity
ke $20.756 (+63%) — ini bukan kabar baik: artinya parameter keluar (TP1, model bahaya) belum stabil terhadap
latensi, dan angka $12.746 kebetulan berada di lembah. Perlu divalidasi ulang di periode lain.

**RINGAN — (b) urutan jual dalam blok** hampir tidak berdampak: rata-rata Δret −0,0003 (blok 0,1 dtk jarang berisi
>1 swap pool yang sama). **RINGAN — (c) antrean nonce**: hanya 30/451 tx tertunda, p99 28 blok, maks 55 blok;
pada latensi p90 jadi 107/508 tertunda (maks 310 blok). Bukan kebocoran, tapi tetap perlu di mesin.

## Usul perbaikan
1. Masukkan pool bayangan (opsi `sellImpact`) ke `bot/v4engine.js` permanen — wajib, ini mengubah harga yang
   dilihat bot untuk keputusan keluar, bukan sekadar biaya.
2. Perbaiki `pipeline/arena.js:6`: gas dolar untuk semua periode, dan pakai seri gas nyata per blok
   (`gas_cache.json`) bukan konstanta; tolak beli kalau gas estimasi > 3% posisi (pada ±5 Sep posisi $2 = 10% gas).
3. Pakai `latb` dari pengukuran live (p90 = 110 blok), lalu **pilih di satu periode, buktikan di periode lain**.
4. Antrean nonce disimulasikan di mesin (atau 2–3 dompet eksekusi) supaya jual saat pasar rontok tidak dianggap serentak.
5. Angka resmi yang jujur setelah a+b+c+d: **$100 → $10.439,91** (180 trade, win 76,1%, PF 3,47, DD 20,6%).

Reproduksi: `hasil/audit/kerja_06/` (`jalan_replay.sh`, `rantai.sh`, `antrean_nonce.js`, `ambil_gas.js`,
`analisis_gas.js`, `run_*/arena*.txt`).
