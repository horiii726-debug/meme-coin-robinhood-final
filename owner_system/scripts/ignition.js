// MIKROSTRUKTUR DETIK-PER-DETIK SEBELUM LEDAKAN.
// "Penyalaan" = swap pertama saat nilai posisi (entry menit-1) tembus 2x.
// Lihat 60 detik sebelum & 30 detik sesudah, per detik (1 detik = 10 blok).
// Bandingkan moonshot per tingkat vs fakeout (tembus 2x tapi gagal ke 11x).
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "ds6d";
const PRE = 60, POST = 30, BPS = 10;          // detik sebelum/sesudah, blok per detik
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const win = new Map(JSON.parse(fs.readFileSync(path.join(DIR, "anatomy_winners.json"))).map(r => [r.pid, r]));
const fake = new Map(JSON.parse(fs.readFileSync(path.join(DIR, "anatomy_fakeouts.json"))).map(r => [r.pid, r]));
const pools = new Map();
for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.split(",");
  const pid = p[0].toLowerCase();
  if (win.has(pid) || fake.has(pid)) pools.set(pid, { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), hook: p[5].toLowerCase(), init: +p[6] });
}

const med = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const recs = [];

function analyze(pid, sw) {
  const m = pools.get(pid); if (!m) return;
  sw.sort((a, b) => a.blk - b.blk || a.li - b.li);
  let qIsC1;
  if (QDEC[m.c1] !== undefined) qIsC1 = true; else if (QDEC[m.c0] !== undefined) qIsC1 = false; else return;
  const quote = qIsC1 ? m.c1 : m.c0, qdec = QDEC[quote], usdPer = quote === USDG ? 1 : ethUsd;
  const toUsd = r => (Math.abs(r) / Math.pow(10, qdec)) * usdPer;
  const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
  const baseAmt = x => qIsC1 ? x.a0 : x.a1;
  const quoteAmt = x => qIsC1 ? x.a1 : x.a0;
  const rel = x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP);
  const ei = sw.findIndex(x => x.blk >= m.init + 600);
  if (ei < 0) return;
  const e = sw[ei];
  const size = Math.min(200, 0.01 * lpUsd(e));
  if (!isFinite(size) || size <= 0.5) return;
  const dIn = (size / usdPer) * Math.pow(10, qdec) * (1 - e.fee / 1e6);
  let base;
  if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
  else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
  const val = x => { const bIn = base * (1 - x.fee / 1e6); let r;
    if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; r = x.L * (x.sqrtP - 1 / inv); }
    else { const spb = x.sqrtP + bIn / x.L; r = x.L * (1 / x.sqrtP - 1 / spb); }
    return (!isFinite(r) || r <= 0) ? 0 : toUsd(r) / size; };
  const ii = sw.findIndex((x, i) => i > ei && val(x) >= 2);
  if (ii < 0) return;
  const ig = sw[ii], igBlk = ig.blk, igP = rel(ig);
  const isWin = win.has(pid);
  const pk = (isWin ? win.get(pid) : fake.get(pid)).pk;

  // ember per detik: -PRE..POST-1
  const B = Array.from({ length: PRE + POST }, () => ({ n: 0, b: 0, s: 0, bu: 0, su: 0 }));
  for (const x of sw) {
    const sec = Math.floor((x.blk - igBlk) / BPS);
    if (sec < -PRE || sec >= POST) continue;
    const k = sec + PRE;
    B[k].n++;
    if (baseAmt(x) > 0) { B[k].b++; B[k].bu += toUsd(quoteAmt(x)); } else { B[k].s++; B[k].su += toUsd(quoteAmt(x)); }
  }
  // fitur di titik penyalaan (hanya data SEBELUM & SAAT penyalaan)
  const pre = sw.filter(x => x.blk <= igBlk && x.blk > igBlk - PRE * BPS);
  const inLast = s => sw.filter(x => x.blk <= igBlk && x.blk > igBlk - s * BPS);
  const buysIn = s => inLast(s).filter(x => baseAmt(x) > 0);
  const sellsIn = s => inLast(s).filter(x => baseAmt(x) < 0);
  let streak = 0;
  for (let i = ii; i >= 0; i--) { if (baseAmt(sw[i]) > 0) streak++; else break; }
  const priceAt = s => { const tgt = igBlk - s * BPS; let best = null; for (const x of sw) { if (x.blk <= tgt) best = x; else break; } return best ? rel(best) : NaN; };
  const lpPre = (() => { const t = igBlk - PRE * BPS; let b = null; for (const x of sw) { if (x.blk <= t) b = x; else break; } return b ? lpUsd(b) : lpUsd(e); })();
  recs.push({
    pid, isWin, pk,
    tier: !isWin ? "fakeout" : pk >= 101 ? ">+10.000%" : pk >= 31 ? "+3.000-10.000%" : "+1.000-3.000%",
    secToIgnite: (igBlk - e.blk) / BPS,
    buys10: buysIn(10).length, buys30: buysIn(30).length, buys60: buysIn(60).length,
    sells10: sellsIn(10).length, sells30: sellsIn(30).length,
    bvol10: buysIn(10).reduce((a, x) => a + toUsd(quoteAmt(x)), 0),
    bvol30: buysIn(30).reduce((a, x) => a + toUsd(quoteAmt(x)), 0),
    accel: buysIn(10).length / Math.max(1, (buysIn(60).length - buysIn(10).length) / 5),
    streakAtIgnite: streak,
    txs30: new Set(inLast(30).map(x => x.tx)).size,
    ret10: igP / priceAt(10), ret30: igP / priceAt(30), ret60: igP / priceAt(60),
    lpGrow60: lpUsd(ig) / lpPre,
    maxBuy30: Math.max(0, ...buysIn(30).map(x => toUsd(quoteAmt(x)))),
    hook: m.hook !== NATIVE,
    buckets: B,
  });
}

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps_sorted.csv")), crlfDelay: Infinity });
  let cur = null, sw = [];
  for await (const line of rl) {
    if (!line) continue;
    const i1 = line.indexOf(",");
    const pid = line.slice(0, i1).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) { if (cur && pools.has(cur)) analyze(cur, sw); cur = pid; sw = []; }
    if (!pools.has(pid)) continue;
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    if (+p[1] > pools.get(pid).init + 216000) continue;
    sw.push({ blk: +p[1], li: +p[2], tx: p[3], a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
  }
  if (cur && pools.has(cur)) analyze(cur, sw);
  fs.writeFileSync(path.join(DIR, "ignition.json"), JSON.stringify(recs.map(({ buckets, ...r }) => r)));

  const tiers = ["+1.000-3.000%", "+3.000-10.000%", ">+10.000%", "fakeout"];
  console.log("=".repeat(104));
  console.log("KURVA DETIK-PER-DETIK DI SEKITAR PENYALAAN (median jumlah PEMBELIAN per 5 detik)");
  console.log("=".repeat(104));
  const hdr = ["-60..-55", "-30..-25", "-20..-15", "-15..-10", "-10..-5", "-5..0", "0..5", "5..10", "10..15", "25..30"];
  const ranges = [[-60, -55], [-30, -25], [-20, -15], [-15, -10], [-10, -5], [-5, 0], [0, 5], [5, 10], [10, 15], [25, 30]];
  console.log("tingkat".padEnd(18) + "n".padStart(5) + hdr.map(h => h.padStart(9)).join(""));
  for (const t of tiers) {
    const S = recs.filter(r => r.tier === t); if (!S.length) continue;
    const cells = ranges.map(([a, b]) => mean(S.map(r => { let s = 0; for (let k = a; k < b; k++) s += r.buckets[k + PRE].b; return s; })));
    console.log(t.padEnd(18) + String(S.length).padStart(5) + cells.map(c => c.toFixed(1).padStart(9)).join(""));
  }
  console.log("(rata-rata pembelian per jendela 5 detik; detik 0 = saat harga tembus 2x)");

  console.log("\nVOLUME BELI USD per 5 detik (rata-rata)");
  console.log("tingkat".padEnd(18) + "n".padStart(5) + hdr.map(h => h.padStart(9)).join(""));
  for (const t of tiers) {
    const S = recs.filter(r => r.tier === t); if (!S.length) continue;
    const cells = ranges.map(([a, b]) => mean(S.map(r => { let s = 0; for (let k = a; k < b; k++) s += r.buckets[k + PRE].bu; return s; })));
    console.log(t.padEnd(18) + String(S.length).padStart(5) + cells.map(c => ("$" + c.toFixed(0)).padStart(9)).join(""));
  }

  console.log("\n" + "=".repeat(104));
  console.log("CIRI DI DETIK PENYALAAN (median) — apakah tingkat moonshot punya pola SAMA?");
  console.log("=".repeat(104));
  const feats = [
    ["detik dari entry ke 2x", r => r.secToIgnite, x => x.toFixed(0) + "s"],
    ["beli 10 dtk terakhir", r => r.buys10, x => x.toFixed(0)],
    ["beli 30 dtk terakhir", r => r.buys30, x => x.toFixed(0)],
    ["beli 60 dtk terakhir", r => r.buys60, x => x.toFixed(0)],
    ["jual 30 dtk terakhir", r => r.sells30, x => x.toFixed(0)],
    ["vol beli 30 dtk", r => r.bvol30, x => "$" + x.toFixed(0)],
    ["akselerasi beli (10s vs rata2)", r => r.accel, x => x.toFixed(2) + "x"],
    ["beli beruntun saat tembus", r => r.streakAtIgnite, x => x.toFixed(0)],
    ["naik harga 10 dtk terakhir", r => r.ret10, x => ((x - 1) * 100).toFixed(0) + "%"],
    ["naik harga 60 dtk terakhir", r => r.ret60, x => ((x - 1) * 100).toFixed(0) + "%"],
    ["LP tumbuh 60 dtk terakhir", r => r.lpGrow60, x => x.toFixed(2) + "x"],
    ["beli terbesar 30 dtk", r => r.maxBuy30, x => "$" + x.toFixed(0)],
  ];
  console.log("ciri".padEnd(32) + tiers.map(t => t.padStart(17)).join(""));
  for (const [name, f, fmt] of feats) {
    console.log(name.padEnd(32) + tiers.map(t => { const S = recs.filter(r => r.tier === t).map(f).filter(isFinite); return (S.length ? fmt(med(S)) : "-").padStart(17); }).join(""));
  }

  // AUC: bisa bedakan moonshot vs fakeout DI DETIK PENYALAAN?
  const auc = (f) => {
    const P = recs.filter(r => r.isWin).map(f).filter(isFinite), N = recs.filter(r => !r.isWin).map(f).filter(isFinite);
    if (!P.length || !N.length) return NaN;
    let s = 0; for (const p of P) for (const n of N) s += p > n ? 1 : p === n ? 0.5 : 0;
    return s / (P.length * N.length);
  };
  console.log("\n" + "=".repeat(70));
  console.log("DAYA BEDA di detik penyalaan: moonshot vs fakeout (AUC; 0,5 = acak)");
  console.log("=".repeat(70));
  for (const [name, f] of feats) console.log(name.padEnd(34) + auc(f).toFixed(3));
})();
