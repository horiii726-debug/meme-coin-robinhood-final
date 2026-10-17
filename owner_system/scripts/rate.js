const { rpc } = require("./rpc");
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const latest = parseInt(rpc("eth_blockNumber"), 16);
for (const span of [1000, 5000, 20000]) {
  const t0 = Date.now();
  try {
    const l = rpc("eth_getLogs", [{ address: PM, fromBlock: "0x"+(latest-span).toString(16), toBlock: "0x"+latest.toString(16) }]);
    console.log("span", String(span).padStart(6), "logs", String(l.length).padStart(6), "ms", Date.now()-t0, "| logs/block", (l.length/span).toFixed(2));
  } catch (e) { console.log("span", span, "ERR", e.message.slice(0,60)); }
}
// full-history estimate
const perBlock = 3.5;
console.log("\nchain blocks:", latest);
