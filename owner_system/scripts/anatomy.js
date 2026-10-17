// ANATOMI KENAIKAN — koin yang naik >=1000% (nilai bisa dicairkan), diperiksa per transaksi.
// Menjawab: bagaimana harga naik (mulus/tangga/parabola), seberapa dalam koreksi di tengah,
// siapa yang membeli (ukuran & konsentrasi), dan apa yang terjadi TEPAT sebelum puncak.
// Pembanding: "fakeout" = sempat >=2x tapi tidak sampai 11x.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "ds6d";
const HZ = parseInt(process.env.HZ || "216000", 10);   // lacak sampai 6 jam
const BLK_MIN = 600;                                      // 600 blok = 1 menit
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const med = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

(async () => {
  const pools = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), fee: +p[3], hook: p[5].toLowerCase(), init: +p[6] });
  }
  const W = [], F = [];

  function analyze(pid, sw) {
    const m = pools.get(pid); if (!m || sw.length < 10) return;
    sw.sort((a, b) => a.blk - b.blk || a.li - b.li);
    const all = sw.filter(x => x.blk <= m.init + HZ);
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else return;
    const quote = qIsC1 ? m.c1 : m.c0, qdec = QDEC[quote];
    const usdPer = quote === USDG ? 1 : ethUsd;
    const toUsd = r => (Math.abs(r) / Math.pow(10, qdec)) * usdPer;
    const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
    const baseAmt = x => qIsC1 ? x.a0 : x.a1;
    const quoteAmt = x => qIsC1 ? x.a1 : x.a0;
    const rel = x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP);

    const ei = all.findIndex(x => x.blk >= m.init + BLK_MIN);
    if (ei < 0 || ei >= all.length - 5) return;
    const e = all[ei];
    const lpE = lpUsd(e);
    const size = Math.min(200, 0.01 * lpE);
    if (!isFinite(size) || size <= 0.5) return;
    const dIn = (size / usdPer) * Math.pow(10, qdec) * (1 - e.fee / 1e6);
    let base;
    if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
    else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
    if (!isFinite(base) || base <= 0) return;
    const val = x => {
      const bIn = base * (1 - x.fee / 1e6); let r;
      if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; r = x.L * (x.sqrtP - 1 / inv); }
      else { const spb = x.sqrtP + bIn / x.L; r = x.L * (1 / x.sqrtP - 1 / spb); }
      return (!isFinite(r) || r <= 0) ? 0 : toUsd(r) / size;
    };

    const after = all.slice(ei + 1);
    const v = after.map(val);
    let pk = 0, pki = 0;
    for (let i = 0; i < v.length; i++) if (v[i] > pk) { pk = v[i]; pki = i; }
    const isWin = pk >= 11, isFake = pk >= 2 && pk < 11;
    if (!isWin && !isFake) return;

    // waktu mencapai ambang (menit sejak entry)
    const tHit = th => { const i = v.findIndex(x => x >= th); return i < 0 ? NaN : (after[i].blk - e.blk) / BLK_MIN; };
    // koreksi terdalam SEBELUM puncak (yang membunuh trailing stop)
    let runMax = 1, maxDD = 0, dd30 = 0, dd50 = 0, inDD30 = false, inDD50 = false;
    for (let i = 0; i <= pki; i++) {
      if (v[i] > runMax) { runMax = v[i]; inDD30 = false; inDD50 = false; }
      const dd = 1 - v[i] / runMax;
      if (dd > maxDD) maxDD = dd;
      if (dd >= 0.3 && !inDD30) { dd30++; inDD30 = true; }
      if (dd >= 0.5 && !inDD50) { dd50++; inDD50 = true; }
    }
    // fase naik: entry -> puncak
    const run = after.slice(0, pki + 1);
    const buys = run.filter(x => baseAmt(x) > 0), sells = run.filter(x => baseAmt(x) < 0);
    const bU = buys.map(x => toUsd(quoteAmt(x))), sU = sells.map(x => toUsd(quoteAmt(x)));
    const bVol = bU.reduce((a, b) => a + b, 0), sVol = sU.reduce((a, b) => a + b, 0);
    const bSorted = [...bU].sort((a, b) => b - a);
    const top5pct = bSorted.slice(0, Math.max(1, Math.ceil(bSorted.length * 0.05))).reduce((a, b) => a + b, 0);
    let streak = 0, best = 0;
    for (const x of run) { if (baseAmt(x) > 0) { streak++; if (streak > best) best = streak; } else streak = 0; }
    const txs = new Set(run.map(x => x.tx)).size;
    // 10% transaksi terakhir sebelum puncak (sinyal pucuk?)
    const tailN = Math.max(5, Math.floor(run.length * 0.1));
    const tail = run.slice(-tailN);
    const tB = tail.filter(x => baseAmt(x) > 0).length, tS = tail.length - tB;
    const tSellU = tail.filter(x => baseAmt(x) < 0).map(x => toUsd(quoteAmt(x)));
    // setelah puncak
    const postAt = mins => { const tgt = after[pki].blk + mins * BLK_MIN; const j = after.findIndex((x, i) => i > pki && x.blk >= tgt); return j < 0 ? NaN : v[j] / pk; };
    // naik dari harga LAHIR (swap pertama) ke puncak harga mentah
    const p0 = rel(all[0]); let rawPk = 0;
    for (const x of all) { const r = rel(x) / p0; if (isFinite(r) && r > rawPk) rawPk = r; }

    const rec = {
      pid, pk, rawFromBirth: rawPk, hook: m.hook !== NATIVE, fee: m.fee, lpE, lpPk: lpUsd(after[pki]), size,
      t2: tHit(2), t5: tHit(5), t11: tHit(11), tPk: (after[pki].blk - e.blk) / BLK_MIN,
      maxDD, dd30, dd50,
      runSwaps: run.length, runBuys: buys.length, runSells: sells.length, runTx: txs,
      bVol, sVol, buySellVolRatio: bVol / Math.max(sVol, 1), buyMed: med(bU), buyP90: q(bU, 0.9), buyMax: bSorted[0] || 0,
      top5pctShare: bVol ? top5pct / bVol : 0, longestBuyStreak: best,
      tailBuyRatio: tB / Math.max(tail.length, 1), tailSellMed: med(tSellU), runSellMed: med(sU),
      post5: postAt(5), post30: postAt(30),
    };
    (isWin ? W : F).push(rec);
  }

  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps_sorted.csv")), crlfDelay: Infinity });
  let cur = null, sw = [];
  for await (const line of rl) {
    if (!line) continue;
    const i1 = line.indexOf(",");
    const pid = line.slice(0, i1).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) { if (cur) analyze(cur, sw); cur = pid; sw = []; }
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    sw.push({ blk: +p[1], li: +p[2], tx: p[3], a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
  }
  if (cur) analyze(cur, sw);

  fs.writeFileSync(path.join(DIR, "anatomy_winners.json"), JSON.stringify(W));
  fs.writeFileSync(path.join(DIR, "anatomy_fakeouts.json"), JSON.stringify(F));
  const money = x => "$" + Number(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const row = (name, f, fmt = x => x.toFixed(2)) => {
    const a = med(W.map(f).filter(isFinite)), b = med(F.map(f).filter(isFinite));
    console.log(name.padEnd(40) + fmt(a).padStart(14) + fmt(b).padStart(14));
  };
  console.log(`MOONSHOT (>=+1000% bisa dicairkan): ${W.length} | FAKEOUT (2x-11x, gagal lanjut): ${F.length}`);
  console.log("=".repeat(70));
  console.log("ciri (median)".padEnd(40) + "MOONSHOT".padStart(14) + "FAKEOUT".padStart(14));
  console.log("-".repeat(70));
  console.log("--- KECEPATAN (menit sejak entry menit-1) ---");
  row("capai 2x", r => r.t2, x => x.toFixed(1) + "m");
  row("capai 5x", r => r.t5, x => isNaN(x) ? "-" : x.toFixed(1) + "m");
  row("capai 11x", r => r.t11, x => isNaN(x) ? "-" : x.toFixed(1) + "m");
  row("capai puncak", r => r.tPk, x => x.toFixed(1) + "m");
  console.log("--- KOREKSI DI TENGAH JALAN (sebelum puncak) ---");
  row("koreksi terdalam", r => r.maxDD, x => (100 * x).toFixed(0) + "%");
  row("jumlah koreksi >=30%", r => r.dd30, x => x.toFixed(0));
  row("jumlah koreksi >=50%", r => r.dd50, x => x.toFixed(0));
  console.log("--- PEMBELI SELAMA NAIK ---");
  row("transaksi selama naik", r => r.runSwaps, x => x.toFixed(0));
  row("pembelian", r => r.runBuys, x => x.toFixed(0));
  row("penjualan", r => r.runSells, x => x.toFixed(0));
  row("volume beli", r => r.bVol, money);
  row("rasio volume beli/jual", r => r.buySellVolRatio, x => x.toFixed(2) + "x");
  row("ukuran beli median", r => r.buyMed, money);
  row("ukuran beli p90", r => r.buyP90, money);
  row("beli terbesar", r => r.buyMax, money);
  row("porsi vol dari 5% beli terbesar", r => r.top5pctShare, x => (100 * x).toFixed(0) + "%");
  row("beruntun beli terpanjang", r => r.longestBuyStreak, x => x.toFixed(0));
  console.log("--- TEPAT SEBELUM PUNCAK (10% transaksi terakhir) ---");
  row("porsi beli di ekor", r => r.tailBuyRatio, x => (100 * x).toFixed(0) + "%");
  row("ukuran jual median di ekor", r => r.tailSellMed, money);
  row("ukuran jual median selama naik", r => r.runSellMed, money);
  console.log("--- SETELAH PUNCAK (nilai relatif puncak) ---");
  row("5 menit setelah puncak", r => r.post5, x => isNaN(x) ? "-" : (100 * x).toFixed(0) + "%");
  row("30 menit setelah puncak", r => r.post30, x => isNaN(x) ? "-" : (100 * x).toFixed(0) + "%");
  console.log("--- STRUKTUR ---");
  row("LP saat entry", r => r.lpE, money);
  row("LP saat puncak", r => r.lpPk, money);
  row("fee (1e-6)", r => r.fee, x => x.toFixed(0));
  console.log("punya hook".padEnd(40) + ((100 * W.filter(r => r.hook).length / W.length).toFixed(0) + "%").padStart(14) + ((100 * F.filter(r => r.hook).length / F.length).toFixed(0) + "%").padStart(14));

  console.log("\nSEBARAN KOREKSI TERDALAM SEBELUM PUNCAK — moonshot:");
  for (const p of [0.25, 0.5, 0.75, 0.9]) console.log(`  p${p * 100}: ${(100 * q(W.map(r => r.maxDD), p)).toFixed(0)}%`);
  for (const t of [0.3, 0.5, 0.7, 0.85]) console.log(`  trailing -${t * 100}% akan terpental SEBELUM puncak pada ${(100 * W.filter(r => r.maxDD >= t).length / W.length).toFixed(0)}% moonshot`);
})();
