// BACKTEST RENCANA DAGANG LENGKAP — saringan gabungan + detektor rug + exit berbasis ARUS.
// Aturan ditetapkan SEBELUM melihat hasil. Diuji terpisah di periode LAMA dan BARU.
//
// EXIT BERBASIS ARUS (ide user: jangan keluar selama pembeli masih kuat & harga masih naik):
//   arus KUAT  = dalam jendela terakhir, pembelian >= penjualan DAN >= 3 pembelian
//   saat arus kuat   -> stop lebar  (tidak terlempar oleh koreksi normal ~48%)
//   saat arus lemah  -> stop ketat  (keluar sebelum ambruk -74% dalam 5 menit)
// DETEKTOR RUG saat memegang: keluar di swap berikutnya begitu >30% LP yang pernah ditambah ditarik.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const Q96 = Math.pow(2, 96);
const DIR = "ds6d";
const SPLIT = 59886162, HZ = 216000, MIN = 600, SIMHZ = 36000;
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;
const readCsv = f => { const L = fs.readFileSync(path.join(DIR, f), "utf8").trim().split("\n"); const H = L[0].split(",").map(h => h.trim()); return L.slice(1).map(l => { const p = l.split(","); const o = {}; H.forEach((h, i) => o[h] = (p[i] || "").trim()); return o; }); };

// ---------- pools + saringan aman ----------
const pools = new Map();
for (const r of readCsv("pools.csv")) {
  const hooks = r.hooks.toLowerCase(), bits = BigInt(hooks) & 0x3fffn;
  const c0 = r.c0.toLowerCase(), c1 = r.c1.toLowerCase();
  pools.set(r.pool_id.toLowerCase(), { c0, c1, fee: +r.fee, hook: hooks !== NATIVE, beforeSwap: Number((bits >> 7n) & 1n), init: +r.init_block });
}
const safe = m => (m.c0 === NATIVE || m.c1 === NATIVE) && m.fee <= 5000 && m.beforeSwap === 0;

// ---------- reputasi dev berjalan, anti-bocor (hasil pool lama baru "diketahui" setelah 1 jam) ----------
const best = new Map(readCsv("sim.csv").map(r => [r.pool_id.toLowerCase(), +r.best_mult]));
const byDev = new Map();
for (const r of readCsv("deployers_bq.csv")) {
  const pid = r.pool_id.toLowerCase(), d = r.deployer.toLowerCase();
  if (!byDev.has(d)) byDev.set(d, []);
  byDev.get(d).push({ pid, init: +r.init_block });
}
const devProven = new Set(), devHas = new Set();
for (const [, arr] of byDev) {
  arr.sort((a, b) => a.init - b.init);
  for (let j = 0; j < arr.length; j++) {
    devHas.add(arr[j].pid);
    for (let i = 0; i < j; i++) {
      if (arr[i].init + SIMHZ > arr[j].init) break;
      if ((best.get(arr[i].pid) || 0) >= 11) { devProven.add(arr[j].pid); break; }
    }
  }
}
// ---------- skor ML out-of-time (hanya periode BARU) ----------
const mlHi = new Set(readCsv(process.env.MLF || "ml_oot_scores.csv").filter(r => r.p400_hi === "1").map(r => r.pool_id));

