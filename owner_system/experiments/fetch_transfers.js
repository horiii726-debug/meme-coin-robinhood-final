// Transfer ERC20 menit pertama (init .. init+600) untuk setiap koin yang ditrade v4.
const fs = require("fs");
const { spawnSync } = require("child_process");
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NATIVE = "0x0000000000000000000000000000000000000000";
const trades = ["v4_L.jsonl", "v4_B.jsonl"].flatMap(f => fs.readFileSync(f, "utf8").trim().split("\n").map(JSON.parse)).filter(t => t.plan === "v4");
const pools = new Map(fs.readFileSync("ds6d/pools.csv", "utf8").trim().split("\n").slice(1).map(l => l.trim().split(",")).map(p => [p[0].toLowerCase(), p]));
const OUT = "la/transfers.json";
const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = trades.filter(t => !done[t.pool]).map(t => { const p = pools.get(t.pool); const token = p[1].toLowerCase() === NATIVE ? p[2].toLowerCase() : p[1].toLowerCase(); return { pool: t.pool, token, init: t.init }; });
function batch(calls) {
  for (let a = 0; a < 16; a++) {
    const r = spawnSync("curl", ["-s", "-m", "120", "--doh-url", "https://cloudflare-dns.com/dns-query", "-X", "POST", "https://rpc.mainnet.chain.robinhood.com",
      "-H", "Content-Type: application/json", "--data-binary", "@-"], { input: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getLogs", params: [c] }))), maxBuffer: 1 << 29 });
    try { const j = JSON.parse(r.stdout.toString()); if (Array.isArray(j) && j.every(x => x.result)) return j.sort((x, y) => x.id - y.id).map(x => x.result); } catch (e) {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(40000, 1000 * 2 ** a));
  }
  throw new Error("gagal");
}
const B = 20;
for (let i = 0; i < todo.length; i += B) {
  const part = todo.slice(i, i + B);
  const res = batch(part.map(x => ({ address: x.token, topics: [T_TRANSFER], fromBlock: "0x" + x.init.toString(16), toBlock: "0x" + (x.init + 600).toString(16) })));
  part.forEach((x, k) => { done[x.pool] = { token: x.token, tr: res[k].map(l => [parseInt(l.blockNumber, 16), parseInt(l.logIndex, 16), "0x" + l.topics[1].slice(26), "0x" + l.topics[2].slice(26), l.data === "0x" ? "0" : BigInt(l.data).toString()]) }; });
  fs.writeFileSync(OUT, JSON.stringify(done));
  console.error(`transfer ${Object.keys(done).length}/${trades.length}`);
}
console.error("SELESAI transfer");
