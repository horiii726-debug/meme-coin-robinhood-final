// Agent 9 — korelasi rugi & posisi bersamaan pada 178 trade (akun basis, hasil replay risk09.js)
const { run, tOf, BPS } = require("./risk09.js");
const B = run();
const C = B.closed.map(c => ({ ...c })); // pos, pnl, entry, exit, eqAtEntry
// decide block (waktu beli akun) = blok putus; pakai entry untuk mulai posisi (selisih ~30 blok)
const W30 = 1800 / BPS, W60 = 3600 / BPS;
const fmt = b => new Date(tOf(b) * 1000 + 7 * 3600e3).toISOString().slice(5, 16).replace("T", " ") + " WIB";
// equity (harga beli) pada blok b dari kurva akun
const eqAt = b => { let e = 100; for (const [bb, v] of B.log) { if (bb <= b) e = v; else break; } return e; };

// 1) posisi bersamaan saat membeli & berbobot waktu
const conc = C.map(c => C.filter(d => d.entry <= c.entry && d.exit > c.entry).length);
const hist = {}; conc.forEach(k => hist[k] = (hist[k] || 0) + 1);
console.log("POSISI TERBUKA saat beli (termasuk yg baru):", JSON.stringify(hist), "maks", Math.max(...conc));
// berbobot waktu selama ada >=1 posisi
const pts = []; C.forEach(c => { pts.push([c.entry, 1]); pts.push([c.exit, -1]); }); pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
let k = 0, last = pts[0][0]; const tw = {};
for (const [b, d] of pts) { tw[k] = (tw[k] || 0) + (b - last); k += d; last = b; }
const totAct = Object.entries(tw).filter(([kk]) => +kk > 0).reduce((a, [, v]) => a + v, 0);
console.log("waktu dgn >=1 posisi (jam):", (totAct * BPS / 3600).toFixed(1), "| sebaran berbobot waktu:",
  Object.entries(tw).filter(([kk]) => +kk > 0).map(([kk, v]) => kk + ":" + (100 * v / totAct).toFixed(1) + "%").join(" "));
// eksposur (harga beli) maks sbg % equity
let expMax = 0, expAt = 0;
for (const c of C) { const o = C.filter(d => d.entry <= c.entry && d.exit > c.entry); const s = o.reduce((a, d) => a + d.pos, 0); const e = c.eqAtEntry + c.pos * 0; const r = s / (e); if (r > expMax) { expMax = r; expAt = c.entry; } }
console.log("eksposur maks (sesudah beli):", (100 * expMax).toFixed(1) + "% equity @", fmt(expAt));

