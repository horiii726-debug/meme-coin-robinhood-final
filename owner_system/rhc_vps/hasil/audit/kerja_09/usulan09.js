// Agent 9 — dampak usulan batas risiko pada 178 trade (replay AKUN, keputusan ML tetap).
// PERINGATAN: ini hanya SENSITIVITAS di data uji. Angka final harus dipilih di periode tuning & dibuktikan
// di periode lain oleh uji maju (Agent 7). Jangan pilih baris dengan hasil terbesar.
const { run, trades, ALL } = require("./risk09.js");
const f = (r, nm) => console.log(`${nm.padEnd(30)} $${r.eq.toFixed(0).padStart(6)} | tr ${String(r.n).padStart(3)} | DD ${(100 * r.dd).toFixed(1).padStart(4)}% | PF ${r.pf.toFixed(2)} | ` +
  ["u_ds5d", "u_ds24", "m1", "m2"].map(k => k + " " + (r.byDs[k] || 0).toFixed(0)).join(" ") + ` | ditolak ${r.tol.win30 + r.tol.day + r.tol.dev} (+exp ${r.tol.exp})`);
f(run(), "basis");
for (const g of [false, true]) {
  console.log(g ? "\n-- dengan gas u_ds dibebankan (koreksi temuan) --" : "\n-- aturan akun apa adanya --");
  for (const n of [2, 3, 4, 5]) f(run({ win30: n, gasFix: g }), `maks ${n} beli / 30 mnt`);
  for (const x of [0.10, 0.15, 0.20]) f(run({ dayLoss: x, gasFix: g }), `rem harian ${100 * x}% (hari WIB)`);
  f(run({ devMax: 1, gasFix: g }), "maks 1 posisi / dev");
}
// dev: apakah koin yg dibeli punya dev yg SEBELUMNYA (keluar < putus) membuat koin rug (ret<0,3) — dari SEMUA koin terlihat, bukan hanya yg dibeli
const byDev = {}; for (const o of ALL) if (o.dev) (byDev[o.dev] = byDev[o.dev] || []).push({ exit: +o.exit, decide: +o.decide, ret: +o.ret, pool: o.pool });
let kena = [], serial = [];
const B = run(); const pnl = {}; B.closed.forEach(c => pnl[c.pool] = c.pnl);
for (const t of trades) {
  if (!t.dev) continue; const h = byDev[t.dev].filter(x => x.pool !== t.pool);
  if (h.some(x => x.exit < t.decide && x.ret < 0.3)) kena.push(t);
  const lahir24 = h.filter(x => x.decide < t.decide && x.decide > t.decide - 24 * 3600 / 0.1013).length;
  if (lahir24 >= 2) serial.push(t);
}
const s = a => a.reduce((x, t) => x + pnl[t.pool], 0);
console.log(`\nDEV: koin dibeli yg dev-nya sudah terbukti rug di koin lain (causal, semua koin terlihat): ${kena.length} trade, pnl $${s(kena).toFixed(0)}, ret ${kena.map(t => t.ret.toFixed(2)).join(",")}`);
console.log(`DEV: koin dibeli dari dev yg melahirkan >=2 koin lain dalam 24 jam sebelumnya: ${serial.length} trade, pnl $${s(serial).toFixed(0)}, win ${serial.filter(t => pnl[t.pool] > 0).length}`);
const devDup = {}; for (const t of trades) if (t.dev) devDup[t.dev] = (devDup[t.dev] || 0) + 1;
console.log(`DEV: dev berbeda di 178 trade = ${Object.keys(devDup).length} (${trades.filter(t => !t.dev).length} tanpa dev), dev dgn >1 trade = ${Object.values(devDup).filter(v => v > 1).length}`);
