// Salinan build_feats2.js dgn jalur diparameterkan: node feats15.js <varian>
const fs = require("fs");
const { features } = require("../../../bot/filter_feats.js");
const FE = JSON.parse(fs.readFileSync("../../../bot/filter_cat.json", "utf8")).feats;
const Q96 = Math.pow(2, 96);
const V = process.argv[2];
const MAP = { ags1: "ags1", ags4: "ags4", ds5d: "u_ds5d", ds24: "u_ds24", m1: "m1", m2: "m2" };
const rows = [];
for (const nm of Object.keys(MAP)) {
  const D = "../../../data/" + MAP[nm];
  const tf0 = "out/" + nm + "_" + V + ".jsonl";
  if (!fs.existsSync(tf0)) { console.error(nm, "lewat"); continue; }
  const tr = fs.readFileSync(tf0, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse).filter(t => t.plan === "v4");
  const sw = JSON.parse(fs.readFileSync(D + "/swaps_m1.json", "utf8"));
  const tt0 = JSON.parse(fs.readFileSync(D + "/transfers.json", "utf8"));
  const cr = JSON.parse(fs.readFileSync(D + "/dev_creator.json", "utf8"));
  const pools = new Map(fs.readFileSync(D + "/pools.csv", "utf8").trim().split("\n").slice(1).map(l => l.trim().split(",")).map(p => [p[0].toLowerCase(), p]));
  let skip = 0;
  for (const t of tr) {
    const s0 = sw[t.pool], tt = tt0[t.pool];
    if (!s0 || !tt) { skip++; continue; }
    const p = pools.get(t.pool);
    const q1 = p[2].toLowerCase() === "0x0000000000000000000000000000000000000000";
    const meta = { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), fee: +p[3], hooks: p[5].toLowerCase(), init: t.init };
    const swaps = s0.map(x => ({ blk: x[0], li: x[1], a0: +x[2], a1: +x[3], sqrtP: Number(x[4]) / Q96, L: Number(x[5]), fee: x[6] }));
    const f = features(meta, swaps, tt.tr.map(r => [r[0], r[1], r[2].toLowerCase(), r[3].toLowerCase(), r[4]]), t.ethUsd);
    const jual = swaps.filter(x => (q1 ? x.a0 : x.a1) < 0).length;
    rows.push({ ds: nm, pool: t.pool, init: t.init, decide: t.init + 600, entry: t.entryBlk, exit: t.exitBlk,
      ret: t.ret, win: t.ret > 1 ? 1 : 0, jual_m1: jual, dev: (cr[t.pool] || {}).dev || "", gasTot: t.gasTot || 0, size: t.size || 0, f });
  }
  console.error(nm, "baris:", tr.length - skip, "| lewat:", skip);
}
const hdr = ["ds", "pool", "init", "decide", "entry", "exit", "ret", "win", "jual_m1", "dev", "gasTot", "size"].concat(FE);
const out = [hdr.join(",")];
for (const r of rows) out.push([r.ds, r.pool, r.init, r.decide, r.entry, r.exit, r.ret, r.win, r.jual_m1, r.dev, r.gasTot, r.size]
  .concat(FE.map(k => { const v = r.f[k]; return Number.isFinite(v) ? (+v.toFixed(8)) : ""; })).join(","));
fs.writeFileSync("feats_" + V + ".csv", out.join("\n"));
console.error("TOTAL", rows.length, "baris -> feats_" + V + ".csv");
