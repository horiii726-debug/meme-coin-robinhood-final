// Anatomi satu pool Uniswap V3 (token0 = WETH): lahir -> puncak, per transaksi,
// termasuk dompet ASLI pembeli (tx.from) selama fase naik.
const { execFileSync } = require("child_process");
const { id, Interface } = require("ethers");
const fs = require("fs");

const POOL = (process.argv[2] || "").toLowerCase();
const Q96 = Math.pow(2, 96);
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;
const T_INIT = id("Initialize(uint160,int24)");
const T_SWAP = id("Swap(address,address,int256,int256,uint160,uint128,int24)");
const T_MINT = id("Mint(address,address,int24,int24,uint128,uint256,uint256)");
const T_BURN = id("Burn(address,int24,int24,uint128,uint256,uint256)");
const iface = new Interface(["event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"]);

function sleepSync(ms) { const e = Date.now() + ms; while (Date.now() < e); }
function post(body) {
  for (let a = 0; a < 7; a++) {
    try {
      const o = execFileSync("curl", ["-s", "-m", "150", "--doh-url", "https://cloudflare-dns.com/dns-query",
        "-X", "POST", "https://rpc.mainnet.chain.robinhood.com", "-H", "Content-Type: application/json",
        "-d", JSON.stringify(body)], { maxBuffer: 1 << 28 }).toString();
      const j = JSON.parse(o);
      if (Array.isArray(body) && !Array.isArray(j)) throw new Error("bukan array");
      return j;
    } catch (e) { if (a === 6) throw e; sleepSync(1500 * (a + 1)); }
  }
}
const rpc = (m, p) => { const j = post({ jsonrpc: "2.0", id: 1, method: m, params: p }); if (j.error) throw new Error(j.error.message); return j.result; };
const getRange = (topics, f, t) => {
  try { return rpc("eth_getLogs", [{ address: POOL, topics, fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) }]); }
  catch (e) { if (e.message.includes("exceeds limit") && t > f) { const m = Math.floor((f + t) / 2); return getRange(topics, f, m).concat(getRange(topics, m + 1, t)); } throw e; }
};

const tip = parseInt(rpc("eth_blockNumber", []), 16);
let init = null;
for (let b = 0; b <= tip && init === null; b += 8000000) {
  const lg = rpc("eth_getLogs", [{ address: POOL, topics: [T_INIT], fromBlock: "0x" + b.toString(16), toBlock: "0x" + Math.min(b + 7999999, tip).toString(16) }]);
  if (lg.length) init = parseInt(lg[0].blockNumber, 16);
}
const blkInfo = rpc("eth_getBlockByNumber", ["0x" + init.toString(16), false]);
console.log(`pool lahir blok ${init} (${new Date(parseInt(blkInfo.timestamp, 16) * 1000).toISOString()}), ${((tip - init) * 0.1 / 3600).toFixed(1)} jam lalu`);

const HZ = Math.min(tip - init, parseInt(process.env.HZ || "864000", 10));
const raw = [];
for (let b = init; b <= init + HZ; b += 36000) raw.push(...getRange([T_SWAP], b, Math.min(b + 35999, init + HZ)));
const mints = [], burns = [];
for (let b = init; b <= init + HZ; b += 216000) {
  mints.push(...getRange([T_MINT], b, Math.min(b + 215999, init + HZ)));
  burns.push(...getRange([T_BURN], b, Math.min(b + 215999, init + HZ)));
}
// token0 = WETH (quote). V3: amount dari sisi POOL. Beli token1 => pool menerima WETH (amount0 > 0).
const sw = raw.map(l => {
  const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
  const sqrtP = Number(d.sqrtPriceX96) / Q96, L = Number(d.liquidity);
  return { blk: parseInt(l.blockNumber, 16), li: parseInt(l.logIndex, 16), tx: l.transactionHash,
    a0: Number(d.amount0), a1: Number(d.amount1), sqrtP, L,
    price: 1 / (sqrtP * sqrtP) * ethUsd,             // USD per token1
    buy: Number(d.amount0) > 0, usd: Math.abs(Number(d.amount0)) / 1e18 * ethUsd };
}).filter(x => isFinite(x.sqrtP) && x.sqrtP > 0).sort((a, b) => a.blk - b.blk || a.li - b.li);
console.log(`swap dalam ${(HZ * 0.1 / 3600).toFixed(1)} jam: ${sw.length} | mint LP: ${mints.length} | burn LP: ${burns.length}`);
if (!sw.length) process.exit(0);

const p0 = sw[0].price;
let pk = 0, pki = 0;
sw.forEach((x, i) => { if (x.price > pk) { pk = x.price; pki = i; } });
const mins = b => ((b - init) * 0.1 / 60);
console.log(`\nswap pertama: blok +${sw[0].blk - init} (${mins(sw[0].blk).toFixed(1)} mnt) harga $${p0.toExponential(3)}`);
console.log(`PUNCAK: $${pk.toExponential(3)} di menit ${mins(sw[pki].blk).toFixed(1)} (${(mins(sw[pki].blk) / 60).toFixed(1)} jam) = +${((pk / p0 - 1) * 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}% dari swap pertama`);
console.log(`sekarang   : $${sw[sw.length - 1].price.toExponential(3)} = ${((sw[sw.length - 1].price / pk - 1) * 100).toFixed(1)}% dari puncak`);
const lpUsd = x => 2 * (x.L / x.sqrtP) / 1e18 * ethUsd;
console.log(`likuiditas aktif (virtual) di puncak ≈ $${Math.round(lpUsd(sw[pki])).toLocaleString("en-US")}`);

