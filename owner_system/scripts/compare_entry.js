// PERBANDINGAN WAKTU MASUK: 1 dtk / 10 dtk / 1 mnt / 2 mnt / 5 mnt / 15 mnt
// Screen SAMA (struktural: ada hook + quote ETH) -> yang dibandingkan murni waktunya.
// Exit SAMA: trailing -50%, batas 15 menit. Rug sebelum keluar = NOL.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "ds24";
const HZ = 216000;
const SIZE_USD = 200, MAX_FRAC = 0.01, GAS = 0.02;
const TRAIL = parseFloat(process.env.TRAIL || "0.50");
const MAXHOLD = parseInt(process.env.MAXHOLD || "9000", 10);   // default 15 menit
const ENTRIES = [10, 100, 600, 1200, 3000, 9000];
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

(async () => {
  const pools = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    const c0 = p[1].toLowerCase(), c1 = p[2].toLowerCase(), hooks = p[5].toLowerCase();
    // SCREEN STRUKTURAL: ada hook, dan salah satu sisi = ETH native
    if (hooks === NATIVE) continue;
    if (c0 !== NATIVE && c1 !== NATIVE) continue;
    pools.set(p[0].toLowerCase(), { c0, c1, hooks, init: +p[6] });
  }
  console.log(`pool lolos screen struktural (hook + ETH): ${pools.size}`);
  // --- reputasi deployer, dihitung berjalan (hanya pool SEBELUMNYA) ---
  const devOf = new Map(), ibAll = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "deployers_bq.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(","); devOf.set(p[0].toLowerCase(), p[1].toLowerCase()); ibAll.set(p[0].toLowerCase(), +p[2]);
  }
  const bestAll = new Map();
  { const L = fs.readFileSync(path.join(DIR, "sim.csv"), "utf8").trim().split("\n");
    const H = L[0].split(","); const bi = H.indexOf("best_mult");
    for (const l of L.slice(1)) { const p = l.split(","); bestAll.set(p[0].toLowerCase(), +p[bi]); } }
  const proven = new Set();
  { const ordered = [...devOf.keys()].filter(p => bestAll.has(p)).sort((a,b) => ibAll.get(a) - ibAll.get(b));
    const hh = new Map();
    for (const pid of ordered) {
      const d = devOf.get(pid);
      if ((hh.get(d) || 0) >= 1) proven.add(pid);      // dev sudah pernah >=11x SEBELUM pool ini
      if (bestAll.get(pid) >= 11) hh.set(d, (hh.get(d) || 0) + 1);
    } }
  const DEVFILTER = process.env.DEVREP === "1";
  if (DEVFILTER) {
    for (const k of [...pools.keys()]) if (!proven.has(k)) pools.delete(k);
    console.log(`setelah + reputasi dev (pernah >=+1000%): ${pools.size}`);
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
      sw.get(pid).push({ blk, sqrtP, L, fee: +p[9] });
    }
  }

  function trade(pid, W) {
    const m = pools.get(pid);
    const all = (sw.get(pid) || []).sort((a, b) => a.blk - b.blk);
    if (all.length < 2) return null;
    const qIsC1 = m.c1 === NATIVE ? true : (m.c0 === NATIVE ? false : null);
    // quote = ETH native; kalau c0 native -> quote adalah c0
    const qIsQuoteC1 = m.c1 === NATIVE;
    const qdec = 18, usdPer = ethUsd;
    const toUsd = r => (Math.abs(r) / 1e18) * usdPer;
    const ei = all.findIndex(x => x.blk >= m.init + W);
    if (ei < 0 || ei >= all.length - 1) return null;
    const e = all[ei];
    const lpE = 2 * toUsd(qIsQuoteC1 ? e.L * e.sqrtP : e.L / e.sqrtP);
    const size = Math.min(SIZE_USD, MAX_FRAC * lpE);
    if (!isFinite(size) || size <= 0.5) return null;
    const dIn = (size / usdPer) * 1e18 * (1 - e.fee / 1e6);
    let base;
    if (qIsQuoteC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
    else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
    if (!isFinite(base) || base <= 0) return null;
    const sellUsd = x => {
      const bIn = base * (1 - x.fee / 1e6);
      let recv;
      if (qIsQuoteC1) { const inv = 1 / x.sqrtP + bIn / x.L; recv = x.L * (x.sqrtP - 1 / inv); }
      else { const spb = x.sqrtP + bIn / x.L; recv = x.L * (1 / x.sqrtP - 1 / spb); }
      return (!isFinite(recv) || recv <= 0) ? 0 : toUsd(recv);
    };
    const p_ = all.slice(ei + 1);
    if (!p_.length) return null;
    let peak = size, trig = -1, ath = 0;
    for (let i = 0; i < p_.length; i++) {
      const v = sellUsd(p_[i]);
      if (v > ath) ath = v;
      if (v > peak) peak = v;
      if (p_[i].blk - e.blk >= MAXHOLD) { trig = i; break; }
      if (v <= peak * (1 - TRAIL) && peak > size) { trig = i; break; }
    }
    const xi = trig < 0 ? p_.length - 1 : Math.min(trig + 1, p_.length - 1);
    const rb = rugBlock.get(pid);
    const intended = trig < 0 ? (m.init + HZ) : p_[xi].blk;
    const proceeds = (rb !== undefined && rb <= intended) ? 0 : sellUsd(p_[xi]);
    return { ret: (proceeds - GAS * 2) / size, ath: ath / size, size };
  }

  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length-1, Math.floor(q*s.length))] : NaN; };
  const lbl = w => w < 600 ? `${(w*0.1).toFixed(0)} detik` : `${(w*0.1/60).toFixed(0)} menit`;

  console.log("\n" + "=".repeat(92));
  console.log("A. HASIL NYATA (exit: trailing -50%, batas 15 menit)");
  console.log("=".repeat(92));
  console.log("masuk".padEnd(10) + "trade".padStart(6) + "  MENANG   rata2   >2x    >5x   >11x   PnL total   per-trade  top1%");
  console.log("-".repeat(92));
  const store = {};
  for (const W of ENTRIES) {
    const tr = [...pools.keys()].map(p => trade(p, W)).filter(Boolean);
    if (!tr.length) continue;
    store[W] = tr;
    const r = tr.map(t => t.ret);
    const inv = tr.reduce((s, t) => s + t.size, 0);
    const got = tr.reduce((s, t) => s + t.ret * t.size, 0);
    const prof = tr.map(t => (t.ret - 1) * t.size).sort((a, b) => b - a);
    const posSum = prof.filter(x => x > 0).reduce((s, x) => s + x, 0) || 1;
    console.log(lbl(W).padEnd(10) + String(tr.length).padStart(6)
      + (100*r.filter(x=>x>1).length/r.length).toFixed(1).padStart(8) + "%"
      + (r.reduce((s,x)=>s+x,0)/r.length).toFixed(2).padStart(8) + "x"
      + (100*r.filter(x=>x>=2).length/r.length).toFixed(1).padStart(6) + "%"
      + (100*r.filter(x=>x>=5).length/r.length).toFixed(1).padStart(6) + "%"
      + (100*r.filter(x=>x>=11).length/r.length).toFixed(1).padStart(6) + "%"
      + ("$" + (got-inv).toFixed(0)).padStart(11)
      + ("$" + ((got-inv)/tr.length).toFixed(2)).padStart(11)
      + (100*Math.max(prof[0],0)/posSum).toFixed(0).padStart(6) + "%");
  }

  console.log("\n" + "=".repeat(92));
  console.log("B. POTENSI MAKSIMUM (kalau jual TEPAT di puncak -- mustahil, ini plafon)");
  console.log("=".repeat(92));
  console.log("masuk".padEnd(10) + "trade".padStart(6) + "   ATH p50   ATH p90   >2x    >5x   >11x  >21x");
  console.log("-".repeat(92));
  for (const W of ENTRIES) {
    const tr = store[W]; if (!tr) continue;
    const a = tr.map(t => t.ath);
    console.log(lbl(W).padEnd(10) + String(tr.length).padStart(6)
      + pct(a,.5).toFixed(2).padStart(10) + "x" + pct(a,.9).toFixed(2).padStart(9) + "x"
      + (100*a.filter(x=>x>=2).length/a.length).toFixed(1).padStart(6) + "%"
      + (100*a.filter(x=>x>=5).length/a.length).toFixed(1).padStart(6) + "%"
      + (100*a.filter(x=>x>=11).length/a.length).toFixed(1).padStart(6) + "%"
      + (100*a.filter(x=>x>=21).length/a.length).toFixed(1).padStart(6) + "%");
  }
})();
