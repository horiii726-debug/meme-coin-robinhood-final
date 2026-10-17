// BACKTEST STRATEGI — exit TANPA pengetahuan masa depan.
// Masuk di akhir jendela fitur. Keluar pakai aturan yang hanya melihat masa lalu.
// Eksekusi di swap BERIKUTNYA setelah pemicu (ada jeda, bukan harga sempurna).
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
const HZ = parseInt(process.env.HZ || "216000", 10);
const MAX_USD = parseFloat(process.env.SIZE || "200");
const MAX_FRAC = 0.01;
const GAS = 0.02;
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

(async () => {
  const pools = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), hooks: p[5].toLowerCase(), init: +p[6] });
  }
  // fitur (untuk aturan MASUK)
  const F = new Map();
  {
    const L = fs.readFileSync(path.join(DIR, process.env.FEAT || "features.csv"), "utf8").trim().split("\n");
    const H = L[0].split(","); const I = {}; H.forEach((h, i) => I[h] = i);
    for (const l of L.slice(1)) {
      const p = l.split(",");
      const o = {}; H.forEach((h, i) => o[h] = isNaN(+p[i]) ? p[i] : +p[i]);
      F.set(p[0].toLowerCase(), o);
    }
  }
  const rugBlock = new Map();
  {
    const ev = new Map();
    for (const l of fs.readFileSync(path.join(DIR, "liq.csv"), "utf8").trim().split("\n").slice(1)) {
      const p = l.split(","); const pid = p[0].toLowerCase(); if (!pools.has(pid)) continue;
      if (!ev.has(pid)) ev.set(pid, []);
      ev.get(pid).push({ blk: +p[1], d: BigInt(p[5]) });
    }
    for (const [pid, arr] of ev) {
      arr.sort((a, b) => a.blk - b.blk);
      let add = 0n, rem = 0n;
      for (const e of arr) {
        if (e.d > 0n) add += e.d; else rem += -e.d;
        if (add > 0n && rem * 100n / add > 80n) { rugBlock.set(pid, e.blk); break; }
      }
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
      const blk = +p[1]; if (blk > m.init + HZ) continue;
      const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
      if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
      if (!sw.has(pid)) sw.set(pid, []);
      sw.get(pid).push({ blk, a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
    }
  }

  // ---- aturan MASUK (hanya pakai fitur jendela) ----
  const SCREENS = {
    // --- hanya info yang ADA di detik ke-0 (dari event Initialize) ---
    "S0. hook + ETH (detik-0)": f => f.has_hook === 1 && f.quote_is_usdg === 0,
    "S1. + LP>=$20k": f => f.has_hook === 1 && f.quote_is_usdg === 0 && f.lp_entry_usd >= 20000,
    // --- butuh data arus, jadi butuh waktu tunggu ---
    "C. + ramai >=50 swap": f => f.lp_entry_usd >= 20000 && f.has_hook === 1 && f.n_swap_w >= 50,
    "M. momentum ret>=2.89x": f => f.lp_entry_usd >= 20000 && f.has_hook === 1 && f.ret_w >= 2.89,
    "E. tanpa hook (pembanding)": f => f.lp_entry_usd >= 20000 && f.has_hook === 0,
  };

  // ---- aturan KELUAR ----
  const EXITS = {
    "trail-50% max 5 mnt": { type: "trail", dd: 0.50, maxB: 3000 },
    "trail-50% max 15 mnt": { type: "trail", dd: 0.50, maxB: 9000 },
    "trail-50% max 30 mnt": { type: "trail", dd: 0.50, maxB: 18000 },
    "trail-50% max 1 jam": { type: "trail", dd: 0.50, maxB: 36000 },
    "trail-50% max 3 jam": { type: "trail", dd: 0.50, maxB: 108000 },
    "trail-50% tanpa batas": { type: "trail", dd: 0.50 },
    "trail-30% max 15 mnt": { type: "trail", dd: 0.30, maxB: 9000 },
    "trail-70% max 1 jam": { type: "trail", dd: 0.70, maxB: 36000 },
  };

  function runTrade(pid, exit) {
    const m = pools.get(pid);
    const all = (sw.get(pid) || []).sort((a, b) => a.blk - b.blk);
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else return null;
    const quote = qIsC1 ? m.c1 : m.c0;
    const usdPer = quote === USDG ? 1 : ethUsd;
    const qdec = QDEC[quote];
    const toUsd = r => (Math.abs(r) / Math.pow(10, qdec)) * usdPer;
    const qRes = x => qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP;

    const wEnd = m.init + W;
    const ei = all.findIndex(x => x.blk > wEnd);
    if (ei < 0) return null;
    const e = all[ei];
    const lpE = 2 * toUsd(qRes(e));
    const size = Math.min(MAX_USD, MAX_FRAC * lpE);
    if (!isFinite(size) || size <= 0.5) return null;

    const dIn = (size / usdPer) * Math.pow(10, qdec) * (1 - e.fee / 1e6);
    let base;
    if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
    else { const inv = 1 / e.sqrtP + dIn / e.L; const sp1 = 1 / inv; base = e.L * (e.sqrtP - sp1); }
    if (!isFinite(base) || base <= 0) return null;

    const sellUsd = x => {
      const bIn = base * (1 - x.fee / 1e6);
      let recv;
      if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; recv = x.L * (x.sqrtP - 1 / inv); }
      else { const spb = x.sqrtP + bIn / x.L; recv = x.L * (1 / x.sqrtP - 1 / spb); }
      return (!isFinite(recv) || recv <= 0) ? 0 : toUsd(recv);
    };

    const path_ = all.slice(ei + 1);
    if (!path_.length) return null;
    const entryBlk = e.blk;
    let peak = size, triggered = -1;
    for (let i = 0; i < path_.length; i++) {
      const v = sellUsd(path_[i]);
      if (v > peak) peak = v;
      const mult = v / size;
      // batas waktu tahan: lewat batas -> keluar di swap itu juga
      if (exit.maxB && path_[i].blk - entryBlk >= exit.maxB) { triggered = i; break; }
      if (exit.type === "tp") {
        if (mult >= exit.tp || mult <= exit.sl) { triggered = i; break; }
      } else if (exit.type === "trail") {
        if (v <= peak * (1 - exit.dd) && peak > size) { triggered = i; break; }
        if (exit.sl && mult <= exit.sl) { triggered = i; break; }
      }
    }
    // eksekusi di swap BERIKUTNYA setelah pemicu (jeda nyata)
    const xi = triggered < 0 ? path_.length - 1 : Math.min(triggered + 1, path_.length - 1);
    const rb = rugBlock.get(pid);
    // Waktu kita BERNIAT keluar. Kalau aturan tidak pernah memicu, kita memegang
    // sampai akhir horizon -- bukan sampai swap terakhir yang kebetulan tercatat.
    const intendedExit = triggered < 0 ? (m.init + HZ) : path_[xi].blk;
    // Rug datang sebelum kita sempat keluar -> posisi terkunci, nilainya nol.
    const proceeds = (rb !== undefined && rb <= intendedExit) ? 0 : sellUsd(path_[xi]);
    return { pid, size, ret: (proceeds - GAS * 2) / size, blocks: path_[xi].blk - e.blk };
  }

  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };

  // ---- UJI PISAH WAKTU: konfigurasi dievaluasi di periode awal vs periode akhir ----
  if (process.env.SPLIT) {
    const key = process.env.SPLIT;
    const sel = [...F.entries()].filter(([p, f]) => SCREENS[key](f)).map(([p]) => p)
      .sort((a, b) => pools.get(a).init - pools.get(b).init);
    const n1 = Math.floor(sel.length * 0.6), n2 = Math.floor(sel.length * 0.8);
    const parts = { "AWAL 60%": sel.slice(0, n1), "TENGAH 20%": sel.slice(n1, n2), "AKHIR 20%": sel.slice(n2) };
    console.log(`UJI PISAH WAKTU — screen "${key}", total ${sel.length} pool`);
    console.log("=".repeat(76));
    for (const [eName, ex] of Object.entries(EXITS)) {
      const out = [];
      for (const [pName, ps] of Object.entries(parts)) {
        const tr = ps.map(p => runTrade(p, ex)).filter(Boolean);
        if (!tr.length) { out.push(`${pName}: -`); continue; }
        const rets = tr.map(t => t.ret);
        const inv = tr.reduce((s, t) => s + t.size, 0);
        const got = tr.reduce((s, t) => s + t.ret * t.size, 0);
        const prof = tr.map(t => (t.ret - 1) * t.size).sort((a, b) => b - a);
        const posSum = prof.filter(x => x > 0).reduce((s, x) => s + x, 0) || 1;
        out.push(`${pName}: n=${tr.length} mean=${(rets.reduce((s,x)=>s+x,0)/rets.length).toFixed(2)} PnL=$${(got-inv).toFixed(0)} top1=${(100*Math.max(prof[0],0)/posSum).toFixed(0)}%`);
      }
      console.log(eName.padEnd(22) + out.join("  |  "));
    }
    process.exit(0);
  }

  if (process.env.LADDER) {
    const sel = [...F.entries()].filter(([p,f]) => SCREENS[process.env.LADDER](f)).map(([p])=>p);
    const tr = sel.map(p => runTrade(p, EXITS["trailing -50%"])).filter(Boolean);
    const r = tr.map(t=>t.ret).sort((a,b)=>b-a);
    console.log("KONFIG: " + process.env.LADDER + " + trailing -50%   n=" + r.length);
    console.log("-".repeat(50));
    for (const th of [1,1.3,2,3,5,11,21]) {
      const c = r.filter(x=>x>=th).length;
      console.log(("  >= " + ((th-1)*100).toFixed(0) + "%").padEnd(14) + String(c).padStart(3) + " dari " + r.length + "   = " + (100*c/r.length).toFixed(1) + "%");
    }
    console.log("  TOTAL RUGI (nol)  " + r.filter(x => x < 0.02).length + " dari " + r.length + "   = " + (100 * r.filter(x => x < 0.02).length / r.length).toFixed(1) + "%");
    console.log("  5 trade terbaik: " + r.slice(0,5).map(x=>x.toFixed(2)+"x").join(", "));
    process.exit(0);
  }
  for (const [sName, sFn] of Object.entries(SCREENS)) {
    const sel = [...F.entries()].filter(([pid, f]) => sFn(f)).map(([pid]) => pid);
    if (sel.length < 5) { console.log(`\n### ${sName}: cuma ${sel.length} pool, dilewati`); continue; }
    console.log("\n" + "=".repeat(76));
    console.log(`### SCREEN ${sName}  ->  ${sel.length} pool`);
    console.log("=".repeat(76));
    console.log("exit rule".padEnd(22) + "   n    med   mean  >11x menang     PnL   top1%  top3%");
    console.log("-".repeat(76));
    for (const [eName, ex] of Object.entries(EXITS)) {
      const tr = sel.map(p => runTrade(p, ex)).filter(Boolean);
      if (!tr.length) continue;
      const rets = tr.map(t => t.ret);
      const invested = tr.reduce((s, t) => s + t.size, 0);
      const got = tr.reduce((s, t) => s + t.ret * t.size, 0);
      const pnl = got - invested;
      // konsentrasi profit: berapa % laba kotor datang dari 1 dan 3 trade terbesar
      const prof = tr.map(t => (t.ret - 1) * t.size).sort((a, b) => b - a);
      const posSum = prof.filter(x => x > 0).reduce((s, x) => s + x, 0) || 1;
      const top1 = 100 * Math.max(prof[0], 0) / posSum;
      const top3 = 100 * prof.slice(0, 3).filter(x => x > 0).reduce((s, x) => s + x, 0) / posSum;
      console.log(eName.padEnd(22) + String(tr.length).padStart(4)
        + pct(rets, .5).toFixed(2).padStart(7) + (rets.reduce((s, x) => s + x, 0) / rets.length).toFixed(2).padStart(7)
        + String(rets.filter(r => r >= 11).length).padStart(6)
        + (100 * rets.filter(r => r > 1).length / rets.length).toFixed(0).padStart(7) + "%"
        + ("$" + pnl.toFixed(0)).padStart(10)
        + top1.toFixed(0).padStart(7) + "%" + top3.toFixed(0).padStart(6) + "%");
    }
  }
})();
