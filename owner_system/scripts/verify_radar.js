// VERIFIKASI MAJU: prediksi radar (dibuat live, sebelum hasil) vs apa yang BENAR-BENAR terjadi.
// Tidak ada kebocoran: prediksi sudah tercatat dengan timestamp sebelum hasilnya ada.
const { execFileSync } = require("child_process");
const { id, Interface } = require("ethers");
const fs = require("fs");

const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const Q96 = Math.pow(2, 96);
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const T_INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const iface = new Interface([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
]);
const NATIVE = "0x0000000000000000000000000000000000000000";
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

function sleepSync(ms) { const e = Date.now() + ms; while (Date.now() < e); }
function rpc(m, p) {
  for (let a = 0; a < 6; a++) {
    try {
      const o = execFileSync("curl", ["-s", "-m", "150", "--doh-url", "https://cloudflare-dns.com/dns-query",
        "-X", "POST", "https://rpc.mainnet.chain.robinhood.com", "-H", "Content-Type: application/json",
        "-d", JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p })], { maxBuffer: 1 << 27 }).toString();
      const j = JSON.parse(o); if (j.error) throw new Error(j.error.message); return j.result;
    } catch (e) { if (a === 5) throw e; sleepSync(1500 * (a + 1)); }
  }
}

const sig = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").map(JSON.parse);
const HZ = 216000;   // 6 jam tindak lanjut
const out = [];
for (const s of sig) {
  const pid = s.pool, init = s.init_block;
  // quote: radar hanya meloloskan pool ber-ETH; cek sisi mana
  const il = rpc("eth_getLogs", [{ address: PM, topics: [T_INIT, pid], fromBlock: "0x" + init.toString(16), toBlock: "0x" + init.toString(16) }]);
  if (!il.length) { console.error("init tidak ketemu", pid.slice(0, 12)); continue; }
  const d0 = iface.parseLog({ topics: il[0].topics, data: il[0].data }).args;
  const qIsC1 = d0.currency1.toLowerCase() === NATIVE;   // ETH = quote
  // ambil log dengan pemecahan rentang otomatis bila melebihi batas 10.000
  const getRange = (f, t) => {
    try {
      return rpc("eth_getLogs", [{ address: PM, topics: [T_SWAP, pid], fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) }]);
    } catch (e) {
      if (e.message.includes("exceeds limit") && t > f) {
        const mid = Math.floor((f + t) / 2);
        return getRange(f, mid).concat(getRange(mid + 1, t));
      }
      throw e;
    }
  };
  const logs = [];
  for (let b = init; b < init + HZ; b += 36000) logs.push(...getRange(b, Math.min(b + 35999, init + HZ)));
  const sw = logs.map(l => {
    const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
    return { blk: parseInt(l.blockNumber, 16), sqrtP: Number(d.sqrtPriceX96) / Q96, L: Number(d.liquidity), fee: Number(d.fee) };
  }).filter(x => isFinite(x.sqrtP) && x.sqrtP > 0 && x.L > 0).sort((a, b) => a.blk - b.blk);

  const toUsd = r => (Math.abs(r) / 1e18) * ethUsd;
  const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
  const ei = sw.findIndex(x => x.blk >= init + 620);   // radar menilai di +620
  if (ei < 0 || ei >= sw.length - 1) { out.push({ ...s, note: "tidak ada swap setelah entry" }); continue; }
  const e = sw[ei];
  const size = Math.min(200, 0.01 * lpUsd(e));
  const dIn = (size / ethUsd) * 1e18 * (1 - e.fee / 1e6);
  let base;
  if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
  else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
  const sellUsd = x => {
    const bIn = base * (1 - x.fee / 1e6); let recv;
    if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; recv = x.L * (x.sqrtP - 1 / inv); }
    else { const spb = x.sqrtP + bIn / x.L; recv = x.L * (1 / x.sqrtP - 1 / spb); }
    return (!isFinite(recv) || recv <= 0) ? 0 : toUsd(recv);
  };
  const after = sw.slice(ei + 1);
  let best = 0, bestBlk = e.blk, peak = size, trig = -1;
  for (let i = 0; i < after.length; i++) {
    const v = sellUsd(after[i]);
    if (v > best) { best = v; bestBlk = after[i].blk; }
    if (trig < 0) {
      if (v > peak) peak = v;
      if (after[i].blk - e.blk >= 9000 || (v <= peak * 0.5 && peak > size)) trig = i;
    }
  }
  const xi = trig < 0 ? after.length - 1 : Math.min(trig + 1, after.length - 1);
  const stratRet = sellUsd(after[xi]) / size;
  out.push({ ...s, size, best: best / size, bestH: (bestBlk - e.blk) / 36000, strat: stratRet, nAfter: after.length });
  process.stderr.write(".");
}
console.error("");

const pctf = v => ((v - 1) * 100).toFixed(0) + "%";
console.log("=".repeat(104));
console.log("UJI MAJU RADAR — prediksi live vs hasil nyata (6 jam tindak lanjut)");
console.log("=".repeat(104));
console.log("pool".padEnd(15) + "p100".padStart(7) + "p400".padStart(7) + "p1000".padStart(7) + "   size" + "   PUNCAK nyata" + "  jam" + "   STRATEGI(trail-50%/15m)");
console.log("-".repeat(104));
for (const r of out.sort((a, b) => b.p400 - a.p400)) {
  if (r.note) { console.log(r.pool.slice(0, 14).padEnd(15) + String(r.p100).padStart(7) + String(r.p400).padStart(7) + String(r.p1000).padStart(7) + "   " + r.note); continue; }
  console.log(r.pool.slice(0, 14).padEnd(15) + r.p100.toFixed(2).padStart(7) + r.p400.toFixed(2).padStart(7) + r.p1000.toFixed(2).padStart(7)
    + ("$" + r.size.toFixed(0)).padStart(7) + pctf(r.best).padStart(15) + r.bestH.toFixed(1).padStart(5) + pctf(r.strat).padStart(26));
}
const V = out.filter(r => !r.note);
const grp = (name, f) => {
  const S = V.filter(f); if (!S.length) return;
  const hit2 = S.filter(r => r.best >= 2).length, hit5 = S.filter(r => r.best >= 5).length;
  const meanStrat = S.reduce((a, r) => a + r.strat, 0) / S.length;
  const pnl = S.reduce((a, r) => a + (r.strat - 1) * r.size, 0);
  const avgP100 = S.reduce((a, r) => a + r.p100, 0) / S.length;
  const avgP400 = S.reduce((a, r) => a + r.p400, 0) / S.length;
  console.log(name.padEnd(30) + String(S.length).padStart(4)
    + `  prediksi p100 ${(100 * avgP100).toFixed(0)}% -> nyata ${(100 * hit2 / S.length).toFixed(0)}%`
    + `  | prediksi p400 ${(100 * avgP400).toFixed(0)}% -> nyata ${(100 * hit5 / S.length).toFixed(0)}%`
    + `  | strategi rata2 ${pctf(meanStrat)}  PnL $${pnl.toFixed(0)}`);
};
console.log("\n" + "=".repeat(104));
console.log("KALIBRASI — apakah probabilitas yang diprediksi sesuai kenyataan?");
console.log("=".repeat(104));
grp("skor TINGGI (p100 >= 0,5)", r => r.p100 >= 0.5);
grp("skor RENDAH (p100 < 0,5)", r => r.p100 < 0.5);
grp("SEMUA", () => true);
