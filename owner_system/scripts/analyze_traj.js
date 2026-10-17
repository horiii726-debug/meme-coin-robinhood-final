// FASE 3 — base rate 4 kelas + return setelah biaya.
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2] || "dsp";
const MIN_LP = parseFloat(process.env.MIN_LP || "20000");   // definisi TRADABLE dari Fase 2
const SLIP = 0.02;                                          // slippage per sisi (batas sizing 2%)

const lines = fs.readFileSync(path.join(DIR, "trajectories.csv"), "utf8").trim().split("\n");
const hdr = lines[0].split(",");
const idx = {}; hdr.forEach((h, i) => idx[h] = i);
const rows = lines.slice(1).map(l => {
  const p = l.split(",");
  return {
    pid: p[idx.pool_id], quote: p[idx.quote], feeInit: +p[idx.fee_init], hooks: p[idx.hooks],
    nSwap: +p[idx.n_swap], lag: +p[idx.lag_blocks],
    peak: +p[idx.peak_mult], end: +p[idx.end_mult], ddAfter: +p[idx.max_dd_after_peak],
    dip: +p[idx.dip_min_mult], postDip: +p[idx.post_dip_mult],
    lpPeak: +p[idx.lp_peak_usd], lpEntry: +p[idx.lp_entry_usd],
    remFrac: +p[idx.liq_rem_frac], medFee: +p[idx.med_fee],
  };
});

const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
const f = (n, d = 2) => Number(n).toFixed(d);

function report(set, title) {
  if (!set.length) { console.log(`\n### ${title}: 0 pool`); return; }
  console.log("\n" + "=".repeat(68));
  console.log(`### ${title}  (n=${set.length})`);
  console.log("=".repeat(68));

  // biaya: fee masuk + fee keluar + slippage 2 sisi
  const withNet = set.map(r => {
    const fee = r.medFee / 1e6;
    const cost = (1 - fee - SLIP) * (1 - fee - SLIP);
    return { ...r, netPeak: r.peak * cost, netEnd: r.end * cost, cost };
  });

  const peaks = withNet.map(r => r.netPeak);
  console.log(`peak multiple SETELAH biaya (1.0 = balik modal):`);
  for (const q of [0.5, 0.75, 0.9, 0.95, 0.99]) console.log(`   p${Math.round(q*100)}`.padEnd(8) + f(pct(peaks, q)) + "x");
  console.log(`   max     ${f(Math.max(...peaks))}x`);

  const rug = withNet.filter(r => r.remFrac > 0.8 || r.end < 0.1);
  const moon10 = withNet.filter(r => r.netPeak >= 11);
  const moon5 = withNet.filter(r => r.netPeak >= 6);
  const moon2 = withNet.filter(r => r.netPeak >= 2);
  const up30 = withNet.filter(r => r.netPeak >= 1.3);
  const decline = withNet.filter(r => !rug.includes(r) && r.netEnd < 0.5);

  console.log(`\nBASE RATE (setelah biaya):`);
  const br = (n, lbl) => console.log(`   ${lbl.padEnd(34)} ${String(n).padStart(5)}  ${f(100*n/set.length)}%`);
  br(moon10.length, "MOONSHOT  peak >= 1000% (11x)");
  br(moon5.length,  "  peak >= 500% (6x)");
  br(moon2.length,  "  peak >= 100% (2x)");
  br(up30.length,   "  peak >= 30%  (rencana awalmu)");
  br(rug.length,    "RUGPULL   (LP ditarik >80% / harga ~0)");
  br(decline.length,"DECLINE   (berakhir < -50%, bukan rug)");

  // strategi dip: turun dulu lalu pulih
  const dipped = withNet.filter(r => r.dip <= 0.5);
  const dipRecov = dipped.filter(r => r.postDip / r.dip >= 3);
  console.log(`\nPOLA DIP (strategi beli-koreksi):`);
  console.log(`   turun >=50% dalam 1 jam pertama : ${dipped.length} (${f(100*dipped.length/set.length)}%)`);
  if (dipped.length) {
    console.log(`   dari yg turun, pulih >=3x dr dasar: ${dipRecov.length} (${f(100*dipRecov.length/dipped.length)}% dr yg turun)`);
    const dr = dipped.map(r => r.postDip / r.dip);
    console.log(`   multiple dari dasar: p50=${f(pct(dr,.5))}x p75=${f(pct(dr,.75))}x p90=${f(pct(dr,.9))}x p99=${f(pct(dr,.99))}x`);
  }

  console.log(`\nkonteks: fee median ${f(pct(set.map(r=>r.medFee),.5),0)}e-6 | p90 ${f(pct(set.map(r=>r.medFee),.9),0)}e-6`);
  console.log(`         swap/pool median ${pct(set.map(r=>r.nSwap),.5)} | LP peak median $${pct(set.map(r=>r.lpPeak),.5).toLocaleString("en-US",{maximumFractionDigits:0})}`);
  console.log(`         pakai hook ${set.filter(r=>r.hooks!=="0x0000000000000000000000000000000000000000").length}/${set.length}`);
}

console.log(`total trajektori: ${rows.length}`);
report(rows, "SEMUA POOL");
report(rows.filter(r => r.lpPeak >= MIN_LP), `TRADABLE (LP peak >= $${MIN_LP.toLocaleString()})`);
