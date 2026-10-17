// Agent 9 — audit risiko & portofolio. Replay AKUN saja (bukan mesin) atas 178 trade uji maju final.
// Aturan akun = arena.js dgn env wf_penuh.sh (MAXPOS=10 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01, KCAP 0.10, KILL 0.60).
// Keputusan ML/honeypot sudah tetap (178 trade), jadi replay akun ini harus mereproduksi $12.746,32.
// Pakai: node risk09.js  (cwd bebas)
const fs = require("fs"), path = require("path");
const D = path.join(__dirname, "..", "..", "..", "data");
const T0 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "uji_maju_final", "trade_final178.json"), "utf8"));
const LK = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "uji_maju_final", "trade_final178_lengkap.json"), "utf8"));
const BT = JSON.parse(fs.readFileSync(path.join(D, "block_time.json"), "utf8"));
// --- baris skor: decide & dev per pool
const L = fs.readFileSync(path.join(D, "arena_scored.csv"), "utf8").replace(/\r/g, "").trim().split("\n");
const H = L[0].split(",");
const ALL = L.slice(1).map(l => { const p = l.split(","); const o = {}; H.forEach((k, i) => o[k] = p[i]); return o; });
const byPool = {}; for (const o of ALL) byPool[o.pool] = o;
// --- gas nyata periode u_ds5d/u_ds24 (arena.js:6 hanya memuat m1,m2)
const GASALL = {};
for (const d of ["u_ds5d", "u_ds24", "m1", "m2"]) for (const l of fs.readFileSync(path.join(D, d, "trades.jsonl"), "utf8").trim().split("\n")) { const t = JSON.parse(l); if (t.plan === "v4") GASALL[t.pool] = { g: t.gasTot || 0, s: t.size || 0 }; }
const reasonOf = {}; LK.forEach(x => reasonOf[x.pool] = x.keluar);
// --- waktu blok: interpolasi linier dari block_time.json (unix detik)
const bk = Object.keys(BT).map(Number).sort((a, b) => a - b);
function tOf(b) {
  let i = 0; while (i < bk.length - 2 && b > bk[i + 1]) i++;
  const a = bk[i], c = bk[i + 1]; return BT[a] + (b - a) * (BT[c] - BT[a]) / (c - a);
}
const BPS = 0.1013; // detik per blok (dipakai arena.js)
const trades = T0.map(t => ({ ...t, decide: +byPool[t.pool].decide, dev: byPool[t.pool].dev || null, reason: reasonOf[t.pool] }));

