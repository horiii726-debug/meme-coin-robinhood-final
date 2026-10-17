// Ukur biaya gas ASLI swap Uniswap v4 di Robinhood Chain dari receipt transaksi (sampel swap menit-1 koin yang ditrade).
const fs = require("fs"); const { spawnSync } = require("child_process");
const batch = calls => {
  for (let a = 0; a < 8; a++) {
    const r = spawnSync("curl", ["-s", "-m", "120", "--doh-url", "https://cloudflare-dns.com/dns-query", "-X", "POST", "https://rpc.mainnet.chain.robinhood.com",
      "-H", "Content-Type: application/json", "--data-binary", "@-"], { input: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, ...c }))), maxBuffer: 1 << 28 });
    try { const j = JSON.parse(r.stdout.toString()); if (Array.isArray(j) && j.every(x => !x.error)) return j.sort((x, y) => x.id - y.id).map(x => x.result); } catch (e) {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000 * (a + 1));
  }
  throw new Error("batch gagal");
};
const SW = JSON.parse(fs.readFileSync("audit/swaps_m1.json", "utf8"));
const T = ["audit/L_full.jsonl", "audit/B_full.jsonl"].flatMap(f => fs.readFileSync(f, "utf8").trim().split("\n").map(JSON.parse)).filter(t => t.plan === "v4");
const eth = Object.fromEntries(T.map(t => [t.pool, t.ethUsd]));
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pools = Object.keys(SW).filter(p => eth[p]); const pick = [];
while (pick.length < 400) { const p = pools[Math.floor(rnd() * pools.length)]; const s = SW[p][Math.floor(rnd() * SW[p].length)]; pick.push({ tx: s[2], pool: p, eth: eth[p] }); }
const uniq = [...new Map(pick.map(x => [x.tx, x])).values()];
const out = [];
for (let i = 0; i < uniq.length; i += 25) {
  const part = uniq.slice(i, i + 25);
  const rc = batch(part.map(x => ({ method: "eth_getTransactionReceipt", params: [x.tx] })));
  rc.forEach((r, k) => { if (!r) return; const gu = parseInt(r.gasUsed, 16), gp = parseInt(r.effectiveGasPrice, 16), l1 = r.gasUsedForL1 ? parseInt(r.gasUsedForL1, 16) : null;
    out.push({ tx: part[k].tx, to: r.to, status: r.status, gasUsed: gu, gasUsedForL1: l1, gwei: gp / 1e9, usd: gu * gp / 1e18 * part[k].eth }); });
}
const gp = batch([{ method: "eth_gasPrice", params: [] }, { method: "eth_blockNumber", params: [] }]);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const usd = out.map(o => o.usd), gas = out.map(o => o.gasUsed), l1 = out.filter(o => o.gasUsedForL1 !== null).map(o => o.gasUsedForL1);
const byTo = {}; out.forEach(o => byTo[o.to] = (byTo[o.to] || 0) + 1);
const res = { n: out.length, usd_p10: q(usd, .1), usd_p50: q(usd, .5), usd_p90: q(usd, .9), usd_mean: usd.reduce((a, b) => a + b, 0) / usd.length,
  gas_p50: q(gas, .5), gas_p90: q(gas, .9), l1gas_p50: l1.length ? q(l1, .5) : null, gwei_p50: q(out.map(o => o.gwei), .5),
  gasPrice_now_gwei: parseInt(gp[0], 16) / 1e9, top_to: Object.entries(byTo).sort((a, b) => b[1] - a[1]).slice(0, 5) };
fs.writeFileSync("audit/gas.json", JSON.stringify({ res, out }, null, 1));
console.log(JSON.stringify(res, null, 1));
