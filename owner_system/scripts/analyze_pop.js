// FASE 2 — population sizing dari log PoolManager mentah.
// Likuiditas dihitung dari event Swap (liquidity + sqrtPriceX96), TIDAK butuh archive state.
const fs = require("fs");
const { Interface, id } = require("ethers");

const iface = new Interface([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
]);
const T_INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const T_MOD  = id("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG   = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH   = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QUOTE_DEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };

const file = process.argv[2];
const Q96 = Math.pow(2, 96);

const pools = new Map();   // poolId -> {c0,c1,fee,tickSpacing,hooks,initBlock}
const swaps = new Map();   // poolId -> [{block, sqrtP, L, a0, a1, fee}]
let nInit = 0, nSwap = 0, nMod = 0, minBlk = Infinity, maxBlk = 0;

for (const line of fs.readFileSync(file, "utf8").split("\n")) {
  if (!line) continue;
  const l = JSON.parse(line);
  const blk = parseInt(l.blockNumber, 16);
  if (blk < minBlk) minBlk = blk;
  if (blk > maxBlk) maxBlk = blk;
  const t0 = l.topics[0];
  try {
    if (t0 === T_INIT) {
      const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
      pools.set(d.id.toLowerCase(), {
        c0: d.currency0.toLowerCase(), c1: d.currency1.toLowerCase(),
        fee: Number(d.fee), tickSpacing: Number(d.tickSpacing),
        hooks: d.hooks.toLowerCase(), initBlock: blk,
      });
      nInit++;
    } else if (t0 === T_SWAP) {
      const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
      const pid = d.id.toLowerCase();
      if (!swaps.has(pid)) swaps.set(pid, []);
      swaps.get(pid).push({
        block: blk,
        sqrtP: Number(d.sqrtPriceX96) / Q96,
        L: Number(d.liquidity),
        a0: Number(d.amount0), a1: Number(d.amount1),
        fee: Number(d.fee),
      });
      nSwap++;
    } else if (t0 === T_MOD) { nMod++; }
  } catch (e) { /* log non-v4 dari kontrak sama, abaikan */ }
}

// ---- harga ETH dalam USD, dihitung dari pool ETH/USDG di data ini sendiri ----
let ethUsd = null, ethUsdSrc = null;
for (const [pid, p] of pools) {
  if (p.c0 === NATIVE && p.c1 === USDG) {
    const s = swaps.get(pid);
    if (s && s.length) {
      // price token1/token0 = sqrtP^2, koreksi desimal 18->6
      const px = s[s.length - 1].sqrtP ** 2 * Math.pow(10, 18 - 6);
      if (px > 100 && px < 100000) { ethUsd = px; ethUsdSrc = pid.slice(0, 12) + " (ETH/USDG on-chain)"; break; }
    }
  }
}
if (!ethUsd && fs.existsSync("eth_usd.json")) {
  const j = JSON.parse(fs.readFileSync("eth_usd.json", "utf8"));
  ethUsd = j.ethUsd; ethUsdSrc = "pool ETH/USDG " + j.source.slice(0, 12) + " (deterministik)";
}

console.log("=".repeat(66));
console.log("FASE 2 — POPULATION SIZING (sampel)");
console.log("=".repeat(66));
console.log(`window blok      : ${minBlk} .. ${maxBlk}  (${maxBlk - minBlk} blok ≈ ${((maxBlk - minBlk) * 0.1 / 60).toFixed(1)} menit)`);
console.log(`Initialize       : ${nInit}`);
console.log(`Swap             : ${nSwap}`);
console.log(`ModifyLiquidity  : ${nMod}`);
console.log(`ETH/USD          : ${ethUsd ? "$" + ethUsd.toFixed(2) + "  [" + ethUsdSrc + "]" : "TIDAK KETEMU -> pool ETH-quote dilewati"}`);

// ---- hanya pool yang lahir DI DALAM window DAN punya >= FOLLOW blok tindak lanjut ----
const FOLLOW = 3000; // 3000 blok ≈ 5 menit
const cutoff = maxBlk - FOLLOW;
let born = 0, bornEval = 0;
const rows = [];
let noQuote = 0, noSwap = 0;

for (const [pid, p] of pools) {
  born++;
  if (p.initBlock > cutoff) continue;   // belum cukup waktu tindak lanjut
  bornEval++;
  let quote = null, quoteIsC0 = null;
  if (QUOTE_DEC[p.c0] !== undefined) { quote = p.c0; quoteIsC0 = true; }
  else if (QUOTE_DEC[p.c1] !== undefined) { quote = p.c1; quoteIsC0 = false; }
  if (!quote) { noQuote++; continue; }
  const usdPerQuote = quote === USDG ? 1 : ethUsd;
  if (!usdPerQuote) continue;

  const s = (swaps.get(pid) || []).filter(x => x.block <= p.initBlock + FOLLOW);
  if (!s.length) { noSwap++; continue; }

  let peakUsd = 0;
  for (const x of s) {
    if (!x.L || !isFinite(x.sqrtP) || x.sqrtP <= 0) continue;
    // cadangan virtual (full-range) -> BATAS ATAS untuk posisi terkonsentrasi
    const qtyRaw = quoteIsC0 ? x.L / x.sqrtP : x.L * x.sqrtP;
    const qty = qtyRaw / Math.pow(10, QUOTE_DEC[quote]);
    const tvl = 2 * qty * usdPerQuote;
    if (isFinite(tvl) && tvl > peakUsd) peakUsd = tvl;
  }
  rows.push({ pid, quote, peakUsd, nSwap: s.length, fee: p.fee, hooks: p.hooks });
}

console.log(`\npool lahir di window          : ${born}`);
console.log(`  dgn >=${FOLLOW} blok tindak lanjut : ${bornEval}`);
console.log(`  tanpa quote token dikenal   : ${noQuote}`);
console.log(`  tanpa swap sama sekali      : ${noSwap}`);
console.log(`  bisa dinilai                : ${rows.length}`);

const pct = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * arr.length))] : 0;
const peaks = rows.map(r => r.peakUsd).sort((a, b) => a - b);
console.log(`\n--- distribusi PEAK LIQUIDITY (USD, 5 menit pertama) ---`);
for (const q of [0.10, 0.25, 0.50, 0.75, 0.90, 0.99]) {
  console.log(`  p${String(Math.round(q * 100)).padStart(2)} : $${pct(peaks, q).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
}
console.log(`  max : $${(peaks[peaks.length - 1] || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

for (const TH of [5000, 20000, 50000]) {
  const t = rows.filter(r => r.peakUsd >= TH);
  console.log(`\n  TRADABLE @ >=$${TH.toLocaleString()} : ${t.length} pool (${(100 * t.length / Math.max(1, rows.length)).toFixed(2)}% dari ${rows.length})`);
  if (TH === 20000 && t.length) {
    const sw = t.map(r => r.nSwap).sort((a, b) => a - b);
    console.log(`    swap/pool  p25=${pct(sw, .25)} median=${pct(sw, .5)} p75=${pct(sw, .75)}`);
    const fees = t.map(r => r.fee).sort((a, b) => a - b);
    console.log(`    fee        median=${pct(fees, .5)} (1e-6) p90=${pct(fees, .9)}`);
    console.log(`    pakai hook : ${t.filter(r => r.hooks !== NATIVE).length}/${t.length}`);
  }
}

// ekstrapolasi kasar ke per-hari
const minutes = (maxBlk - minBlk) * 0.1 / 60;
const evalMinutes = Math.max(1, minutes - FOLLOW * 0.1 / 60);
const tr20 = rows.filter(r => r.peakUsd >= 20000).length;
console.log(`\n--- ekstrapolasi kasar (sampel ${evalMinutes.toFixed(1)} menit) ---`);
console.log(`  pool tradable >=$20k  : ~${Math.round(tr20 / evalMinutes * 60)}/jam  ~${Math.round(tr20 / evalMinutes * 1440)}/hari`);
console.log(`  pool baru total       : ~${Math.round(born / minutes * 1440)}/hari`);
console.log("\nCATATAN: cadangan virtual = BATAS ATAS. Posisi terkonsentrasi punya token nyata LEBIH SEDIKIT,");
console.log("jadi angka TVL di atas OPTIMISTIS. Kalau di sini saja sudah tipis, kenyataannya lebih tipis lagi.");
