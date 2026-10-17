// Ambil log PoolManager paralel, chunk adaptif (split otomatis kalau kena cap 10k log).
const { spawn } = require("child_process");
const fs = require("fs");
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const RPC = "https://rpc.mainnet.chain.robinhood.com";

function call(method, params) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const p = spawn("curl", ["-s", "-m", "120", "--doh-url", "https://cloudflare-dns.com/dns-query",
      "-X", "POST", RPC, "-H", "Content-Type: application/json", "-d", body]);
    let out = "", err = "";
    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);
    p.on("close", () => {
      try {
        const j = JSON.parse(out);
        j.error ? rej(new Error(j.error.message)) : res(j.result);
      } catch (e) { rej(new Error("badjson/" + err.slice(0, 60))); }
    });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getLogs(from, to, depth = 0) {
  // Rate limit / error transien -> retry dengan exponential backoff.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await call("eth_getLogs", [{
        address: PM,
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
      }]);
    } catch (e) {
      const msg = e.message;
      // Hasil kebanyakan -> pecah dua, bukan retry.
      if (msg.includes("exceeds limit") && to > from && depth < 12) {
        const mid = Math.floor((from + to) / 2);
        const a = await getLogs(from, mid, depth + 1);
        const b = await getLogs(mid + 1, to, depth + 1);
        return a.concat(b);
      }
      const transient = msg.includes("Too Many Requests") || msg.includes("badjson") ||
                        msg.includes("429") || msg.includes("timeout");
      if (!transient || attempt === 5) throw e;
      await sleep(800 * Math.pow(2, attempt) + Math.random() * 400);
    }
  }
}

(async () => {
  const BLOCKS = parseInt(process.argv[2] || "36000", 10);
  const CHUNK = 1200, PAR = parseInt(process.env.PAR || "3", 10);
  const tip = parseInt(await call("eth_blockNumber", []), 16);
  const OFF = parseInt(process.env.OFF || "0", 10);
  const latest = tip - OFF;
  const start = latest - BLOCKS;
  const tasks = [];
  for (let b = start; b <= latest; b += CHUNK) tasks.push([b, Math.min(b + CHUNK - 1, latest)]);
  console.error(`window ${start}..${latest} (${BLOCKS} blok) -> ${tasks.length} chunk, ${PAR} paralel`);

  const file = `logs_${start}_${latest}.ndjson`;
  const out = fs.createWriteStream(file);
  let done = 0, total = 0, failed = 0, i = 0;
  const t0 = Date.now();

  await Promise.all(Array.from({ length: PAR }, async () => {
    while (i < tasks.length) {
      const [f, t] = tasks[i++];
      try {
        const L = await getLogs(f, t);
        total += L.length;
        for (const l of L) out.write(JSON.stringify(l) + "\n");
      } catch (e) {
        failed++;
        console.error("FAIL", f, t, e.message.slice(0, 50));
      }
      if (++done % 10 === 0 || done === tasks.length) {
        console.error(`  ${done}/${tasks.length} chunk | ${total} log | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    }
  }));

  out.end();
  console.error(`SELESAI: ${total} log, ${failed} chunk gagal, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.error(`FILE=${file}`);
})();
