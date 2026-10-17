# RHC-Quant — progres & masalah (17 Okt 2026)

Bot paper-trading sniping memecoin Uniswap v4 di Robinhood Chain (4663). MODE KERTAS, tanpa dompet/kunci.
Fakta & aturan lengkap: `rhc_vps/CLAUDE.md`.

## Hasil (modal $100, setelan AUDIT07)
| Uji | Hasil |
|---|---|
| 2 Ags–17 Sep, uji maju 3 seed | $14.224 / $16.291 / $18.204 |
| 1–2 Okt (data belum pernah dilihat model) | $264,69 (bot Rust $282,63) |
| 200 urutan acak (proyeksi) | median $11.656, terburuk 5% $7.450, 0% rugi, DD terburuk 5% 33,4% |

## Yang sudah dikerjakan
- Bot live Rust `rust/rhc-live` (live/sim/unduh/menit1): keputusan identik backtest (Okt 50/50, Ags–Sep 177/177).
- Fitur & mesin Rust identik bit dengan JS (`rust/port_features`, `rust/port_engine`).
- Radar semua DEX on-chain (v4, v3, PancakeSwap-v3, v2) + filter saham ter-tokenisasi.
- Paket VPS Ubuntu `rhc_vps/vps/` (systemd, penjaga, latih ulang harian bergerbang mutu).
- Audit: tanpa kebocoran data; referensi Quant Spec diuji & ditolak; forensik roket.

## Masalah terbuka
1. RPC publik lambat (±1 dtk) & 429 -> radar penuh + trading butuh RPC berbayar.
2. Keterlambatan: dengan latensi realistis, Oktober turun ke $114.
3. Biaya realisme belum di angka: dampak jual kita (−15%), jual di akhir blok (−6%).
4. Roket ribuan persen jarang tertangkap (ML menolak, keluar terlalu cepat).
5. Koin v3/v2 DEX Screener belum diuji.
6. Pertumbuhan mentok di batas 1% likuiditas (>~$2.000 modal).
7. Build Linux belum dites; uji jendela acak (6 jendela) terhenti, bisa dilanjutkan.

## Data
Data mentah (±17 GB) tidak disimpan di GitHub. Unduh ulang: `rhc-live unduh <dari> <sampai> <dir>` lalu `rhc-live menit1 <dir>`.
