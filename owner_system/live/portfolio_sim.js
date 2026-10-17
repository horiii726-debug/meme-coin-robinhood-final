// Simulasi PORTOFOLIO dengan modal terbatas: trade berjalan BERSAMAAN, uang terkunci sampai posisi ditutup.
// Posisi = min(fraksi x total ekuitas, batas likuiditas trade, kas tersedia). Kas < $1 -> trade dilewati.
// Modal terkunci sampai exit; untuk "batas 6 jam" sampai jam ke-6 setelah pool lahir.
const fs = require("fs");
const HZ = 216000;
const [file, plan, frac, start] = [process.argv[2], process.argv[3], +process.argv[4], +process.argv[5]];
const T = fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse).filter(t => t.plan === plan);
const ev = [];
T.forEach((t, k) => {
  ev.push({ blk: t.entryBlk, type: 0, k });
  ev.push({ blk: t.reason === "batas 6 jam" || t.reason === "tanpa swap setelah masuk" ? t.init + HZ : t.exitBlk, type: 1, k });
});
ev.sort((a, b) => a.blk - b.blk || b.type - a.type);   // tutup dulu baru buka di blok yang sama
let cash = start, locked = 0, peak = start, dd = 0, taken = 0, skipped = 0, maxOpen = 0, open = 0;
const pos = new Map();
for (const e of ev) {
  const t = T[e.k];
  if (e.type === 0) {
    const equity = cash + locked;
    const txs = t.tp1 ? 3 : 2;
    let p = Math.min(frac * equity, t.size, cash - 0.02 * txs);
    if (p < 1) { skipped++; continue; }
    cash -= p; locked += p; pos.set(e.k, p); taken++; open++; maxOpen = Math.max(maxOpen, open);
  } else if (pos.has(e.k)) {
    const p = pos.get(e.k); pos.delete(e.k); open--;
    const txs = t.tp1 ? 3 : 2;
    const gross = t.ret + 0.02 * txs / t.size;             // nilai per $1 sebelum gas
    locked -= p; cash += Math.max(0, p * gross - 0.02 * txs);
    const eq = cash + locked; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak);
  }
}
const eq = cash + locked;
const hours = (Math.max(...ev.map(e => e.blk)) - Math.min(...ev.map(e => e.blk))) * 0.1 / 3600;
console.log(JSON.stringify({ plan, frac, start, final: +eq.toFixed(2), ret_pct: +(100 * (eq / start - 1)).toFixed(0), taken, skipped, maxOpen, dd_pct: +(100 * dd).toFixed(0), hours: +hours.toFixed(1) }));
