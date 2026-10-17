const { rpc } = require("./rpc");
const { id, Interface, AbiCoder } = require("ethers");
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const latest = parseInt(rpc("eth_blockNumber"), 16);
const logs = rpc("eth_getLogs", [{ address: PM, topics: [INIT], fromBlock: "0x"+(latest-200000).toString(16), toBlock: "0x"+latest.toString(16) }]);
const iface = new Interface(["event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)"]);
const tok = {}, hooks = {}, fees = {};
const rows = [];
for (const l of logs) {
  const d = iface.parseLog({ topics: l.topics, data: l.data });
  const a = { c0: d.args.currency0, c1: d.args.currency1, hooks: d.args.hooks, fee: d.args.fee.toString() };
  rows.push(a);
  tok[a.c0] = (tok[a.c0]||0)+1; tok[a.c1] = (tok[a.c1]||0)+1;
  hooks[a.hooks] = (hooks[a.hooks]||0)+1;
  fees[a.fee] = (fees[a.fee]||0)+1;
}
console.log("total Initialize:", rows.length);
console.log("\n=== TOP 12 CURRENCIES (pool-side count) — quote-token candidates ===");
const top = Object.entries(tok).sort((a,b)=>b[1]-a[1]).slice(0,12);
const dec = new AbiCoder();
for (const [addr, n] of top) {
  let sym="?", d18="?";
  if (addr === "0x0000000000000000000000000000000000000000") { sym="ETH(native)"; d18=18; }
  else {
    try { const r = rpc("eth_call",[{to:addr,data:id("symbol()").slice(0,10)},"latest"]); sym = dec.decode(["string"], r)[0]; } catch(e){ sym="ERR"; }
    try { const r = rpc("eth_call",[{to:addr,data:id("decimals()").slice(0,10)},"latest"]); d18 = parseInt(r,16); } catch(e){ d18="ERR"; }
  }
  console.log(String(n).padStart(5), addr, "dec="+d18, sym);
}
console.log("\n=== TOP 8 HOOKS ===");
Object.entries(hooks).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([a,c])=>console.log(String(c).padStart(5), a));
console.log("\n=== TOP 8 FEE TIERS ===");
Object.entries(fees).sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([a,c])=>console.log(String(c).padStart(5), "fee="+a, a==="8388608"?"(DYNAMIC flag 0x800000)":""));
