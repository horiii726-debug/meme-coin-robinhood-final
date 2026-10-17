// Laporan hasil (uji maju atau paper live) dinilai dengan kriteria di FORWARD_TEST_RULES.md.
// Pakai: node paper_report.js <trades.jsonl> [judul] [--min-trades N]
const fs = require("fs");
const [file, title = "Hasil"] = process.argv.slice(2);
const minTrades = process.argv.includes("--min-trades") ? +process.argv[process.argv.indexOf("--min-trades") + 1] : 0;
const T = fs.readFileSync(file, "utf8").split("\n").filter(l => l.trim()).map(JSON.parse);
const KELLY = { v4: 0.095, v3: 0.098, v2: 0.025 };   // 1/4 Kelly dari backtest (dibekukan)

const wilson = (k, n) => { if (!n) return [0, 0]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - h) / d, (c + h) / d]; };
const pct = x => (100 * x).toFixed(1) + "%";
let out = `# ${title}\n\nFile: ${file}\nDibuat: ${new Date().toISOString()}\n\n`;
out += "| Rencana | Trade | Win rate (95% CI) | Profit factor | PnL total | PnL tanpa trade terbesar | Rata-rata/trade | Median hold | Equity $100 @1/4 Kelly | DD maks |\n|---|---|---|---|---|---|---|---|---|---|\n";
const verdict = {};
for (const plan of ["v4", "v3", "v2"]) {
  const t = T.filter(x => x.plan === plan).sort((a, b) => a.exitBlk - b.exitBlk);
  if (!t.length) continue;
  const n = t.length, w = t.filter(x => x.pnl > 0).length;
  const gp = t.filter(x => x.pnl > 0).reduce((a, x) => a + x.pnl, 0), gl = -t.filter(x => x.pnl < 0).reduce((a, x) => a + x.pnl, 0);
  const pnl = gp - gl, top = Math.max(...t.map(x => x.pnl)), pf = gl ? gp / gl : Infinity;
  const [lo, hi] = wilson(w, n);
  const holds = t.map(x => x.hold).sort((a, b) => a - b);
  // equity berurutan waktu keluar, 1/4 Kelly, dibatasi ukuran trade asli
  let eq = 100, peak = 100, dd = 0;
  for (const x of t) {
    const pos = Math.min(Math.max(KELLY[plan] * eq, Math.min(1, eq)), x.size);
    const gross = x.ret + 0.02 * (x.tp1 ? 3 : 2) / x.size;
    eq = Math.max(0, eq + pos * (gross - 1) - 0.02 * (x.tp1 ? 3 : 2));
    peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak);
  }
  out += `| ${plan} | ${n} | ${pct(w / n)} (${pct(lo)}–${pct(hi)}) | ${pf.toFixed(2)} | $${pnl.toFixed(0)} | $${(pnl - Math.max(top, 0)).toFixed(0)} | ${(100 * (t.reduce((a, x) => a + x.ret, 0) / n - 1)).toFixed(1)}% | ${holds[n >> 1].toFixed(0)} mnt | $${eq.toFixed(0)} | ${pct(dd)} |\n`;
  if (plan === "v4") {
    const pass = w / n >= 0.42 && pf >= 1.3 && pnl > 0 && pnl - Math.max(top, 0) > 0;
    const fail = w / n < 0.35 || pf < 1.0;
    verdict.v4 = n < minTrades ? `BELUM CUKUP DATA (${n} < ${minTrades} trade)` : pass ? "LULUS" : fail ? "GAGAL — berhenti, jangan setel ulang" : "BELUM JELAS — lanjut paper trading";
    verdict.dd = dd;
  }
}
const rt = T.filter(x => x.plan === "v4" && x.realtime === true).length;
out += `\n**Keputusan v4 (kriteria dikunci sebelum melihat data): ${verdict.v4 ?? "tidak ada trade v4"}**\n\n`;
out += "Kriteria lulus: win rate >= 42%, profit factor >= 1,30, PnL > 0, PnL tanpa trade terbesar > 0. Gagal: win rate < 35% atau PF < 1,00.\n";
if (T.some(x => "realtime" in x)) out += `\nTrade v4 yang diproses real-time (bukan kejar-ketinggalan): ${rt}\n`;
const reasons = {}; for (const x of T.filter(x => x.plan === "v4")) reasons[x.reason] = (reasons[x.reason] || 0) + 1;
out += "\nAlasan keluar v4: " + Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") + "\n";
process.stdout.write(out);