const SCREENS = {
  "S1 aman (ETH, fee<=0,5%, beforeSwap mati)": pid => true,
  "S2 S1 + dev pernah >=+1000%":              pid => devProven.has(pid),
  "S3 S1 + skor ML top-30% (hanya BARU)":     pid => mlHi.has(pid),
  "S4 S1 + (dev terbukti ATAU skor ML)":      pid => devProven.has(pid) || mlHi.has(pid),
};
const EXITS = {
  "X1 trail-50% max15m":                 { mode: "trail", tr: 0.50, maxB: 15 * MIN, rug: false },
  "X1R trail-50% max15m +detektor rug":  { mode: "trail", tr: 0.50, maxB: 15 * MIN, rug: true },
  "X2 arus 60d: kuat-80% lemah-30%":     { mode: "flow", W: 600,  strong: 0.80, weak: 0.30, maxB: 360 * MIN, rug: true },
  "X3 X2 + kunci setelah 10x":           { mode: "flow", W: 600,  strong: 0.80, weak: 0.30, lockAt: 10, lockStrong: 0.50, lockWeak: 0.20, maxB: 360 * MIN, rug: true },
  "X4 arus 5 menit: kuat-80% lemah-30%": { mode: "flow", W: 3000, strong: 0.80, weak: 0.30, maxB: 360 * MIN, rug: true },
  "X5 arus 60d: kuat-60% lemah-25%":     { mode: "flow", W: 600,  strong: 0.60, weak: 0.25, maxB: 360 * MIN, rug: true },
  // --- tanpa batas 15 menit; keluar di pucuk / tanda dump ---
  "X6 X3 + tanda pucuk (jual membesar)": { mode: "flow", W: 600, strong: 0.80, weak: 0.30, lockAt: 10, lockStrong: 0.50, lockWeak: 0.20, maxB: 360 * MIN, rug: true, topSig: true },
  "X7 X3 + tanda dump (jual>=5% LP)":    { mode: "flow", W: 600, strong: 0.80, weak: 0.30, lockAt: 10, lockStrong: 0.50, lockWeak: 0.20, maxB: 360 * MIN, rug: true, dumpSig: 0.05 },
  "X8 X3 + pucuk + dump":                { mode: "flow", W: 600, strong: 0.80, weak: 0.30, lockAt: 10, lockStrong: 0.50, lockWeak: 0.20, maxB: 360 * MIN, rug: true, topSig: true, dumpSig: 0.05 },
};

