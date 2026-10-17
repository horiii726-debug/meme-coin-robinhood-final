// BACKFILL IDENTITAS (Agent 17) — ambil ulang log on-chain yang identitasnya dibuang kolektor lama.
// Untuk daftar pool terpilih (data/identitas/daftar.csv) mengambil:
//   1. ModifyLiquidity  (topics: [T_MOD, poolId])  -> sender + salt + tx_hash, SELURUH riwayat pool
//   2. Swap             (topics: [T_SWAP, poolId]) -> sender + tx_hash, init..init+HZ
//   3. Transfer token   (address: token)           -> from/to/value + tx_hash, init..init+HZ
//   4. Transfer ERC721 PositionManager             -> pemilik NYATA posisi LP (salt = tokenId)
// Berkas lama TIDAK PERNAH ditimpa; semua hasil masuk ke data/identitas/.
// Resume lewat checkpoint per pool. Berhenti sendiri kalau disk bebas < MIN_GB.
// Pakai: node backfill_id.js            (env: GRUP, PAR, JEDA, HZ, MIN_GB, LIMIT, OUT, DAFTAR)
// Berhenti rapi: buat pipeline/stop_backfill.txt
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Interface, id } = require("ethers");

const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const DOH = process.env.DOH_URL || "https://cloudflare-dns.com/dns-query";
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const T_MOD = id("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)");
const T_TR = id("Transfer(address,address,uint256)");
const iface = new Interface([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
]);
const ROOT = path.join(__dirname, "..");
const OUT = process.env.OUT || path.join(ROOT, "data", "identitas");
const HZ = +(process.env.HZ || 324000);          // 9 jam, sama dengan batas pegang bot
const PAR = +(process.env.PAR || 2);             // paralelisme RENDAH: RPC gratis dipakai unduhan lain
const MIN_GB = +(process.env.MIN_GB || 6);
const LIMIT = +(process.env.LIMIT || 0);
const NOL32 = "0x" + "0".repeat(64);
const NOLADDR = "0x0000000000000000000000000000000000000000";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- pacu RPC adaptif ----------
const JEDA0 = +(process.env.JEDA || 350);        // jeda dasar antar panggilan (ms)
let jeda = JEDA0;
let n429 = 0, nPanggil = 0;
function naikkanJeda() { jeda = Math.min(6000, Math.round(jeda * 1.5) + 200); }
function turunkanJeda() { if (jeda > JEDA0) jeda = Math.max(JEDA0, Math.round(jeda * 0.88)); }

function rpc(method, params) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const args = ["-s", "-m", "180"];
    if (DOH) args.push("--doh-url", DOH);
    args.push("-X", "POST", RPC, "-H", "Content-Type: application/json", "-d", body);
    const p = spawn("curl", args, { maxBuffer: 1 << 29 });
    let out = "";
    p.stdout.on("data", d => out += d);
    p.on("close", () => {
      try { const j = JSON.parse(out); j.error ? rej(new Error(j.error.message)) : res(j.result); }
      catch (e) { rej(new Error("badjson")); }
    });
  });
}

async function call(method, params) {
  for (let a = 0; a < 9; a++) {
    await sleep(jeda + Math.random() * 200);
    nPanggil++;
    try { const r = await rpc(method, params); turunkanJeda(); return r; }
    catch (e) {
      const m = e.message || "";
      if (m.includes("exceeds limit") || m.includes("too many results")) throw e;   // ditangani pemanggil
      if (m.includes("Too Many Requests") || m.includes("429") || m.includes("rate limit")) { n429++; naikkanJeda(); }
      if (a === 8) throw e;
      await sleep(900 * Math.pow(1.8, a) + Math.random() * 700);
    }
  }
}

// getLogs dengan pemecahan rentang otomatis bila hasil melebihi batas RPC
async function getLogs(filter, from, to, depth = 0) {
  try {
    const f = Object.assign({}, filter, { fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) });
    return await call("eth_getLogs", [f]);
  } catch (e) {
    const m = e.message || "";
    if ((m.includes("exceeds limit") || m.includes("too many results")) && to > from && depth < 24) {
      const mid = Math.floor((from + to) / 2);
      const a = await getLogs(filter, from, mid, depth + 1);
      const b = await getLogs(filter, mid + 1, to, depth + 1);
      return a.concat(b);
    }
    throw e;
  }
}

