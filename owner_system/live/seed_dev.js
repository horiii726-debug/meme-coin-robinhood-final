// Isi riwayat dev dari trade yang sudah selesai: dev = pemegang token terbesar di menit-1.
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const HERE = __dirname, PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951", ZERO = "0x0000000000000000000000000000000000000000";
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RPC = (process.env.RPC_URLS || "https://rpc.mainnet.chain.robinhood.com").split(",")[0];
const DOH = process.env.DOH_URL === undefined ? "https://cloudflare-dns.com/dns-query" : process.env.DOH_URL;
const rpc = (m, p) => {
  for (let a = 0; a < 5; a++) {
    const r = spawnSync("curl", ["-s", "-m", "30", ...(DOH ? ["--doh-url", DOH] : []), "-X", "POST", RPC, "-H", "Content-Type: application/json",
      "--data-binary", "@-"], { input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }), maxBuffer: 1 << 26 });
    try { const j = JSON.parse(r.stdout.toString()); if (!j.error) return j.result; } catch (e) {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800 * (a + 1));
  }
  return null;
};
const files = ["trades.jsonl", "trades_catchup_24jam.jsonl", "arsip_20260916/trades.jsonl", "arsip_20260917_1725/trades.jsonl"];
const seen = new Map();
for (const f of files) {
  const p = path.join(HERE, f); if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf8").trim().split("\n")) { if (!l.trim()) continue; const t = JSON.parse(l); if (t.plan === "v4") seen.set(t.pool, t); }
}
const pools = new Map();
for (const d of ["store", "arsip_20260916/store", "arsip_20260917_1725/store"]) {
  const p = path.join(HERE, d, "pools.csv"); if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf8").trim().split("\n").slice(1)) { const q = l.split(","); pools.set(q[0].toLowerCase(), q); }
}
const trades = [...seen.values()].sort((a, b) => b.init - a.init).slice(0, +(process.env.N || 400));
console.log(`trade dipakai: ${trades.length} (dari ${seen.size} total)`);
const DEVFILE = path.join(HERE, "dev_history.json");
const hist = fs.existsSync(DEVFILE) ? JSON.parse(fs.readFileSync(DEVFILE, "utf8")) : {};
let ok = 0, gagal = 0;
for (const [i, t] of trades.entries()) {
  const meta = pools.get(t.pool); if (!meta) { gagal++; continue; }
  const token = meta[1].toLowerCase() === ZERO ? meta[2].toLowerCase() : meta[1].toLowerCase();
  const logs = rpc("eth_getLogs", [{ address: token, topics: [T_TRANSFER], fromBlock: "0x" + t.init.toString(16), toBlock: "0x" + (t.init + 600).toString(16) }]);
  if (!logs) { gagal++; continue; }
  const bal = new Map();
  for (const l of logs) {
    const fr = "0x" + l.topics[1].slice(-40).toLowerCase(), to = "0x" + l.topics[2].slice(-40).toLowerCase(), v = Number(BigInt(l.data));
    if (fr !== ZERO) bal.set(fr, (bal.get(fr) || 0) - v);
    if (to !== ZERO) bal.set(to, (bal.get(to) || 0) + v);
  }
  let dev = null, bv = 0;
  for (const [k, v] of bal) if (v > bv && k !== PM && k !== ZERO) { dev = k; bv = v; }
  if (dev) { (hist[dev] = hist[dev] || []).push(t.ret); ok++; }
  if ((i + 1) % 50 === 0) { fs.writeFileSync(DEVFILE, JSON.stringify(hist)); console.log(`  ${i + 1}/${trades.length} | dev terdata ${ok} | gagal ${gagal}`); }
}
fs.writeFileSync(DEVFILE, JSON.stringify(hist));
const devs = Object.keys(hist), bersih = devs.filter(d => hist[d].every(r => r >= 0.3));
console.log(`SELESAI: ${devs.length} dev, ${bersih.length} tanpa rug (${(100 * bersih.length / devs.length).toFixed(0)}%) | koin terdata ${ok}, gagal ${gagal}`);
