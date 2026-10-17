// ATH: dari koin LAHIR sampai puncak tertinggi.
// Dua ukuran:
//  (a) harga mentah  -> berapa % naik di grafik
//  (b) NILAI JUAL nyata -> berapa yang benar-benar bisa dicairkan (slippage+fee)
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "ds24";
const LAT = parseInt(process.env.LAT || "10", 10);      // 10 blok = 1 detik
const HZ = parseInt(process.env.HZ || "216000", 10);    // 6 jam
const SIZE_USD = 200, MAX_FRAC = 0.01;
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

(async () => {
  const pools = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), hooks: p[5].toLowerCase(), init: +p[6] });
  }
  const sw = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps.csv")), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    if (!line) continue;
    const p = line.split(",");
    const pid = p[0].toLowerCase(); const m = pools.get(pid); if (!m) continue;
    const blk = +p[1]; if (blk > m.init + HZ) continue;
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    if (!sw.has(pid)) sw.set(pid, []);
    sw.get(pid).push({ blk, sqrtP, L, fee: +p[9] });
  }

  const rawA = [], netA = [], tA = [], hookRaw = [], hookNet = [];
  for (const [pid, m] of pools) {
    const s = (sw.get(pid) || []).sort((a, b) => a.blk - b.blk);
    if (s.length < 2) continue;
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else continue;
    const quote = qIsC1 ? m.c1 : m.c0;
    const usdPer = quote === USDG ? 1 : ethUsd;
    const qdec = QDEC[quote];
    const toUsd = r => (Math.abs(r) / Math.pow(10, qdec)) * usdPer;
    const rel = x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP);

    const ei = s.findIndex(x => x.blk >= m.init + LAT);
    if (ei < 0 || ei >= s.length - 1) continue;
    const e = s[ei];
    const p0 = rel(e); if (!isFinite(p0) || p0 <= 0) continue;

    // (a) harga mentah
    const after = s.slice(ei + 1);
    let peakRaw = 1, peakBlk = e.blk;
    for (const x of after) { const r = rel(x) / p0; if (isFinite(r) && r > peakRaw) { peakRaw = r; peakBlk = x.blk; } }

    // (b) nilai jual nyata
    const lpE = 2 * toUsd(qIsC1 ? e.L * e.sqrtP : e.L / e.sqrtP);
    const size = Math.min(SIZE_USD, MAX_FRAC * lpE);
    let peakNet = null;
    if (isFinite(size) && size > 0.5) {
      const dIn = (size / usdPer) * Math.pow(10, qdec) * (1 - e.fee / 1e6);
      let base;
      if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
      else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
      if (isFinite(base) && base > 0) {
        let best = 0;
        for (const x of after) {
          const bIn = base * (1 - x.fee / 1e6);
          let recv;
          if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; recv = x.L * (x.sqrtP - 1 / inv); }
          else { const spb = x.sqrtP + bIn / x.L; recv = x.L * (1 / x.sqrtP - 1 / spb); }
          if (isFinite(recv) && recv > 0) { const v = toUsd(recv); if (v > best) best = v; }
        }
        peakNet = best / size;
      }
    }
    rawA.push(peakRaw);
    tA.push(peakBlk - e.blk);
    if (peakNet !== null && isFinite(peakNet)) {
      netA.push(peakNet);
      if (m.hooks !== NATIVE) { hookRaw.push(peakRaw); hookNet.push(peakNet); }
    }
  }

  const pct = (a, q) => { const t = [...a].sort((x, y) => x - y); return t.length ? t[Math.min(t.length-1, Math.floor(q*t.length))] : NaN; };
  const tab = (a, label) => {
    console.log(`\n${label}  (n=${a.length})`);
    console.log("  p50 " + pct(a,.5).toFixed(2) + "x   p75 " + pct(a,.75).toFixed(2) + "x   p90 " + pct(a,.9).toFixed(2)
      + "x   p95 " + pct(a,.95).toFixed(2) + "x   p99 " + pct(a,.99).toFixed(2) + "x   max " + Math.max(...a).toFixed(1) + "x");
    for (const th of [2, 3, 6, 11, 21, 51, 101]) {
      const c = a.filter(x => x >= th).length;
      console.log(`    >= +${((th-1)*100).toLocaleString()}%`.padEnd(22) + String(c).padStart(5) + "  " + (100*c/a.length).toFixed(2) + "%");
    }
  };
  console.log("=".repeat(70));
  console.log("ATH: dari koin LAHIR (+1 detik) sampai PUNCAK TERTINGGI");
  console.log("=".repeat(70));
  tab(rawA, "(a) HARGA DI GRAFIK — seperti yang dilihat di chart");
  tab(netA, "(b) NILAI YANG BENAR-BENAR BISA DICAIRKAN (posisi ~$200, sesudah slippage+fee)");
  if (hookNet.length) tab(hookNet, "(c) NILAI CAIR, hanya pool BER-HOOK");
  console.log(`\nWAKTU dari lahir ke puncak: p25 ${(pct(tA,.25)*0.1/60).toFixed(1)} mnt | p50 ${(pct(tA,.5)*0.1/60).toFixed(1)} mnt | p75 ${(pct(tA,.75)*0.1/60).toFixed(1)} mnt | p90 ${(pct(tA,.9)*0.1/60).toFixed(0)} mnt`);
  console.log("\nSelisih (a) vs (b) = biaya nyata: slippage + fee. Grafik selalu terlihat lebih indah.");
})();