// koreksi sebelum puncak (dari harga)
let runMax = p0, maxDD = 0, dd30 = 0, dd50 = 0, in30 = false, in50 = false;
for (let i = 0; i <= pki; i++) {
  if (sw[i].price > runMax) { runMax = sw[i].price; in30 = in50 = false; }
  const dd = 1 - sw[i].price / runMax;
  if (dd > maxDD) maxDD = dd;
  if (dd >= 0.3 && !in30) { dd30++; in30 = true; }
  if (dd >= 0.5 && !in50) { dd50++; in50 = true; }
}
const run = sw.slice(0, pki + 1);
const buys = run.filter(x => x.buy), sells = run.filter(x => !x.buy);
const bV = buys.reduce((a, x) => a + x.usd, 0), sV = sells.reduce((a, x) => a + x.usd, 0);
const medf = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
let st = 0, best = 0; for (const x of run) { if (x.buy) { st++; if (st > best) best = st; } else st = 0; }
console.log(`\n--- FASE NAIK (lahir -> puncak) ---`);
console.log(`koreksi terdalam sebelum puncak: ${(100 * maxDD).toFixed(0)}% | koreksi >=30%: ${dd30}x | >=50%: ${dd50}x`);
console.log(`transaksi ${run.length} (beli ${buys.length} / jual ${sells.length}) | vol beli $${Math.round(bV).toLocaleString("en-US")} / jual $${Math.round(sV).toLocaleString("en-US")}`);
console.log(`beli median $${medf(buys.map(x => x.usd)).toFixed(0)} | terbesar $${Math.round(Math.max(...buys.map(x => x.usd), 0)).toLocaleString("en-US")} | beruntun beli terpanjang ${best}`);

// dompet asli selama fase naik
const txs = [...new Set(run.map(x => x.tx))];
const from = {};
for (let i = 0; i < txs.length; i += 40) {
  const g = txs.slice(i, i + 40);
  let r; try { r = post(g.map((h, k) => ({ jsonrpc: "2.0", id: k, method: "eth_getTransactionByHash", params: [h] }))); } catch (e) { continue; }
  for (const it of r) { const t = it && it.result; if (t) from[t.hash] = t.from.toLowerCase(); }
}
const bw = {}, sWal = {};
for (const x of run) { const f = from[x.tx]; if (!f) continue; if (x.buy) bw[f] = (bw[f] || 0) + x.usd; else sWal[f] = (sWal[f] || 0) + x.usd; }
const tot = Object.values(bw).reduce((a, b) => a + b, 0);
const topB = Object.entries(bw).sort((a, b) => b[1] - a[1]);
const hhi = Object.values(bw).reduce((a, v) => a + (v / tot) ** 2, 0);
console.log(`\n--- DOMPET PEMBELI (fase naik, ${Object.keys(from).length}/${txs.length} tx ter-resolusi) ---`);
console.log(`pembeli unik ${topB.length} | penjual unik ${Object.keys(sWal).length} | HHI beli ${hhi.toFixed(3)}`);
console.log(`top-1 ${(100 * (topB[0] ? topB[0][1] : 0) / tot).toFixed(1)}% | top-5 ${(100 * topB.slice(0, 5).reduce((a, b) => a + b[1], 0) / tot).toFixed(1)}% | top-10 ${(100 * topB.slice(0, 10).reduce((a, b) => a + b[1], 0) / tot).toFixed(1)}% dari volume beli`);
topB.slice(0, 5).forEach(([w, u], i) => console.log(`  ${i + 1}. ${w}  $${Math.round(u).toLocaleString("en-US")}  ${sWal[w] ? "(juga menjual $" + Math.round(sWal[w]).toLocaleString("en-US") + ")" : ""}`));

// 10 pembeli PERTAMA
console.log(`\n--- 10 TRANSAKSI PERTAMA ---`);
sw.slice(0, 10).forEach((x, i) => console.log(`  #${i + 1} blok +${x.blk - init}  ${x.buy ? "BELI" : "JUAL"} $${x.usd.toFixed(2).padStart(9)}  ${(from[x.tx] || "?").slice(0, 16)}`));

// per jam
console.log(`\n--- PER JAM ---`);
console.log("jam  swap  beli  jual   vol_beli    harga_akhir   vs_swap_pertama");
const H = new Map();
for (const x of sw) { const h = Math.floor((x.blk - init) / 36000); const e = H.get(h) || { n: 0, b: 0, s: 0, bv: 0, last: 0 }; e.n++; if (x.buy) { e.b++; e.bv += x.usd; } else e.s++; e.last = x.price; H.set(h, e); }
[...H.keys()].sort((a, b) => a - b).slice(0, 24).forEach(h => { const e = H.get(h); console.log(`${String(h).padStart(3)} ${String(e.n).padStart(5)} ${String(e.b).padStart(5)} ${String(e.s).padStart(5)}  $${Math.round(e.bv).toLocaleString("en-US").padStart(9)}   $${e.last.toExponential(3)}   ${((e.last / p0 - 1) * 100).toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(9)}%`); });
