// Harness uji kesamaan mesin: SALINAN replay.js (logika sama persis) + opsi PoolSim yang TIDAK
// dipakai replay.js (rugExit, warnTick, trail, tpLadder, armAt, sellImpact, sellLast, nonce, gate, sizeFn,
// plans, maxUsd/lpFrac/minUsd) + rekaman onEvent, onSnap, dan nilaiSekarang (mark-to-market).
// Padanan Rust: binary `engine_harness` (src/bin/engine_harness.rs). v4engine.js hanya di-require, tidak diubah.
// Pakai (cwd = rhc_vps/pipeline): ENGINE_EXTRA='{...}' AUDIT=... node engine_harness.js <dir> <from> <end> <out_prefix> [auto]
//   keluaran: <prefix>.trades.jsonl, <prefix>.events.jsonl, <prefix>.snaps.jsonl, <prefix>.mtm.jsonl
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { PoolSim, loadModel, safe, HZ } = require("C:/Users/horii/rhc-quant/rhc_vps/pipeline/v4engine.js");

const [DIR, FROM, END, OUTP, ETH = "file"] = process.argv.slice(2);
const fromInit = +FROM, endBlk = +END;
const Q96 = Math.pow(2, 96);
const ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e";
const fixedEth = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;
const model = loadModel(process.env.DANGER_FILE || "danger_model.json");
const modelUp = process.env.UP_FILE ? loadModel(process.env.UP_FILE) : null;
const AUD = JSON.parse(process.env.AUDIT || "{}");
const EX = JSON.parse(process.env.ENGINE_EXTRA || "{}");
const pdPool = [];
const h32 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

if (!process.env.DANGER_FILE) {
  const ck = JSON.parse(fs.readFileSync("danger_check.json", "utf8"));
  let mx = 0; ck.X.forEach((x, k) => { mx = Math.max(mx, Math.abs(model.predict(x) - ck.p[k])); });
  console.error(`cek model JS vs sklearn (2000 sampel): selisih maks ${mx.toExponential(2)}`);
  if (mx > 1e-9) { console.error("MODEL JS TIDAK SAMA. Berhenti."); process.exit(1); }
}

const pools = new Map();
for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.trim().split(",");
  const m = { id: p[0].toLowerCase(), c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), fee: +p[3], hooks: p[5].toLowerCase(), init: +p[6] };
  if (safe(m) && m.init >= fromInit && m.init + (AUD.hz || HZ) <= endBlk) pools.set(m.id, m);
}
const liq = new Map();
for (const line of fs.readFileSync(path.join(DIR, "liq.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = line.trim().split(","); const pid = p[0].toLowerCase();
  if (!pools.has(pid)) continue;
  if (!liq.has(pid)) liq.set(pid, []);
  liq.get(pid).push({ blk: +p[1], li: +p[2], d: BigInt(p[5]) });
}
console.error(`pool lolos saringan & horizon lengkap: ${pools.size}`);

let ethSeries = null;
async function loadEth(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const s = [];
  for await (const line of rl) {
    if (!line.startsWith(ETH_POOL)) continue;
    const p = line.split(","); const sp = Number(p[6]) / Q96;
    s.push([+p[1], sp * sp * 1e12]);
  }
  return s.sort((a, b) => a[0] - b[0]);
}
const ethAt = blk => {
  if (!ethSeries || !ethSeries.length) return fixedEth;
  let lo = 0, hi = ethSeries.length - 1, ans = ethSeries[0][1];
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ethSeries[mid][0] <= blk) { ans = ethSeries[mid][1]; lo = mid + 1; } else hi = mid - 1; }
  return ans;
};

