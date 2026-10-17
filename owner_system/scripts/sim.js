// FASE 3 — SIMULASI ROUND-TRIP yang benar-benar bisa dieksekusi.
// Beli sejumlah quote di entry, lalu di TIAP titik waktu hitung berapa quote yang
// benar-benar didapat kalau posisi itu DIJUAL saat itu (slippage + fee pada L saat itu).
// Harga yang tidak bisa dijual otomatis tidak pernah muncul sebagai profit.
//
// Identitas yang dipakai (sudah divalidasi 97.6% di 31.261 swap):
//   quote=token1: beli dy -> dSqrtP = dy/L ; base keluar dx = L*(1/sqrtP0 - 1/sqrtP1)
//   quote=token0: beli dx -> d(1/sqrtP) = dx/L ; base keluar dy = L*(sqrtP0 - sqrtP1)
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);

const DIR = process.argv[2] || "dsp";
const LAT = parseInt(process.env.LAT || "30", 10);        // 30 blok = 3 dtk jeda deteksi->eksekusi
const HORIZON = parseInt(process.env.HZ || "216000", 10); // 6 jam
const MAX_USD = parseFloat(process.env.SIZE || "200");    // target size per posisi
const MAX_FRAC = 0.01;                                    // maks 1% TVL -> slippage ~2%
const GAS_USD = parseFloat(process.env.GAS || "0.02");    // gas L2 per sisi
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

(async () => {
  const pools = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "pools.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const [pid, c0, c1, fee, ts, hooks, init] = line.split(",");
      pools.set(pid.toLowerCase(), { c0: c0.toLowerCase(), c1: c1.toLowerCase(), fee: +fee, hooks: hooks.toLowerCase(), init: +init });
    }
  }
  const series = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(",");
      const pid = p[0].toLowerCase();
      const m = pools.get(pid); if (!m) continue;
      const blk = +p[1];
      if (blk > m.init + HORIZON) continue;
      const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
      if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
      if (!series.has(pid)) series.set(pid, []);
      series.get(pid).push({ blk, sqrtP, L, fee: +p[9] });
    }
  }
  const liq = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "liq.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(","); const pid = p[0].toLowerCase();
      if (!pools.has(pid)) continue;
      const d = BigInt(p[5]); const e = liq.get(pid) || { add: 0n, rem: 0n };
      if (d > 0n) e.add += d; else e.rem += -d;
      liq.set(pid, e);
    }
  }

  const out = fs.createWriteStream(path.join(DIR, "sim.csv"));
  out.write("pool_id,quote,hooks,init_block,n_swap,size_usd,lp_entry_usd,lp_peak_usd," +
            "best_mult,best_block,best_lag,end_mult,dip_mult,dip_block,post_dip_mult,liq_rem_frac,med_fee\n");

  let written = 0, skipped = 0;
  for (const [pid, m] of pools) {
    const s = (series.get(pid) || []).sort((a, b) => a.blk - b.blk);
    if (s.length < 3) { skipped++; continue; }
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else { skipped++; continue; }
    const quote = qIsC1 ? m.c1 : m.c0;
    const usdPer = quote === USDG ? 1 : ethUsd;
    const qdec = QDEC[quote];
    const toUsd = raw => (raw / Math.pow(10, qdec)) * usdPer;
    const fromUsd = usd => (usd / usdPer) * Math.pow(10, qdec);

    const ei = s.findIndex(x => x.blk >= m.init + LAT);
    if (ei < 0) { skipped++; continue; }
    const e = s[ei];

    // cadangan quote (tervalidasi): qIsC1 -> L*sqrtP ; else L/sqrtP
    const qReserve = x => qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP;
    const lpUsd = x => 2 * toUsd(qReserve(x));
    const lpEntry = lpUsd(e);
    if (!isFinite(lpEntry) || lpEntry <= 0) { skipped++; continue; }

    // size dibatasi 1% TVL (slippage ~2%)
    const sizeUsd = Math.min(MAX_USD, MAX_FRAC * lpEntry);
    if (sizeUsd <= 0.5) { skipped++; continue; }
    const feeE = e.fee / 1e6;
    const dIn = fromUsd(sizeUsd) * (1 - feeE);      // quote masuk setelah fee

    // BELI
    let base, sp1;
    if (qIsC1) { sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
    else       { const inv = 1 / e.sqrtP + dIn / e.L; sp1 = 1 / inv; base = e.L * (e.sqrtP - sp1); }
    if (!isFinite(base) || base <= 0) { skipped++; continue; }

    // JUAL di tiap titik -> berapa quote nyata yang didapat
    const sellUsd = x => {
      const f = x.fee / 1e6;
      const bIn = base * (1 - f);
      let recv;
      if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; const spb = 1 / inv; recv = x.L * (x.sqrtP - spb); }
      else       { const spb = x.sqrtP + bIn / x.L; recv = x.L * (1 / x.sqrtP - 1 / spb); }
      if (!isFinite(recv) || recv <= 0) return 0;
      return toUsd(recv);
    };

    const after = s.slice(ei + 1);
    if (!after.length) { skipped++; continue; }
    let best = 0, bestBlk = e.blk, lpPeak = lpEntry;
    for (const x of after) {
      const v = sellUsd(x);
      if (v > best) { best = v; bestBlk = x.blk; }
      const lp = lpUsd(x); if (isFinite(lp) && lp > lpPeak) lpPeak = lp;
    }
    const endUsd = sellUsd(after[after.length - 1]);

    // pola dip dalam 1 jam pertama (berbasis nilai jual, bukan harga mentah)
    const oneHour = 36000;
    let dipV = Infinity, dipBlk = e.blk, dipI = 0;
    after.forEach((x, i) => { if (x.blk - e.blk > oneHour) return; const v = sellUsd(x); if (v < dipV) { dipV = v; dipBlk = x.blk; dipI = i; } });
    let postDip = dipV;
    for (let i = dipI; i < after.length; i++) { const v = sellUsd(after[i]); if (v > postDip) postDip = v; }

    const net = u => (u - GAS_USD * 2) / sizeUsd;   // multiple bersih setelah gas 2 sisi
    const lo = liq.get(pid) || { add: 0n, rem: 0n };
    const remFrac = lo.add > 0n ? Number(lo.rem * 10000n / lo.add) / 10000 : 0;
    const fees = after.map(x => x.fee).sort((a, b) => a - b);

    out.write([pid, quote, m.hooks, m.init, after.length, sizeUsd.toFixed(2),
      lpEntry.toFixed(0), lpPeak.toFixed(0),
      net(best).toFixed(4), bestBlk, bestBlk - e.blk, net(endUsd).toFixed(4),
      (dipV === Infinity ? 1 : net(dipV)).toFixed(4), dipBlk, net(postDip).toFixed(4),
      remFrac.toFixed(4), fees[Math.floor(fees.length / 2)]].join(",") + "\n");
    written++;
  }
  out.end();
  console.error(`simulasi ditulis: ${written} | dilewati: ${skipped}`);
})();
