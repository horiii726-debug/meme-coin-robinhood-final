// FASE 2 — GATE. Menghitung persis 3 kill criteria yang ditetapkan di rencana.
// Likuiditas dari event Swap (liquidity + sqrtPriceX96). Tidak butuh archive state.
const fs = require("fs");
const { Interface, id } = require("ethers");

const iface = new Interface([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
]);
const T_INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const FOLLOW = 3000;            // 3000 blok ≈ 5 menit jendela entry
const TH = 20000;               // ambang TRADABLE dari rencana

const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;
const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0;
const money = n => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function analyze(file) {
  const pools = new Map(), swaps = new Map();
  let minB = Infinity, maxB = 0, nSwap = 0;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const l = JSON.parse(line);
    const blk = parseInt(l.blockNumber, 16);
    if (blk < minB) minB = blk; if (blk > maxB) maxB = blk;
    try {
      if (l.topics[0] === T_INIT) {
        const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
        pools.set(d.id.toLowerCase(), { c0: d.currency0.toLowerCase(), c1: d.currency1.toLowerCase(),
          fee: Number(d.fee), hooks: d.hooks.toLowerCase(), initBlock: blk });
      } else if (l.topics[0] === T_SWAP) {
        const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
        const pid = d.id.toLowerCase();
        if (!swaps.has(pid)) swaps.set(pid, []);
        swaps.get(pid).push({ block: blk, sqrtP: Number(d.sqrtPriceX96) / Q96, L: Number(d.liquidity),
          a0: Number(d.amount0), a1: Number(d.amount1), fee: Number(d.fee) });
        nSwap++;
      }
    } catch (e) {}
  }
  const cutoff = maxB - FOLLOW;
  const rows = [];
  let born = 0, evald = 0, noQuote = 0, dead = 0;
  for (const [pid, p] of pools) {
    born++;
    if (p.initBlock > cutoff) continue;
    evald++;
    let quote = null, isC0 = null;
    if (QDEC[p.c0] !== undefined) { quote = p.c0; isC0 = true; }
    else if (QDEC[p.c1] !== undefined) { quote = p.c1; isC0 = false; }
    if (!quote) { noQuote++; continue; }
    const usd = quote === USDG ? 1 : ethUsd;
    const s = (swaps.get(pid) || []).filter(x => x.block <= p.initBlock + FOLLOW);
    if (!s.length) { dead++; continue; }
    let peak = 0;
    for (const x of s) {
      if (!x.L || !isFinite(x.sqrtP) || x.sqrtP <= 0) continue;
      const qty = (isC0 ? x.L / x.sqrtP : x.L * x.sqrtP) / Math.pow(10, QDEC[quote]);
      const tvl = 2 * qty * usd;
      if (isFinite(tvl) && tvl > peak) peak = tvl;
    }
    rows.push({ pid, peak, n: s.length, fee: p.fee, hooks: p.hooks, quote });
  }
  return { file, minB, maxB, nSwap, born, evald, noQuote, dead, rows,
           minutes: (maxB - minB) * 0.1 / 60 };
}

const files = process.argv.slice(2);
const all = files.map(analyze);

console.log("=".repeat(70));
console.log("FASE 2 — GATE  (ETH = $" + ethUsd.toFixed(2) + ", ambang TRADABLE = " + money(TH) + ")");
console.log("=".repeat(70));

let totBorn = 0, totMin = 0, totRows = [];
for (const w of all) {
  const tr = w.rows.filter(r => r.peak >= TH);
  console.log(`\nwindow ${w.minB}..${w.maxB}  (${w.minutes.toFixed(0)} mnt, ${w.nSwap} swap)`);
  console.log(`  pool lahir ${w.born} | dinilai ${w.evald} | tanpa quote ${w.noQuote} | NOL swap ${w.dead} | terukur ${w.rows.length}`);
  console.log(`  tradable >=${money(TH)}: ${tr.length}  (${(100*tr.length/Math.max(1,w.rows.length)).toFixed(1)}% dari yg terukur, ${(100*tr.length/Math.max(1,w.evald)).toFixed(1)}% dari semua pool baru)`);
  totBorn += w.born; totMin += w.minutes; totRows = totRows.concat(w.rows);
}

const tradable = totRows.filter(r => r.peak >= TH);
const peaksAll = totRows.map(r => r.peak).sort((a, b) => a - b);
const peaksTr = tradable.map(r => r.peak).sort((a, b) => a - b);
const evalMin = totMin - all.length * FOLLOW * 0.1 / 60;

console.log("\n" + "-".repeat(70));
console.log("GABUNGAN");
console.log("-".repeat(70));
console.log(`total pool baru terukur : ${totRows.length}`);
console.log(`total TRADABLE          : ${tradable.length}`);
console.log(`\ndistribusi peak LP SEMUA pool terukur:`);
for (const q of [0.1, 0.25, 0.5, 0.75, 0.9]) console.log(`  p${Math.round(q*100)}`.padEnd(7) + money(pct(peaksAll, q)));
console.log(`\ndistribusi peak LP pool TRADABLE:`);
for (const q of [0.1, 0.25, 0.5, 0.75, 0.9]) console.log(`  p${Math.round(q*100)}`.padEnd(7) + money(pct(peaksTr, q)));
const medTr = pct(peaksTr, 0.5);
const swN = tradable.map(r => r.n).sort((a,b)=>a-b);
const feeTr = tradable.map(r => r.fee).sort((a,b)=>a-b);
console.log(`\npool tradable: swap p25=${pct(swN,.25)} median=${pct(swN,.5)} p75=${pct(swN,.75)}`);
console.log(`pool tradable: fee median=${pct(feeTr,.5)}e-6 p90=${pct(feeTr,.9)}e-6 | pakai hook ${tradable.filter(r=>r.hooks!==NATIVE).length}/${tradable.length}`);

const trPerDay = tradable.length / evalMin * 1440;
const bornPerDay = totBorn / totMin * 1440;
console.log("\n" + "-".repeat(70));
console.log("KILL CRITERIA F2");
console.log("-".repeat(70));
const c1 = trPerDay * 30;
console.log(`1) unique pool TRADABLE < 200 ?`);
console.log(`   terukur langsung di sampel : ${tradable.length} pool (${evalMin.toFixed(0)} menit sampel)`);
console.log(`   laju                       : ~${Math.round(trPerDay)}/hari  -> ~${Math.round(c1)} per 30 hari`);
console.log(`   VERDICT: ${c1 >= 200 ? "LOLOS" : "KENA -> STOP"}`);
console.log(`\n2) median LP pool tradable < ${money(TH)} ?`);
console.log(`   median = ${money(medTr)}`);
console.log(`   VERDICT: ${medTr >= TH ? "LOLOS" : "KENA -> STOP"}`);
console.log(`\n3) pool baru < 5/hari ?`);
console.log(`   ~${Math.round(bornPerDay)}/hari`);
console.log(`   VERDICT: ${bornPerDay >= 5 ? "LOLOS" : "KENA -> STOP"}`);

console.log(`\nCATATAN METODE:`);
console.log(`- TVL dari cadangan virtual full-range = BATAS ATAS. Posisi terkonsentrasi`);
console.log(`  punya token nyata lebih sedikit, jadi angka ini OPTIMISTIS.`);
console.log(`- ${totRows.length ? (100*all.reduce((s,w)=>s+w.dead,0)/all.reduce((s,w)=>s+w.evald,0)).toFixed(0) : 0}% pool baru TIDAK PERNAH di-swap sama sekali (lahir mati).`);
console.log(`- trader unik BELUM bisa dihitung: 'sender' di event = router, bukan orang.`);
