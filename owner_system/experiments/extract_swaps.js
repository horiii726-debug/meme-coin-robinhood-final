// Swap menit pertama (<= init+600) + swap sampai blok keputusan untuk setiap koin yang ditrade.
const fs = require("fs"); const readline = require("readline");
const trades = ["v4_L.jsonl", "v4_B.jsonl"].flatMap(f => fs.readFileSync(f, "utf8").trim().split("\n").map(JSON.parse)).filter(t => t.plan === "v4");
const want = new Map(trades.map(t => [t.pool, t.init]));
const out = {};
(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream("ds6d/swaps_sorted.csv"), crlfDelay: Infinity });
  for await (const line of rl) {
    const id = line.slice(0, line.indexOf(",")).toLowerCase(); const init = want.get(id); if (init === undefined) continue;
    const p = line.split(","); const blk = +p[1]; if (blk > init + 600) continue;
    (out[id] = out[id] || []).push([blk, +p[2], p[3], p[4], p[5], p[6], p[7], +p[9]]);
  }
  fs.writeFileSync("la/swaps_m1.json", JSON.stringify(out)); console.error("swap menit-1 untuk", Object.keys(out).length, "pool");
})();
