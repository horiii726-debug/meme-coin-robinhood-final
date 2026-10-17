// FASE 4 — fitur dari jendela [init, init+W] SAJA.
// Label dihitung dari (init+W, init+HORIZON]. Tidak ada tumpang tindih.
// Aturan arah: jumlah token BASE > 0  => BUY.  (quote=c1 -> base=a0 ; quote=c0 -> base=a1)
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);

const DIR = process.argv[2] || "dsp";
const W = parseInt(process.env.W || "3000", 10);
const MINSW = parseInt(process.env.MINSW || "3", 10);          // 3000 blok = 5 menit (jendela FITUR)
const HORIZON = parseInt(process.env.HZ || "216000", 10); // 6 jam (jendela LABEL)
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

(async () => {
  const pools = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "pools.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const [pid, c0, c1, fee, ts, hooks, init] = line.split(",");
      pools.set(pid.toLowerCase(), { c0: c0.toLowerCase(), c1: c1.toLowerCase(), feeInit: +fee, ts: +ts, hooks: hooks.toLowerCase(), init: +init });
    }
  }
  const sw = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(",");
      const pid = p[0].toLowerCase(); const m = pools.get(pid); if (!m) continue;
      const blk = +p[1]; if (blk > m.init + HORIZON) continue;
      const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
      if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
      if (!sw.has(pid)) sw.set(pid, []);
      sw.get(pid).push({ blk, tx: p[3], a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
    }
  }
  const lq = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "liq.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(","); const pid = p[0].toLowerCase(); const m = pools.get(pid); if (!m) continue;
      const blk = +p[1]; if (blk > m.init + HORIZON) continue;
      if (!lq.has(pid)) lq.set(pid, []);
      lq.get(pid).push({ blk, d: BigInt(p[5]) });
    }
  }

  const cols = ["pool_id",
    // --- likuiditas ---
    "lp_entry_usd", "lp_end_w_usd", "lp_peak_w_usd", "lp_growth", "lp_adds_w", "lp_removes_w", "lp_rem_frac_w",
    // --- order flow ---
    "n_swap_w", "n_buy_w", "n_sell_w", "buy_sell_cnt_ratio",
    "buyvol_usd_w", "sellvol_usd_w", "flow_imbalance", "netflow_over_lp",
    "buy_size_med_usd", "buy_size_mean_usd", "sell_size_med_usd", "max_buy_usd", "max_buy_over_lp",
    "n_tx_w", "swaps_per_tx", "bundled_frac",
    // --- waktu / akselerasi ---
    "lag_first_swap", "gap_med_blocks", "gap_std_blocks", "swaps_per_min", "accel_2nd_half",
    // --- harga / volatilitas ---
    "ret_w", "vol_logret_w", "maxdd_w", "up_move_frac",
    // --- struktur ---
    "fee_init", "fee_med_w", "fee_dynamic", "has_hook", "tick_spacing", "quote_is_usdg",
    // --- noise control (WAJIB: kalau ini lolos seleksi, pipeline bocor) ---
    "noise1", "noise2", "noise3",
    // --- LABEL (dari SETELAH jendela fitur) ---
    "y_rug", "y_dump", "best_mult_after", "end_mult_after", "lp_peak_after"];
  const out = fs.createWriteStream(path.join(DIR, process.env.OUT || "features.csv"));
  out.write(cols.join(",") + "\n");

  let n = 0, skip = 0;
  for (const [pid, m] of pools) {
    const all = (sw.get(pid) || []).sort((a, b) => a.blk - b.blk);
    if (all.length < MINSW) { skip++; continue; }
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else { skip++; continue; }
    const quote = qIsC1 ? m.c1 : m.c0;
    const usdPer = quote === USDG ? 1 : ethUsd;
    const qdec = QDEC[quote];
    const toUsd = raw => (Math.abs(raw) / Math.pow(10, qdec)) * usdPer;
    const qRes = x => qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP;
    const lpUsd = x => 2 * toUsd(qRes(x));
    const baseAmt = x => qIsC1 ? x.a0 : x.a1;
    const quoteAmt = x => qIsC1 ? x.a1 : x.a0;

    const wEnd = m.init + W;
    const win = all.filter(x => x.blk <= wEnd);
    const post = all.filter(x => x.blk > wEnd);
    if (win.length < MINSW || post.length < 2) { skip++; continue; }

    // ---------- FITUR (hanya dari `win`) ----------
    const lpEntry = lpUsd(win[0]), lpEndW = lpUsd(win[win.length - 1]);
    const lpPeakW = Math.max(...win.map(lpUsd).filter(isFinite));
    const lqW = (lq.get(pid) || []).filter(x => x.blk <= wEnd);
    let addW = 0n, remW = 0n, nAdd = 0, nRem = 0;
    for (const e of lqW) { if (e.d > 0n) { addW += e.d; nAdd++; } else { remW += -e.d; nRem++; } }

    const buys = win.filter(x => baseAmt(x) > 0), sells = win.filter(x => baseAmt(x) < 0);
    const bUsd = buys.map(x => toUsd(quoteAmt(x))), sUsd = sells.map(x => toUsd(quoteAmt(x)));
    const buyVol = bUsd.reduce((s, x) => s + x, 0), sellVol = sUsd.reduce((s, x) => s + x, 0);

    const txSet = new Map();
    for (const x of win) txSet.set(x.tx, (txSet.get(x.tx) || 0) + 1);
    const bundled = [...txSet.values()].filter(v => v > 1).length;

    const gaps = [];
    for (let i = 1; i < win.length; i++) gaps.push(win[i].blk - win[i - 1].blk);
    const halfB = m.init + W / 2;
    const h1 = win.filter(x => x.blk <= halfB).length, h2 = win.length - h1;

    const rels = win.map(x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP)).filter(v => isFinite(v) && v > 0);
    const logrets = [];
    for (let i = 1; i < rels.length; i++) { const r = Math.log(rels[i] / rels[i - 1]); if (isFinite(r)) logrets.push(r); }
    let peakR = rels[0] || 1, ddW = 0;
    for (const r of rels) { if (r > peakR) peakR = r; const dd = 1 - r / peakR; if (dd > ddW) ddW = dd; }
    const retW = rels.length ? rels[rels.length - 1] / rels[0] : 1;

    // ---------- LABEL (hanya dari `post`) ----------
    const lqPost = (lq.get(pid) || []).filter(x => x.blk > wEnd);
    let addP = 0n, remP = 0n;
    for (const e of lqPost) { if (e.d > 0n) addP += e.d; else remP += -e.d; }
    const totalAdd = addW + addP;
    const remFracTotal = totalAdd > 0n ? Number((remW + remP) * 10000n / totalAdd) / 10000 : 0;

    const p0 = rels.length ? rels[rels.length - 1] : 1;
    const relsPost = post.map(x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP)).filter(v => isFinite(v) && v > 0);
    const bestAfter = relsPost.length ? Math.max(...relsPost) / p0 : 1;
    const endAfter = relsPost.length ? relsPost[relsPost.length - 1] / p0 : 1;
    const lpPeakAfter = Math.max(...post.map(lpUsd).filter(isFinite), 0);
    const lpEndAfter = lpUsd(post[post.length - 1]);

    // LABEL murni dari SETELAH jendela fitur. Tidak boleh menyentuh besaran jendela fitur.
    const remFracPost = totalAdd > 0n ? Number(remP * 10000n / totalAdd) / 10000 : 0;
    const yRug = (remFracPost > 0.8 || lpEndAfter < 0.05 * lpPeakAfter) ? 1 : 0;
    const yDump = (endAfter < 0.5) ? 1 : 0;

    const row = [pid,
      lpEntry.toFixed(0), lpEndW.toFixed(0), lpPeakW.toFixed(0), (lpEndW / Math.max(lpEntry, 1)).toFixed(4),
      nAdd, nRem, (addW > 0n ? Number(remW * 10000n / addW) / 10000 : 0).toFixed(4),
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
      retW.toFixed(6), std(logrets).toFixed(6), ddW.toFixed(4),
      (logrets.filter(r => r > 0).length / Math.max(logrets.length, 1)).toFixed(4),
      m.feeInit, med(win.map(x => x.fee)), m.feeInit === 8388608 ? 1 : 0,
      m.hooks === NATIVE ? 0 : 1, m.ts, quote === USDG ? 1 : 0,
      Math.random().toFixed(6), Math.random().toFixed(6), Math.random().toFixed(6),
      yRug, yDump, bestAfter.toFixed(4), endAfter.toFixed(4), lpPeakAfter.toFixed(0)];
    out.write(row.join(",") + "\n");
    n++;
  }
  out.end();
  console.error(`fitur ditulis: ${n} | dilewati: ${skip}`);
})();