function diskBebasGB() {
  try {
    const r = spawnSync("df", ["-k", OUT], { encoding: "utf8" });
    const l = r.stdout.trim().split("\n").pop().trim().split(/\s+/);
    const v = +l[3] / 1048576;
    return isFinite(v) ? v : 99;
  } catch (e) { return 99; }
}

const num = h => parseInt(h, 16);
const addr = t => "0x" + t.slice(26).toLowerCase();

async function kerjakanPool(r, head, stat) {
  const pool = r.pool.toLowerCase(), init = +r.init, token = (r.token || "").toLowerCase();
  const akhir = Math.min(init + HZ, head);
  const tulis = (sub, isi) => {
    const d = path.join(OUT, sub); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, pool + ".csv"), isi);
  };

  // 1) ModifyLiquidity — SELURUH riwayat pool (init .. kepala rantai)
  const mod = await getLogs({ address: PM, topics: [T_MOD, pool] }, init, head);
  const salts = new Map();            // sender -> Set(salt)
  let sMod = "block,log_idx,tx_hash,tick_lo,tick_hi,liq_delta,sender,salt\n";
  for (const l of mod) {
    const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
    const sender = d.sender.toLowerCase();
    sMod += num(l.blockNumber) + "," + num(l.logIndex) + "," + l.transactionHash + "," +
      d.tickLower + "," + d.tickUpper + "," + d.liquidityDelta + "," + sender + "," + d.salt + "\n";
    if (!salts.has(sender)) salts.set(sender, new Set());
    salts.get(sender).add(d.salt);
  }
  tulis("liq", sMod);

  // 2) Swap — init .. init+HZ (identitas pengirim; kolom lain ikut supaya berkas berdiri sendiri)
  const sw = await getLogs({ address: PM, topics: [T_SWAP, pool] }, init, akhir);
  let sSw = "block,log_idx,tx_hash,sender,a0,a1,sqrt_price,liquidity,tick,fee\n";
  for (const l of sw) {
    const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
    sSw += num(l.blockNumber) + "," + num(l.logIndex) + "," + l.transactionHash + "," + d.sender.toLowerCase() + "," +
      d.amount0 + "," + d.amount1 + "," + d.sqrtPriceX96 + "," + d.liquidity + "," + d.tick + "," + d.fee + "\n";
  }
  tulis("swap", sSw);

  // 3) Transfer token — init .. init+HZ (LANJUTAN dari fetch_tr.js yang berhenti di init+600)
  let nTr = 0;
  if (token && token !== NOLADDR) {
    const tr = await getLogs({ address: token, topics: [T_TR] }, init, akhir);
    let sTr = "block,log_idx,tx_hash,from,to,value\n";
    for (const l of tr) {
      if (l.topics.length < 3) continue;                       // bentuk Transfer lain (mis. ERC721)
      sTr += num(l.blockNumber) + "," + num(l.logIndex) + "," + l.transactionHash + "," +
        addr(l.topics[1]) + "," + addr(l.topics[2]) + "," + (l.data === "0x" ? "0" : BigInt(l.data).toString()) + "\n";
      nTr++;
    }
    tulis("tr", sTr);
  }

  // 4) Pemilik NYATA posisi LP: salt = tokenId NFT di kontrak PositionManager (= sender).
  //    Transfer(0x0 -> pemilik) = mint posisi; transfer berikutnya = pindah kepemilikan.
  let sNft = "manager,token_id,block,log_idx,from,to\n", nNft = 0;
  for (const [sender, set] of salts) {
    const ids = [...set].filter(x => x !== NOL32);
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      let lg = [];
      try { lg = await getLogs({ address: sender, topics: [T_TR, null, null, chunk] }, Math.max(0, init - 500), akhir); }
      catch (e) { continue; }                                  // kontrak bukan ERC721 -> tidak ada data
      for (const l of lg) {
        if (l.topics.length < 4) continue;
        sNft += sender + "," + l.topics[3] + "," + num(l.blockNumber) + "," + num(l.logIndex) + "," +
          addr(l.topics[1]) + "," + addr(l.topics[2]) + "\n";
        nNft++;
      }
    }
  }
  tulis("nft", sNft);

  stat.mod += mod.length; stat.sw += sw.length; stat.tr += nTr; stat.nft += nNft;
  return { pool, mod: mod.length, swap: sw.length, tr: nTr, nft: nNft, init, akhir, head, token, ds: r.ds, grup: r.grup };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const daftarPath = process.env.DAFTAR || path.join(OUT, "daftar.csv");
  const lines = fs.readFileSync(daftarPath, "utf8").trim().split("\n");
  const cols = lines[0].split(",");
  let rows = lines.slice(1).map(l => {
    const p = l.split(","); const o = {}; cols.forEach((c, i) => o[c] = p[i]); return o;
  });
  if (process.env.GRUP) {
    const want = process.env.GRUP.split(",").map(s => s.trim());
    rows = rows.filter(r => want.some(w => (r.grup || "").split("|").includes(w)));
  }
  if (LIMIT) rows = rows.slice(0, LIMIT);

  const ckPath = path.join(OUT, "checkpoint_backfill.json");
  let ck = fs.existsSync(ckPath) ? JSON.parse(fs.readFileSync(ckPath, "utf8")) : { selesai: {}, gagal: {} };
  if (!ck.selesai) ck.selesai = {};
  if (!ck.gagal) ck.gagal = {};
  const todo = rows.filter(r => !ck.selesai[r.pool.toLowerCase()]);

  const bebas = diskBebasGB();
  console.error("pool diminta " + rows.length + " | sudah " + (rows.length - todo.length) + " | sisa " + todo.length +
    " | PAR=" + PAR + " jeda=" + jeda + "ms | disk bebas " + bebas.toFixed(1) + " GB");
  if (bebas < MIN_GB) { console.error("disk bebas < " + MIN_GB + " GB -> berhenti sebelum mulai"); process.exit(3); }

  let head = 0;
  for (let a = 0; a < 6 && !head; a++) { try { head = num(await call("eth_blockNumber", [])); } catch (e) { await sleep(4000); } }
  if (!head) { console.error("tidak bisa membaca kepala rantai"); process.exit(2); }
  console.error("kepala rantai: " + head);

  const stat = { mod: 0, sw: 0, tr: 0, nft: 0 };
  let i = 0, ok = 0, gagal = 0, stop = false;
  const t0 = Date.now();
  const ringkas = [];
  const worker = async () => {
    while (i < todo.length && !stop) {
      if (fs.existsSync(path.join(__dirname, "stop_backfill.txt"))) { stop = true; console.error("stop_backfill.txt -> berhenti"); break; }
      const r = todo[i++];
      if ((i % 5) === 1) {
        const b = diskBebasGB();
        if (b < MIN_GB) { stop = true; console.error("disk bebas " + b.toFixed(1) + " GB < " + MIN_GB + " GB -> berhenti"); break; }
      }
      try {
        const res = await kerjakanPool(r, head, stat);
        ck.selesai[res.pool] = { mod: res.mod, swap: res.swap, tr: res.tr, nft: res.nft, akhir: res.akhir, head };
        delete ck.gagal[res.pool];
        ringkas.push(res); ok++;
      } catch (e) {
        gagal++; ck.gagal[r.pool.toLowerCase()] = (e.message || "?").slice(0, 80);
        console.error("GAGAL " + r.pool.slice(0, 12) + " " + (e.message || "").slice(0, 60));
      }
      if ((ok + gagal) % 5 === 0 || i >= todo.length) {
        fs.writeFileSync(ckPath, JSON.stringify(ck));
        const el = (Date.now() - t0) / 1000;
        console.error("  " + (ok + gagal) + "/" + todo.length + " | mod " + stat.mod + " swap " + stat.sw +
          " tr " + stat.tr + " nft " + stat.nft + " | 429=" + n429 + " jeda=" + jeda + "ms | " + el.toFixed(0) + "s | ETA " +
          ((((todo.length - ok - gagal) / Math.max(ok + gagal, 1)) * el) / 60).toFixed(1) + "m");
      }
    }
  };
  await Promise.all(Array.from({ length: PAR }, worker));
  fs.writeFileSync(ckPath, JSON.stringify(ck));
  const logPath = path.join(OUT, "backfill_log.csv");
  if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, "pool,ds,grup,init,akhir,head,token,n_mod,n_swap,n_tr,n_nft\n");
  if (ringkas.length) {
    fs.appendFileSync(logPath, ringkas.map(r => r.pool + "," + r.ds + "," + r.grup + "," + r.init + "," + r.akhir + "," +
      r.head + "," + r.token + "," + r.mod + "," + r.swap + "," + r.tr + "," + r.nft).join("\n") + "\n");
  }
  console.error("SELESAI: ok=" + ok + " gagal=" + gagal + " | RPC: " + nPanggil + " panggilan, " + n429 +
    " kali Too Many Requests | " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
  process.exit(gagal || stop ? 2 : 0);
})();