// ---------- event likuiditas untuk pool aman saja ----------
const liq = new Map();
for (const line of fs.readFileSync(path.join(DIR, "liq.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = line.split(","); const pid = p[0].toLowerCase(); const m = pools.get(pid);
  if (!m || !safe(m)) continue;
  if (!liq.has(pid)) liq.set(pid, []);
  liq.get(pid).push({ blk: +p[1], d: BigInt(p[5]) });
}

const res = {};
function run(pid, sw) {
  const m = pools.get(pid); if (!m || !safe(m)) return;
  const period = m.init < SPLIT ? "LAMA" : "BARU";
  if (m.init + HZ > (period === "LAMA" ? 56196161 : 60750162)) return;
  sw.sort((a, b) => a.blk - b.blk || a.li - b.li);
  const qIsC1 = m.c1 === NATIVE;
  const toUsd = r => (Math.abs(r) / 1e18) * ethUsd;
  const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
  const isBuy = x => (qIsC1 ? x.a0 : x.a1) > 0;
  const all = sw.filter(x => x.blk <= m.init + HZ);
  const ei = all.findIndex(x => x.blk >= m.init + MIN);
  if (ei < 0 || ei >= all.length - 1) return;
  const e = all[ei];
  const size = Math.min(200, 0.01 * lpUsd(e));
  if (!isFinite(size) || size < 20) return;
  const dIn = (size / ethUsd) * 1e18 * (1 - e.fee / 1e6);
  let base;
  if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
  else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
  if (!isFinite(base) || base <= 0) return;
  const val = x => { const bIn = base * (1 - x.fee / 1e6); let r;
    if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; r = x.L * (x.sqrtP - 1 / inv); }
    else { const spb = x.sqrtP + bIn / x.L; r = x.L * (1 / x.sqrtP - 1 / spb); }
    return (!isFinite(r) || r <= 0) ? 0 : toUsd(r) / size; };
  const V = all.map((x, i) => i > ei ? val(x) : 0);
  let perfect = 0; for (let i = ei + 1; i < all.length; i++) if (V[i] > perfect) perfect = V[i];

  // blok rug (>80%) & blok peringatan detektor (>30%)
  let rugBlk = null, warnBlk = null;
  { let a = 0n, r = 0n;
    for (const ev of (liq.get(pid) || []).sort((x, y) => x.blk - y.blk)) {
      if (ev.d > 0n) a += ev.d; else r += -ev.d;
      if (a > 0n) { if (warnBlk === null && r * 100n / a > 30n) warnBlk = ev.blk; if (rugBlk === null && r * 100n / a > 80n) rugBlk = ev.blk; }
    } }

  const screensHit = Object.entries(SCREENS).filter(([k, fn]) => fn(pid)).map(([k]) => k)
    .filter(k => !(k.startsWith("S3") && period === "LAMA") && !(k.startsWith("S4") && period === "LAMA"));
  if (!screensHit.length) return;

  for (const [xn, X] of Object.entries(EXITS)) {
    let peak = 1, exitI = -1, reason = "horizon";
    let lo = 0, b = 0, s = 0, sUsdW = 0;                   // jendela arus bergulir
    let sCntRun = 0, sUsdRun = 0;                          // penjualan sejak entry
    const sellUsd = x => (Math.abs(qIsC1 ? x.a1 : x.a0) / 1e18) * ethUsd;
    for (let i = 0; i < all.length; i++) {
      const x = all[i];
      if (isBuy(x)) b++; else { s++; sUsdW += sellUsd(x); }
      if (X.W) { while (all[lo].blk <= x.blk - X.W) { if (isBuy(all[lo])) b--; else { s--; sUsdW -= sellUsd(all[lo]); } lo++; } }
      if (i <= ei) continue;
      const v = V[i], dt = x.blk - e.blk;
      if (v > peak) peak = v;
      if (!isBuy(x)) { sCntRun++; sUsdRun += sellUsd(x); }
      if (X.rug && warnBlk !== null && x.blk > warnBlk) { exitI = i; reason = "detektor rug"; break; }
      if (dt >= X.maxB) { exitI = i; reason = "batas waktu"; break; }
      // tanda dump: satu penjualan >= X% nilai LP saat itu
      if (X.dumpSig && !isBuy(x) && sellUsd(x) >= X.dumpSig * lpUsd(x)) { exitI = i; reason = "tanda dump"; break; }
      // tanda pucuk: sudah >=3x, dan ukuran jual 60 dtk terakhir membesar >=1,5x rata2 sejak entry
      if (X.topSig && peak >= 3 && s >= 3 && sCntRun >= 6) {
        const avgW = sUsdW / s, avgRun = sUsdRun / sCntRun;
        if (avgW >= 1.5 * avgRun) { exitI = i; reason = "tanda pucuk"; break; }
      }
      let tr;
      if (X.mode === "trail") tr = X.tr;
      else {
        const strong = b >= s && b >= 3;
        if (X.lockAt && peak >= X.lockAt) tr = strong ? X.lockStrong : X.lockWeak;
        else tr = strong ? X.strong : X.weak;
      }
      if (v <= peak * (1 - tr)) { exitI = i; reason = "stop"; break; }
    }
    let xi, exitBlk;
    if (exitI < 0) { xi = all.length - 1; exitBlk = m.init + HZ; }
    else {
      // jeda eksekusi: jual baru masuk di swap pertama >= LATB blok setelah tanda terlihat
      const LATB = parseInt(process.env.LATB || "0", 10);
      const tgt = all[exitI].blk + LATB;
      let j = exitI + 1;
      while (j < all.length && all[j].blk < tgt) j++;
      xi = Math.min(j, all.length - 1); exitBlk = all[xi].blk;
    }
    let mult = V[xi];
    if (rugBlk !== null && rugBlk <= exitBlk && !(X.rug && warnBlk !== null && warnBlk < rugBlk && all[xi].blk < rugBlk)) { mult = 0; exitBlk = rugBlk; reason = "kena rug"; }
    const ret = (mult * size - 0.04) / size;
    const holdMin = (Math.min(exitBlk, all[all.length - 1].blk) - e.blk) * 0.1 / 60;
    for (const sc of screensHit) {
      res[sc] = res[sc] || {}; res[sc][xn] = res[sc][xn] || { LAMA: [], BARU: [] };
      res[sc][xn][period].push({ ret, size, holdMin, perfect, reason, init: m.init, entryBlk: e.blk, exitBlk, pid });
    }
  }
}

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps_sorted.csv")), crlfDelay: Infinity });
  let cur = null, sw = [];
  for await (const line of rl) {
    if (!line) continue;
    const i1 = line.indexOf(",");
    const pid = line.slice(0, i1).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) { if (cur) run(cur, sw); cur = pid; sw = []; }
    const m = pools.get(pid); if (!m || !safe(m)) continue;
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    sw.push({ blk: +p[1], li: +p[2], a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
  }
  if (cur) run(cur, sw);

  const med = a => { if (!a.length) return NaN; const t = [...a].sort((x, y) => x - y); return t[Math.floor(t.length / 2)]; };
  const stat = tr => {
    if (!tr.length) return null;
    const pnls = tr.map(t => (t.ret - 1) * t.size);
    const gp = pnls.filter(x => x > 0).reduce((a, b) => a + b, 0), gl = -pnls.filter(x => x < 0).reduce((a, b) => a + b, 0);
    const sorted = [...pnls].sort((a, b) => b - a);
    const moon = tr.filter(t => t.perfect >= 11);
    return { n: tr.length, win: tr.filter(t => t.ret > 1).length / tr.length,
      mean: tr.reduce((a, t) => a + t.ret, 0) / tr.length - 1, pf: gl > 0 ? gp / gl : Infinity,
      holdAvg: tr.reduce((a, t) => a + t.holdMin, 0) / tr.length, holdMed: med(tr.map(t => t.holdMin)),
      x5: tr.filter(t => t.ret >= 5).length, x11: tr.filter(t => t.ret >= 11).length,
      pnl: pnls.reduce((a, b) => a + b, 0), noTop: pnls.reduce((a, b) => a + b, 0) - Math.max(sorted[0], 0),
      moonN: moon.length, capture: med(moon.map(t => t.ret / t.perfect)),
      rugHit: tr.filter(t => t.reason === "kena rug").length, rugSaved: tr.filter(t => t.reason === "detektor rug").length };
  };
  let out = "";
  const P = s => { out += s + "\n"; };
  for (const [sc, exits] of Object.entries(res)) {
    for (const period of ["LAMA", "BARU"]) {
      const any = Object.values(exits).some(x => x[period].length);
      if (!any) continue;
      P("\n" + "=".repeat(132));
      P(`${sc}  —  periode ${period}`);
      P("=".repeat(132));
      P("exit".padEnd(38) + "    n  menang  rata2    PF  hold-rata  hold-med  >=5x >=11x      PnL  tanpa-top1  moonshot tangkap%  kena-rug diselamatkan");
      for (const [xn, per] of Object.entries(exits)) {
        const x = stat(per[period]); if (!x) continue;
        P(xn.padEnd(38) + String(x.n).padStart(5) + (100 * x.win).toFixed(0).padStart(7) + "%" + (100 * x.mean).toFixed(0).padStart(6) + "%"
          + (isFinite(x.pf) ? x.pf.toFixed(2) : "inf").padStart(6) + (x.holdAvg.toFixed(1) + "m").padStart(11) + (x.holdMed.toFixed(1) + "m").padStart(10)
          + String(x.x5).padStart(6) + String(x.x11).padStart(6) + ("$" + x.pnl.toFixed(0)).padStart(9) + ("$" + x.noTop.toFixed(0)).padStart(12)
          + (x.moonN ? `${x.moonN} / ${(100 * x.capture).toFixed(0)}%` : "-").padStart(18) + String(x.rugHit).padStart(10) + String(x.rugSaved).padStart(12));
      }
    }
  }
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(res["S1 aman (ETH, fee<=0,5%, beforeSwap mati)"]["X8 X3 + pucuk + dump"]));
  fs.writeFileSync(process.env.OUTT || "exit_v3_out.txt", out);
  process.stdout.write(out);
})();
