// Salinan arena.js (aturan pemilik: maks 5 posisi, 1/4 Kelly compounding, gas nyata).
// Baca scored_<V>.csv. Opsi tambahan: GATE=<file json daftar pool yang ditolak aturan baru>
const fs = require("fs");
const V = process.env.V;
const NL = String.fromCharCode(10), CR = String.fromCharCode(13);
const R = fs.readFileSync("scored_" + V + ".csv", "utf8").split(CR).join("").trim().split(NL);
const hdr = R[0].split(",");
const GATE = process.env.GATE ? new Set(JSON.parse(fs.readFileSync(process.env.GATE, "utf8"))) : null;
// SHRINK: perkecil posisi (bukan menolak koin) kalau skor rug tinggi. PRUG=file csv pool,p ; STAU=ambang ; SMUL=pengali
let PRUG = null;
if (process.env.PRUG) {
  PRUG = new Map();
  const L = fs.readFileSync(process.env.PRUG, "utf8").split(CR).join("").trim().split(NL);
  const h = L[0].split(","), ip = h.indexOf("pool"), iv = h.indexOf(process.env.PCOL || "p_rug10");
  for (let i = 1; i < L.length; i++) { const p2 = L[i].split(","); const v = parseFloat(p2[iv]); if (Number.isFinite(v)) PRUG.set(p2[ip], v); }
}
const STAU = +(process.env.STAU || 0.5), SMUL = +(process.env.SMUL || 0.5), SLIN = process.env.SLIN === "1";
const rows = R.slice(1).map(l => { const p = l.split(","); const o = {}; hdr.forEach((h, i) => o[h] = p[i]); return o; })
  .map(o => ({ ds: o.ds, pool: o.pool, decide: +o.decide, entry: +o.entry, exit: +o.exit, ret: +o.ret,
               gasTot: +o.gasTot || 0, size: +o.size || 0, jual: +o.jual_m1, dev: o.dev || null,
               lp: parseFloat(o.lp_m1) || 0, score: o.score === "" ? NaN : +o.score }))
  .filter(o => !process.env.ONLY || process.env.ONLY.split(",").includes(o.ds))
  .sort((a, b) => a.decide - b.decide);
