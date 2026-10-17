# Monte Carlo — PROYEKSI, bukan hasil

10.000 jalur x 30 hari per skenario, dibangun dari 178 trade NYATA uji maju final (`../uji_maju_final/trade_final178.json`).
Yang diacak hanya urutan jam pasar (blok bootstrap 12 jam di dalam tiap periode). Skrip: `pipeline/mc_pro.js`.

| Skenario | Pasar yang diambil | Biaya tambahan |
|---|---|---|
| terbaik | 13–17 Sep (ramai) | tidak ada |
| realistis | 4 periode, bobot sama | +5% per trade, gas 2x |
| terburuk | ±5 & ±10 Sep (sepi) | +10% per trade, gas 3x |

Median: terbaik $415 / $40.817 / $203.858 (1 hari / 1 minggu / 1 bulan); realistis $161 / $11.055 / $61.187; terburuk $117 / $106 / $95 (52% jalur rugi, 82% kena stop darurat).