// 2) jendela 30 mnt & 60 mnt terburuk menurut MASUK: rugi posisi yg dibuka di jendela itu
function worstWin(W, key) {
  let best = null;
  for (const c of C) {
    const a = c[key], set = C.filter(d => d[key] >= a && d[key] < a + W);
    const los = set.filter(d => d.pnl < 0), sum = los.reduce((s, d) => s + d.pnl, 0), net = set.reduce((s, d) => s + d.pnl, 0);
    const e0 = eqAt(a - 1);
    if (!best || sum / e0 < best.frac) best = { at: fmt(a), n: set.length, nRugi: los.length, rugi: sum, net, e0, frac: sum / e0, netFrac: net / e0, ds: c.ds };
  }
  return best;
}
for (const [nm, W] of [["30 mnt", W30], ["60 mnt", W60]]) for (const key of ["entry", "exit"]) {
  const r = worstWin(W, key);
  console.log(`TERBURUK ${nm} menurut ${key === "entry" ? "MASUK" : "KELUAR"}: ${r.at} (${r.ds}) | ${r.n} trade, ${r.nRugi} rugi | rugi $${r.rugi.toFixed(2)} = ${(100 * r.frac).toFixed(1)}% equity $${r.e0.toFixed(0)} | bersih ${(100 * r.netFrac).toFixed(1)}%`);
}
// 3) rugi BERBARENGAN: pada satu saat, posisi terbuka yg akhirnya rugi (pnl<0) — nilai rugi akhirnya / equity saat itu
let worst = null;
for (const c of C) {
  const o = C.filter(d => d.entry <= c.entry && d.exit > c.entry); const los = o.filter(d => d.pnl < 0);
  const s = los.reduce((a, d) => a + d.pnl, 0), e = c.eqAtEntry;
  if (!worst || s / e < worst.frac) worst = { at: fmt(c.entry), n: o.length, nRugi: los.length, s, e, frac: s / e, ds: c.ds };
}
console.log(`RUGI BERBARENGAN terburuk: ${worst.at} (${worst.ds}) | ${worst.n} posisi terbuka, ${worst.nRugi} berakhir rugi | $${worst.s.toFixed(2)} = ${(100 * worst.frac).toFixed(1)}% equity $${worst.e.toFixed(0)}`);
const mx = Math.max(...C.map(c => C.filter(d => d.entry <= c.entry && d.exit > c.entry && d.pnl < 0).length));
console.log("maks posisi terbuka bersamaan yg akhirnya rugi:", mx);
// 4) rugi per hari WIB (realisasi saat keluar)
const day = {}; for (const c of C) { const d = fmt(c.exit).slice(0, 5); day[d] = day[d] || { pnl: 0, n: 0, e0: eqAt(c.exit - 1) }; day[d].pnl += c.pnl; day[d].n++; }
const dd = Object.entries(day).map(([d, v]) => [d, v.n, v.pnl, v.pnl / v.e0]).sort((a, b) => a[3] - b[3]);
console.log("HARI terburuk (realisasi, % equity awal hari kira2):", dd.slice(0, 5).map(x => `${x[0]} ${x[1]}tr $${x[2].toFixed(0)} ${(100 * x[3]).toFixed(1)}%`).join(" | "));
// 5) DD tersembunyi: kurva harga-beli vs kurva di mana posisi rugi dinilai pada nilai akhirnya sejak masuk (ukuran posisi TETAP)
const evs = []; C.forEach(c => { evs.push(c.entry); evs.push(c.exit); }); evs.sort((a, b) => a - b);
let pk1 = 100, pk2 = 100, dd1 = 0, dd2 = 0, at2 = 0;
for (const b of evs) {
  const e1 = eqAt(b);
  const hidden = C.filter(d => d.entry <= b && d.exit > b && d.pnl < 0).reduce((a, d) => a + d.pnl, 0);
  const e2 = e1 + hidden;
  pk1 = Math.max(pk1, e1); pk2 = Math.max(pk2, e2); dd1 = Math.max(dd1, 1 - e1 / pk1); if (1 - e2 / pk2 > dd2) { dd2 = 1 - e2 / pk2; at2 = b; }
}
console.log(`DD harga-beli ${(100 * dd1).toFixed(1)}% vs DD jika rugi terbuka diakui ${(100 * dd2).toFixed(1)}% @ ${fmt(at2)}`);
// 6) batas 9 jam: posisi yg rugi & lama
const hz = C.filter(c => /akhir data|9 jam|batas/.test(c.reason || ""));
console.log("keluar batas 9 jam:", hz.length, "pnl $" + hz.reduce((a, c) => a + c.pnl, 0).toFixed(0), "| pos rata2 % equity", (100 * hz.reduce((a, c) => a + c.pos / c.eqAtEntry, 0) / hz.length).toFixed(1) + "%");
// 7) rugi beruntun: P(rugi | trade tutup sebelumnya rugi) vs P(rugi)
{ const s = [...C].sort((a, b) => a.exit - b.exit); let a = 0, b = 0; for (let i = 1; i < s.length; i++) if (s[i - 1].pnl < 0) { b++; if (s[i].pnl < 0) a++; }
  console.log(`P(rugi)=${(100 * C.filter(c => c.pnl < 0).length / C.length).toFixed(1)}% | P(rugi | sebelumnya rugi)=${(100 * a / b).toFixed(1)}% (n=${b})`); }
