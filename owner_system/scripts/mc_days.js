// Monte Carlo "berapa hari $100 -> $10.000" untuk v4, compounding, modal TERBATAS & trade BERSAMAAN.
// Linimasa sintetis: tiap jam diisi salinan satu jam trading asli (dipilih acak), jarak masuk & lama pegang
// setiap trade dipertahankan. Posisi = min(fraksi x ekuitas, batas likuiditas trade, kas tersedia).
// Pakai: node mc_days.js <frac> <out.json> <trades1.jsonl> [trades2.jsonl ...]
const fs = require("fs");
const [frac, OUT, ...files] = [+process.argv[2], process.argv[3], ...process.argv.slice(4)];
const HOUR = 36000, DAYS = +(process.env.DAYS || 30), SIMS = +(process.env.SIMS || 2000), START = 100, TARGET = 10000;

// kumpulkan blok per jam dari tiap file (jam penuh saja)
const hours = [];
for (const f of files) {
  const T = fs.readFileSync(f, "utf8").trim().split("\n").map(JSON.parse).filter(t => t.plan === "v4");
  const release = t => (t.reason === "batas 6 jam" || t.reason === "tanpa swap setelah masuk") && t.init ? t.init + 216000 : t.exitBlk;
  const t0 = Math.min(...T.map(t => t.entryBlk)), t1 = Math.max(...T.map(t => t.entryBlk));
  const nH = Math.floor((t1 - t0) / HOUR);
  for (let h = 0; h < nH; h++) {
    const blk = T.filter(t => t.entryBlk >= t0 + h * HOUR && t.entryBlk < t0 + (h + 1) * HOUR)
      .map(t => ({ off: t.entryBlk - (t0 + h * HOUR), dur: Math.max(1, release(t) - t.entryBlk), size: t.size, ret: t.ret, txs: t.tp1 ? 3 : 2 }));
    hours.push(blk);
  }
}
const perHour = hours.reduce((a, h) => a + h.length, 0) / hours.length;
console.error(`blok jam: ${hours.length} | rata ${perHour.toFixed(1)} trade/jam | ${SIMS} simulasi x ${DAYS} hari`);

let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const H = DAYS * 24;
const eqByHour = Array.from({ length: H + 1 }, () => new Float64Array(SIMS));
const hitDay = [];
for (let s = 0; s < SIMS; s++) {
  // bangun event
  const ev = [];
  for (let h = 0; h < H; h++) {
    const src = hours[Math.floor(rnd() * hours.length)];
    for (const t of src) { const e = h * HOUR + t.off; ev.push([e, 0, t]); ev.push([e + t.dur, 1, t]); }
  }
  ev.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let cash = START, locked = 0, hIdx = 0, hit = null;
  const pos = new Map();
  eqByHour[0][s] = START;
  for (const [blk, type, t] of ev) {
    while (hIdx < H && blk >= (hIdx + 1) * HOUR) { hIdx++; eqByHour[hIdx][s] = cash + locked; if (hit === null && cash + locked >= TARGET) hit = hIdx / 24; }
    if (type === 0) {
      const p = Math.min(frac * (cash + locked), t.size, cash - 0.02 * t.txs);
      if (p >= 1) { cash -= p; locked += p; pos.set(t, (pos.get(t) || []).concat(p)); }
    } else {
      const arr = pos.get(t); if (!arr || !arr.length) continue;
      const p = arr.shift();
      locked -= p; cash += Math.max(0, p * (t.ret + 0.02 * t.txs / t.size) - 0.02 * t.txs);
    }
  }
  while (hIdx < H) { hIdx++; eqByHour[hIdx][s] = cash + locked; if (hit === null && cash + locked >= TARGET) hit = hIdx / 24; }
  hitDay.push(hit);
}
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const pct = eqByHour.map(col => [0.05, 0.25, 0.5, 0.75, 0.95].map(p => q(col, p)));
const samples = eqByHour.map(col => Array.from(col.slice(0, 40)));
const hits = hitDay.filter(x => x !== null);
const res = { frac, sims: SIMS, days: DAYS, hours_source: hours.length, trades_per_hour: perHour,
  hit_rate: hits.length / SIMS, hit_days: { p10: hits.length ? q(hits, 0.1) : null, p50: hits.length ? q(hits, 0.5) : null, p90: hits.length ? q(hits, 0.9) : null },
  hit_all: hitDay, pct, samples };
fs.writeFileSync(OUT, JSON.stringify(res));
console.log(JSON.stringify({ frac, hit_rate: res.hit_rate, hit_days: res.hit_days, day1_median: q(eqByHour[24], 0.5), day7_median: q(eqByHour[168], 0.5), day30_median: q(eqByHour[H], 0.5) }));
