// APAKAH POLA PONIE BERLAKU UMUM?
// Untuk tiap pool: hitung beli/jual PER JAM (jam 0,1,2,3), lalu kelompokkan
// berdasarkan hasil akhirnya. Pertanyaan: apakah pemenang menunjukkan
// RUNTUHNYA SISI JUAL di jam ke-1, seperti PONIE?
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "dsh";
const HOUR = 36000;
const NH = 4;                      // jam 0..3
const MIN_FOLLOW = 2 * HOUR;       // butuh >=2 jam tindak lanjut
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

(async () => {
  const pools = new Map();
  let maxBlk = 0;
  for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(",");
    const init = +p[6];
    if (init > maxBlk) maxBlk = init;
    pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), hook: p[5].toLowerCase(), init });
  }
  console.error(`pools: ${pools.size}`);

  const out = [];
  function flush(pid, rows) {
    const m = pools.get(pid); if (!m) return;
    rows.sort((a, b) => a.blk - b.blk);
    if (!rows.length) return;
    const lastBlk = rows[rows.length - 1].blk;
    if (lastBlk - m.init < MIN_FOLLOW) return;      // tindak lanjut kurang
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else return;
    const rel = x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP);
    const baseAmt = x => qIsC1 ? x.a0 : x.a1;
    const p0 = rel(rows[0]);
    if (!isFinite(p0) || p0 <= 0) return;
    let peak = 0;
    for (const x of rows) { const r = rel(x) / p0; if (isFinite(r) && r > peak) peak = r; }
    if (!isFinite(peak) || peak <= 0) return;

    const h = Array.from({ length: NH }, () => ({ b: 0, s: 0, lastP: null }));
    for (const x of rows) {
      const k = Math.floor((x.blk - m.init) / HOUR);
      if (k < 0 || k >= NH) continue;
      if (baseAmt(x) > 0) h[k].b++; else h[k].s++;
      const r = rel(x) / p0; if (isFinite(r)) h[k].lastP = r;
    }
    out.push({ pid, peak, hook: m.hook !== NATIVE, h });
  }

  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps_sorted.csv")), crlfDelay: Infinity });
  let cur = null, rows = [];
  for await (const line of rl) {
    if (!line) continue;
    const i1 = line.indexOf(",");
    const pid = line.slice(0, i1).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) { if (cur) flush(cur, rows); cur = pid; rows = []; }
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96;
    if (!isFinite(sqrtP) || sqrtP <= 0) continue;
    rows.push({ blk: +p[1], a0: +p[4], a1: +p[5], sqrtP });
  }
  if (cur) flush(cur, rows);
  console.error(`pool bisa dinilai: ${out.length}`);

  const tiers = [
    ["gagal (<2x)", r => r.peak < 2],
    ["+100-400%", r => r.peak >= 2 && r.peak < 5],
    ["+400-1000%", r => r.peak >= 5 && r.peak < 11],
    ["+1000-5000%", r => r.peak >= 11 && r.peak < 51],
    [">= +5000%", r => r.peak >= 51],
  ];
  const med = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

  console.log("\n" + "=".repeat(100));
  console.log("RASIO BELI/JUAL PER JAM — apakah sisi jual MENGERING di jam ke-1?");
  console.log("=".repeat(100));
  console.log("kelompok".padEnd(16) + "n".padStart(6) + "   jam0_B/J  jam1_B/J  jam2_B/J  jam3_B/J   |  jam0_jual jam1_jual  (median)");
  console.log("-".repeat(100));
  for (const [name, f] of tiers) {
    const S = out.filter(f);
    if (S.length < 5) { console.log(name.padEnd(16) + String(S.length).padStart(6) + "   (terlalu sedikit)"); continue; }
    const ratios = [], sells = [];
    for (let k = 0; k < NH; k++) {
      ratios.push(med(S.map(r => r.h[k].b / Math.max(r.h[k].s, 1))));
      sells.push(med(S.map(r => r.h[k].s)));
    }
    console.log(name.padEnd(16) + String(S.length).padStart(6)
      + ratios.map(v => v.toFixed(2).padStart(10)).join("")
      + "   |" + sells.slice(0, 2).map(v => String(v).padStart(10)).join(""));
  }

  console.log("\n" + "=".repeat(100));
  console.log("UJI LANGSUNG: apakah 'jual mengering di jam-1' memprediksi pemenang?");
  console.log("=".repeat(100));
  // definisi: rasio B/J jam1 >= 3x rasio B/J jam0, DAN jam1 punya >=20 beli
  const trig = r => {
    const r0 = r.h[0].b / Math.max(r.h[0].s, 1);
    const r1 = r.h[1].b / Math.max(r.h[1].s, 1);
    return r.h[1].b >= 20 && r1 >= 3 * Math.max(r0, 0.5);
  };
  const hit = out.filter(trig), miss = out.filter(r => !trig(r));
  const rate = (S, th) => S.length ? 100 * S.filter(r => r.peak >= th).length / S.length : 0;
  console.log(`pemicu menyala : ${hit.length} pool`);
  console.log(`tidak menyala  : ${miss.length} pool`);
  console.log("");
  console.log("kelompok".padEnd(22) + ">=+100%   >=+400%  >=+1000%  >=+5000%");
  console.log("-".repeat(64));
  console.log("PEMICU MENYALA".padEnd(22) + [2, 5, 11, 51].map(t => (rate(hit, t).toFixed(1) + "%").padStart(9)).join(""));
  console.log("tidak menyala".padEnd(22) + [2, 5, 11, 51].map(t => (rate(miss, t).toFixed(1) + "%").padStart(9)).join(""));
  console.log("semua pool".padEnd(22) + [2, 5, 11, 51].map(t => (rate(out, t).toFixed(1) + "%").padStart(9)).join(""));
})();
