// FASE 3 — trajektori + label 4 kelas.
// Harga relatif saja (desimal token base tidak perlu, karena return itu rasio).
// Entry realistis: swap pertama SETELAH jeda deteksi (latency), bukan harga init.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);

const DIR = process.argv[2] || "ds24";
const LAT_BLOCKS = parseInt(process.env.LAT || "30", 10);   // 30 blok = 3 detik jeda deteksi->eksekusi
const HORIZON = parseInt(process.env.HZ || "216000", 10);   // 216000 blok = 6 jam
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

(async () => {
  // ---- pools ----
  const pools = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "pools.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const [pid, c0, c1, fee, ts, hooks, initBlock] = line.split(",");
      pools.set(pid.toLowerCase(), { c0: c0.toLowerCase(), c1: c1.toLowerCase(),
        fee: +fee, ts: +ts, hooks: hooks.toLowerCase(), init: +initBlock });
    }
  }
  console.error(`pools: ${pools.size}`);

  // ---- swaps per pool (hanya pool yang kita kenal) ----
  const series = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps.csv")), crlfDelay: Infinity });
    let first = true, n = 0;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(",");
      const pid = p[0].toLowerCase();
      const meta = pools.get(pid);
      if (!meta) continue;
      const blk = +p[1];
      if (blk > meta.init + HORIZON) continue;
      if (!series.has(pid)) series.set(pid, []);
      series.get(pid).push({
        blk, tx: p[3], a0: +p[4], a1: +p[5],
        sqrtP: Number(p[6]) / Q96, L: Number(p[7]), fee: +p[9],
      });
      n++;
    }
    console.error(`swaps terpakai: ${n}`);
  }

  // ---- likuiditas ditarik? (deteksi rug) ----
  const liqOut = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "liq.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(",");
      const pid = p[0].toLowerCase();
      if (!pools.has(pid)) continue;
      const d = BigInt(p[5]);
      const e = liqOut.get(pid) || { add: 0n, rem: 0n };
      if (d > 0n) e.add += d; else e.rem += -d;
      liqOut.set(pid, e);
    }
  }

  const out = fs.createWriteStream(path.join(DIR, "trajectories.csv"));
  out.write("pool_id,quote,fee_init,hooks,init_block,n_swap,entry_block,lag_blocks," +
            "peak_mult,peak_block,end_mult,max_dd_after_peak,min_mult_before_peak," +
            "dip_min_mult,dip_block,post_dip_mult,lp_peak_usd,lp_entry_usd,liq_rem_frac,med_fee\n");

  let written = 0;
  for (const [pid, meta] of pools) {
    const s = (series.get(pid) || []).sort((a, b) => a.blk - b.blk);
    if (s.length < 2) continue;
    let quote = null, qIsC1 = null;
    if (QDEC[meta.c1] !== undefined) { quote = meta.c1; qIsC1 = true; }
    else if (QDEC[meta.c0] !== undefined) { quote = meta.c0; qIsC1 = false; }
    if (!quote) continue;
    const usd = quote === USDG ? 1 : ethUsd;
    const qdec = QDEC[quote];

    const relPrice = x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP);
    const lpUsd = x => 2 * ((qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP) / Math.pow(10, qdec)) * usd;

    // entry = swap pertama pada/ setelah init+latency
    const entryIdx = s.findIndex(x => x.blk >= meta.init + LAT_BLOCKS);
    if (entryIdx < 0) continue;
    const e = s[entryIdx];
    const p0 = relPrice(e);
    if (!isFinite(p0) || p0 <= 0) continue;

    const after = s.slice(entryIdx);
    let peak = 1, peakBlk = e.blk, peakI = 0;
    after.forEach((x, i) => { const m = relPrice(x) / p0; if (isFinite(m) && m > peak) { peak = m; peakBlk = x.blk; peakI = i; } });
    const endM = relPrice(after[after.length - 1]) / p0;

    let minBefore = Infinity;
    for (let i = 0; i <= peakI; i++) { const m = relPrice(after[i]) / p0; if (m < minBefore) minBefore = m; }
    let ddAfter = 0;
    for (let i = peakI; i < after.length; i++) { const m = relPrice(after[i]) / p0; const dd = 1 - m / peak; if (dd > ddAfter) ddAfter = dd; }

    // pola dip: titik terendah dalam 1 jam pertama, lalu berapa jauh pulih
    const oneHour = 36000;
    let dipM = Infinity, dipBlk = e.blk, dipI = 0;
    after.forEach((x, i) => { if (x.blk - e.blk > oneHour) return; const m = relPrice(x) / p0; if (m < dipM) { dipM = m; dipBlk = x.blk; dipI = i; } });
    let postDip = dipM;
    for (let i = dipI; i < after.length; i++) { const m = relPrice(after[i]) / p0; if (m > postDip) postDip = m; }

    let lpPeak = 0;
    for (const x of after) { const v = lpUsd(x); if (isFinite(v) && v > lpPeak) lpPeak = v; }
    const lpEntry = lpUsd(e);

    const lo = liqOut.get(pid) || { add: 0n, rem: 0n };
    const remFrac = lo.add > 0n ? Number(lo.rem * 10000n / lo.add) / 10000 : 0;
    const fees = after.map(x => x.fee).sort((a, b) => a - b);
    const medFee = fees[Math.floor(fees.length / 2)];

    out.write([pid, quote, meta.fee, meta.hooks, meta.init, after.length, e.blk, e.blk - meta.init,
      peak.toFixed(4), peakBlk, endM.toFixed(4), ddAfter.toFixed(4), (minBefore === Infinity ? 1 : minBefore).toFixed(4),
      (dipM === Infinity ? 1 : dipM).toFixed(4), dipBlk, postDip.toFixed(4),
      lpPeak.toFixed(0), lpEntry.toFixed(0), remFrac.toFixed(4), medFee].join(",") + "\n");
    written++;
  }
  out.end();
  console.error(`trajektori ditulis: ${written}`);
})();
