# RHC — Paket VPS

Strategi sniping memecoin Uniswap v4 di Robinhood Chain. Mode kertas.

Hasil uji maju final (2 Ags – 17 Sep, mulai dari nol, tanpa data masa depan):
**$100 -> $12.746,32**, 178 trade, win 75,8%, drawdown maks 20,0%.

## Baca berurutan
0. `CLAUDE.md` — pintu masuk untuk Claude Code (dimuat otomatis); `RENCANA_MULTI_AGENT.md` — rencana audit 10 agent
1. `STRATEGI_FINAL.md` — strategi, hasil, cara uji, yang belum beres
2. `DEPLOY_VPS.md` — cara pasang & jalankan di VPS
3. `CATATAN_AUDIT.md` — temuan audit: yang sudah & belum diperbaiki

## Isi
| Folder | Isi |
|---|---|
| `bot/` | bot paper trading + 3 model final + setelan final (`.env`) |
| `pipeline/` | pengumpul data, replay, pelatih model, arena uji maju |
| `data/` | seluruh data harga historis on-chain (6 periode utuh + Agustus berlubang) |
| `hasil/` | log uji maju final, 178 trade lengkap + alasan keluar, grafik (`visual/`), Monte Carlo 3 skenario (`monte_carlo/`, PROYEKSI), riwayat paper live |
| `rust/` | skorer CatBoost versi Rust (parity dengan Python) |
| `dok_lama/` | dokumen sebelumnya: alamat kontrak terverifikasi, aturan uji, audit biaya |

## Data historis
| Folder | Periode | Jam |
|---|---|---|
| `data/ags1` | 2 Agustus | 9,9 |
| `data/ags4` | 19–20 Agustus | 9,7 |
| `data/u_ds5d` | ±5 September | 18,4 |
| `data/u_ds24` | ±10 September | 24,3 |
| `data/m1` | 13–15 September | 48,8 |
| `data/m2` | 16–17 September | 36,5 |
| `data/agustus_mentah` | 1 Ags – 7 Sep, 7 jendela | ±162 (BERLUBANG, bisa dilanjutkan) |

Tiap folder periode: `swaps_sorted.csv` (semua swap), `liq.csv` (perubahan likuiditas), `pools.csv` (pool baru), `trades.jsonl` (hasil replay), `swaps_m1.json` & `transfers.json` (data menit pertama), `dev_creator.json` (dompet pembuat).
