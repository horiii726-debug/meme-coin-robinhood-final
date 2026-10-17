// Identitas DEPLOYER tiap pool: ambil log Initialize (ter-filter topic, jadi murah),
// lalu resolve tx.from -> siapa yang membuat pool itu.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { id } = require("ethers");

const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const T_INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const sleep = ms => new Promise(r => setTimeout(r, ms));

function post(body) {
  return new Promise((res, rej) => {
    const p = spawn("curl", ["-s", "-m", "150", "--doh-url", "https://cloudflare-dns.com/dns-query",
      "-X", "POST", "https://rpc.mainnet.chain.robinhood.com", "-H", "Content-Type: application/json",
      "-d", JSON.stringify(body)], { maxBuffer: 1024 * 1024 * 300 });
    let out = "";
    p.stdout.on("data", d => out += d);
    p.on("close", () => { try { res(JSON.parse(out)); } catch (e) { rej(new Error("badjson")); } });
  });
}
async function rpc(method, params) {
  for (let a = 0; a < 7; a++) {
    try {
      const j = await post({ jsonrpc: "2.0", id: 1, method, params });
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { if (a === 6) throw e; await sleep(900 * Math.pow(2, a) + Math.random() * 500); }
  }
}
async function batch(reqs) {
  for (let a = 0; a < 7; a++) {
    try { const j = await post(reqs); if (!Array.isArray(j)) throw new Error("na"); return j; }
    catch (e) { if (a === 6) throw e; await sleep(900 * Math.pow(2, a) + Math.random() * 500); }
  }
}

(async () => {
  const [FROM, TO] = fs.readFileSync("range.txt", "utf8").trim().split(/\s+/).map(Number);
  const DIR = process.argv[2] || "ds24";
  const CH = 40000;
  const pairs = [];   // [poolId, txHash, block]
  for (let b = FROM; b <= TO; b += CH) {
    const t = Math.min(b + CH - 1, TO);
    let logs;
    try {
      logs = await rpc("eth_getLogs", [{ address: PM, topics: [T_INIT],
        fromBlock: "0x" + b.toString(16), toBlock: "0x" + t.toString(16) }]);
    } catch (e) { console.error("FAIL", b, e.message.slice(0, 40)); continue; }
    for (const l of logs) pairs.push([l.topics[1].toLowerCase(), l.transactionHash, parseInt(l.blockNumber, 16)]);
    console.error(`  ${b}..${t}: ${logs.length} init (total ${pairs.length})`);
  }
  console.error(`total Initialize: ${pairs.length}`);

  const uniqTx = [...new Set(pairs.map(p => p[1]))];
  console.error(`tx unik: ${uniqTx.length} -> ${Math.ceil(uniqTx.length / 100)} request`);
  const fromOf = new Map();
  const groups = [];
  for (let i = 0; i < uniqTx.length; i += 100) groups.push(uniqTx.slice(i, i + 100));
  let gi = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (gi < groups.length) {
      const g = groups[gi++];
      let r;
      try { r = await batch(g.map((h, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getTransactionByHash", params: [h] }))); }
      catch (e) { continue; }
      for (const it of r) { const t = it && it.result; if (t) fromOf.set(t.hash, t.from.toLowerCase()); }
      if (gi % 20 === 0) console.error(`  ${gi}/${groups.length} grup`);
    }
  }));

  const w = fs.createWriteStream(path.join(DIR, "deployers.csv"));
  w.write("pool_id,deployer,init_block\n");
  let n = 0;
  for (const [pid, tx, blk] of pairs) {
    const f = fromOf.get(tx);
    if (!f) continue;
    w.write(`${pid},${f},${blk}\n`);
    n++;
  }
  w.end();
  console.error(`SELESAI: ${n} pool ter-atribusi ke deployer | deployer unik: ${new Set([...fromOf.values()]).size}`);
})();
