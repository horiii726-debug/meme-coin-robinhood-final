// Lacak trajektori satu pool v4 dari lahir sampai sekarang: harga, ATH, arus, likuiditas.
const { execFileSync } = require("child_process");
const { id, Interface } = require("ethers");
const fs = require("fs");

const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const PID = process.argv[2];
const INIT = parseInt(process.argv[3], 10);
const Q96 = Math.pow(2, 96);
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const iface = new Interface(["event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"]);

function sleepSync(ms) { const e = Date.now() + ms; while (Date.now() < e); }
function rpc(m, p) {
  for (let a = 0; a < 6; a++) {
    try {
      const o = execFileSync("curl", ["-s", "-m", "150", "--doh-url", "https://cloudflare-dns.com/dns-query",
        "-X", "POST", "https://rpc.mainnet.chain.robinhood.com", "-H", "Content-Type: application/json",
        "-d", JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p })], { maxBuffer: 1 << 27 }).toString();
      const j = JSON.parse(o); if (j.error) throw new Error(j.error.message); return j.result;
    } catch (e) { if (a === 5) throw e; sleepSync(1500 * (a + 1)); }
  }
}

const tip = parseInt(rpc("eth_blockNumber", []), 16);
const STEP = 400000;
// currency0 = ETH native, currency1 = token  => harga token dlm ETH = 1/(sqrtP^2) ... cek arah
// qIsC1 = false (quote adalah currency0/ETH) => harga token = 1/(sqrtP^2)
let n = 0, first = null, last = null, ath = 0, athBlk = 0, atl = Infinity;
let buyN = 0, sellN = 0, buyV = 0, sellV = 0, maxLpUsd = 0;
const hourly = new Map();

for (let b = INIT; b <= tip; b += STEP) {
  const to = Math.min(b + STEP - 1, tip);
  let lg;
  try { lg = rpc("eth_getLogs", [{ address: PM, topics: [T_SWAP, PID], fromBlock: "0x" + b.toString(16), toBlock: "0x" + to.toString(16) }]); }
  catch (e) { console.error("  gagal " + b + ": " + e.message.slice(0, 40)); continue; }
  for (const l of lg) {
    const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
    const blk = parseInt(l.blockNumber, 16);
    const sqrtP = Number(d.sqrtPriceX96) / Q96;
    const L = Number(d.liquidity);
    if (!isFinite(sqrtP) || sqrtP <= 0) continue;
    const priceEth = 1 / (sqrtP * sqrtP);        // ETH per token
    const priceUsd = priceEth * ethUsd;
    const a0 = Number(d.amount0), a1 = Number(d.amount1);
    const ethAmt = Math.abs(a0) / 1e18;
    const isBuy = a1 > 0;                        // token keluar dari pool = beli
    if (isBuy) { buyN++; buyV += ethAmt * ethUsd; } else { sellN++; sellV += ethAmt * ethUsd; }
    const lpUsd = 2 * ((L / sqrtP) / 1e18) * ethUsd;
    if (isFinite(lpUsd) && lpUsd > maxLpUsd) maxLpUsd = lpUsd;
    if (!first) first = { blk, priceUsd, lpUsd };
    last = { blk, priceUsd, lpUsd };
    if (priceUsd > ath) { ath = priceUsd; athBlk = blk; }
    if (priceUsd < atl) atl = priceUsd;
    const h = Math.floor((blk - INIT) / 36000);
    const e = hourly.get(h) || { n: 0, b: 0, s: 0, bv: 0, sv: 0, lo: Infinity, hi: 0, last: 0 };
    e.n++; if (isBuy) { e.b++; e.bv += ethAmt * ethUsd; } else { e.s++; e.sv += ethAmt * ethUsd; }
    if (priceUsd < e.lo) e.lo = priceUsd; if (priceUsd > e.hi) e.hi = priceUsd; e.last = priceUsd;
    hourly.set(h, e);
    n++;
  }
  process.stderr.write(`\r  ${b}..${to}  total ${n} swap`);
}
console.error("");
const money = v => "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
console.log(`\nTOTAL SWAP: ${n}  (beli ${buyN} / jual ${sellN})`);
console.log(`volume beli ${money(buyV)} | jual ${money(sellV)} | net ${money(buyV - sellV)}`);
console.log(`\nharga pertama : $${first.priceUsd.toExponential(4)}  (blok +${first.blk - INIT})`);
console.log(`ATH           : $${ath.toExponential(4)}  (blok +${athBlk - INIT} = ${((athBlk - INIT) * 0.1 / 3600).toFixed(1)} jam setelah lahir)`);
console.log(`harga sekarang: $${last.priceUsd.toExponential(4)}`);
console.log(`\nDARI HARGA PERTAMA KE ATH : ${((ath / first.priceUsd - 1) * 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}%`);
console.log(`DARI ATH KE SEKARANG      : ${((last.priceUsd / ath - 1) * 100).toFixed(1)}%`);
console.log(`LP maksimum tercatat      : ${money(maxLpUsd)} | LP sekarang: ${money(last.lpUsd)}`);
console.log(`\nPER JAM (12 jam pertama):`);
console.log("jam   swap  beli  jual   vol_beli     harga_akhir     vs_awal");
for (let h = 0; h < 12; h++) {
  const e = hourly.get(h); if (!e) { console.log(`${String(h).padStart(3)}     -`); continue; }
  console.log(`${String(h).padStart(3)} ${String(e.n).padStart(6)} ${String(e.b).padStart(5)} ${String(e.s).padStart(5)}  ${money(e.bv).padStart(11)}   $${e.last.toExponential(3)}  ${((e.last / first.priceUsd - 1) * 100).toLocaleString("en-US", { maximumFractionDigits: 0 }).padStart(10)}%`);
}
