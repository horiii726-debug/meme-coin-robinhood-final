// REPUTASI DEPLOYER — apakah rekam jejak pembuat memprediksi koin berikutnya?
// ANTI-BOCOR: rekam jejak dihitung HANYA dari pool yang dia buat SEBELUMNYA.
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2] || "ds24";

// deployer
const dev = new Map(), initBlk = new Map();
for (const l of fs.readFileSync(path.join(DIR, "deployers_bq.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.split(",");
  dev.set(p[0].toLowerCase(), p[1].toLowerCase());
  initBlk.set(p[0].toLowerCase(), +p[2]);
}
// hasil per pool (best_mult = exit terbaik yang bisa dieksekusi)
const best = new Map();
{
  const L = fs.readFileSync(path.join(DIR, "sim.csv"), "utf8").trim().split("\n");
  const H = L[0].split(","); const bi = H.indexOf("best_mult");
  for (const l of L.slice(1)) { const p = l.split(","); best.set(p[0].toLowerCase(), +p[bi]); }
}
// label rug
const rug = new Map();
{
  const L = fs.readFileSync(path.join(DIR, "features.csv"), "utf8").trim().split("\n");
  const H = L[0].split(","); const ri = H.indexOf("y_rug");
  for (const l of L.slice(1)) { const p = l.split(","); rug.set(p[0].toLowerCase(), +p[ri]); }
}

// ---------- 1. berapa pool per deployer ----------
const byDev = new Map();
for (const [pid, d] of dev) {
  if (!byDev.has(d)) byDev.set(d, []);
  byDev.get(d).push(pid);
}
const counts = [...byDev.values()].map(a => a.length).sort((a, b) => b - a);
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length-1, Math.floor(q*s.length))]; };
console.log("=".repeat(72));
console.log("1. SIAPA YANG MEMBUAT KOIN-KOIN INI");
console.log("=".repeat(72));
console.log(`pool               : ${dev.size}`);
console.log(`deployer unik      : ${byDev.size}`);
console.log(`pool per deployer  : p50=${pct(counts,.5)}  p90=${pct(counts,.9)}  p99=${pct(counts,.99)}  max=${counts[0]}`);
const multi = counts.filter(c => c > 1).length;
console.log(`deployer >1 pool   : ${multi} (${(100*multi/byDev.size).toFixed(1)}%)`);
console.log(`pool dari deployer >1 : ${counts.filter(c=>c>1).reduce((s,x)=>s+x,0)} (${(100*counts.filter(c=>c>1).reduce((s,x)=>s+x,0)/dev.size).toFixed(1)}%)`);
console.log(`\n10 deployer terbesar (jumlah pool): ${counts.slice(0,10).join(", ")}`);

// ---------- 2. rekam jejak berjalan (anti-bocor) ----------
const pools = [...dev.keys()].filter(p => best.has(p)).sort((a, b) => initBlk.get(a) - initBlk.get(b));
const hist = new Map();   // deployer -> {n, hits10x, hits100x, rugs}
const rows = [];
for (const pid of pools) {
  const d = dev.get(pid);
  const h = hist.get(d) || { n: 0, h10: 0, h100: 0, rug: 0 };
  rows.push({
    pid, d,
    prevN: h.n, prev10: h.h10, prev100: h.h100, prevRug: h.rug,
    best: best.get(pid), rug: rug.get(pid),
  });
  const b = best.get(pid);
  h.n++;
  if (b >= 11) h.h10++;
  if (b >= 101) h.h100++;
  if (rug.get(pid) === 1) h.rug++;
  hist.set(d, h);
}

console.log("\n" + "=".repeat(72));
console.log("2. APAKAH REKAM JEJAK MEMPREDIKSI KOIN BERIKUTNYA?");
console.log("   (rekam jejak HANYA dari pool yang dia buat SEBELUMNYA)");
console.log("=".repeat(72));
const grp = (name, f) => {
  const s = rows.filter(f);
  if (!s.length) { console.log(name.padEnd(46) + "  (0 pool)"); return; }
  const h11 = s.filter(r => r.best >= 11).length;
  const h2 = s.filter(r => r.best >= 2).length;
  const h101 = s.filter(r => r.best >= 101).length;
  console.log(name.padEnd(46) + String(s.length).padStart(6)
    + (100*h2/s.length).toFixed(1).padStart(9) + "%"
    + (100*h11/s.length).toFixed(2).padStart(9) + "%"
    + (100*h101/s.length).toFixed(2).padStart(9) + "%");
};
console.log("kelompok".padEnd(46) + "  pool" + "   >=+100%" + "  >=+1000%" + " >=+10000%");
console.log("-".repeat(72));
grp("deployer BARU (belum pernah bikin)", r => r.prevN === 0);
grp("pernah bikin 1-2 koin sebelumnya", r => r.prevN >= 1 && r.prevN <= 2);
grp("pernah bikin 3-9 koin sebelumnya", r => r.prevN >= 3 && r.prevN <= 9);
grp("pernah bikin >=10 koin sebelumnya", r => r.prevN >= 10);
console.log("-".repeat(72));
grp("BELUM pernah punya koin >=+1000%", r => r.prevN >= 1 && r.prev10 === 0);
grp("PERNAH punya koin >=+1000%", r => r.prev10 >= 1);
grp("PERNAH punya koin >=+10000%", r => r.prev100 >= 1);
console.log("-".repeat(72));
grp("rekam jejak: 0 rug", r => r.prevN >= 2 && r.prevRug === 0);
grp("rekam jejak: semua rug", r => r.prevN >= 2 && r.prevRug === r.prevN);

const base = rows.filter(r => r.best >= 11).length;
console.log("-".repeat(72));
console.log(`SEMUA POOL (pembanding)`.padEnd(46) + String(rows.length).padStart(6)
  + (100*rows.filter(r=>r.best>=2).length/rows.length).toFixed(1).padStart(9) + "%"
  + (100*base/rows.length).toFixed(2).padStart(9) + "%"
  + (100*rows.filter(r=>r.best>=101).length/rows.length).toFixed(2).padStart(9) + "%");
