// PEMBANGUN FITUR + SIMULASI, VERSI STREAMING HEMAT MEMORI.
// Prasyarat: swaps sudah diurutkan per pool_id (lihat prep_sort.sh).
// Memori = O(satu pool), bukan O(seluruh dataset). Aman di RAM 8 GB.
// Definisi fitur & label IDENTIK dengan features.js + sim.js.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);

const DIR = process.argv[2] || "ds6d";
const SORTED = process.argv[3] || path.join(DIR, "swaps_sorted.csv");
const W = parseInt(process.env.W || "600", 10);            // jendela fitur 1 menit
const HZ = parseInt(process.env.HZ || "36000", 10);        // horizon label 1 jam (p90 puncak = 45 mnt)
const LAT = parseInt(process.env.LAT || "600", 10);        // entry di menit-1
const SIZE_USD = 200, MAX_FRAC = 0.01, GAS = 0.02;
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

(async () => {
  // ---- pools (kecil) ----
  const pools = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(),
      feeInit: +p[3], ts: +p[4], hooks: p[5].toLowerCase(), init: +p[6] });
  }
  console.error(`pools: ${pools.size}`);

  // ---- likuiditas: agregasi streaming, memori O(pools) ----
  const liq = new Map();   // pid -> {addW, remW, addP, remP, nAdd, nRem, rugBlk}
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "liq.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(",");
      const pid = p[0].toLowerCase(); const m = pools.get(pid); if (!m) continue;
      const blk = +p[1]; if (blk > m.init + HZ) continue;
      const d = BigInt(p[5]);
      const e = liq.get(pid) || { addW: 0n, remW: 0n, addP: 0n, remP: 0n, nAdd: 0, nRem: 0, cumA: 0n, cumR: 0n, rugBlk: null };
      const inW = blk <= m.init + W;
      if (d > 0n) { if (inW) { e.addW += d; e.nAdd++; } else e.addP += d; e.cumA += d; }
      else { const v = -d; if (inW) { e.remW += v; e.nRem++; } else e.remP += v; e.cumR += v; }
      if (e.rugBlk === null && e.cumA > 0n && e.cumR * 100n / e.cumA > 80n) e.rugBlk = blk;
      liq.set(pid, e);
    }
    console.error(`pool dgn event likuiditas: ${liq.size}`);
  }

  // ---- output ----
  const FCOLS = ["pool_id",
    "lp_entry_usd", "lp_end_w_usd", "lp_peak_w_usd", "lp_growth", "lp_adds_w", "lp_removes_w", "lp_rem_frac_w",
    "n_swap_w", "n_buy_w", "n_sell_w", "buy_sell_cnt_ratio",
    "buyvol_usd_w", "sellvol_usd_w", "flow_imbalance", "netflow_over_lp",
    "buy_size_med_usd", "buy_size_mean_usd", "sell_size_med_usd", "max_buy_usd", "max_buy_over_lp",
    "n_tx_w", "swaps_per_tx", "bundled_frac",
    "lag_first_swap", "gap_med_blocks", "gap_std_blocks", "swaps_per_min", "accel_2nd_half",
    "ret_w", "vol_logret_w", "maxdd_w", "up_move_frac",
    "fee_init", "fee_med_w", "fee_dynamic", "has_hook", "tick_spacing", "quote_is_usdg",
    "noise1", "noise2", "noise3",
    "y_rug", "y_dump", "best_mult_after", "end_mult_after", "lp_peak_after"];
  const fOut = fs.createWriteStream(path.join(DIR, "features.csv"));
  fOut.write(FCOLS.join(",") + "\n");
  const sOut = fs.createWriteStream(path.join(DIR, "sim.csv"));
  sOut.write("pool_id,quote,hooks,init_block,n_swap,size_usd,lp_entry_usd,lp_peak_usd,best_mult,best_block,best_lag,end_mult,liq_rem_frac,med_fee\n");

  let nF = 0, nS = 0, seen = 0;

  function flush(pid, rows) {
    const m = pools.get(pid); if (!m) return;
    seen++;
    rows.sort((a, b) => a.blk - b.blk);
    const all = rows.filter(x => x.blk <= m.init + HZ);
    if (all.length < 3) return;
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else return;
    const quote = qIsC1 ? m.c1 : m.c0, qdec = QDEC[quote];
    const usdPer = quote === USDG ? 1 : ethUsd;
    const toUsd = r => (Math.abs(r) / Math.pow(10, qdec)) * usdPer;
    const qRes = x => qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP;
    const lpUsd = x => 2 * toUsd(qRes(x));
    const baseAmt = x => qIsC1 ? x.a0 : x.a1;
    const quoteAmt = x => qIsC1 ? x.a1 : x.a0;
    const rel = x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP);

    const wEnd = m.init + W;
    const win = all.filter(x => x.blk <= wEnd);
    const post = all.filter(x => x.blk > wEnd);
    const L = liq.get(pid) || { addW: 0n, remW: 0n, addP: 0n, remP: 0n, nAdd: 0, nRem: 0, rugBlk: null };

    // ---------- FITUR (hanya `win`) ----------
    if (win.length >= 3 && post.length >= 2) {
      const lpEntry = lpUsd(win[0]), lpEndW = lpUsd(win[win.length - 1]);
      const lpPeakW = Math.max(...win.map(lpUsd).filter(isFinite));
      const buys = win.filter(x => baseAmt(x) > 0), sells = win.filter(x => baseAmt(x) < 0);
      const bUsd = buys.map(x => toUsd(quoteAmt(x))), sUsd = sells.map(x => toUsd(quoteAmt(x)));
      const buyVol = bUsd.reduce((s, x) => s + x, 0), sellVol = sUsd.reduce((s, x) => s + x, 0);
      const txSet = new Map();
      for (const x of win) txSet.set(x.tx, (txSet.get(x.tx) || 0) + 1);
      const bundled = [...txSet.values()].filter(v => v > 1).length;
      const gaps = []; for (let i = 1; i < win.length; i++) gaps.push(win[i].blk - win[i - 1].blk);
      const halfB = m.init + W / 2;
      const h1 = win.filter(x => x.blk <= halfB).length, h2 = win.length - h1;
      const rels = win.map(rel).filter(v => isFinite(v) && v > 0);
      const logrets = []; for (let i = 1; i < rels.length; i++) { const r = Math.log(rels[i] / rels[i - 1]); if (isFinite(r)) logrets.push(r); }
      let peakR = rels[0] || 1, ddW = 0;
      for (const r of rels) { if (r > peakR) peakR = r; const dd = 1 - r / peakR; if (dd > ddW) ddW = dd; }

      const totalAdd = L.addW + L.addP;
      const remFracPost = totalAdd > 0n ? Number(L.remP * 10000n / totalAdd) / 10000 : 0;
      const p0 = rels.length ? rels[rels.length - 1] : 1;
      const relsPost = post.map(rel).filter(v => isFinite(v) && v > 0);
      const bestAfter = relsPost.length ? Math.max(...relsPost) / p0 : 1;
      const endAfter = relsPost.length ? relsPost[relsPost.length - 1] / p0 : 1;
      const lpPeakAfter = Math.max(...post.map(lpUsd).filter(isFinite), 0);
      const lpEndAfter = lpUsd(post[post.length - 1]);
      const yRug = (remFracPost > 0.8 || lpEndAfter < 0.05 * lpPeakAfter) ? 1 : 0;

      fOut.write([pid, lpEntry.toFixed(0), lpEndW.toFixed(0), lpPeakW.toFixed(0),
        (lpEndW / Math.max(lpEntry, 1)).toFixed(4), L.nAdd, L.nRem,
        (L.addW > 0n ? Number(L.remW * 10000n / L.addW) / 10000 : 0).toFixed(4),
        win.length, buys.length, sells.length, (buys.length / Math.max(sells.length, 1)).toFixed(4),
        buyVol.toFixed(2), sellVol.toFixed(2),
        ((buyVol - sellVol) / Math.max(buyVol + sellVol, 1e-9)).toFixed(4),
        ((buyVol - sellVol) / Math.max(lpEntry, 1)).toFixed(4),
        med(bUsd).toFixed(2), mean(bUsd).toFixed(2), med(sUsd).toFixed(2),
        (bUsd.length ? Math.max(...bUsd) : 0).toFixed(2),
        ((bUsd.length ? Math.max(...bUsd) : 0) / Math.max(lpEntry, 1)).toFixed(4),
        txSet.size, (win.length / Math.max(txSet.size, 1)).toFixed(3), (bundled / Math.max(txSet.size, 1)).toFixed(4),
        win[0].blk - m.init, med(gaps).toFixed(1), std(gaps).toFixed(1),
        (win.length / (W * 0.1 / 60)).toFixed(3), (h2 / Math.max(h1, 1)).toFixed(4),
        (rels.length ? rels[rels.length - 1] / rels[0] : 1).toFixed(6), std(logrets).toFixed(6), ddW.toFixed(4),
        (logrets.filter(r => r > 0).length / Math.max(logrets.length, 1)).toFixed(4),
        m.feeInit, med(win.map(x => x.fee)), m.feeInit === 8388608 ? 1 : 0,
        m.hooks === NATIVE ? 0 : 1, m.ts, quote === USDG ? 1 : 0,
        Math.random().toFixed(6), Math.random().toFixed(6), Math.random().toFixed(6),
        yRug, (endAfter < 0.5) ? 1 : 0, bestAfter.toFixed(4), endAfter.toFixed(4), lpPeakAfter.toFixed(0)].join(",") + "\n");
      nF++;
    }

    // ---------- SIMULASI round-trip (entry di menit-1) ----------
    const ei = all.findIndex(x => x.blk >= m.init + LAT);
    if (ei >= 0 && ei < all.length - 1) {
      const e = all[ei];
      const lpE = lpUsd(e);
      const size = Math.min(SIZE_USD, MAX_FRAC * lpE);
      if (isFinite(size) && size > 0.5) {
        const dIn = (size / usdPer) * Math.pow(10, qdec) * (1 - e.fee / 1e6);
        let base;
        if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
        else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
        if (isFinite(base) && base > 0) {
          const sellUsd = x => {
            const bIn = base * (1 - x.fee / 1e6);
            let recv;
            if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; recv = x.L * (x.sqrtP - 1 / inv); }
            else { const spb = x.sqrtP + bIn / x.L; recv = x.L * (1 / x.sqrtP - 1 / spb); }
            return (!isFinite(recv) || recv <= 0) ? 0 : toUsd(recv);
          };
          const after = all.slice(ei + 1);
          let bestV = 0, bestBlk = e.blk, lpPeak = lpE;
          for (const x of after) { const v = sellUsd(x); if (v > bestV) { bestV = v; bestBlk = x.blk; } const lp = lpUsd(x); if (isFinite(lp) && lp > lpPeak) lpPeak = lp; }
          const endV = sellUsd(after[after.length - 1]);
          const totalAdd2 = L.addW + L.addP;
          const remFrac = totalAdd2 > 0n ? Number((L.remW + L.remP) * 10000n / totalAdd2) / 10000 : 0;
          const fees = after.map(x => x.fee).sort((a, b) => a - b);
          const net = u => (u - GAS * 2) / size;
          sOut.write([pid, quote, m.hooks, m.init, after.length, size.toFixed(2),
            lpE.toFixed(0), lpPeak.toFixed(0), net(bestV).toFixed(4), bestBlk, bestBlk - e.blk,
            net(endV).toFixed(4), remFrac.toFixed(4), fees[Math.floor(fees.length / 2)]].join(",") + "\n");
          nS++;
        }
      }
    }
  }

  // ---- streaming swaps (sudah terurut per pool_id) ----
  const rl = readline.createInterface({ input: fs.createReadStream(SORTED), crlfDelay: Infinity });
  let cur = null, rows = [];
  for await (const line of rl) {
    if (!line) continue;
    const i1 = line.indexOf(",");
    const pid = line.slice(0, i1).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) {
      if (cur) flush(cur, rows);
      cur = pid; rows = [];
    }
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96, Lq = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(Lq) || Lq <= 0) continue;
    rows.push({ blk: +p[1], tx: p[3], a0: +p[4], a1: +p[5], sqrtP, L: Lq, fee: +p[9] });
    if (rows.length > 200000) rows.length = 200000;   // pagar keamanan
  }
  if (cur) flush(cur, rows);
  fOut.end(); sOut.end();
  console.error(`pool diproses: ${seen} | fitur: ${nF} | simulasi: ${nS}`);
})();
