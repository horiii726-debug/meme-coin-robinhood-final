// Seberapa MURAH harga masuk di detik-1 dibanding menit-5? (pertanyaan inti user)
// Dan berapa banyak pool yang harganya justru sudah lari sebelum menit-5.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "ds24";
const MARKS = [10, 100, 600, 1200, 3000];   // 1s, 10s, 1m, 2m, 5m

(async () => {
  const pools = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), hooks: p[5].toLowerCase(), init: +p[6] });
  }
  const sw = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps.csv")), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    if (!line) continue;
    const p = line.split(",");
    const pid = p[0].toLowerCase(); const m = pools.get(pid); if (!m) continue;
    const blk = +p[1]; if (blk > m.init + 4000) continue;      // cukup 5 menit pertama
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    if (!sw.has(pid)) sw.set(pid, []);
    sw.get(pid).push({ blk, sqrtP, L });
  }

  const ratios = MARKS.map(() => []);
  const avail = MARKS.map(() => 0);
  let n = 0;
  for (const [pid, m] of pools) {
    const s = (sw.get(pid) || []).sort((a, b) => a.blk - b.blk);
    if (s.length < 2) continue;
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else continue;
    const rel = x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP);
    const priceAt = w => { const c = s.filter(x => x.blk >= m.init + w); return c.length ? rel(c[0]) : null; };
    const p1 = priceAt(MARKS[0]);
    if (!p1 || !isFinite(p1)) continue;
    n++;
    MARKS.forEach((w, i) => {
      const p = priceAt(w);
      if (p && isFinite(p) && p > 0) { ratios[i].push(p / p1); avail[i]++; }
    });
  }
  const pct = (a, q) => { const t = [...a].sort((x, y) => x - y); return t.length ? t[Math.min(t.length-1, Math.floor(q*t.length))] : NaN; };
  console.log("=".repeat(72));
  console.log("HARGA MASUK relatif terhadap DETIK-1  (1.00 = sama; 2.00 = 2x lebih mahal)");
  console.log("=".repeat(72));
  console.log(`pool dianalisis: ${n}\n`);
  console.log("titik masuk".padEnd(14) + "ada data   p25     p50     p75     p90    >2x lebih mahal");
  console.log("-".repeat(72));
  MARKS.forEach((w, i) => {
    const lbl = w < 600 ? `${(w*0.1).toFixed(0)} detik` : `${(w*0.1/60).toFixed(0)} menit`;
    const r = ratios[i];
    const over2 = r.filter(x => x >= 2).length;
    console.log(lbl.padEnd(14) + String(avail[i]).padStart(7)
      + pct(r,.25).toFixed(2).padStart(8) + pct(r,.5).toFixed(2).padStart(8)
      + pct(r,.75).toFixed(2).padStart(8) + pct(r,.9).toFixed(2).padStart(8)
      + (`${(100*over2/Math.max(1,r.length)).toFixed(1)}%`).padStart(14));
  });
  console.log("\nBaca: p50 di menit-5 = harga median 5 menit setelah lahir, dibanding harga di detik-1.");
})();
