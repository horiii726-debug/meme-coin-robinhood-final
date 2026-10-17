const { rpc } = require("./rpc");
const { id, AbiCoder } = require("ethers");
const V3SWAP = id("Swap(address,address,int256,int256,uint160,uint128,int24)");
const latest = parseInt(rpc("eth_blockNumber"), 16);
const logs = rpc("eth_getLogs", [{ topics: [V3SWAP], fromBlock: "0x"+(latest-3000).toString(16), toBlock: "0x"+latest.toString(16) }]);
const pools = [...new Set(logs.map(l => l.address))];
console.log("v3-style Swap logs in 3000 blocks:", logs.length, "| unique pools:", pools.length);
const dec = new AbiCoder(); const fac = {};
for (const p of pools.slice(0, 12)) {
  try {
    const f = dec.decode(["address"], rpc("eth_call", [{ to: p, data: id("factory()").slice(0,10) }, "latest"]))[0];
    fac[f] = (fac[f]||0)+1;
  } catch (e) { fac["NO_factory()"] = (fac["NO_factory()"]||0)+1; }
}
console.log("factories seen:"); Object.entries(fac).forEach(([f,c])=>console.log("  ", c, f));
for (const f of Object.keys(fac)) {
  if (!f.startsWith("0x")) continue;
  const code = rpc("eth_getCode",[f,"latest"]);
  console.log("factory", f, "codesize", (code.length-2)/2);
}
