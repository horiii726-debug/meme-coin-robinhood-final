// Berapa PRESISI MAKSIMUM yang bisa dicapai untuk menangkap koin >=1000%?
// Cari kombinasi ambang fitur (1-3 fitur) yang memaksimalkan % pool >=11x,
// dengan syarat dukungan minimum agar bukan kebetulan.
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2] || "dsp";
const TARGET_MULT = parseFloat(process.env.TM || "11");
const MIN_SUPPORT = parseInt(process.env.MINSUP || "10", 10);

// sim.csv = hasil exit TERBAIK (perfect foresight) -> ini PLAFON teoretis
const S = new Map();
{
  const L = fs.readFileSync(path.join(DIR, "sim.csv"), "utf8").trim().split("\n");
  const H = L[0].split(","); const I = {}; H.forEach((h, i) => I[h] = i);
  for (const l of L.slice(1)) { const p = l.split(","); S.set(p[0].toLowerCase(), +p[I.best_mult]); }
}
const L = fs.readFileSync(path.join(DIR, "features.csv"), "utf8").trim().split("\n");
const H = L[0].split(","); const I = {}; H.forEach((h, i) => I[h] = i);
const LAB = ["y_rug", "y_dump", "best_mult_after", "end_mult_after", "lp_peak_after", "pool_id"];
const FEATS = H.filter(h => !LAB.includes(h) && !h.startsWith("noise"));

const rows = L.slice(1).map(l => {
  const p = l.split(",");
  const o = { pid: p[0].toLowerCase() };
  for (const f of FEATS) { const v = +p[I[f]]; o[f] = isFinite(v) ? v : 0; }
  o.best = S.get(p[0].toLowerCase());
  return o;
}).filter(r => r.best !== undefined);

// --- split waktu: cari di TRAIN, uji di VALIDATION ---
const initOf = new Map();
for (const l of fs.readFileSync(path.join(DIR,"pools.csv"),"utf8").trim().split("\n").slice(1)) {
  const p=l.split(","); initOf.set(p[0].toLowerCase(), +p[6]);
}
rows.forEach(r => r.init = initOf.get(r.pid) || 0);
rows.sort((a,b) => a.init - b.init);
const nTr = Math.floor(rows.length*0.6);
const TRAIN = rows.slice(0, nTr);
const VAL   = rows.slice(nTr, nTr + Math.floor(rows.length*0.2));
global.__TRAIN = TRAIN; global.__VAL = VAL;

const hit = r => r.best >= TARGET_MULT;
const base = rows.filter(hit).length;

console.log("=".repeat(70));
console.log(`PLAFON: berapa banyak yang BISA mencapai >=${((TARGET_MULT-1)*100).toFixed(0)}%`);
console.log("=".repeat(70));
console.log(`populasi          : ${rows.length} pool`);
console.log(`mencapai target   : ${base} pool  = ${(100*base/rows.length).toFixed(2)}%`);
console.log(`(ini exit SEMPURNA / tahu masa depan -- BATAS ATAS mutlak)\n`);

if (!base) { console.log("Tidak ada satu pun yang mencapai target. Pencarian dihentikan."); process.exit(0); }

// kandidat ambang per fitur (kuantil)
const cuts = {};
for (const f of FEATS) {
  const v = rows.map(r => r[f]).filter(isFinite).sort((a, b) => a - b);
  const qs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  cuts[f] = [...new Set(qs.map(q => v[Math.floor(q * v.length)]))];
}
const conds = [];
for (const f of FEATS) for (const c of cuts[f]) {
  conds.push({ k: `${f}>=${c}`, f, fn: r => r[f] >= c });
  conds.push({ k: `${f}<${c}`, f, fn: r => r[f] < c });
}

function evalSetOn(data, fns, minsup) {
  const sel = data.filter(r => fns.every(c => c.fn(r)));
  if (sel.length < minsup) return null;
  const h = sel.filter(hit).length;
  return { n: sel.length, h, prec: h/sel.length };
}
function evalSet(fns) {
  const sel = global.__TRAIN.filter(r => fns.every(c => c.fn(r)));
  if (sel.length < MIN_SUPPORT) return null;
  const h = sel.filter(hit).length;
  return { n: sel.length, h, prec: h/sel.length, recall: h/base, fns };
}

const results = [];
// 1 fitur
for (const c of conds) { const e = evalSet([c]); if (e) results.push({ rule: [c.k], ...e }); }
// 2 fitur
for (let i = 0; i < conds.length; i++) for (let j = i + 1; j < conds.length; j++) {
  if (conds[i].f === conds[j].f) continue;
  const e = evalSet([conds[i], conds[j]]);
  if (e) results.push({ rule: [conds[i].k, conds[j].k], ...e });
}
results.sort((a, b) => b.prec - a.prec || b.n - a.n);

console.log(`PRESISI TERBAIK (min ${MIN_SUPPORT} pool terpilih, dicari di ${results.length} kombinasi):`);
console.log("-".repeat(70));
console.log("prec%   dipilih  kena  recall  aturan");
for (const r of results.slice(0, 12)) {
  console.log(`${(100*r.prec).toFixed(1).padStart(5)}  ${String(r.n).padStart(7)}  ${String(r.h).padStart(4)}  ${(100*r.recall).toFixed(0).padStart(5)}%  ${r.rule.join(" & ")}`);
}
console.log("\n" + "=".repeat(70));
console.log("UJI OUT-OF-SAMPLE: aturan dicari di TRAIN, diuji di VALIDATION");
console.log("=".repeat(70));
console.log("train_prec  val_n  val_kena  VAL_PREC  aturan");
let survived = 0;
for (const r of results.slice(0, 15)) {
  const v = evalSetOn(global.__VAL, r.fns, 3);
  const vs = v ? (100*v.prec).toFixed(1)+"%" : "n<3";
  if (v && v.prec >= 0.5) survived++;
  console.log((100*r.prec).toFixed(1).padStart(9)+"%  "+String(v?v.n:0).padStart(5)+"  "+String(v?v.h:0).padStart(8)+"  "+vs.padStart(8)+"  "+r.rule.join(" & "));
}
console.log("\naturan yang bertahan >=50% di validation: " + survived + " dari 15");
const best = results[0];
console.log("\n" + "=".repeat(70));
console.log(`PRESISI MAKSIMUM TERUKUR: ${(100*best.prec).toFixed(1)}%  (target user: 50%)`);
console.log(`base rate populasi      : ${(100*base/rows.length).toFixed(2)}%  ->  lift ${(best.prec/(base/rows.length)).toFixed(1)}x`);
console.log(`PERINGATAN: ini dicari DI DATA YANG SAMA (in-sample). Nilai sebenarnya akan lebih rendah.`);
