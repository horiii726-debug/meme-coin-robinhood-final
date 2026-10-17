// Kolektor jangka panjang: fetch -> DECODE LANGSUNG -> tulis CSV ringkas.
// Tidak menyimpan JSON mentah (10x lebih besar). Resumable lewat checkpoint.
// Pakai: node collect.js <fromBlock> <toBlock> <outDir>
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Interface, id } = require("ethers");

const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const iface = new Interface([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
]);
const T_INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const T_MOD  = id("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function call(method, params) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const p = spawn("curl", ["-s", "-m", "150", "--doh-url", "https://cloudflare-dns.com/dns-query",
      "-X", "POST", RPC, "-H", "Content-Type: application/json", "-d", body]);
    let out = "";
    p.stdout.on("data", d => out += d);
    p.on("close", () => {
      try { const j = JSON.parse(out); j.error ? rej(new Error(j.error.message)) : res(j.result); }
      catch (e) { rej(new Error("badjson")); }
    });
  });
}

async function getLogs(from, to, depth = 0) {
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      return await call("eth_getLogs", [{ address: PM,
        fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
    } catch (e) {
      if (e.message.includes("exceeds limit") && to > from && depth < 12) {
        const mid = Math.floor((from + to) / 2);
        return (await getLogs(from, mid, depth + 1)).concat(await getLogs(mid + 1, to, depth + 1));
      }
      if (attempt === 6) throw e;
      await sleep(700 * Math.pow(2, attempt) + Math.random() * 500);
    }
  }
}

(async () => {
  const FROM = parseInt(process.argv[2], 10);
  const TO = parseInt(process.argv[3], 10);
  const DIR = process.argv[4] || "data";
  const CHUNK = 1200, PAR = parseInt(process.env.PAR || "3", 10);
  fs.mkdirSync(DIR, { recursive: true });

  const ckptPath = path.join(DIR, "checkpoint.json");
  let ckpt = { done: [] };
  if (fs.existsSync(ckptPath)) ckpt = JSON.parse(fs.readFileSync(ckptPath, "utf8"));
  const doneSet = new Set(ckpt.done);

  const fresh = !fs.existsSync(path.join(DIR, "swaps.csv"));
  const wPools = fs.createWriteStream(path.join(DIR, "pools.csv"), { flags: "a" });
  const wSwaps = fs.createWriteStream(path.join(DIR, "swaps.csv"), { flags: "a" });
  const wLiq   = fs.createWriteStream(path.join(DIR, "liq.csv"),   { flags: "a" });
  if (fresh) {
    wPools.write("pool_id,c0,c1,fee,tick_spacing,hooks,init_block\n");
    wSwaps.write("pool_id,block,log_idx,tx_hash,a0,a1,sqrt_price,liquidity,tick,fee\n");
    wLiq.write("pool_id,block,log_idx,tick_lo,tick_hi,liq_delta\n");
  }

  const tasks = [];
  for (let b = FROM; b <= TO; b += CHUNK) {
    const t = Math.min(b + CHUNK - 1, TO);
    if (!doneSet.has(b)) tasks.push([b, t]);
  }
  console.error(`range ${FROM}..${TO} | ${tasks.length} chunk tersisa (${doneSet.size} sudah) | PAR=${PAR}`);

  let i = 0, nSwap = 0, nInit = 0, nLiq = 0, done = 0, failed = 0;
  const t0 = Date.now();

  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < tasks.length) {
      const [f, t] = tasks[i++];
      let logs;
      try { logs = await getLogs(f, t); }
      catch (e) { failed++; console.error("FAIL", f, e.message.slice(0, 40)); continue; }
      for (const l of logs) {
        const blk = parseInt(l.blockNumber, 16);
        const li = parseInt(l.logIndex, 16);
        try {
          if (l.topics[0] === T_SWAP) {
            const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
            wSwaps.write(`${d.id},${blk},${li},${l.transactionHash},${d.amount0},${d.amount1},${d.sqrtPriceX96},${d.liquidity},${d.tick},${d.fee}\n`);
            nSwap++;
          } else if (l.topics[0] === T_INIT) {
            const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
            wPools.write(`${d.id},${d.currency0},${d.currency1},${d.fee},${d.tickSpacing},${d.hooks},${blk}\n`);
            nInit++;
          } else if (l.topics[0] === T_MOD) {
            const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
            wLiq.write(`${d.id},${blk},${li},${d.tickLower},${d.tickUpper},${d.liquidityDelta}\n`);
            nLiq++;
          }
        } catch (e) {}
      }
      doneSet.add(f);
      if (++done % 25 === 0 || done === tasks.length) {
        fs.writeFileSync(ckptPath, JSON.stringify({ done: [...doneSet] }));
        const el = (Date.now() - t0) / 1000;
        const rate = done / el;
        console.error(`  ${done}/${tasks.length} | swap ${nSwap} init ${nInit} liq ${nLiq} | ${el.toFixed(0)}s | ETA ${((tasks.length - done) / rate / 60).toFixed(1)}m`);
      }
    }
  }));

  fs.writeFileSync(ckptPath, JSON.stringify({ done: [...doneSet] }));
  wPools.end(); wSwaps.end(); wLiq.end();
  console.error(`SELESAI: swap=${nSwap} init=${nInit} liq=${nLiq} gagal=${failed} ${((Date.now()-t0)/1000).toFixed(0)}s`);
})();