const out = fs.createWriteStream(OUTP + ".trades.jsonl");
const evOut = fs.createWriteStream(OUTP + ".events.jsonl");
const snOut = fs.createWriteStream(OUTP + ".snaps.jsonl");
const mtmOut = fs.createWriteStream(OUTP + ".mtm.jsonl");
let nTrades = 0, nPools = 0, nSnap = 0;
function runPool(m, sw) {
  sw.sort((a, b) => a.blk - b.blk || a.li - b.li);
  const lq = (liq.get(m.id) || []).sort((a, b) => a.blk - b.blk || a.li - b.li);
  const hz = AUD.hz ? AUD.hz : (AUD.noCap ? endBlk - m.init : HZ);
  const opt = { modelUp, ethUsd: ETH === "auto" ? ethAt(m.init) : fixedEth, model, latb: AUD.latb ?? 30, strictSnap: AUD.strictSnap, entryLat: AUD.entryLat, keepNoAfter: AUD.keepNoAfter, lpAdjust: AUD.lpAdjust, pdMode: AUD.pdMode, pdPool: AUD.pdMode ? pdPool : null, gasUsd: AUD.gasUsd, approveUsd: AUD.approveUsd, failBuy: AUD.failBuy, failSell: AUD.failSell, worstOrder: AUD.worstOrder,
    hz, staleMin: AUD.staleMin, quietMin: AUD.quietMin, fillOnTime: AUD.fillOnTime, quietAll: AUD.quietAll,
    onTrade: t => { out.write(JSON.stringify(t) + "\n"); nTrades++; } };
  // ---- opsi tambahan (tidak ada di replay.js) ----
  for (const k of ["rugExit", "warnTick", "trail", "trailPre", "dumpFrac", "tpLadder", "armAt", "armTrail", "armDump", "sellImpact", "sellLast", "plans", "maxUsd", "lpFrac", "minUsd"])
    if (EX[k] !== undefined) opt[k] = EX[k];
  if (EX.nonce) opt.nonce = { [m.id]: { e: Math.floor(h32(m.id + "|ne") * 4) * 5, t: Math.floor(h32(m.id + "|nt") * 3) * 7, x: Math.floor(h32(m.id + "|nx") * 3) * 4 } };
  if (EX.gate) opt.gate = sim => { const h = h32(sim.m.id + "|gate"); return h < 0.25 ? false : (h < 0.4 && !sim._g ? (sim._g = 1, null) : true); };
  if (EX.sizeFn) opt.sizeFn = (lp, mm) => Math.min(150, 0.02 * lp) * (mm.fee > 3000 ? 0.5 : 1);
  if (EX.events) opt.onEvent = e => evOut.write(JSON.stringify(e) + "\n");
  if (EX.snaps) opt.onSnap = s => snOut.write(JSON.stringify(s) + "\n");
  const sim = new PoolSim(m, opt);
  const mtm = blk => { if (!EX.mtm) return; for (const p of sim.plans) { const v = sim.nilaiSekarang(p.name); if (v !== null) mtmOut.write(JSON.stringify({ pool: m.id, blk, plan: p.name, v }) + "\n"); } };
  let i = 0, j = 0;
  const lim = m.init + hz;
  while (i < sw.length || j < lq.length) {
    const bi = i < sw.length ? sw[i].blk : Infinity, bj = j < lq.length ? lq[j].blk : Infinity;
    const blk = Math.min(bi, bj);
    if (blk > lim) break;
    for (let d = sim.nextDeadline(), g = 0; d < blk && d <= lim && g < 50; d = sim.nextDeadline(), g++) sim.tick(d);
    const L = [], S = [];
    while (j < lq.length && lq[j].blk === blk) L.push(lq[j++].d);
    while (i < sw.length && sw[i].blk === blk) S.push(sw[i++]);
    sim.processBlock(blk, L, S);
    mtm(blk);
    if (sim.allDone()) break;
  }
  for (let d = sim.nextDeadline(), g = 0; d <= lim && !sim.allDone() && g < 50; d = sim.nextDeadline(), g++) sim.tick(d);
  sim.finalize(); nPools++; nSnap += sim.nSnap;
}

(async () => {
  const swapFile = fs.existsSync(path.join(DIR, "swaps_sorted.csv")) ? path.join(DIR, "swaps_sorted.csv") : path.join(DIR, "swaps.csv");
  if (ETH === "auto") { ethSeries = await loadEth(swapFile); console.error(`harga ETH historis: ${ethSeries.length} titik`); }
  const rl = readline.createInterface({ input: fs.createReadStream(swapFile), crlfDelay: Infinity });
  let cur = null, sw = [];
  for await (const line of rl) {
    if (!line) continue;
    const pid = line.slice(0, line.indexOf(",")).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) { if (cur && pools.has(cur)) runPool(pools.get(cur), sw); cur = pid; sw = []; }
    if (!pools.has(pid)) continue;
    const p = line.split(",");
    sw.push({ blk: +p[1], li: +p[2], tx: p[3], a0: +p[4], a1: +p[5], sqrtP: Number(p[6]) / Q96, L: Number(p[7]), fee: +p[9] });
  }
  if (cur && pools.has(cur)) runPool(pools.get(cur), sw);
  out.end(); evOut.end(); snOut.end(); mtmOut.end();
  console.error(`SELESAI: pool ${nPools} | trade ${nTrades} | potret model ${nSnap}`);
})();
