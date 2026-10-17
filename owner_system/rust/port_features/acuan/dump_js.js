// Acuan JS: panggil filter_feats.js ASLI untuk semua koin di dataset, simpan fitur presisi penuh (JSONL).
// Penyiapan input meniru persis rhc_vps/pipeline/build_feats2.js.
// Pakai: node dump_js.js <out.jsonl> [--root DIR] [--repeat N] [ds ...]
const fs = require("fs");
const { features } = require("C:/Users/horii/rhc-quant/rhc_vps/bot/filter_feats.js");
const FE = JSON.parse(fs.readFileSync("C:/Users/horii/rhc-quant/rhc_vps/bot/filter_cat.json", "utf8")).feats;
let ROOT = "C:/Users/horii/rhc-quant/rhc_vps/data";
const Q96 = Math.pow(2, 96);

const args = process.argv.slice(2);
const outPath = args.shift();
let repeat = 1;
const dsList = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--repeat") repeat = +args[++i];
  else if (args[i] === "--root") ROOT = args[++i];
  else dsList.push(args[i]);
}
if (!dsList.length) dsList.push("m1", "m2", "u_ds5d", "u_ds24", "ags1", "ags4");

// Nilai non-hingga dan -0 dikodekan sebagai string supaya NaN/Infinity/-0 tidak hilang di JSON.
const enc = v => (typeof v !== "number" ? "TYPE:" + typeof v
  : Number.isNaN(v) ? "NaN" : v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity"
  : Object.is(v, -0) ? "-0" : v);

const t0 = process.hrtime.bigint();
let tLoad = 0n, tFeat = 0n, nRows = 0;
const out = [];
for (const ds of dsList) {
  const D = `${ROOT}/${ds}`;
  const l0 = process.hrtime.bigint();
  // ---- identik build_feats2.js ----
  const tr = fs.readFileSync(`${D}/trades.jsonl`, "utf8").trim().split("\n").map(JSON.parse).filter(t => t.plan === "v4");
  const sw = JSON.parse(fs.readFileSync(`${D}/swaps_m1.json`, "utf8"));
  const tf = JSON.parse(fs.readFileSync(`${D}/transfers.json`, "utf8"));
  const pools = new Map(fs.readFileSync(`${D}/pools.csv`, "utf8").trim().split("\n").slice(1).map(l => l.trim().split(",")).map(p => [p[0].toLowerCase(), p]));
  const jobs = [];
  for (const t of tr) {
    const s0 = sw[t.pool], tt = tf[t.pool];
    if (!s0 || !tt) continue;
    const p = pools.get(t.pool);
    const meta = { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), fee: +p[3], hooks: p[5].toLowerCase(), init: t.init };
    const swaps = s0.map(x => ({ blk: x[0], li: x[1], a0: +x[2], a1: +x[3], sqrtP: Number(x[4]) / Q96, L: Number(x[5]), fee: x[6] }));
    const trs = tt.tr.map(r => [r[0], r[1], r[2].toLowerCase(), r[3].toLowerCase(), r[4]]);
    jobs.push({ pool: t.pool, meta, swaps, trs, ethUsd: t.ethUsd });
  }
  const l1 = process.hrtime.bigint();
  tLoad += l1 - l0;
  // ---- hitung fitur (diukur terpisah) ----
  let res = null;
  for (let r = 0; r < repeat; r++) {
    const f0 = process.hrtime.bigint();
    const cur = jobs.map(j => features(j.meta, j.swaps, j.trs, j.ethUsd));
    tFeat += process.hrtime.bigint() - f0;
    if (!res) res = cur;
  }
  jobs.forEach((j, i) => {
    const f = res[i];
    const fo = {};
    for (const k of Object.keys(f)) fo[k] = enc(f[k]);
    for (const k of FE) if (!(k in f)) throw new Error("fitur hilang: " + k);
    out.push(JSON.stringify({ ds, i, pool: j.pool, f: fo }));
  });
  nRows += jobs.length;
  console.error(`${ds}: ${jobs.length} koin`);
}
fs.writeFileSync(outPath, out.join("\n") + "\n");
const tAll = process.hrtime.bigint() - t0;
const ms = x => (Number(x) / 1e6).toFixed(1);
console.error(`JS rows=${nRows} total_ms=${ms(tAll)} load_ms=${ms(tLoad)} feat_ms_per_pass=${ms(tFeat / BigInt(repeat))} repeat=${repeat}`);
