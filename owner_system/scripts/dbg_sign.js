// Debug: cek konvensi tanda amount0/amount1 vs arah perubahan harga.
const fs = require("fs");
const readline = require("readline");
const { Interface, id } = require("ethers");
const iface = new Interface([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
]);
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const Q96 = Math.pow(2, 96);

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]), crlfDelay: Infinity });
  const seq = new Map();
  let n = 0;
  for await (const line of rl) {
    if (!line) continue;
    const l = JSON.parse(line);
    if (l.topics[0] !== T_SWAP) continue;
    let d; try { d = iface.parseLog({ topics: l.topics, data: l.data }).args; } catch (e) { continue; }
    const pid = d.id.toLowerCase();
    if (!seq.has(pid)) seq.set(pid, []);
    seq.get(pid).push({ blk: parseInt(l.blockNumber, 16), li: parseInt(l.logIndex, 16),
      sqrtP: Number(d.sqrtPriceX96) / Q96, L: Number(d.liquidity), a0: Number(d.amount0), a1: Number(d.amount1) });
    if (++n > 60000) break;
  }
  rl.close();

  let shown = 0, agree1 = 0, agree0 = 0, tot = 0;
  const ratios1 = [], ratios0 = [];
  for (const [pid, arr] of seq) {
    if (arr.length < 3) continue;
    arr.sort((a, b) => a.blk - b.blk || a.li - b.li);
    for (let i = 1; i < arr.length; i++) {
      const p = arr[i - 1], c = arr[i];
      const dS = c.sqrtP - p.sqrtP;
      if (dS === 0 || !c.L || !isFinite(dS)) continue;
      tot++;
      if (Math.sign(c.a1) === Math.sign(dS)) agree1++;
      if (Math.sign(c.a0) === Math.sign(dS)) agree0++;
      const r1 = Math.abs(c.a1 / dS) / c.L;
      const d0 = (1 / c.sqrtP) - (1 / p.sqrtP);
      const r0 = d0 !== 0 ? Math.abs(c.a0 / d0) / c.L : NaN;
      if (isFinite(r1) && r1 > 0) ratios1.push(r1);
      if (isFinite(r0) && r0 > 0) ratios0.push(r0);
      if (shown < 8 && Math.abs(dS / p.sqrtP) > 1e-6) {
        console.log(`a0=${c.a0.toExponential(3)} a1=${c.a1.toExponential(3)} dSqrtP=${dS.toExponential(3)} L=${c.L.toExponential(3)} |a1/dS|/L=${r1.toFixed(3)}`);
        shown++;
      }
    }
  }
  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(q * s.length)] : NaN; };
  console.log(`\npasangan: ${tot}`);
  console.log(`tanda(a1)==tanda(dSqrtP): ${(100*agree1/tot).toFixed(1)}%   tanda(a0)==tanda(dSqrtP): ${(100*agree0/tot).toFixed(1)}%`);
  console.log(`\n|a1/dSqrtP| / L   p25=${pct(ratios1,.25).toFixed(3)} p50=${pct(ratios1,.5).toFixed(3)} p75=${pct(ratios1,.75).toFixed(3)}  (n=${ratios1.length})`);
  console.log(`|a0/d(1/sqrtP)|/L p25=${pct(ratios0,.25).toFixed(3)} p50=${pct(ratios0,.5).toFixed(3)} p75=${pct(ratios0,.75).toFixed(3)}  (n=${ratios0.length})`);
})();