function run(opt = {}) {
  const o = Object.assign({ MAXPOS: 10, EXPMAX: 0.5, REM: true, SLIP: true, LPCAP: 0.01, KCAP: 0.10, KILL: 0.60, MINPOS: 0.25,
    gasFix: false, gaya: "arena", win30: 0, dayLoss: 0, devMax: 0, mtmPess: false }, opt);
  let cash = 100, peak = 100, ddMax = 0, killed = false;
  const open = new Map(), closed = [], ev = [], log = [];
  const KFIX = (() => { let best = 0.01, bg = -1e18; const r = trades.map(t => t.ret); for (let i = 1; i < 200; i++) { const f = i / 200; let g = 0, ok = true; for (const x of r) { const v = 1 + f * (x - 1); if (v <= 0) { ok = false; break; } g += Math.log(v); } if (ok && g > bg) { bg = g; best = f; } } return Math.min(0.10, best / 4); })();
  const kellyBot = () => { const all = closed.map(c => c.net); if (all.length < 30) return 0.02; if (all.length < 100) return 0.094; const r = all.slice(-500);
    let best = 0.01, bG = -1e18; for (let i = 1; i < 200; i++) { const f = i / 200; let g = 0, ok = true; for (const x of r) { const v = 1 + f * (x - 1); if (v <= 0) { ok = false; break; } g += Math.log(v); } if (ok && g > bG) { bG = g; best = f; } }
    return Math.max(0.01, Math.min(o.KCAP, best / 4)); };
  const kelly = () => { if (o.gaya === "bot") return kellyBot(); if (o.gaya === "mc") return closed.length < 30 ? 0.02 : closed.length < 100 ? 0.094 : KFIX; const r = closed.map(c => c.ret); if (r.length < 30) return 0.02; if (r.length < 100) return 0.094;
    let best = 0.02, bv = -1e9; for (let f = 0.01; f <= 0.6; f += 0.005) { let s = 0, ok = true; for (const x of r) { const v = 1 + f * (x - 1); if (v <= 0) { ok = false; break; } s += Math.log(v); } if (ok && s / r.length > bv) { bv = s / r.length; best = f; } }
    return Math.max(0.01, Math.min(o.KCAP, best / 4)); };
  for (const t of trades) { ev.push({ b: t.decide, k: "putus", t }); ev.push({ b: t.exit, k: "tutup", t }); }
  ev.sort((a, b) => a.b - b.b || (a.k === "tutup" ? -1 : 1));
  const entries = []; // blok masuk yg diterima (utk batas 30 mnt)
  const dayStart = {}; const tol = { win30: 0, day: 0, dev: 0, kill: 0, exp: 0, slot: 0, kas: 0 };
  const devOpen = {};
  // equity pesimis: posisi rugi dinilai di nilai akhirnya sejak masuk (batas bawah MTM, tanpa data jalur harga)
  const eqOf = () => cash + [...open.values()].reduce((a, x) => a + (o.mtmPess ? Math.min(x.pos, x.backEst) : x.pos), 0);
  const back = (t, pos) => {
    const lp = t.lp; const slip = (o.SLIP && lp > 0) ? Math.min(0.9, 2 * pos / lp) : 0;
    let g = t.gasTot, s = t.size; if (o.gasFix && !(g && s) && GASALL[t.pool]) { g = GASALL[t.pool].g; s = GASALL[t.pool].s; }
    const gT = (g !== undefined && s) ? g : 0; const gr = gT && s ? (t.ret + gT / s) : t.ret;
    return Math.max(0, pos * gr * (1 - slip) - gT);
  };
  const dayKey = b => new Date(tOf(b) * 1000 + 7 * 3600e3).toISOString().slice(0, 10); // hari WIB
  for (const e of ev) {
    const t = e.t;
    if (e.k === "tutup") {
      const p = open.get(t.pool); if (!p) continue; open.delete(t.pool);
      const bk_ = back(t, p.pos); cash += bk_;
      if (t.dev) devOpen[t.dev]--;
      closed.push({ ret: t.ret, net: bk_ / p.pos, pnl: bk_ - p.pos, pos: p.pos, pool: t.pool, ds: t.ds, entry: t.entry, exit: t.exit, reason: t.reason, eqAtEntry: p.eqAtEntry });
      const eq = eqOf(); peak = Math.max(peak, eq); ddMax = Math.max(ddMax, 1 - eq / peak);
      if (!killed && 1 - eq / peak > o.KILL) killed = true;
      log.push([e.b, eq]);
      continue;
    }
    if (killed) { tol.kill++; continue; }
    if (open.size >= o.MAXPOS) { tol.slot++; continue; }
    const eqNow = eqOf();
    if (o.win30 > 0) { const w = 1800 / BPS; const n = entries.filter(b => b > e.b - w).length; if (n >= o.win30) { tol.win30++; continue; } }
    if (o.dayLoss > 0) { const dk = dayKey(e.b); if (!(dk in dayStart)) dayStart[dk] = eqNow; if (eqNow < dayStart[dk] * (1 - o.dayLoss)) { tol.day++; continue; } }
    if (o.devMax > 0 && t.dev && (devOpen[t.dev] || 0) >= o.devMax) { tol.dev++; continue; }
    const frac = kelly();
    const cost = cash + [...open.values()].reduce((a, x) => a + x.pos, 0);
    if (o.gaya === "arena" && (cost - cash) + Math.min(frac * cost, cash) > o.EXPMAX * cost) { tol.exp++; continue; }
    if (o.gaya === "bot" && cost > 0 && (cost - cash) >= o.EXPMAX * cost) { tol.exp++; continue; }
    let mult = 1; if (o.REM) { const dd = 1 - eqNow / peak; mult = dd > 0.30 ? 0.25 : dd > 0.20 ? 0.5 : dd > 0.10 ? 0.75 : 1; }
    const gRes = o.gaya === "arena" ? 0.21 : 0.21 * (open.size + 1);
    let pos = Math.min(frac * eqNow * mult, cash - gRes);
    if (o.LPCAP > 0 && t.lp > 0) pos = Math.min(pos, o.LPCAP * t.lp);
    if (o.gaya === "mc" && (cost - cash) + pos > o.EXPMAX * cost) pos = o.EXPMAX * cost - (cost - cash);
    if (o.gaya === "bot" && pos > cash - 0.21) pos = cash - 0.21;
    if (pos < (o.gaya === "bot" ? 1 : o.MINPOS)) { tol.kas++; continue; }
    cash -= pos; open.set(t.pool, { pos, backEst: back(t, pos), eqAtEntry: eqNow }); entries.push(e.b);
    if (o.dayLoss > 0) { const dk = dayKey(e.b); if (!(dk in dayStart)) dayStart[dk] = eqNow + pos - pos; }
    if (t.dev) devOpen[t.dev] = (devOpen[t.dev] || 0) + 1;
  }
  const eqA = cash + [...open.values()].reduce((a, x) => a + x.pos, 0);
  const w = closed.filter(c => c.pnl > 0).reduce((a, c) => a + c.pnl, 0), l = -closed.filter(c => c.pnl <= 0).reduce((a, c) => a + c.pnl, 0);
  const byDs = {}; for (const c of closed) byDs[c.ds] = (byDs[c.ds] || 0) + c.pnl;
  return { eq: eqA, n: closed.length, dd: ddMax, pf: w / l, tol, closed, byDs, log };
}
module.exports = { run, trades, tOf, BPS, ALL, byPool, GASALL };
if (require.main === module) {
  const f = (r, nm) => console.log(`${nm.padEnd(34)} $${r.eq.toFixed(2).padStart(10)} | trade ${r.n} | DD ${(100 * r.dd).toFixed(1)}% | PF ${r.pf.toFixed(2)} | ` +
    Object.entries(r.byDs).map(([k, v]) => k + " " + v.toFixed(1)).join(" ") + " | tolak " + JSON.stringify(r.tol));
  f(run(), "BASIS (harus $12.746,32)");
  f(run({ gasFix: true }), "gas u_ds dibebankan");
  f(run({ mtmPess: true }), "equity pesimis (rugi diakui saat masuk)");
  f(run({ gaya: "bot" }), "aturan akun paper_live.js");
  f(run({ gaya: "mc" }), "aturan akun mc_pro.js");
  f(run({ gaya: "bot", gasFix: true }), "bot + gas u_ds");
  f(run({ gaya: "mc", gasFix: true }), "mc + gas u_ds");
}
