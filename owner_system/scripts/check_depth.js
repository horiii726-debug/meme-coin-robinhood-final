// Uji model-free: apakah rumus cadangan virtual sahih untuk sizing?
// Untuk swap dalam rentang likuiditas konstan berlaku EKSAK:  amount1 = L * d(sqrtP)
// Jadi L_tersirat = amount1 / d(sqrtP) harus == L yang dilaporkan di event.
// Kalau rasionya ~1, rumus TVL & slippage saya sahih. Kalau jauh <1, terlalu optimistis.
const fs = require("fs");
const { Interface, id } = require("ethers");
const iface = new Interface([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
]);
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const T_INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const Q96 = Math.pow(2, 96);
const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const pools = new Map(), seq = new Map();
for (const file of process.argv.slice(2)) {
  const txt = fs.readFileSync(file, "utf8");
  for (const line of txt.split("\n")) {
    if (!line) continue;
    const l = JSON.parse(line);
    const t = l.topics[0];
    if (t === T_INIT) {
      try { const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
        pools.set(d.id.toLowerCase(), { c0: d.currency0.toLowerCase(), c1: d.currency1.toLowerCase() });
      } catch (e) {}
    } else if (t === T_SWAP) {
      try {
        const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
        const pid = d.id.toLowerCase();
        if (!seq.has(pid)) seq.set(pid, []);
        seq.get(pid).push({ blk: parseInt(l.blockNumber, 16), li: parseInt(l.logIndex, 16),
          sqrtP: Number(d.sqrtPriceX96) / Q96, L: Number(d.liquidity),
          a0: Number(d.amount0), a1: Number(d.amount1) });
      } catch (e) {}
    }
  }
}

const ratios = [], sizes = [];
for (const [pid, arr] of seq) {
  const p = pools.get(pid); if (!p) continue;
  let quoteIsC1 = null;
  if (QDEC[p.c1] !== undefined) quoteIsC1 = true;
  else if (QDEC[p.c0] !== undefined) quoteIsC1 = false;
  else continue;
  const quote = quoteIsC1 ? p.c1 : p.c0;
  const usd = quote === USDG ? 1 : ethUsd;
  arr.sort((a, b) => a.blk - b.blk || a.li - b.li);
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1], cur = arr[i];
    const dS = cur.sqrtP - prev.sqrtP;
    if (!isFinite(dS) || dS === 0 || !cur.L) continue;
    // amount1 = L * dSqrtP  (token1);  amount0 = L * d(1/sqrtP) (token0)
    const implied = Math.abs(quoteIsC1 ? cur.a1 / dS
                              : cur.a0 / (1 / cur.sqrtP - 1 / prev.sqrtP));
    if (!isFinite(implied) || implied <= 0) continue;
    const r = implied / cur.L;
    if (r > 0 && r < 100) ratios.push(r);
    // ukuran swap nyata dalam USD
    const raw = Math.abs(quoteIsC1 ? cur.a1 : cur.a0) / Math.pow(10, QDEC[quote]);
    const u = raw * usd;
    if (isFinite(u) && u > 0) sizes.push(u);
  }
}

const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(q * s.length)] : 0; };
console.log("=".repeat(64));
console.log("UJI MODEL-FREE: L_tersirat / L_dilaporkan");
console.log("=".repeat(64));
console.log(`pasangan swap berurutan diuji : ${ratios.length}`);
for (const q of [0.1, 0.25, 0.5, 0.75, 0.9]) console.log(`  p${String(Math.round(q*100)).padStart(2)} : ${pct(ratios, q).toFixed(3)}`);
const med = pct(ratios, 0.5);
const near1 = ratios.filter(r => r > 0.9 && r < 1.1).length;
console.log(`\ndalam +-10% dari 1.0 : ${near1}/${ratios.length} (${(100*near1/Math.max(1,ratios.length)).toFixed(1)}%)`);
console.log(`\nVERDIKT: ${med > 0.9 && med < 1.1
  ? "rumus SAHIH -> estimasi TVL & slippage bisa dipakai."
  : "rumus MELESET (median " + med.toFixed(2) + ") -> TVL harus dikoreksi faktor ~" + med.toFixed(2)}`);

console.log(`\n--- ukuran swap nyata (USD) yang benar-benar terjadi ---`);
for (const q of [0.5, 0.75, 0.9, 0.99]) console.log(`  p${Math.round(q*100)} : $${pct(sizes, q).toLocaleString("en-US",{maximumFractionDigits:0})}`);
console.log(`  max : $${Math.max(...sizes).toLocaleString("en-US",{maximumFractionDigits:0})}`);
