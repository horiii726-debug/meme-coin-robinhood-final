# Strategi Final RHC

Sniping memecoin baru di Uniswap v4, Robinhood Chain (chainId 4663). Mode kertas — belum pernah menyentuh uang asli.

Dokumen ini menjelaskan strategi yang terakhir diuji, cara ujinya, hasilnya, dan apa yang masih belum beres. Semua angka berasal dari swap on-chain sungguhan. Tidak ada angka simulasi acak (Monte Carlo) di bagian hasil.

---

## 1. Hasil uji maju final

Bot dinyalakan pada data 2 Agustus dalam keadaan **tidak tahu apa-apa**, lalu dibiarkan belajar sendiri sampai 17 September. Di setiap tahap, model hanya boleh belajar dari masa lalu.

**$100 → $12.746,32 (+12.646%)**

| Ukuran | Nilai |
|---|---|
| Trade | 178 |
| Win rate | 75,8% |
| Profit factor | 3,72 |
| Drawdown maksimal | 20,0% |
| Stop darurat menyala | tidak pernah |
| Posisi melebihi 1% likuiditas pool | 0 dari 178 |
| Jam pasar yang diuji | ±148 jam (±6 hari), tersebar 2 Ags – 17 Sep |

Per periode:

| Periode | Trade | Win | PF | Untung | Keadaan bot |
|---|---|---|---|---|---|
| 2 & 19–20 Agustus | 0 | — | — | $0 | model belum bisa menilai |
| ±5 September | 18 | 61% | 0,70 | −$2,70 | masih belajar |
| ±10 September | 25 | 72% | 1,46 | +$16,03 | mulai bisa |
| 13–15 September | 85 | 82% | 4,80 | +$8.804,25 | sudah pintar |
| 16–17 September | 50 | 72% | 2,68 | +$3.828,73 | sudah pintar |

Log lengkap: `hasil/uji_maju_final/wf_penuh.log`. Semua trade: `hasil/uji_maju_final/trade_wf.json`.

### Batas posisi mengubah hasil

| Posisi maksimal | Hasil | Bisa dipercaya? |
|---|---|---|
| 0,5% likuiditas pool | $7.302 | ya |
| **1% likuiditas pool** | **$12.746** | **ya — ini setelan final** |
| 2% likuiditas pool | $18.661 | tidak — 82 posisi kebesaran |
| tanpa batas | $22.832 | tidak — posisi sampai 22,9% isi pool |

Di atas 1% likuiditas, pembelian kita sendiri menggerakkan harga dan simulasi tidak bisa menghitungnya dengan benar. Batas 1% itu batas fisik pasar, bukan aturan strategi.

---

## 2. Cara kerja strategi

### Masuk
1. Koin baru lahir di PoolManager (`0x8366a39c…e40951`). Bot memantau.
2. Di **menit ke-1** (blok `init+600`) bot menghitung **34 fitur** hanya dari data sampai saat itu: likuiditas, volume beli/jual, sebaran pemegang token (HHI, Gini, entropi), graf dompet (eigenvalue, kepadatan), dampak harga per dolar (Kyle lambda), momentum berbobot likuiditas.
3. **Model CatBoost** memberi skor. Hanya koin di **10% skor tertinggi** dari 100 koin terakhir yang lolos.
4. **Cek honeypot** — simulasi jual lewat `eth_call`. Gagal = lewati.
5. **Reputasi dev** — dompet pengirim transaksi mint. Kalau pernah membuat koin yang rug (ret < 0,3), tolak.
6. Masuk di blok `init+630` (menit-1 + 3 detik).

### Ukuran posisi
- **1/4 Kelly × equity harga pasar**, dihitung hanya dari trade yang benar-benar dibuka akun
- Pemanasan 2% untuk 30 trade pertama, lalu 9,4% sampai 100 trade, lalu Kelly live
- Batas atas Kelly 10% per posisi
- Posisi maksimal **1% likuiditas pool**
- Maksimal **10 posisi** serentak, maksimal **50% equity** dipertaruhkan serentak
- Compounding: ukuran selalu dihitung dari equity terbaru

### Keluar
- **TP1 +20% → jual 60%**, *kecuali* model `p_naik` ≥ 0,5 (masih akan naik ≥1,5× dalam 30 menit) — maka TP ditunda
- Sisa posisi keluar kalau:
  - model `p_bahaya` ≥ 0,4 **dan** model `p_naik` < 0,5
  - likuiditas didump ≥ 5% dalam satu swap
  - LP ditarik > 30%
  - turun 40% (sebelum TP1)
  - turun 10% dari puncak (setelah TP1)
  - sudah **9 jam**

### Rem risiko
| Drawdown dari puncak | Ukuran taruhan |
|---|---|
| 0–10% | normal |
| 10–20% | 75% |
| 20–30% | 50% |
| > 30% | 25% |
| **60%** | **stop darurat — berhenti beli** |

