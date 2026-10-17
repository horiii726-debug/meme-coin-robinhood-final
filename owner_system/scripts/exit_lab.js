// LAB ATURAN EXIT — menguji exit DINAMIS berbasis momentum arus beli,
// bukan cuma trailing stop tetap. Streaming per pool (hemat memori).
// Ide: tahan selama tenaga beli masih ada; keluar saat tenaganya habis.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "ds24s";
const SORTED = path.join(DIR, "swaps_sorted.csv");
const LAT = 600, HZ = 36000, SIZE_USD = 200, MAX_FRAC = 0.01, GAS = 0.02;
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

// --- aturan exit yang diuji ---
const RULES = {
  "trail-50% 15mnt":        { trail: 0.50, maxB: 9000 },
  "trail-50% 60mnt":        { trail: 0.50, maxB: 36000 },
  "momentum 40% 60mnt":     { mom: 0.40, maxB: 36000 },
  "momentum 25% 60mnt":     { mom: 0.25, maxB: 36000 },
  "momentum 40% + trail-60%": { mom: 0.40, trail: 0.60, maxB: 36000 },
  "momentum 25% + trail-70%": { mom: 0.25, trail: 0.70, maxB: 36000 },
  "flow-negatif 60mnt":     { flowNeg: true, maxB: 36000 },
  "flow-negatif + trail-60%": { flowNeg: true, trail: 0.60, maxB: 36000 },
};

