// Inspeksi satu pool Uniswap V2: pembeli/penjual ASLI (tx.from), bukan router.
const { execFileSync } = require("child_process");
const { id, Interface } = require("ethers");
const fs = require("fs");

const A = (process.argv[2] || "").toLowerCase();
const HOURS = parseFloat(process.env.HOURS || "2");
const BATCH = parseInt(process.env.BATCH || "40", 10);
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

function sleepSync(ms) { const e = Date.now() + ms; while (Date.now() < e); }
function post(body) {
  for (let a = 0; a < 7; a++) {
    try {
      const o = execFileSync("curl", ["-s", "-m", "150", "--doh-url", "https://cloudflare-dns.com/dns-query",
        "-X", "POST", "https://rpc.mainnet.chain.robinhood.com", "-H", "Content-Type: application/json",
        "-d", JSON.stringify(body)], { maxBuffer: 1 << 27 }).toString();
      const j = JSON.parse(o);
      if (Array.isArray(body) && !Array.isArray(j)) throw new Error("bukan array: " + JSON.stringify(j).slice(0, 90));
      return j;
    } catch (e) { if (a === 6) throw e; sleepSync(1500 * (a + 1)); }
  }
}
const rpc = (m, p) => { const j = post({ jsonrpc: "2.0", id: 1, method: m, params: p }); if (j.error) throw new Error(j.error.message); return j.result; };

const T_SWAP = id("Swap(address,uint256,uint256,uint256,uint256,address)");
const iface = new Interface(["event Swap(address indexed sender,uint amount0In,uint amount1In,uint amount0Out,uint amount1Out,address indexed to)"]);

const tip = parseInt(rpc("eth_blockNumber", []), 16);
const span = Math.round(HOURS * 36000);
const ev = [];
for (let b = tip - span; b < tip; b += 36000) {
  const to = Math.min(b + 35999, tip);
  const lg = rpc("eth_getLogs", [{ address: A, fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16) }]);
  for (const l of lg) {
    if (l.topics[0] !== T_SWAP) continue;
    const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
    const isBuy = Number(d.amount0In) > 0;
    const eth = isBuy ? Number(d.amount0In) / 1e18 : Number(d.amount0Out) / 1e18;
    ev.push({ tx: l.transactionHash, isBuy, usd: eth * ethUsd });
  }
}
const txs = [...new Set(ev.map(e => e.tx))];
console.log(`${HOURS} jam terakhir: ${ev.length} swap | ${txs.length} tx unik`);

const from = {};
let done = 0;
for (let i = 0; i < txs.length; i += BATCH) {
  const g = txs.slice(i, i + BATCH);
  let r;
  try { r = post(g.map((h, k) => ({ jsonrpc: "2.0", id: k, method: "eth_getTransactionByHash", params: [h] }))); }
  catch (e) { continue; }
  for (const it of r) { const t = it && it.result; if (t) from[t.hash] = t.from.toLowerCase(); }
  done += g.length;
  if (done % 400 === 0) console.error(`  ${done}/${txs.length} tx`);
}
console.log(`tx ter-resolusi: ${Object.keys(from).length}/${txs.length}`);

const buyers = {}, sellers = {}, bCnt = {}, sCnt = {};
for (const e of ev) {
  const f = from[e.tx]; if (!f) continue;
  if (e.isBuy) { buyers[f] = (buyers[f] || 0) + e.usd; bCnt[f] = (bCnt[f] || 0) + 1; }
  else { sellers[f] = (sellers[f] || 0) + e.usd; sCnt[f] = (sCnt[f] || 0) + 1; }
}
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
const money = v => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
const tb = sum(buyers), ts = sum(sellers);

console.log(`\nPEMBELI ASLI : ${Object.keys(buyers).length} dompet | ${money(tb)}`);
console.log(`PENJUAL ASLI : ${Object.keys(sellers).length} dompet | ${money(ts)}`);
console.log(`net          : ${money(tb - ts)}`);
const hhi = o => { const t = sum(o) || 1; return Object.values(o).reduce((a, v) => a + (v / t) ** 2, 0); };
console.log(`\nkonsentrasi (HHI, 1.0 = satu pihak): beli ${hhi(buyers).toFixed(3)} | jual ${hhi(sellers).toFixed(3)}`);
console.log(`\n5 PENJUAL TERBESAR:`);
top(sellers, 5).forEach(([w, v], i) => console.log(`  ${i + 1}. ${w}  ${money(v)}  ${(100 * v / ts).toFixed(1)}%  (${sCnt[w]}x)`));
console.log(`  top-5 = ${(100 * top(sellers, 5).reduce((a, b) => a + b[1], 0) / ts).toFixed(1)}% dari total jual`);
console.log(`\n5 PEMBELI TERBESAR:`);
top(buyers, 5).forEach(([w, v], i) => console.log(`  ${i + 1}. ${w}  ${money(v)}  ${(100 * v / tb).toFixed(1)}%  (${bCnt[w]}x)`));
console.log(`  top-5 = ${(100 * top(buyers, 5).reduce((a, b) => a + b[1], 0) / tb).toFixed(1)}% dari total beli`);
const both = Object.keys(buyers).filter(w => sellers[w]).length;
console.log(`\ndompet yang beli DAN jual: ${both} (${(100 * both / Math.max(Object.keys(buyers).length, 1)).toFixed(1)}% dari pembeli)`);
