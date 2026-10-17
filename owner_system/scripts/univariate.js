// FASE 5 — uji univariate + koreksi Benjamini-Hochberg (FDR 10%).
// Split berbasis waktu. TEST SET TIDAK DISENTUH.
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2] || "dsp";
const TARGET = process.env.Y || "y_rug";
const FDR = 0.10;

// init_block dari pools.csv untuk split waktu
const hookOf = new Map();
const initOf = new Map();
for (const line of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = line.split(","); initOf.set(p[0].toLowerCase(), +p[6]); hookOf.set(p[0].toLowerCase(), p[5].toLowerCase());
}

const L = fs.readFileSync(path.join(DIR, "features.csv"), "utf8").trim().split("\n");
const H = L[0].split(",");
const I = {}; H.forEach((h, i) => I[h] = i);
const LABELS = ["y_rug", "y_dump", "best_mult_after", "end_mult_after", "lp_peak_after", "pool_id"];
const FEATS = H.filter(h => !LABELS.includes(h));

let rows = L.slice(1).map(l => {
  const p = l.split(",");
  const o = { pid: p[I.pool_id], y: +p[I[TARGET]], init: initOf.get(p[I.pool_id]) || 0, hook: hookOf.get(p[I.pool_id]) };
  for (const f of FEATS) { const v = +p[I[f]]; o[f] = isFinite(v) ? v : 0; }
  return o;
}).filter(r => r.init > 0);
const MINLP = parseFloat(process.env.MIN_LP || "0");
if (MINLP > 0) rows = rows.filter(r => r.lp_entry_usd >= MINLP);
const SEGMENT = process.env.SEGMENT || "";
if (SEGMENT) rows = rows.filter(r => r.hook === SEGMENT);

rows.sort((a, b) => a.init - b.init);
const nTr = Math.floor(rows.length * 0.6), nVa = Math.floor(rows.length * 0.2);
const train = rows.slice(0, nTr), val = rows.slice(nTr, nTr + nVa), test = rows.slice(nTr + nVa);
const dev = train.concat(val);   // train+validation untuk seleksi

console.log("=".repeat(72));
console.log(`FASE 5 — UNIVARIATE  target=${TARGET}`);
console.log("=".repeat(72));
console.log(`total ${rows.length} | train ${train.length} | val ${val.length} | TEST ${test.length} (DIKUNCI, tidak dipakai)`);
console.log(`base rate dev: ${(100 * dev.filter(r => r.y === 1).length / dev.length).toFixed(1)}%`);

// normal CDF
function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function aucTest(data, feat) {
  const pos = [], neg = [];
  for (const r of data) (r.y === 1 ? pos : neg).push(r[feat]);
  const n1 = pos.length, n2 = neg.length;
  if (!n1 || !n2) return null;
  const all = data.map(r => ({ v: r[feat], y: r.y })).sort((a, b) => a.v - b.v);
  // rank dengan penanganan seri
  let i = 0, rankSum = 0;
  while (i < all.length) {
    let j = i; while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) if (all[k].y === 1) rankSum += avg;
    i = j + 1;
  }
  const auc = (rankSum - n1 * (n1 + 1) / 2) / (n1 * n2);
  const z = (auc - 0.5) / Math.sqrt((n1 + n2 + 1) / (12 * n1 * n2));
  const p = 2 * (1 - ncdf(Math.abs(z)));
  return { auc, z, p };
}

const res = [];
for (const f of FEATS) {
  const t = aucTest(dev, f);
  if (t) res.push({ f, ...t });
}
res.sort((a, b) => a.p - b.p);

// Benjamini-Hochberg
const m = res.length;
let kMax = -1;
res.forEach((r, i) => { if (r.p <= FDR * (i + 1) / m) kMax = i; });
res.forEach((r, i) => r.sig = i <= kMax);

console.log(`\nfitur diuji: ${m} | lolos BH (FDR ${FDR * 100}%): ${res.filter(r => r.sig).length}\n`);
console.log("  AUC    |z|     p         BH   fitur");
console.log("-".repeat(72));
for (const r of res.slice(0, 26)) {
  const noise = r.f.startsWith("noise") ? "  <== NOISE" : "";
  console.log(`  ${r.auc.toFixed(3)}  ${Math.abs(r.z).toFixed(1).padStart(5)}  ${r.p.toExponential(1).padStart(8)}  ${(r.sig ? "LOLOS" : "  -  ").padEnd(5)} ${r.f}${noise}`);
}

const noiseSig = res.filter(r => r.f.startsWith("noise") && r.sig);
console.log("\n" + "=".repeat(72));
if (noiseSig.length) {
  console.log(`BOCOR: ${noiseSig.length} fitur NOISE lolos seleksi -> pipeline bermasalah, JANGAN lanjut.`);
} else {
  console.log(`KONTROL NOISE BERSIH: 0 dari 3 fitur acak lolos. Pipeline tidak bocor.`);
  const best = res.filter(r => r.sig && !r.f.startsWith("noise"));
  console.log(`fitur yang bertahan: ${best.length}`);
  if (!best.length) console.log("KILL CRITERIA F5 KENA: tidak ada fitur yang lolos FDR.");
}
