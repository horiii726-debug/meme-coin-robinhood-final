const { rpc } = require("./rpc");
const { id, Interface } = require("ethers");
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
console.log("Initialize topic0 =", INIT);

const code = rpc("eth_getCode", [PM, "latest"]);
console.log("PoolManager bytecode bytes =", (code.length - 2) / 2);

for (const sig of ["owner()", "protocolFeeController()", "protocolFeesAccrued(address)"]) {
  const sel = id(sig).slice(0, 10);
  try { console.log(sig.padEnd(28), sel, "->", rpc("eth_call", [{ to: PM, data: sel + (sig.includes("address") ? "0".repeat(64) : "") }, "latest"])); }
  catch (e) { console.log(sig.padEnd(28), sel, "-> ERR", e.message.slice(0, 70)); }
}

const latest = parseInt(rpc("eth_blockNumber"), 16);
const from = latest - 200000;
const logs = rpc("eth_getLogs", [{ address: PM, topics: [INIT], fromBlock: "0x"+from.toString(16), toBlock: "0x"+latest.toString(16) }]);
console.log("\nInitialize events in last 200k blocks (~"+Math.round(200000*0.1/60)+" min):", logs.length);
const iface = new Interface(["event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)"]);
for (const l of logs.slice(0, 5)) {
  const d = iface.parseLog({ topics: l.topics, data: l.data });
  console.log(" pool", d.args.id.slice(0,14), "c0", d.args.currency0, "c1", d.args.currency1, "fee", d.args.fee.toString(), "ts", d.args.tickSpacing.toString(), "hooks", d.args.hooks);
}
