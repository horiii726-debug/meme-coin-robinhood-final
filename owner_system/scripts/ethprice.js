// Cari harga ETH/USD dari pool ETH/USDG di chain, tanpa sumber eksternal.
// poolId v4 = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
const { spawn } = require("child_process");
const { AbiCoder, keccak256, id, Interface } = require("ethers");

const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const iface = new Interface(["event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"]);

function call(method, params) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const p = spawn("curl", ["-s", "-m", "120", "--doh-url", "https://cloudflare-dns.com/dns-query",
      "-X", "POST", "https://rpc.mainnet.chain.robinhood.com", "-H", "Content-Type: application/json", "-d", body]);
    let out = ""; p.stdout.on("data", d => out += d);
    p.on("close", () => { try { const j = JSON.parse(out); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } });
  });
}

function poolId(c0, c1, fee, tickSpacing, hooks) {
  return keccak256(new AbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"], [c0, c1, fee, tickSpacing, hooks]));
}

(async () => {
  // kombinasi fee/tickSpacing standar Uniswap + yang terlihat di data chain ini
  const combos = [[100,1],[500,10],[3000,60],[10000,200],[2500,25],[20000,200],[1000,20],[5000,100],[100,2],[400,8],[8388608,60]];
  const latest = parseInt(await call("eth_blockNumber", []), 16);
  const from = "0x" + (latest - 4000).toString(16);
  const found = [];
  for (const [fee, ts] of combos) {
    const pid = poolId(NATIVE, USDG, fee, ts, NATIVE);
    let logs;
    try { logs = await call("eth_getLogs", [{ address: PM, topics: [T_SWAP, pid], fromBlock: from, toBlock: "0x" + latest.toString(16) }]); }
    catch (e) { continue; }
    if (!logs || !logs.length) continue;
    const d = iface.parseLog({ topics: logs[logs.length - 1].topics, data: logs[logs.length - 1].data }).args;
    const sqrtP = Number(d.sqrtPriceX96) / Math.pow(2, 96);
    const price = sqrtP ** 2 * Math.pow(10, 18 - 6);   // USDG per ETH
    const L = Number(d.liquidity);
    const depthUsd = 2 * (L * sqrtP) / 1e6;            // sisi USDG, virtual
    found.push({ fee, ts, pid, n: logs.length, price, depthUsd });
    console.log(`fee=${String(fee).padStart(8)} ts=${String(ts).padStart(4)}  swaps=${String(logs.length).padStart(5)}  ETH=$${price.toFixed(2)}  depth≈$${depthUsd.toLocaleString("en-US",{maximumFractionDigits:0})}`);
  }
  if (!found.length) { console.log("TIDAK ADA pool ETH/USDG ketemu dari kombinasi standar."); process.exit(1); }
  found.sort((a, b) => b.depthUsd - a.depthUsd);
  console.log(`\nDIPAKAI (pool terdalam): ETH = $${found[0].price.toFixed(2)}  poolId=${found[0].pid.slice(0,18)}`);
  require("fs").writeFileSync("eth_usd.json", JSON.stringify({ ethUsd: found[0].price, source: found[0].pid, fee: found[0].fee, at: new Date().toISOString() }, null, 2));
})();
