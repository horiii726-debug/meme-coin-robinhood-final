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
      return await call("eth_getLogs", [{ address: PM, topics: [[T_INIT, T_SWAP, T_MOD]],
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

  // --- Kolom identitas (sender/salt): DITAMBAHKAN DI AKHIR baris, tidak pernah menggeser kolom lama.
  // Aturan format, supaya unduhan yang SEDANG BERJALAN tidak rusak:
  //   - direktori yang sudah punya swaps.csv -> format mengikuti header yang SUDAH ADA (env diabaikan)
  //   - direktori baru                       -> format dari env SIMPAN_IDENTITAS=1 (default: format lama)
  // Pembaca lama (replay.js, state_rows.js, bot/paper_live.js) memakai indeks kolom tetap p[0..9] /
  // p[0..5], jadi kolom tambahan di akhir diabaikan dengan aman.
  const H_SWAP_LAMA = "pool_id,block,log_idx,tx_hash,a0,a1,sqrt_price,liquidity,tick,fee";
  const H_LIQ_LAMA  = "pool_id,block,log_idx,tick_lo,tick_hi,liq_delta";
  const swapPath = path.join(DIR, "swaps.csv"), liqPath = path.join(DIR, "liq.csv");
  const fresh = !fs.existsSync(swapPath);
  let IDENT = process.env.SIMPAN_IDENTITAS === "1";
  if (!fresh) {
    // Header file yang sedang tumbuh menentukan format; format TIDAK BOLEH berubah di tengah file.
    let h = "";
    try {
      const fd = fs.openSync(swapPath, "r"); const buf = Buffer.alloc(4096);
      const n = fs.readSync(fd, buf, 0, 4096, 0); fs.closeSync(fd);
      h = buf.slice(0, n).toString("utf8").split("\n")[0].trim();
    } catch (e) { h = ""; }
    if (h) IDENT = h.endsWith(",sender");
  }
  const wPools = fs.createWriteStream(path.join(DIR, "pools.csv"), { flags: "a" });
  const wSwaps = fs.createWriteStream(swapPath, { flags: "a" });
  const wLiq   = fs.createWriteStream(liqPath,  { flags: "a" });
  if (fresh) {
    wPools.write("pool_id,c0,c1,fee,tick_spacing,hooks,init_block\n");
    wSwaps.write(H_SWAP_LAMA + (IDENT ? ",sender" : "") + "\n");
    wLiq.write(H_LIQ_LAMA + (IDENT ? ",sender,salt" : "") + "\n");
  }
  console.error(`kolom identitas (sender/salt): ${IDENT ? "AKTIF" : "mati"} (${fresh ? "direktori baru" : "ikut header lama"})`);

  const tasks = [];
  for (let b = FROM; b <= TO; b += CHUNK) {
    const t = Math.min(b + CHUNK - 1, TO);
    if (!doneSet.has(b)) tasks.push([b, t]);
  }
  console.error(`range ${FROM}..${TO} | ${tasks.length} chunk tersisa (${doneSet.size} sudah) | PAR=${PAR}`);

  let i = 0, nSwap = 0, nInit = 0, nLiq = 0, done = 0, failed = 0, badDecode = 0;
  const t0 = Date.now();
  const total = tasks.length;
  // tulis lalu TUNGGU sampai data benar-benar diserahkan ke OS; baru sesudah itu potongan boleh
  // dicatat "done" (versi lama mencatat done saat data masih di buffer -> bisa hilang bila proses mati).
  const put = (ws, s) => s ? new Promise((res, rej) => ws.write(s, e => e ? rej(e) : res())) : Promise.resolve();
  let stop = false;
  process.on("SIGINT", () => { stop = true; console.error("berhenti setelah potongan berjalan selesai..."); });

  const failedTasks = [];
  const worker = async () => {
    while (i < tasks.length && !stop) {
      if (fs.existsSync(path.join(__dirname, "stop_unduh.txt"))) { stop = true; break; }
      const [f, t] = tasks[i++];
      let logs;
      try { logs = await getLogs(f, t); }
      catch (e) { failed++; failedTasks.push([f, t]); console.error("FAIL", f, e.message.slice(0, 40)); await sleep(3000); continue; }
      let sS = "", sP = "", sL = "";
      for (const l of logs) {
        const blk = parseInt(l.blockNumber, 16);
        const li = parseInt(l.logIndex, 16);
        try {
          if (l.topics[0] === T_SWAP) {
            const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
            sS += `${d.id},${blk},${li},${l.transactionHash},${d.amount0},${d.amount1},${d.sqrtPriceX96},${d.liquidity},${d.tick},${d.fee}${IDENT ? "," + d.sender.toLowerCase() : ""}\n`;
            nSwap++;
          } else if (l.topics[0] === T_INIT) {
            const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
            sP += `${d.id},${d.currency0},${d.currency1},${d.fee},${d.tickSpacing},${d.hooks},${blk}\n`;
            nInit++;
          } else if (l.topics[0] === T_MOD) {
            const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
            sL += `${d.id},${blk},${li},${d.tickLower},${d.tickUpper},${d.liquidityDelta}${IDENT ? "," + d.sender.toLowerCase() + "," + d.salt : ""}\n`;
            nLiq++;
          }
        } catch (e) { badDecode++; }
      }
      await Promise.all([put(wSwaps, sS), put(wPools, sP), put(wLiq, sL)]);
      doneSet.add(f);
      if (++done % 25 === 0 || done === total) {
        fs.writeFileSync(ckptPath, JSON.stringify({ done: [...doneSet] }));
        const el = (Date.now() - t0) / 1000;
        const rate = done / el;
        console.error(`  ${done}/${total} | swap ${nSwap} init ${nInit} liq ${nLiq} | ${el.toFixed(0)}s | ETA ${((total - done) / rate / 60).toFixed(1)}m`);
      }
    }
  };
  await Promise.all(Array.from({ length: PAR }, worker));
  // ulangi potongan gagal (maks 3 putaran, paralel 1, jeda panjang)
  for (let pass = 0; pass < 3 && failedTasks.length && !stop; pass++) {
    const again = failedTasks.splice(0);
    console.error(`ulang ${again.length} potongan gagal (putaran ${pass + 1})`);
    await sleep(20000);
    tasks.length = 0; tasks.push(...again); i = 0;
    await worker();
  }

  fs.writeFileSync(ckptPath, JSON.stringify({ done: [...doneSet] }));
  await Promise.all([new Promise(r => wPools.end(r)), new Promise(r => wSwaps.end(r)), new Promise(r => wLiq.end(r))]);
  const sisa = failedTasks.length;
  console.error(`SELESAI: swap=${nSwap} init=${nInit} liq=${nLiq} gagal_akhir=${sisa} decode_gagal=${badDecode} ${((Date.now()-t0)/1000).toFixed(0)}s`);
  process.exit(sisa || stop ? 2 : 0);
})();
