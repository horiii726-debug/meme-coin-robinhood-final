// meniru parseStore (paper_live.js:263-279) untuk swaps.csv: ukur waktu, heap, byte/baris
const fs = require("fs"); const f = process.argv[2];
global.gc(); const h0 = process.memoryUsage().heapUsed, t0 = Date.now();
const txt = fs.readFileSync(f, "utf8"); const ev = [];
const lines = txt.split("\n").slice(1);
for (const l of lines) { if (!l.trim()) continue; const q = l.trim().split(",");
  ev.push({ k: "S", id: q[0], blk: +q[1], li: +q[2], tx: q[3], a0: BigInt(q[4]), a1: BigInt(q[5]), sqrtPX96: BigInt(q[6]), L: BigInt(q[7]), tick: +q[8], fee: +q[9] }); }
const tParse = Date.now() - t0; const m1 = process.memoryUsage();
ev.sort((a, b) => a.blk - b.blk || a.li - b.li);
const m2 = process.memoryUsage();
console.log(JSON.stringify({ file: f, bytes: txt.length, rows: ev.length, byte_per_row: +(txt.length / ev.length).toFixed(1), parse_ms: tParse, sort_ms: Date.now() - t0 - tParse,
  heap_peak_MB: +((m2.heapUsed - h0) / 1e6).toFixed(0), heap_per_row_B: +((m1.heapUsed - h0) / ev.length).toFixed(0), rss_MB: +(m2.rss / 1e6).toFixed(0) }));