(async () => {
  const pools = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    const c0 = p[1].toLowerCase(), c1 = p[2].toLowerCase(), hooks = p[5].toLowerCase();
    if (hooks === NATIVE) continue;                       // screen struktural
    if (c0 !== NATIVE && c1 !== NATIVE) continue;
    const bits = BigInt(hooks) & 0x3fffn;
    if (Number((bits >> 7n) & 1n) === 1) continue;        // beforeSwap aktif -> lewati
    pools.set(p[0].toLowerCase(), { c0, c1, hooks, init: +p[6] });
  }
  console.error(`pool lolos screen struktural: ${pools.size}`);

  const rugBlk = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "liq.csv")), crlfDelay: Infinity });
    let first = true; const cum = new Map();
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(","); const pid = p[0].toLowerCase(); if (!pools.has(pid)) continue;
      const c = cum.get(pid) || { a: 0n, r: 0n };
      const d = BigInt(p[5]);
      if (d > 0n) c.a += d; else c.r += -d;
      cum.set(pid, c);
      if (!rugBlk.has(pid) && c.a > 0n && c.r * 100n / c.a > 80n) rugBlk.set(pid, +p[1]);
    }
  }

  const results = {};
  for (const k of Object.keys(RULES)) results[k] = [];

  function run(pid, rows) {
    const m = pools.get(pid); if (!m) return;
    rows.sort((a, b) => a.blk - b.blk);
    const all = rows.filter(x => x.blk <= m.init + HZ);
    if (all.length < 3) return;
    const qIsC1 = m.c1 === NATIVE;
    const usdPer = ethUsd;
    const toUsd = r => (Math.abs(r) / 1e18) * usdPer;
    const baseAmt = x => qIsC1 ? x.a0 : x.a1;
    const quoteAmt = x => qIsC1 ? x.a1 : x.a0;
    const ei = all.findIndex(x => x.blk >= m.init + LAT);
    if (ei < 0 || ei >= all.length - 1) return;
    const e = all[ei];
    const lpE = 2 * toUsd(qIsC1 ? e.L * e.sqrtP : e.L / e.sqrtP);
    const size = Math.min(SIZE_USD, MAX_FRAC * lpE);
    if (!isFinite(size) || size <= 0.5) return;
    const dIn = (size / usdPer) * 1e18 * (1 - e.fee / 1e6);
    let base;
    if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
    else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
    if (!isFinite(base) || base <= 0) return;
    const sellUsd = x => {
      const bIn = base * (1 - x.fee / 1e6);
      let recv;
      if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; recv = x.L * (x.sqrtP - 1 / inv); }
      else { const spb = x.sqrtP + bIn / x.L; recv = x.L * (1 / x.sqrtP - 1 / spb); }
      return (!isFinite(recv) || recv <= 0) ? 0 : toUsd(recv);
    };
    const after = all.slice(ei + 1);
    if (!after.length) return;
    const rb = rugBlk.get(pid);

    for (const [name, R] of Object.entries(RULES)) {
      // momentum = volume beli bersih per 600 blok, dibandingkan puncaknya
      let peakV = size, peakFlow = 0, trig = -1;
      const WIN = 600;
      for (let i = 0; i < after.length; i++) {
        const x = after[i];
        const v = sellUsd(x);
        if (v > peakV) peakV = v;
        // arus beli dalam 600 blok terakhir
        let bf = 0, sf = 0;
        for (let j = i; j >= 0 && x.blk - after[j].blk <= WIN; j--) {
          const u = toUsd(quoteAmt(after[j]));
          if (baseAmt(after[j]) > 0) bf += u; else sf += u;
        }
        const net = bf - sf;
        if (net > peakFlow) peakFlow = net;
        if (R.maxB && x.blk - e.blk >= R.maxB) { trig = i; break; }
        if (R.trail && v <= peakV * (1 - R.trail) && peakV > size) { trig = i; break; }
        if (R.mom && peakFlow > 0 && net < peakFlow * R.mom && x.blk - e.blk > WIN) { trig = i; break; }
        if (R.flowNeg && net < 0 && x.blk - e.blk > WIN) { trig = i; break; }
      }
      const xi = trig < 0 ? after.length - 1 : Math.min(trig + 1, after.length - 1);
      const intended = trig < 0 ? (m.init + HZ) : after[xi].blk;
      const proceeds = (rb !== undefined && rb <= intended) ? 0 : sellUsd(after[xi]);
      results[name].push({ ret: (proceeds - GAS * 2) / size, size });
    }
  }

  const rl = readline.createInterface({ input: fs.createReadStream(SORTED), crlfDelay: Infinity });
  let cur = null, rows = [];
  for await (const line of rl) {
    if (!line) continue;
    const i1 = line.indexOf(",");
    const pid = line.slice(0, i1).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) { if (cur && pools.has(cur)) run(cur, rows); cur = pid; rows = []; }
    if (!pools.has(pid)) continue;
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    rows.push({ blk: +p[1], a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
  }
  if (cur && pools.has(cur)) run(cur, rows);

  console.log("\n" + "=".repeat(94));
  console.log("LAB EXIT — masuk menit-1, screen struktural, entry $200 / 1% TVL");
  console.log("=".repeat(94));
  console.log("aturan exit".padEnd(28) + "  n   MENANG  rata2  >=+100% >=+400% >=+1000%   PnL     per-trade  top1%");
  console.log("-".repeat(94));
  for (const [name, tr] of Object.entries(results)) {
    if (!tr.length) continue;
    const r = tr.map(t => t.ret);
    const inv = tr.reduce((s, t) => s + t.size, 0);
    const got = tr.reduce((s, t) => s + t.ret * t.size, 0);
    const prof = tr.map(t => (t.ret - 1) * t.size).sort((a, b) => b - a);
    const pos = prof.filter(x => x > 0).reduce((s, x) => s + x, 0) || 1;
    console.log(name.padEnd(28) + String(tr.length).padStart(5)
      + (100 * r.filter(x => x > 1).length / r.length).toFixed(1).padStart(7) + "%"
      + (100 * (r.reduce((s, x) => s + x, 0) / r.length - 1)).toFixed(0).padStart(6) + "%"
      + (100 * r.filter(x => x >= 2).length / r.length).toFixed(1).padStart(8) + "%"
      + (100 * r.filter(x => x >= 5).length / r.length).toFixed(1).padStart(7) + "%"
      + (100 * r.filter(x => x >= 11).length / r.length).toFixed(1).padStart(8) + "%"
      + ("$" + (got - inv).toFixed(0)).padStart(9)
      + ("$" + ((got - inv) / tr.length).toFixed(2)).padStart(11)
      + (100 * Math.max(prof[0], 0) / pos).toFixed(0).padStart(6) + "%");
  }
})();
