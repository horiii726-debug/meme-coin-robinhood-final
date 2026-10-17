// Resolusi identitas trader: tx_hash -> tx.from (orang asli, bukan router).
// Pakai batch JSON-RPC eth_getBlockByNumber(blk,true) -> ambil hash+from saja.
// Hanya blok yang benar-benar punya swap yang diambil.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const sleep = ms => new Promise(r => setTimeout(r, ms));

function batchCall(reqs) {
  return new Promise((res, rej) => {
    const p = spawn("curl", ["-s", "-m", "150", "--doh-url", "https://cloudflare-dns.com/dns-query",
      "-X", "POST", RPC, "-H", "Content-Type: application/json", "-d", JSON.stringify(reqs)],
      { maxBuffer: 1024 * 1024 * 400 });
    let out = "";
    p.stdout.on("data", d => out += d);
    p.on("close", () => { try { res(JSON.parse(out)); } catch (e) { rej(new Error("badjson")); } });
  });
}

async function fetchBlocks(blocks) {
  const reqs = blocks.map((b, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getBlockByNumber",
    params: ["0x" + b.toString(16), true] }));
  for (let a = 0; a < 6; a++) {
    try {
      const r = await batchCall(reqs);
      if (!Array.isArray(r)) throw new Error("not array");
      return r;
    } catch (e) {
      if (a === 5) throw e;
      await sleep(700 * Math.pow(2, a) + Math.random() * 400);
    }
  }
}

(async () => {
  const DIR = process.argv[2] || "ds24";
  const BATCH = parseInt(process.env.BATCH || "40", 10);
  const PAR = parseInt(process.env.PAR || "3", 10);

  // blok unik yang punya swap
  const need = new Set();
  const rl = require("readline").createInterface({
    input: fs.createReadStream(path.join(DIR, "swaps.csv")), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    if (!line) continue;
    const c = line.indexOf(",");
    const c2 = line.indexOf(",", c + 1);
    need.add(parseInt(line.slice(c + 1, c2), 10));
  }
  const blocks = [...need].sort((a, b) => a - b);
  console.error(`blok dgn swap: ${blocks.length}`);

  const ckPath = path.join(DIR, "traders_ckpt.json");
  let done = new Set();
  if (fs.existsSync(ckPath)) done = new Set(JSON.parse(fs.readFileSync(ckPath, "utf8")));
  const todo = blocks.filter(b => !done.has(b));
  console.error(`tersisa: ${todo.length}`);

  const groups = [];
  for (let i = 0; i < todo.length; i += BATCH) groups.push(todo.slice(i, i + BATCH));

  const fresh = !fs.existsSync(path.join(DIR, "tx_from.csv"));
  const w = fs.createWriteStream(path.join(DIR, "tx_from.csv"), { flags: "a" });
  if (fresh) w.write("tx_hash,from,block\n");

  let i = 0, n = 0, gdone = 0, failed = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < groups.length) {
      const g = groups[i++];
      let r;
      try { r = await fetchBlocks(g); }
      catch (e) { failed++; continue; }
      for (const item of r) {
        const b = item && item.result;
        if (!b || !b.transactions) continue;
        const bn = parseInt(b.number, 16);
        for (const tx of b.transactions) w.write(`${tx.hash},${tx.from},${bn}\n`);
        n += b.transactions.length;
        done.add(bn);
      }
      if (++gdone % 20 === 0 || gdone === groups.length) {
        fs.writeFileSync(ckPath, JSON.stringify([...done]));
        const el = (Date.now() - t0) / 1000;
        console.error(`  ${gdone}/${groups.length} grup | ${n} tx | ${el.toFixed(0)}s | ETA ${((groups.length - gdone) / (gdone / el) / 60).toFixed(1)}m`);
      }
    }
  }));
  fs.writeFileSync(ckPath, JSON.stringify([...done]));
  w.end();
  console.error(`SELESAI: ${n} tx, ${failed} grup gagal, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})();