### Belajar sendiri
- Model filter dilatih ulang otomatis **tiap 100 trade tutup** (proses terpisah, bot tetap trading pakai model lama sampai model baru lolos cek parity)
- Riwayat dev bertambah tiap trade tutup
- Potret kondisi posisi dicatat ke `snaps_live.jsonl` sebagai bahan latih ulang model keluar

### Biaya yang dihitung
Gas $0,06/swap + approve $0,03 (diukur dari receipt on-chain), transaksi beli gagal 1,85% dan jual gagal 0,54% per percobaan (diukur dari router), slippage AMM dari matematika sqrtPrice + likuiditas, bot pesaing dianggap mengeksekusi lebih dulu dalam blok yang sama, latensi 3 detik untuk masuk dan keluar.

---

## 3. Model di paket ini

| Model | File | Dilatih dari | Kualitas |
|---|---|---|---|
| Filter beli (CatBoost) | `bot/filter_cat.json` | 2.797 koin (2 Ags – 17 Sep) | — |
| p_bahaya | `bot/danger_model.json` | 205.243 potret kondisi | AUC luar-waktu 0,823 |
| p_naik | `bot/pnaik_model.json` | 205.243 potret kondisi | AUC luar-waktu 0,795 |

Setiap model punya file `*_check.json`. Bot menolak jalan kalau prediksi JavaScript meleset lebih dari 1e-9 dari Python. Saat paket dibuat, ketiganya lolos: 2,22e-16 / 1,11e-16 / 1,11e-16.

Mesin backtest (`pipeline/v4engine.js`) adalah file yang sama dengan mesin bot (`bot/v4engine.js`). Diuji: replay data 19–20 Agustus dengan kedua mesin menghasilkan 75 trade identik (`hasil/uji_mesin_ags4.jsonl`).

---

## 4. Cara uji dibuat jujur

- **Tidak melihat masa depan.** Model keluar di tiap periode hanya dilatih dari periode sebelumnya. Model filter dilatih ulang tiap 100 trade dari trade yang sudah tutup saja (`exit < blok keputusan`).
- **Uji kebocoran.** Label diacak → AUC 0,504 (setara tebak acak). Kalau ada kebocoran, angkanya tetap tinggi.
- **Fitur hanya dari menit pertama.** Diperiksa di 2.125 koin: 0 pelanggaran.
- **Trade kalah tidak dibuang.** Koin yang habis total ikut dihitung.
- **Data tanpa lubang.** Data Agustus yang berlubang tidak dipakai — koin butuh 9 jam data tanpa putus.

---

## 5. Yang masih belum beres

Hasil nyata kemungkinan **di bawah** $12.746 karena empat asumsi simulasi masih terlalu optimis:

1. **Penjualan kita tidak menggerakkan harga pool.** TP1 jual 60%, sisanya dijual dari harga yang seolah belum ada penjualan.
2. **Order jual dianggap paling depan dalam blok**, sedangkan beli dianggap paling belakang.
3. **Tidak ada antrean nonce.** Satu dompet tidak bisa menjual 10 koin serentak dalam 3 detik.
4. **Gas dianggap tetap $0,06**, tanpa lonjakan.

Temuan audit lain yang belum dikerjakan ada di `CATATAN_AUDIT.md`.

### Sifat strategi yang harus diterima
- **Butuh masa belajar.** Minggu pertama nyaris tidak menghasilkan. Jangan panik.
- **Hidup dari hari ramai.** Hampir semua untung datang dari 13–17 September. Pasar sepi berminggu-minggu = hasil jauh lebih kecil.
- **Melewatkan banyak roket.** Dari 12 koin yang naik >3× di 16–17 September, bot cuma menangkap 2. Model belajar menebak "untung sedikit pun", bukan "naik berkali lipat". Model pencari roket sudah dibuat (`pipeline/arena_score_moon.py`) tapi hasilnya belum konsisten — perlu data lebih banyak.
- **Sampel masih kecil.** 178 trade → win rate 75,8% bisa meleset ±6%. Butuh ±1.000 trade untuk yakin.

---

## 6. Belum pernah uang asli

Belum ada modul kirim transaksi. Sebelum uang asli, wajib ada:
- VPS + RPC berbayar
- Modul eksekusi lewat Universal Router (`0x8876789976decbfcbbbe364623c63652db8c0904`, selektor `execute` `0x3593564c`) dan Permit2 (`0x000000000022d473030f116ddee9f6b43ac78ba3`) — alamat terverifikasi on-chain di `dok_lama/config.toml`
- Pengaman slippage maksimum per order
- Mode bayangan: kirim order nominal kecil dulu, ukur selisih harga nyata vs simulasi
- Dompet khusus dengan modal yang siap hilang seluruhnya
