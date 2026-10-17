# robinhood-final-meme

Memecoin sniping research and paper-trading system for **Uniswap v4 on Robinhood Chain (chainId 4663)**, plus a full
out-of-sample re-test on fresh on-chain data (18 Sep – 16 Oct 2026). **Paper mode only: no wallet, no keys, no real trades.**

Ringkasan (Bahasa Indonesia) ada di bagian paling bawah.

## Layout

| Path | What |
|---|---|
| `owner_system/` | The original RHC-Quant system (Rust bot `rust/rhc-live`, engine `rust/port_engine`, features `rust/port_features`, Python training, JS pipeline, frozen models in `rhc_vps/bot/`, the owner's documents) **with the changes listed below** |
| `research/` | Every script used for the re-test, all result files (JSON/CSV/logs), audit-driven fixes, tuning grid, Monte Carlo, luck tests, model and formula comparisons |
| `research/bench/` | Rust vs C++ inference benchmark (identical outputs) |
| `dashboard/rhc_dashboard.html` | Self-contained results dashboard (open in a browser) |
| `data/<window>/` | Raw and derived on-chain data per 2-day window, zstd-compressed (`zstd -d file.zst`) |

### Data windows (`data/`)

| Name | Blocks / period | Content |
|---|---|---|
| `w00`–`w13` | 18 Sep – 15 Oct 2026, 2 days each | Out-of-sample test period (models frozen before it) |
| `w14` | 15 Oct 12:00 – 16 Oct ≈03:00 UTC | Freshest window |
| `h00`–`h30` | 1 Jul – Sep 2026 | History (partly processed when stopped; see each folder's files) |
| `x00,x01,x03,x04,x05` | same as w00/w01/w03/w04/w05 | Extended universe: + WETH-quoted pools (mapped to native ETH) + native pools with fee ≤ 1% |
| `ext_w*` | same | The extra pools alone, as downloaded |

Files per window: `pools.csv` (every pool born), `swaps_sorted.csv`, `liq.csv` (tradable pools + ETH/USDG price pool),
`trades*.jsonl` (replay of every candidate coin; variants without exit models), `swaps_m1.json`, `transfers.json`,
`dev_creator.json` (minute-1 data), `features.jsonl` (34 minute-1 features), `sim_*.jsonl` (account sims), `rscore.csv`
(walk-forward retrained entry scores). The merged datasets `all/` and `oct/` are exact concatenations; rebuild them with
`python research/merge_windows.py all w00 … w14`.

Window block ranges are in `research/windows.txt`, `research/windows_hist.txt`, `research/windows_ext.txt`.

## Changes made to the owner's code (`owner_system/rust`)

All defaults reproduce the original behaviour exactly (verified: identical trades/equity on the same data).

| File | Change |
|---|---|
| `rhc-live/src/fast_download.rs` (new) | `rhc-live fast` two-phase downloader (Initialize events, then swaps/liquidity filtered by pool id) ≈11× faster; `rhc-live fast1` minute-1 data with multi-address `eth_getLogs` (validated: 40/40 coins identical to `menit1`). `EXT_ONLY=1` downloads the WETH / ≤1% fee extra universe |
| `rhc-live/src/unduh.rs` | Batch RPC retries keep successful items; `eth_getLogs` splits block ranges on the 10,000-log cap instead of failing |
| `rhc-live/src/cfg.rs`, `bot.rs` | New settings `SELL_IMPACT` (0/1/full), `LAT_BLOCKS` (execution latency, default 30), `KELLY_MIN` (Kelly floor, default 0.01) |
| `port_engine/src/engine.rs` | `MAX_FEE` (max pool fee in ppm, default 5000) |
| `research/run_window.sh` | Replay end block = window end + 9 h, so coins born in the last 9 h of a window are tested (the original random-window script silently skipped ≈37% of coins) |

Build: `cd owner_system/rust/rhc-live && cargo build --release` (same for `port_engine`, `port_features`).

## Main results (all on data the frozen models had never seen)

Single continuous $100 account (no resets), realistic costs (gas $0.06/swap, approve $0.03, failed tx 1.85%/0.54%, 3 s latency, worst in-block order):

| System | 18 Sep – 16 Oct | Max DD | October only | Max DD |
|---|---|---|---|---|
| Official (frozen model) | $84,446 | 24% | $50,460 | 43% |
| Official + entry filter retrained every 2 days | $78,369 | 21% | $46,719 | 46% |
| System A (Sep-tuned settings) | $140,123 | 25% | $48,656 | 36% |
| **System A + retrain every 2 days** | **$161,558** | 25% | **$95,049** | 33% |

System A = `QTHR=0.80 DANGER_TH=0.5 TRAIL_PUNCAK=0.4 TUTUP_SAAT_RUG=1 DUMP_FRAC=0.05 KELLY_MAKS=0.15 MAX_POS=10`, chosen on
September windows only (`research/tune.py`, 576 configs).

Skill vs luck: entry filter AUC 0.74 on 14,920 new coins (top 10% mean return 1.40× vs 0.97× random, p = 0.0001);
0/100 random-pick bots match the real bot. Random window order (100 orders): official loses in 1/100, System A in 6/100
(when the account starts right before 7–9 Oct). Monte Carlo (bot's own Kelly sizing, 1% LP cap, kill switch): fine up to
~10% worse fills per trade; at 20% worse 76% of System A paths draw down >50%; at 30% worse the system loses.

Bug found in the bot: after a losing streak quarter-Kelly floors at 1% and the drawdown brake at 25%, so positions fall
below `MIN_POS` and the bot never trades again (Kelly only learns from executed trades). See `KELLY_MIN`.

Also tested and rejected: exit on buy:sell ≤ 1:1 momentum, the "QFV quantum" radar formula (AUC 0.53), LightGBM /
XGBoost / ensemble filters (failed in October), most literature microstructure features (sign flips). Rust vs C++: same
speed (~1.8 µs per prediction); the network (~78 ms RPC) is the bottleneck.

Not yet ready for real money: no long paper-live record, competing bots not modelled, public RPC too slow/limited for live.

## Ringkasan (Indonesia)

- Data baru 18 Sep–16 Okt, satu akun $100 berjalan terus: **Sistem A + retrain → $161.558** (DD 25%), resmi → $84.446.
- Oktober saja (belum pernah dilihat setelan/model): Sistem A + retrain $95.049 vs resmi $50.460.
- Bukan hoki: AUC 0,74 di 14.920 koin baru; 0/100 bot acak menyamai.
- Risiko: mulai tepat sebelum periode jelek → Sistem A rugi di 6/100 urutan acak; eksekusi live harus mendekati backtest.
- Bug bot: bisa macet permanen setelah rentetan rugi (Kelly 1% × rem 25% < $0,25). Ditambahkan `KELLY_MIN`.
- Belum layak uang asli: paper live 2 minggu dulu dengan RPC berbayar, lalu uang kecil.

### Large files

GitHub rejects files over 100 MB, so a few compressed files are split into `*.zst.partNN` pieces with a `*.zst.sha256`
checksum next to them. Rebuild and verify, then decompress:

```
cat data/h27/swaps_sorted.csv.zst.part* > data/h27/swaps_sorted.csv.zst
sha256sum -c data/h27/swaps_sorted.csv.zst.sha256
zstd -d data/h27/swaps_sorted.csv.zst
```
