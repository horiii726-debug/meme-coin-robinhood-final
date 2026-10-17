// JUAL BERTAHAP: TP1 mengamankan kemenangan (win rate), SISA dibiarkan jalan (moonshot).
// Sisa memakai aturan v2: stop berbasis arus + tanda pucuk + tanda dump + detektor rug, tanpa batas 15 menit.
// Konfigurasi dipilih di periode LAMA saja, lalu dicek di BARU. Jeda eksekusi LATB blok (default 30 = 3 dtk).
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const Q96 = Math.pow(2, 96);
const DIR = "ds6d";
const SPLIT = 59886162, HZ = 216000, MIN = 600;
const LATB = parseInt(process.env.LATB || "30", 10);
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const pools = new Map();
for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.split(","); const hooks = p[5].toLowerCase(), bits = BigInt(hooks) & 0x3fffn;
  pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), fee: +p[3], beforeSwap: Number((bits >> 7n) & 1n), init: +p[6] });
}
const safe = m => (m.c0 === NATIVE || m.c1 === NATIVE) && m.fee <= 5000 && m.beforeSwap === 0;
const liq = new Map();
for (const line of fs.readFileSync(path.join(DIR, "liq.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = line.split(","); const pid = p[0].toLowerCase(); const m = pools.get(pid);
  if (!m || !safe(m)) continue;
  if (!liq.has(pid)) liq.set(pid, []);
  liq.get(pid).push({ blk: +p[1], d: BigInt(p[5]) });
}

// skor model hold/jual per pool (dari train_state.py)
const SC = new Map();
for (const line of fs.readFileSync("state_scores.csv", "utf8").trim().split("\n").slice(1)) {
  const p = line.split(","); const pid = p[0].trim().toLowerCase();
  if (!SC.has(pid)) SC.set(pid, { blk: [], pn: [], pd: [] });
  const e = SC.get(pid); e.blk.push(+p[1]); e.pn.push(+p[3]); e.pd.push(+p[4]);
}
// grid konfigurasi
const CONFIGS = [];
for (const tp of [1.2, 1.3, 1.5, 1.7, 2.0]) {
  const tag = "TP1 +" + Math.round((tp - 1) * 100) + "% jual 60%";
  CONFIGS.push({ name: tag + " | sisa: aturan v2", tp, frac: 0.6, pre: "hard40", run: "v2" });
  for (const th of [0.3, 0.4, 0.5, 0.6]) CONFIGS.push({ name: tag + " | sisa: model bahaya>=" + th, tp, frac: 0.6, pre: "hard40", run: "danger", th });
  for (const th of [0.4, 0.5]) CONFIGS.push({ name: tag + " | sisa: v2 tapi TAHAN bila p_naik>=" + th, tp, frac: 0.6, pre: "hard40", run: "hold", th });
}
CONFIGS.push({ name: "PEMBANDING v3: TP1 +20% jual 85% | sisa v2", tp: 1.2, frac: 0.85, pre: "hard40", run: "v2" });
CONFIGS.push({ name: "PEMBANDING v2: tanpa TP1", tp: Infinity, frac: 0, pre: "flow", run: "v2" });

const res = new Map(CONFIGS.map(c => [c.name, { LAMA: [], BARU: [] }]));

function run(pid, sw) {
  const m = pools.get(pid); if (!m || !safe(m)) return;
  const period = m.init < SPLIT ? "LAMA" : "BARU";
  if (m.init + HZ > (period === "LAMA" ? 56196161 : 60750162)) return;
  sw.sort((a, b) => a.blk - b.blk || a.li - b.li);
  const qIsC1 = m.c1 === NATIVE;
  const toUsd = r => (Math.abs(r) / 1e18) * ethUsd;
  const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
  const isBuy = x => (qIsC1 ? x.a0 : x.a1) > 0;
  const sellUsd = x => (Math.abs(qIsC1 ? x.a1 : x.a0) / 1e18) * ethUsd;
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
  // nilai USD saat menjual bTok token di swap x
  const sellVal = (x, bTok) => { if (bTok <= 0) return 0; const bIn = bTok * (1 - x.fee / 1e6); let r;
    if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; r = x.L * (x.sqrtP - 1 / inv); }
    else { const spb = x.sqrtP + bIn / x.L; r = x.L * (1 / x.sqrtP - 1 / spb); }
    return (!isFinite(r) || r <= 0) ? 0 : toUsd(r); };
  const V = all.map((x, i) => i > ei ? sellVal(x, base) / size : 0);   // kelipatan posisi penuh (untuk pemicu)
  let rugBlk = null, warnBlk = null;
  { let a = 0n, r = 0n;
    for (const ev of (liq.get(pid) || []).sort((x, y) => x.blk - y.blk)) {
      if (ev.d > 0n) a += ev.d; else r += -ev.d;
      if (a > 0n) { if (warnBlk === null && r * 100n / a > 30n) warnBlk = ev.blk; if (rugBlk === null && r * 100n / a > 80n) rugBlk = ev.blk; }
    } }
  const fillIdx = trig => { const tgt = all[trig].blk + LATB; let j = trig + 1; while (j < all.length && all[j].blk < tgt) j++; return Math.min(j, all.length - 1); };
  const realize = (idx, bTok) => (rugBlk !== null && rugBlk <= all[idx].blk) ? 0 : sellVal(all[idx], bTok);

  let perfect = 0; for (let k = ei + 1; k < V.length; k++) if (V[k] > perfect) perfect = V[k];
  for (const C of CONFIGS) {
    let peak = 1, rem = base, proceeds = 0, txs = 1, tpDone = false;
    const S = SC.get(pid); let sp = -1;
    let lo = 0, b = 0, s = 0, sUsdW = 0, sCnt = 0, sUsd = 0, exitIdx = -1, lastIdx = ei;
    for (let i = 0; i < all.length; i++) {
      const x = all[i];
      if (isBuy(x)) b++; else { s++; sUsdW += sellUsd(x); }
      while (all[lo].blk <= x.blk - 600) { if (isBuy(all[lo])) b--; else { s--; sUsdW -= sellUsd(all[lo]); } lo++; }
      if (i <= ei) continue;
      lastIdx = i;
      const v = V[i]; if (v > peak) peak = v;
      if (!isBuy(x)) { sCnt++; sUsd += sellUsd(x); }
      if (S) while (sp + 1 < S.blk.length && S.blk[sp + 1] <= x.blk) sp++;
      const pn = S && sp >= 0 ? S.pn[sp] : null, pd = S && sp >= 0 ? S.pd[sp] : null;
      // TP1
      if (!tpDone && C.frac > 0 && v >= C.tp) {
        const fi = fillIdx(i); const sellTok = base * C.frac;
        proceeds += realize(fi, sellTok); rem -= sellTok; txs++; tpDone = true;
        if (rem <= base * 1e-9) { exitIdx = fi; break; }
        continue;
      }
      // aturan keluar posisi (sisa, atau penuh sebelum TP1)
      let trig = false;
      if (warnBlk !== null && x.blk > warnBlk) trig = true;
      if (!trig && !isBuy(x) && sellUsd(x) >= 0.05 * lpUsd(x)) trig = true;                           // tanda dump
      if (!trig && peak >= 3 && s >= 3 && sCnt >= 6 && (sUsdW / s) >= 1.5 * (sUsd / sCnt)) trig = true; // tanda pucuk
      if (!trig && tpDone && C.run === "danger" && pd !== null && pd >= C.th) trig = true;
      if (!trig && tpDone && C.run === "danger" && v <= peak * 0.10) trig = true;     // stop bencana
      const holdOn = tpDone && C.run === "hold" && pn !== null && pn >= C.th;
      if (!trig && !(tpDone && C.run === "danger") && !holdOn) {
        let tr;
        if (!tpDone && C.pre === "hard40") tr = 0.40;
        else if (!tpDone && C.pre === "hard30") tr = 0.30;
        else { const strong = b >= s && b >= 3; tr = peak >= 10 ? (strong ? 0.50 : 0.20) : (strong ? 0.80 : 0.30); }
        if (v <= peak * (1 - tr)) trig = true;
      }
      if (trig) { exitIdx = fillIdx(i); break; }
    }
    if (exitIdx < 0) {
      // tidak pernah terpicu dalam horizon: jual di swap terakhir; kalau rug terjadi sebelum akhir horizon -> 0
      exitIdx = lastIdx;
      proceeds += (rugBlk !== null && rugBlk <= m.init + HZ) ? 0 : sellVal(all[exitIdx], rem);
    } else if (rem > base * 1e-9) {
      proceeds += realize(exitIdx, rem);
    }
    txs++;
    const pnl = proceeds - size - 0.02 * txs;
    res.get(C.name)[period].push({ pnl, size, ret: (proceeds - 0.02 * txs) / size,
      hold: (all[exitIdx].blk - e.blk) * 0.1 / 60, perfect });
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

  const med = a => { const t = [...a].sort((x, y) => x - y); return t.length ? t[Math.floor(t.length / 2)] : NaN; };
  const st = tr => {
    const p = tr.map(t => t.pnl), gp = p.filter(x => x > 0).reduce((a, b) => a + b, 0), gl = -p.filter(x => x < 0).reduce((a, b) => a + b, 0);
    const sorted = [...p].sort((a, b) => b - a);
    const moon = tr.filter(t => t.perfect >= 11);
    return { n: tr.length, win: tr.filter(t => t.pnl > 0).length / tr.length, pf: gl ? gp / gl : Infinity,
      mean: tr.reduce((a, t) => a + t.ret, 0) / tr.length - 1, pnl: p.reduce((a, b) => a + b, 0),
      noTop: p.reduce((a, b) => a + b, 0) - Math.max(sorted[0], 0),
      holdAvg: tr.reduce((a, t) => a + t.hold, 0) / tr.length, holdMed: med(tr.map(t => t.hold)),
      x11: tr.filter(t => t.ret >= 11).length, x2: tr.filter(t => t.ret >= 2).length, x31: tr.filter(t => t.ret >= 31).length,
      top10: (() => { const r = tr.map(t => t.ret).sort((a, b) => b - a); const k = Math.max(1, Math.floor(r.length * 0.1)); return r.slice(0, k).reduce((a, b) => a + b, 0) / k - 1; })(),
      maxRet: Math.max(...tr.map(t => t.ret)) - 1,
      moonCap: moon.length ? med(moon.map(t => t.ret / t.perfect)) : NaN, moonN: moon.length };
  };
  const rows = CONFIGS.map(C => ({ C, L: st(res.get(C.name).LAMA), B: st(res.get(C.name).BARU) }));
  const fmt = x => `${String(x.n).padStart(4)} ${(100 * x.win).toFixed(0).padStart(4)}% ${x.pf.toFixed(2).padStart(5)} ${(100 * x.mean).toFixed(0).padStart(5)}% ${("$" + x.pnl.toFixed(0)).padStart(8)} ${("$" + x.noTop.toFixed(0)).padStart(8)} ${(x.holdAvg.toFixed(0) + "/" + x.holdMed.toFixed(0) + "m").padStart(8)} ${String(x.x11).padStart(4)} ${String(x.x31).padStart(4)} ${("+" + (100 * x.top10).toFixed(0) + "%").padStart(7)} ${(isNaN(x.moonCap) ? "-" : (100 * x.moonCap).toFixed(0) + "%").padStart(5)} ${("+" + (100 * x.maxRet).toFixed(0) + "%").padStart(9)}`;
  const hdr = "   n  win    PF  rata2      PnL   -top1  hold a/m >=10x >=30x top10%avg tangkap  terbesar";
  let out = `JUAL BERTAHAP — saringan aman, jeda eksekusi ${LATB} blok (${(LATB * 0.1).toFixed(1)} dtk)\n`;
  out += "\nKONFIGURASI SISA 40% diurutkan menurut RETURN RATA-RATA periode LAMA (win rate LAMA >= WMIN):\n";
  out += "konfigurasi".padEnd(44) + "| LAMA" + hdr + " | BARU" + hdr + "\n";
  for (const r of rows.filter(r => r.L.win >= parseFloat(process.env.WMIN || "0.5")).sort((a, b) => b.L.mean - a.L.mean))
    out += r.C.name.padEnd(44) + "|     " + fmt(r.L) + " |     " + fmt(r.B) + "\n";
  out += "\nPEMBANDING:\n";
  for (const r of rows.filter(r => r.C.name.startsWith("PEMBANDING")))
    out += r.C.name.padEnd(44) + "|     " + fmt(r.L) + " |     " + fmt(r.B) + "\n";
  fs.writeFileSync(process.env.OUTT || "exit_tp_out.txt", out);
  process.stdout.write(out);
})();