const START = +(process.env.START || 100), MAXPOS = +(process.env.MAXPOS || 5), KILL = +(process.env.KILL || 0.60), THR0 = 0.195;
const KCAP = +(process.env.KCAP || 0.10), MINPOS = +(process.env.MINPOS || 0.25);
const SLIP = process.env.SLIP === "1", EXPMAX = +(process.env.EXPMAX || 1), REM = process.env.REM === "1";
const QTHR = +(process.env.QTHR || 0.30), LPCAP = +(process.env.LPCAP || 0);
const HONEY = process.env.HONEY !== "0", DEVR = process.env.DEV !== "0", MLR = process.env.ML !== "0";
let cash = START, peak = START, ddMax = 0, killed = false;
const openPos = new Map(); const closed = []; const recent = []; const devHist = {};
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function kelly() {
  const r = closed.map(c => c.ret);
  if (r.length < 30) return 0.02;
  if (r.length < 100) return 0.094;
  let best = 0.02, bv = -1e9;
  for (let f = 0.01; f <= 0.6; f += 0.005) {
    let s = 0, ok = true;
    for (const x of r) { const v = 1 + f * (x - 1); if (v <= 0) { ok = false; break; } s += Math.log(v); }
    if (ok && s / r.length > bv) { bv = s / r.length; best = f; }
  }
  return Math.max(0.01, Math.min(KCAP, best / 4));
}
const ev = [];
for (const t of rows) { ev.push({ b: t.decide, k: "putus", t }); ev.push({ b: t.exit, k: "tutup", t }); }
ev.sort((a, b) => a.b - b.b || (a.k === "tutup" ? -1 : 1));
const tolak = { ml: 0, dev: 0, honey: 0, slot: 0, kill: 0, kas: 0, noskor: 0, eksposur: 0, gate: 0 };
let beli = 0, besar = 0; const dump = [];
for (const e of ev) {
  const t = e.t;
  if (e.k === "tutup") {
    const p = openPos.get(t.pool); if (!p) continue;
    openPos.delete(t.pool);
    const slip = (SLIP && p.lp > 0) ? Math.min(0.9, 2 * p.pos / p.lp) : 0;
    const gT = (t.gasTot && t.size) ? t.gasTot : 0;
    const grossRet = gT && t.size ? (t.ret + gT / t.size) : t.ret;
    const back = Math.max(0, p.pos * grossRet * (1 - slip) - gT); cash += back;
    closed.push({ ret: t.ret, pnl: back - p.pos, pool: t.pool, ds: t.ds, blk: e.b, pos: p.pos });
    if (t.dev) (devHist[t.dev] = devHist[t.dev] || []).push(t.ret);
    const eq = cash + [...openPos.values()].reduce((a, x) => a + x.pos, 0);
    peak = Math.max(peak, eq); ddMax = Math.max(ddMax, 1 - eq / peak);
    if (!killed && 1 - eq / peak > KILL) killed = true;
    continue;
  }
  if (MLR) {
    if (!Number.isFinite(t.score)) { tolak.noskor++; continue; }
    recent.push(t.score); if (recent.length > 100) recent.shift();
    const thr = recent.length < 30 ? THR0 : q(recent, QTHR);
    if (t.score < thr) { tolak.ml++; continue; }
  }
  if (GATE && GATE.has(t.pool)) { tolak.gate++; continue; }
  if (DEVR && t.dev) { const h = devHist[t.dev]; if (h && h.some(r => r < 0.3)) { tolak.dev++; continue; } }
  if (HONEY && t.jual === 0) { tolak.honey++; continue; }
  if (killed) { tolak.kill++; continue; }
  if (openPos.size >= MAXPOS) { tolak.slot++; continue; }
  const frac0 = kelly();
  {
    const eqNow = cash + [...openPos.values()].reduce((a, x) => a + x.pos, 0);
    const terpakai = eqNow - cash;
    if (terpakai + Math.min(frac0 * eqNow, cash) > EXPMAX * eqNow) { tolak.eksposur++; continue; }
  }
  const eq = cash + [...openPos.values()].reduce((a, x) => a + x.pos, 0);
  const g = 0.06 * 3 + 0.03;
  let mult = 1;
  if (REM) { const dd = 1 - eq / peak; mult = dd > 0.30 ? 0.25 : dd > 0.20 ? 0.5 : dd > 0.10 ? 0.75 : 1; }
  if (PRUG) {
    const pv = PRUG.get(t.pool);
    if (Number.isFinite(pv)) { if (SLIN) mult *= Math.max(0.1, 1 - pv); else if (pv >= STAU) mult *= SMUL; }
  }
  let pos = Math.min(kelly() * eq * mult, cash - g);
  if (LPCAP > 0 && t.lp > 0) pos = Math.min(pos, LPCAP * t.lp);
  if (pos < MINPOS) { tolak.kas++; continue; }
  cash -= pos; openPos.set(t.pool, { pos, lp: t.lp }); beli++;
  if (t.lp > 0 && pos > 0.01 * t.lp) besar++;
  dump.push({ pool: t.pool, ds: t.ds, ret: t.ret, pos: +pos.toFixed(2), decide: t.decide, entry: t.entry, exit: t.exit, lp: t.lp, score: t.score });
}
const eqAkhir = cash + [...openPos.values()].reduce((a, x) => a + x.pos, 0);
const wins = closed.filter(c => c.ret > 1);
const PF = r => { const g = r.filter(c => c.pnl > 0).reduce((a, c) => a + c.pnl, 0), l = -r.filter(c => c.pnl <= 0).reduce((a, c) => a + c.pnl, 0); return l > 0 ? g / l : Infinity; };
const byDs = {}; for (const c of closed) { (byDs[c.ds] = byDs[c.ds] || []).push(c); }
const perDs = {}; for (const k of Object.keys(byDs)) perDs[k] = { n: byDs[k].length, pnl: +byDs[k].reduce((a, c) => a + c.pnl, 0).toFixed(2) };
const hasil = { varian: V + (process.env.TAG || ""), peluang: rows.length, beli, tutup: closed.length, tolak,
  win: +(100 * wins.length / Math.max(closed.length, 1)).toFixed(1),
  PF: PF(closed) === Infinity ? null : +PF(closed).toFixed(2),
  rugDimakan: closed.filter(c => c.ret < 0.3).length, eqAkhir: +eqAkhir.toFixed(2),
  ddMax: +(100 * ddMax).toFixed(1), killed, perDs, besar };
console.log(JSON.stringify(hasil));
fs.writeFileSync("arena_" + V + (process.env.TAG || "") + ".json", JSON.stringify({ hasil, closed, dump }));
