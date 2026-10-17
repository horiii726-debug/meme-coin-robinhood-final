// Resolusi dompet ASLI: tx_hash -> tx.from, hanya untuk swap di pool yang dianalisis.
// Batch eth_getTransactionByHash (100/request).
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const sleep = ms => new Promise(r => setTimeout(r, ms));

function batch(reqs) {
  return new Promise((res, rej) => {
    const p = spawn("curl", ["-s", "-m", "150", "--doh-url", "https://cloudflare-dns.com/dns-query",
      "-X", "POST", RPC, "-H", "Content-Type: application/json", "-d", JSON.stringify(reqs)],
      { maxBuffer: 1024 * 1024 * 200 });
    let out = "";
    p.stdout.on("data", d => out += d);
    p.on("close", () => { try { const j = JSON.parse(out); Array.isArray(j) ? res(j) : rej(new Error("not array")); } catch (e) { rej(new Error("badjson")); } });
  });
}

(async () => {
  const DIR = process.argv[2] || "dsp";
  const W = parseInt(process.env.W || "3000", 10);
  const MIN_LP = parseFloat(process.env.MIN_LP || "0");
  const SZ = parseInt(process.env.SZ || "100", 10);
  const PAR = parseInt(process.env.PAR || "2", 10);

  // pool yang dipakai (dari features.csv, opsional disaring LP)
  const L = fs.readFileSync(path.join(DIR, "features.csv"), "utf8").trim().split("\n");
  const H = L[0].split(","); const I = {}; H.forEach((h, i) => I[h] = i);
  const want = new Set();
  for (const line of L.slice(1)) {
    const p = line.split(",");
    if (MIN_LP > 0 && +p[I.lp_entry_usd] < MIN_LP) continue;
    want.add(p[0].toLowerCase());
  }
  const initOf = new Map();
  for (const line of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = line.split(","); initOf.set(p[0].toLowerCase(), +p[6]);
  }
  console.error(`pool target: ${want.size}`);

  // kumpulkan tx hash unik di jendela fitur
  const txs = new Set();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(",");
      const pid = p[0].toLowerCase();
      if (!want.has(pid)) continue;
      const init = initOf.get(pid);
      const blk = +p[1];
      if (init === undefined || blk > init + W) continue;
      txs.add(p[3]);
    }
  }
  const list = [...txs];
  console.error(`tx unik: ${list.length} -> ${Math.ceil(list.length / SZ)} request`);

  const w = fs.createWriteStream(path.join(DIR, "tx_from.csv"));
  w.write("tx_hash,from,to,value,gas_price\n");
  const groups = [];
  for (let i = 0; i < list.length; i += SZ) groups.push(list.slice(i, i + SZ));

  let gi = 0, n = 0, fail = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (gi < groups.length) {
      const g = groups[gi++];
      const reqs = g.map((h, i) => ({ jsonrpc: "2.0", id: i, method: "eth_getTransactionByHash", params: [h] }));
      let r = null;
      for (let a = 0; a < 6; a++) {
        try { r = await batch(reqs); break; }
        catch (e) { if (a === 5) { fail++; } else await sleep(800 * Math.pow(2, a) + Math.random() * 400); }
      }
      if (!r) continue;
      for (const it of r) {
        const t = it && it.result;
        if (!t) continue;
        w.write(`${t.hash},${t.from},${t.to || ""},${t.value},${t.gasPrice || ""}\n`);
        n++;
      }
      if (gi % 20 === 0 || gi === groups.length) {
        const el = (Date.now() - t0) / 1000;
        console.error(`  ${gi}/${groups.length} | ${n} tx | ${el.toFixed(0)}s | ETA ${((groups.length - gi) / (gi / el) / 60).toFixed(1)}m`);
      }
    }
  }));
  w.end();
  console.error(`SELESAI: ${n} tx resolved, ${fail} grup gagal`);
})();
