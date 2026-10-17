// Validasi asumsi: seberapa terkonsentrasi posisi likuiditasnya?
// Kalau mayoritas full-range, cadangan virtual ~= cadangan nyata -> TVL saya akurat.
// Kalau mayoritas sempit, TVL saya terlalu optimistis dan gate harus dinilai ulang.
const fs = require("fs");
const { Interface, id } = require("ethers");
const iface = new Interface([
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
]);
const T_MOD = id("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)");
const T_INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const MIN_TICK = -887272, MAX_TICK = 887272;

const born = new Map();  // pool -> tickSpacing (hanya pool yang lahir di window)
const adds = [];
for (const file of process.argv.slice(2)) {
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const l = JSON.parse(line);
    if (l.topics[0] === T_INIT) {
      try { const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
        born.set(d.id.toLowerCase(), Number(d.tickSpacing)); } catch (e) {}
    }
  }
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const l = JSON.parse(line);
    if (l.topics[0] !== T_MOD) continue;
    try {
      const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
      const pid = d.id.toLowerCase();
      if (!born.has(pid)) continue;              // hanya pool baru
      if (BigInt(d.liquidityDelta) <= 0n) continue; // hanya penambahan
      const ts = born.get(pid) || 1;
      const lo = Number(d.tickLower), hi = Number(d.tickUpper);
      const maxLo = Math.ceil(MIN_TICK / ts) * ts, maxHi = Math.floor(MAX_TICK / ts) * ts;
      adds.push({ pid, lo, hi, full: lo <= maxLo && hi >= maxHi, width: hi - lo });
    } catch (e) {}
  }
}

const n = adds.length;
const full = adds.filter(a => a.full).length;
console.log("=".repeat(62));
console.log("VALIDASI KONSENTRASI LIKUIDITAS (pool yang lahir di sampel)");
console.log("=".repeat(62));
console.log(`total penambahan likuiditas : ${n}`);
console.log(`FULL-RANGE                  : ${full}  (${(100*full/Math.max(1,n)).toFixed(1)}%)`);
console.log(`terkonsentrasi              : ${n-full}  (${(100*(n-full)/Math.max(1,n)).toFixed(1)}%)`);

// per-pool: apakah pool didominasi full-range?
const byPool = new Map();
for (const a of adds) {
  if (!byPool.has(a.pid)) byPool.set(a.pid, { f: 0, t: 0 });
  const e = byPool.get(a.pid); e.t++; if (a.full) e.f++;
}
let poolFull = 0;
for (const [, e] of byPool) if (e.f / e.t >= 0.5) poolFull++;
console.log(`\npool dgn mayoritas add full-range : ${poolFull}/${byPool.size} (${(100*poolFull/Math.max(1,byPool.size)).toFixed(1)}%)`);

const widths = adds.filter(a => !a.full).map(a => a.width).sort((a, b) => a - b);
const pct = (x, q) => x.length ? x[Math.floor(q * x.length)] : 0;
if (widths.length) {
  console.log(`\nlebar rentang tick (yang TIDAK full-range):`);
  for (const q of [0.25, 0.5, 0.75, 0.9]) {
    const w = pct(widths, q);
    console.log(`  p${Math.round(q*100)}: ${w} tick  (~${(Math.pow(1.0001, w) * 100 - 100).toFixed(0)}% rentang harga)`);
  }
}
console.log(`\nKESIMPULAN: ${100*full/Math.max(1,n) >= 70
  ? "mayoritas FULL-RANGE -> TVL dari cadangan virtual AKURAT, gate valid."
  : "banyak terkonsentrasi -> TVL saya OPTIMISTIS, gate harus dinilai ulang."}`);
