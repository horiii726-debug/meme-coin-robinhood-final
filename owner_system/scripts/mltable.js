// Tabel latih ML: fitur arus (jendela 1 menit) + REPUTASI DEV (berjalan, anti-bocor)
// + struktur pool. Target: seberapa jauh koin ini naik (nilai yang bisa dicairkan).
const fs = require("fs");
const path = require("path");

const DIR = process.argv[2] || "ds24";
const FEATFILE = process.env.FEAT || "features_w600.csv";
const NATIVE = "0x0000000000000000000000000000000000000000";

// --- deployer + urutan waktu ---
const devOf = new Map(), initOf = new Map();
for (const l of fs.readFileSync(path.join(DIR, "deployers_bq.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.split(",");
  devOf.set(p[0].toLowerCase(), p[1].toLowerCase());
  initOf.set(p[0].toLowerCase(), +p[2]);
}
// --- hasil (exit terbaik yang bisa dieksekusi) ---
const best = new Map();
{
  const L = fs.readFileSync(path.join(DIR, "sim.csv"), "utf8").trim().split("\n");
  const H = L[0].split(","); const bi = H.indexOf("best_mult");
  for (const l of L.slice(1)) { const p = l.split(","); best.set(p[0].toLowerCase(), +p[bi]); }
}
// --- struktur pool ---
const meta = new Map();
for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.split(",");
  meta.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), hook: p[5].toLowerCase() });
}

// --- REPUTASI DEV BERJALAN: hanya dari pool yang dia buat SEBELUMNYA ---
const ordered = [...devOf.keys()].filter(p => best.has(p)).sort((a, b) => initOf.get(a) - initOf.get(b));
const rep = new Map();     // pool -> snapshot reputasi dev SAAT pool ini lahir
const acc = new Map();     // dev -> akumulasi
for (const pid of ordered) {
  const d = devOf.get(pid);
  const a = acc.get(d) || { n: 0, h2: 0, h11: 0, h101: 0, sum: 0 };
  rep.set(pid, {
    dev_n_prev: a.n,
    dev_rate2: a.n ? a.h2 / a.n : -1,
    dev_rate11: a.n ? a.h11 / a.n : -1,
    dev_has11: a.h11 > 0 ? 1 : 0,
    dev_has101: a.h101 > 0 ? 1 : 0,
    dev_avg_mult: a.n ? a.sum / a.n : -1,
  });
  const b = best.get(pid);
  a.n++; a.sum += Math.min(b, 200);
  if (b >= 2) a.h2++;
  if (b >= 11) a.h11++;
  if (b >= 101) a.h101++;
  acc.set(d, a);
}
// kepadatan launch: berapa pool lahir dalam 6000 blok (10 mnt) sebelum pool ini
// kepadatan launch dari SEMUA pool yang lahir (sama seperti radar), bukan hanya yang punya hasil
const allBirth = [];
for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.split(","); allBirth.push({ pid: p[0].toLowerCase(), blk: +p[6] });
}
allBirth.sort((a, b) => a.blk - b.blk);
const density = new Map();
{
  let lo = 0;
  for (let i = 0; i < allBirth.length; i++) {
    while (allBirth[i].blk - allBirth[lo].blk > 6000) lo++;
    density.set(allBirth[i].pid, i - lo);
  }
}

// --- fitur arus ---
const L = fs.readFileSync(path.join(DIR, FEATFILE), "utf8").trim().split("\n");
const H = L[0].split(","); const I = {}; H.forEach((h, i) => I[h] = i);
const DROP = new Set(["pool_id", "y_rug", "y_dump", "best_mult_after", "end_mult_after", "lp_peak_after"]);
const FLOW = H.filter(h => !DROP.has(h));
const REPCOLS = ["dev_n_prev", "dev_rate2", "dev_rate11", "dev_has11", "dev_has101", "dev_avg_mult"];
const EXTRA = ["launch_density_10m", "hook_beforeSwap", "quote_eth"];

const out = fs.createWriteStream(path.join(DIR, "ml.csv"));
out.write(["pool_id", "init_block", ...FLOW, ...REPCOLS, ...EXTRA, "y_mult"].join(",") + "\n");
let n = 0;
for (const l of L.slice(1)) {
  const p = l.split(",");
  const pid = p[0].toLowerCase();
  const b = best.get(pid); if (b === undefined || !isFinite(b)) continue;
  const r = rep.get(pid); if (!r) continue;
  const m = meta.get(pid); if (!m) continue;
  const bits = BigInt(m.hook) & 0x3fffn;
  const beforeSwap = (bits >> 7n) & 1n;   // bit ke-7 = beforeSwap
  out.write([pid, initOf.get(pid),
    ...FLOW.map(f => { const v = +p[I[f]]; return isFinite(v) ? v : 0; }),
    ...REPCOLS.map(c => r[c]),
    density.get(pid) || 0, Number(beforeSwap), (m.c0 === NATIVE || m.c1 === NATIVE) ? 1 : 0,
    b.toFixed(4)].join(",") + "\n");
  n++;
}
out.end();
console.error(`tabel ML: ${n} baris, ${FLOW.length + REPCOLS.length + EXTRA.length} fitur`);
