// 100+ koin yang NAIK >=1000% SECARA NYATA (bisa dicairkan, bukan harga di grafik).
// Lalu: apa persamaan mereka di JAM PERTAMA?
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "dsh";
const HOUR = 36000, MIN_FOLLOW = 2 * HOUR;
const SIZE_USD = 200, MAX_FRAC = 0.01;
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

(async () => {
  const pools = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(),
      fee: +p[3], hook: p[5].toLowerCase(), init: +p[6] });
  }
  const rows = [];
  function flush(pid, sw) {
    const m = pools.get(pid); if (!m || sw.length < 3) return;
    sw.sort((a, b) => a.blk - b.blk);
    if (sw[sw.length - 1].blk - m.init < MIN_FOLLOW) return;
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else return;
    const quote = qIsC1 ? m.c1 : m.c0, qdec = QDEC[quote];
    const usdPer = quote === USDG ? 1 : ethUsd;
    const toUsd = r => (Math.abs(r) / Math.pow(10, qdec)) * usdPer;
    const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
    const baseAmt = x => qIsC1 ? x.a0 : x.a1;
    const quoteAmt = x => qIsC1 ? x.a1 : x.a0;
    // entry di menit-1
    const ei = sw.findIndex(x => x.blk >= m.init + 600);
    if (ei < 0 || ei >= sw.length - 1) return;
    const e = sw[ei];
    const lpE = lpUsd(e);
    const size = Math.min(SIZE_USD, MAX_FRAC * lpE);
    if (!isFinite(size) || size <= 0.5) return;
    const dIn = (size / usdPer) * Math.pow(10, qdec) * (1 - e.fee / 1e6);
    let base;
    if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
    else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
    if (!isFinite(base) || base <= 0) return;
    let best = 0, bestBlk = e.blk, lpPeak = lpE;
    for (const x of sw.slice(ei + 1)) {
      const bIn = base * (1 - x.fee / 1e6);
      let recv;
      if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; recv = x.L * (x.sqrtP - 1 / inv); }
      else { const spb = x.sqrtP + bIn / x.L; recv = x.L * (1 / x.sqrtP - 1 / spb); }
      if (isFinite(recv) && recv > 0) { const v = toUsd(recv); if (v > best) { best = v; bestBlk = x.blk; } }
      const lp = lpUsd(x); if (isFinite(lp) && lp > lpPeak) lpPeak = lp;
    }
    // ciri JAM PERTAMA (jam 0)
    const h0 = sw.filter(x => x.blk < m.init + HOUR);
    const b0 = h0.filter(x => baseAmt(x) > 0), s0 = h0.filter(x => baseAmt(x) < 0);
    const bv = b0.reduce((a, x) => a + toUsd(quoteAmt(x)), 0);
    const sv = s0.reduce((a, x) => a + toUsd(quoteAmt(x)), 0);
    const tx = new Set(h0.map(x => x.tx)).size;
    rows.push({ pid, mult: best / size, bestLagH: (bestBlk - e.blk) / HOUR,
      lpEntry: lpE, lpPeak, hook: m.hook !== NATIVE, fee: m.fee, size,
      n0: h0.length, b0: b0.length, s0: s0.length, bv, sv, tx0: tx,
      lag: sw[0].blk - m.init, quoteEth: quote !== USDG });
  }

  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps_sorted.csv")), crlfDelay: Infinity });
  let cur = null, sw = [];
  for await (const line of rl) {
    if (!line) continue;
    const i1 = line.indexOf(",");
    const pid = line.slice(0, i1).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) { if (cur) flush(cur, sw); cur = pid; sw = []; }
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    sw.push({ blk: +p[1], tx: p[3], a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
  }
  if (cur) flush(cur, sw);

  const W = rows.filter(r => r.mult >= 11);
  const F = rows.filter(r => r.mult < 1.3);
  console.log(`pool dinilai: ${rows.length} | NAIK >=+1000% (bisa dicairkan): ${W.length} | gagal: ${F.length}`);
  const med = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const money = v => "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

  console.log("\n" + "=".repeat(86));
  console.log("PERSAMAAN KOIN >= +1000%  (n=" + W.length + ")  vs  KOIN GAGAL  (n=" + F.length + ")");
  console.log("=".repeat(86));
  const cmp = [
    ["swap di jam-0", r => r.n0], ["pembelian jam-0", r => r.b0], ["penjualan jam-0", r => r.s0],
    ["tx unik jam-0", r => r.tx0], ["volume beli jam-0", r => r.bv], ["volume jual jam-0", r => r.sv],
    ["LP saat entry", r => r.lpEntry], ["LP puncak", r => r.lpPeak],
    ["jeda swap pertama (blok)", r => r.lag], ["fee (1e-6)", r => r.fee],
    ["size bisa masuk", r => r.size], ["jam ke puncak", r => r.bestLagH],
  ];
  console.log("ciri".padEnd(28) + "PEMENANG".padStart(16) + "GAGAL".padStart(16) + "   rasio");
  console.log("-".repeat(86));
  for (const [name, f] of cmp) {
    const a = med(W.map(f)), b = med(F.map(f));
    console.log(name.padEnd(28) + (a > 999 ? money(a) : a.toFixed(2)).padStart(16)
      + (b > 999 ? money(b) : b.toFixed(2)).padStart(16)
      + ("  " + (b ? (a / b).toFixed(1) + "x" : "-")).padStart(9));
  }
  const pctH = S => (100 * S.filter(r => r.hook).length / Math.max(S.length, 1)).toFixed(1);
  const pctE = S => (100 * S.filter(r => r.quoteEth).length / Math.max(S.length, 1)).toFixed(1);
  console.log("punya hook (%)".padEnd(28) + (pctH(W) + "%").padStart(16) + (pctH(F) + "%").padStart(16));
  console.log("pasangan ETH (%)".padEnd(28) + (pctE(W) + "%").padStart(16) + (pctE(F) + "%").padStart(16));

  console.log("\n" + "=".repeat(86));
  console.log("20 PEMENANG TERBESAR");
  console.log("=".repeat(86));
  console.log("pool".padEnd(20) + "naik".padStart(12) + "LP entry".padStart(12) + "size".padStart(9) + "swap_j0".padStart(9) + "jam_puncak".padStart(12) + "  hook");
  W.sort((a, b) => b.mult - a.mult).slice(0, 20).forEach(r =>
    console.log(r.pid.slice(0, 18).padEnd(20)
      + ("+" + ((r.mult - 1) * 100).toLocaleString("en-US", { maximumFractionDigits: 0 }) + "%").padStart(12)
      + money(r.lpEntry).padStart(12) + money(r.size).padStart(9)
      + String(r.n0).padStart(9) + r.bestLagH.toFixed(1).padStart(12) + "  " + (r.hook ? "ya" : "-")));
})();
