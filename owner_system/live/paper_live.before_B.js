// PAPER TRADING LIVE v2/v3/v4 — MODE KERTAS. TIDAK ADA TRANSAKSI, TIDAK ADA KUNCI DOMPET.
// Pakai mesin yang sama dengan backtest (v4engine.js, lulus uji kesamaan 638/638 trade).
// Semua event disimpan ke disk (format sama dengan collect.js). Kalau proses mati, saat hidup lagi
// event diputar ulang lalu lanjut dari blok terakhir, jadi tidak ada celah data.
// Pakai: node paper_live.js [startBlock]
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PoolSim, loadModel, safe, HZ } = require("./v4engine");
const FEAT = require("./filter_feats");

const HERE = __dirname;
const STORE = path.join(HERE, "store");
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";          // config.toml: pool_manager (terverifikasi)
// RPC bisa lebih dari satu (dipisah koma) -> otomatis pindah kalau satu gagal. DoH hanya perlu di koneksi yang DNS-nya dibajak ISP.
const RPCS = (process.env.RPC_URLS || "https://rpc.mainnet.chain.robinhood.com").split(",").map(x => x.trim()).filter(Boolean);
const DOH = process.env.DOH_URL === undefined ? "https://cloudflare-dns.com/dns-query" : process.env.DOH_URL;
let rpcIdx = 0;
const T_INIT = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
const T_SWAP = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const T_MOD = "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";
const ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e";   // ETH/USDG fee 100 (eth_usd.json)
const Q96 = Math.pow(2, 96);
const POLL_MS = +(process.env.POLL_MS || 1500), CHUNK = 1200, REALTIME_LAG = 50;
// Koreksi realistis dari audit 2026-09-13: masuk telat 3 dtk, pool mati tidak dibuang, tanpa intip blok, LP akhir dihitung.
// 2026-09-13: batas pegang 6 jam DIHAPUS (permintaan pemilik; di LAMA PF per trade sama). Batas 48 jam hanya untuk bersih-bersih memori.
// 2026-09-13 22:xx: KEMBALI ke v4 asli (batas 6 jam). Tanpa batas, uang terkunci di koin mati: akun $100 riwayat asli $78 vs $5.756 dengan batas 6 jam.
// 2026-09-15 AUDIT: masuk berdasarkan waktu (menit 1 + 3 dtk, tidak menunggu swap berikutnya) + pesanan jual terisi berdasarkan waktu.
// 2026-09-15 BIAYA NYATA: gas swap diukur dari receipt on-chain (median $0,054/tx) -> $0,06; approve token $0,03; bot lain di blok yang sama dianggap lebih dulu.
const REALISTIC = { latb: 30, entryLat: 30, keepNoAfter: true, strictSnap: true, lpAdjust: true, fillOnTime: true, gasUsd: 0.06, approveUsd: 0.03, worstOrder: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = s => { const l = `[${new Date().toISOString().slice(0, 19)}] ${s}`; console.log(l); fs.appendFileSync(path.join(HERE, "live.log"), l + "\n"); };

fs.mkdirSync(STORE, { recursive: true });
const model = loadModel(path.join(HERE, "danger_model.json"));
// FILTER BELI (ML): aktif kalau FILTER=1. Skor < ambang -> koin dilewati.
const USE_FILTER = process.env.FILTER === "1";
const filterModel = USE_FILTER ? loadModel(path.join(HERE, "filter_model.json")) : null;
const FILTER_THR = USE_FILTER ? JSON.parse(fs.readFileSync(path.join(HERE, "filter_model.json"), "utf8")).threshold : 0;
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
let nSkip = 0, nPass = 0;
// AKUN VIRTUAL (siap VPS): modal, 1/4 Kelly, batas posisi. Nilai dari uji 2026-09-18 (FORWARD_TEST_RULES.md).
const START_USD = +(process.env.START_USD || 100);
const KELLY_HIST = 0.094;          // 1/4 Kelly dari 1.754 trade historis; dipakai sampai ada 100 trade live
const MAX_POS = +(process.env.MAX_POS || 20);
const HONEYPOT = process.env.HONEYPOT !== "0";
const FRESH_BLOCKS = +(process.env.FRESH_BLOCKS || 300);    // data dianggap basi kalau tertinggal > 30 dtk
const acct = { cash: START_USD, locked: 0, peak: START_USD, dd: 0, open: new Map(), closed: 0, wins: 0, liveRets: [] };
const recentScores = [];
// KEPUTUSAN CEK DISIMPAN: supaya saat restart/putar ulang hasilnya sama persis dan tidak memanggil RPC lagi
const DECISIONS = path.join(HERE, "decisions.jsonl");
const decided = new Map();
if (fs.existsSync(DECISIONS)) for (const l of fs.readFileSync(DECISIONS, "utf8").split(String.fromCharCode(10))) if (l.trim()) { try { const d = JSON.parse(l); decided.set(d.pool, d); } catch (e) {} }
function saveDecision(sim) {
  const d = { pool: sim.m.id, filterOk: sim.filterOk, score: sim.filterScore ?? null, honeypot: sim.honeypot ?? null, hpWhy: sim.hpWhy ?? null, t: new Date().toISOString() };
  decided.set(d.pool, d); fs.appendFileSync(DECISIONS, JSON.stringify(d) + String.fromCharCode(10));
}
let nHoneypot = 0, nStale = 0, nFull = 0, lastOkPoll = 0, nRpcFail = 0, nKill = 0;
const kellyNow = () => {
  const r = acct.liveRets; if (r.length < 100) return KELLY_HIST;
  let best = 0, bestG = -1e18;
  for (let f = 0; f < 1; f += 0.005) { let g = 0; for (const x of r) g += Math.log(Math.max(1 + f * (x - 1), 1e-12)); if (g > bestG) { bestG = g; best = f; } }
  return best / 4;
};
const thrNow = () => {
  if (recentScores.length < 30) return FILTER_THR;
  const s = [...recentScores].sort((x, y) => x - y); return s[Math.floor(0.30 * s.length)];
};

// ---------- RPC ----------
function call(method, params) {
  return new Promise((res, rej) => {
    const url = RPCS[rpcIdx % RPCS.length];
    const args = ["-s", "-m", "60", ...(DOH ? ["--doh-url", DOH] : []), "-X", "POST", url, "-H", "Content-Type: application/json", "-d", JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })];
    const p = spawn("curl", args);
    let o = ""; p.stdout.on("data", d => o += d);
    p.on("close", () => { try { const j = JSON.parse(o); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(new Error("badjson " + o.slice(0, 60))); } });
  });
}
async function rpc(method, params) {
  for (let a = 0; ; a++) {
    try { return await call(method, params); }
    catch (e) {
      if (e.message.includes("exceeds limit") || /revert|execution/i.test(e.message)) throw e;
      if (RPCS.length > 1) rpcIdx++;                     // pindah ke RPC cadangan
      if (a >= 8) throw e; await sleep(Math.min(30000, 600 * 2 ** a));
    }
  }
}
// Panggilan cepat untuk pengecekan sebelum beli: maksimal ~4 dtk, tidak boleh menahan bot lama.
function rpcQuick(method, params, ms = 4000) {
  return new Promise((res, rej) => {
    const url = RPCS[rpcIdx % RPCS.length];
    const args = ["-s", "-m", String(Math.ceil(ms / 1000)), ...(DOH ? ["--doh-url", DOH] : []), "-X", "POST", url, "-H", "Content-Type: application/json", "-d", JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })];
    const p = spawn("curl", args); let o = "";
    p.stdout.on("data", d => o += d);
    p.on("close", () => { try { const j = JSON.parse(o); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(new Error("timeout/badjson")); } });
  });
}
async function getLogs(from, to, topics) {
  try { return await rpc("eth_getLogs", [{ address: PM, topics, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]); }
  catch (e) {
    if (e.message.includes("exceeds limit") && to > from) { const mid = (from + to) >> 1; return (await getLogs(from, mid, topics)).concat(await getLogs(mid + 1, to, topics)); }
    throw e;
  }
}

// ---------- decode ABI manual (tanpa library) ----------
const word = (data, k) => data.slice(2 + 64 * k, 2 + 64 * (k + 1));
const u = w => BigInt("0x" + w);
const s = (w, bits) => BigInt.asIntN(bits, BigInt("0x" + w));
const addr = t => "0x" + t.slice(-40).toLowerCase();
function decode(l) {
  const blk = parseInt(l.blockNumber, 16), li = parseInt(l.logIndex, 16), t0 = l.topics[0], id = l.topics[1].toLowerCase();
  if (t0 === T_SWAP) return { k: "S", id, blk, li, tx: l.transactionHash, a0: s(word(l.data, 0), 128), a1: s(word(l.data, 1), 128),
    sqrtPX96: u(word(l.data, 2)), L: u(word(l.data, 3)), tick: s(word(l.data, 4), 24), fee: Number(u(word(l.data, 5))) };
  if (t0 === T_INIT) return { k: "I", id, blk, li, c0: addr(l.topics[2]), c1: addr(l.topics[3]), fee: Number(u(word(l.data, 0))),
    ts: s(word(l.data, 1), 24), hooks: addr(word(l.data, 2)) };
  if (t0 === T_MOD) return { k: "M", id, blk, li, tlo: s(word(l.data, 0), 24), thi: s(word(l.data, 1), 24), d: s(word(l.data, 2), 256) };
  return null;
}
const csvLine = e => e.k === "S" ? `${e.id},${e.blk},${e.li},${e.tx},${e.a0},${e.a1},${e.sqrtPX96},${e.L},${e.tick},${e.fee}`
  : e.k === "I" ? `${e.id},${e.c0},${e.c1},${e.fee},${e.ts},${e.hooks},${e.blk},${e.li}` : `${e.id},${e.blk},${e.li},${e.tlo},${e.thi},${e.d}`;
const HEAD = { "swaps.csv": "pool_id,block,log_idx,tx_hash,a0,a1,sqrt_price,liquidity,tick,fee",
  "pools.csv": "pool_id,c0,c1,fee,tick_spacing,hooks,init_block,log_idx", "liq.csv": "pool_id,block,log_idx,tick_lo,tick_hi,liq_delta" };
// baca event tersimpan; buang event di atas blok checkpoint (sisa potongan yang belum selesai saat proses mati)
function parseStore(maxBlk) {
  const ev = [];
  for (const f of Object.keys(HEAD)) {
    const p = path.join(STORE, f); if (!fs.existsSync(p)) continue;
    const keep = [HEAD[f]]; let dropped = 0;
    for (const l of fs.readFileSync(p, "utf8").split("\n").slice(1)) {
      if (!l.trim()) continue; const q = l.trim().split(",");
      const e = f === "pools.csv" ? { k: "I", id: q[0], c0: q[1], c1: q[2], fee: +q[3], ts: +q[4], hooks: q[5], blk: +q[6], li: +(q[7] ?? -1) }
        : f === "swaps.csv" ? { k: "S", id: q[0], blk: +q[1], li: +q[2], tx: q[3], a0: BigInt(q[4]), a1: BigInt(q[5]), sqrtPX96: BigInt(q[6]), L: BigInt(q[7]), tick: +q[8], fee: +q[9] }
        : { k: "M", id: q[0], blk: +q[1], li: +q[2], tlo: +q[3], thi: +q[4], d: BigInt(q[5]) };
      if (e.blk > maxBlk) { dropped++; continue; }
      ev.push(e); keep.push(l.trim());
    }
    if (dropped) { fs.writeFileSync(p, keep.join("\n") + "\n"); log(`${f}: ${dropped} event sisa potongan tak selesai dibuang (akan diambil ulang)`); }
  }
  return ev.sort((a, b) => a.blk - b.blk || a.li - b.li);
}
const writers = {};
function store(e) {
  const f = e.k === "S" ? "swaps.csv" : e.k === "I" ? "pools.csv" : "liq.csv";
  if (!writers[f]) {
    const p = path.join(STORE, f), fresh = !fs.existsSync(p);
    writers[f] = fs.openSync(p, "a");
    if (fresh) fs.writeSync(writers[f], HEAD[f] + "\n");
  }
  fs.writeSync(writers[f], csvLine(e) + "\n");
}

// ---------- status & hasil ----------
const TRADES = path.join(HERE, "trades.jsonl"), EVENTS = path.join(HERE, "events.jsonl");
const sims = new Map();
let ethUsd = null, lastBlk = 0, tip = 0, replaying = false, started = Date.now(), lastErr = "";
const closed = [];
function onTrade(t) {
  t.realtime = !replaying && tip - t.exitBlk <= REALTIME_LAG;
  closed.push(t);
  if (t.plan === "v4") {
    acct.liveRets.push(t.ret);
    const o = acct.open.get(t.pool);
    if (o) {
      acct.open.delete(t.pool); acct.locked -= o.pos;
      const g = t.gasTot ?? 0.2;
      const back = Math.max(0, o.pos * (t.ret + g / t.size) - g);
      acct.cash += back; acct.closed++; if (back > o.pos) acct.wins++;
      t.akun_posisi = o.pos; t.akun_kembali = back;
      const eq = acct.cash + acct.locked; acct.peak = Math.max(acct.peak, eq); acct.dd = Math.max(acct.dd, 1 - eq / acct.peak);
    }
  }
  if (!replaying) {
    fs.appendFileSync(TRADES, JSON.stringify(t) + "\n");
    if (t.plan === "v4") log(`TUTUP v4 ${t.pool.slice(0, 10)} ${t.pnl >= 0 ? "+" : ""}${(100 * (t.ret - 1)).toFixed(0)}% ($${t.pnl.toFixed(2)}) hold ${t.hold.toFixed(0)}m | ${t.reason}`);
  }
}
function onEvent(e) {
  if (e.type === "entry" && e.plan !== "v3" ) {
    const sim = sims.get(e.pool); const g = 0.06 * 3 + 0.03;
    const E = acct.cash + acct.locked;
    const pos = Math.min(kellyNow() * E, e.size, acct.cash - g);
    if (pos >= 1 && acct.open.size < MAX_POS) { acct.cash -= pos; acct.locked += pos; acct.open.set(e.pool, { pos, size: e.size }); }
  }
  if (replaying) return;
  e.ts = new Date().toISOString(); e.lag = tip - e.blk;
  fs.appendFileSync(EVENTS, JSON.stringify(e) + "\n");
  if (e.type === "entry") log(`MASUK ${e.pool.slice(0, 10)} ukuran $${e.size.toFixed(0)} LP $${e.lp.toFixed(0)} (kertas)`);
}
// KILL SWITCH: berhenti buka posisi baru kalau equity turun terlalu dalam dari puncak (default 35%).
const KILL_DD = +(process.env.KILL_DD || 0.35);
let killed = false;
function ekuitasSekarang() {
  let nilai = 0;
  for (const [pool, o] of acct.open) {
    const sim = sims.get(pool); const m = sim ? sim.nilaiSekarang("v4") : null;
    nilai += m === null || !isFinite(m) ? o.pos : o.pos * m;      // kalau tidak bisa dinilai, pakai harga beli
  }
  return { equity: acct.cash + nilai, nilaiPosisi: nilai };
}
function cekKill() {
  const { equity } = ekuitasSekarang();
  acct.peakMtm = Math.max(acct.peakMtm || START_USD, equity);
  const dd = 1 - equity / acct.peakMtm;
  if (!killed && dd >= KILL_DD) { killed = true; log(`KILL SWITCH: equity $${equity.toFixed(2)} turun ${(100*dd).toFixed(0)}% dari puncak $${acct.peakMtm.toFixed(2)} -> berhenti buka posisi baru`); }
  return dd;
}
function writeStatus() {
  const ddMtm = cekKill(); const mtm = ekuitasSekarang();
  const st = {};
  for (const plan of ["v4", "v3", "v2"]) {
    const t = closed.filter(x => x.plan === plan);
    const gp = t.filter(x => x.pnl > 0).reduce((a, x) => a + x.pnl, 0), gl = -t.filter(x => x.pnl < 0).reduce((a, x) => a + x.pnl, 0);
    st[plan] = { trade: t.length, win_rate: t.length ? +(100 * t.filter(x => x.pnl > 0).length / t.length).toFixed(1) : null,
      pf: gl ? +(gp / gl).toFixed(2) : null, pnl: +t.reduce((a, x) => a + x.pnl, 0).toFixed(2) };
  }
  let open = 0; for (const sim of sims.values()) if (sim.ei >= 0 && !sim.skip && sim.plans.some(p => p.name === "v4" && !p.done)) open++;
  fs.writeFileSync(path.join(HERE, "status.json"), JSON.stringify({ updated: new Date().toISOString(), mode: "KERTAS (tanpa transaksi)",
    last_block: lastBlk, tip, lag_blocks: tip - lastBlk, eth_usd: ethUsd && +ethUsd.toFixed(2), pools_tracked: sims.size, v4_open: open,
    uptime_min: +((Date.now() - started) / 60000).toFixed(1), last_error: lastErr, filter: USE_FILTER ? { ambil: nPass, lewati: nSkip, ambang: +thrNow().toFixed(3) } : "mati", pengaman: { honeypot_dilewati: nHoneypot, cek_rpc_gagal: nRpcFail, data_basi: nStale, slot_penuh: nFull, maks_posisi: MAX_POS, kill_switch: killed ? "AKTIF (berhenti beli)" : `mati (batas ${(100*KILL_DD).toFixed(0)}%)`, dilewati_kill: nKill }, akun: { modal_awal: START_USD, equity_harga_beli: +(acct.cash + acct.locked).toFixed(2), equity_harga_pasar: +mtm.equity.toFixed(2), nilai_posisi_sekarang: +mtm.nilaiPosisi.toFixed(2), drawdown_pasar: +(100 * ddMtm).toFixed(1), kas: +acct.cash.toFixed(2), terpakai: +acct.locked.toFixed(2), posisi_terbuka: acct.open.size, trade_selesai: acct.closed, win_rate: acct.closed ? +(100 * acct.wins / acct.closed).toFixed(1) : null, drawdown_maks: +(100 * acct.dd).toFixed(1), kelly: +kellyNow().toFixed(4) }, results: st }, null, 1));
}

// ---------- filter beli (ML) ----------
function gate(sim) {
  // DATA SEGAR: di live nyata tidak mungkin beli tepat menit-1 kalau bot tertinggal > 30 dtk dari chain, atau RPC gagal > 15 dtk
  if (!replaying && (tip - (sim.m.init + 630) > FRESH_BLOCKS || Date.now() - lastOkPoll > 15000)) { nStale++; sim.skipWhy2 = "data basi"; return false; }
  if (HONEYPOT && sim.honeypot === true) { nHoneypot++; return false; }
  if (acct.open.size >= MAX_POS) { nFull++; return false; }
  if (killed) { nKill++; return false; }
  if (replaying) return sim.filterOk === undefined ? true : sim.filterOk;   // putar ulang: tanpa cek jaringan
  const telat = tip - (sim.m.init + 630);
  const siap = (!USE_FILTER || sim.filterOk !== undefined) && (!HONEYPOT || sim.filterOk === false || sim.honeypot !== undefined);
  if (!siap) {
    if (telat > 100) { nStale++; if (!sim.loggedWait) { sim.loggedWait = true; log(`TUNGGU CEK ${sim.m.id.slice(0, 10)} > 10 dtk, dilewati`); } return false; }
    return null;                                            // tunggu hasil cek, jangan beli buta
  }
  if (!USE_FILTER) return true;
  return sim.filterOk;
}
async function siapkanFilter(sim, blk) {
  if (!USE_FILTER || sim.filterOk !== undefined || sim.ei >= 0 || sim.skip) return;
  const init = sim.m.init;
  if (blk < init + 600) return;
  try {
    const logs = await rpcQuick("eth_getLogs", [{ address: sim.token, topics: [T_TRANSFER], fromBlock: "0x" + init.toString(16), toBlock: "0x" + (init + 600).toString(16) }], 5000);
    const tr = logs.map(l => [parseInt(l.blockNumber, 16), parseInt(l.logIndex, 16),
      "0x" + l.topics[1].slice(-40).toLowerCase(), "0x" + l.topics[2].slice(-40).toLowerCase(), BigInt(l.data).toString()]);
    const sw = sim.sw.filter(x => x.blk <= init + 600);
    const f = FEAT.features(sim.m, sw, tr, sim.ethUsd);
    const x = filterModel.feats.map(k => (Number.isFinite(f[k]) ? f[k] : NaN));
    const p = filterModel.predict(x);
    const thr = thrNow();
    recentScores.push(p); if (recentScores.length > 100) recentScores.shift();
    sim.filterScore = p; sim.filterOk = p >= thr;
    if (sim.filterOk) nPass++; else nSkip++;
    if (!replaying) log(`FILTER ${sim.m.id.slice(0, 10)} skor ${p.toFixed(3)} ${sim.filterOk ? "AMBIL" : "LEWATI"} (ambang ${thr.toFixed(3)})`);
    if (HONEYPOT && sim.filterOk && !replaying) await cekHoneypot(sim, sw, tr);
  } catch (e) {
    // data pengecekan tidak didapat cepat -> jangan beli buta
    sim.filterOk = false; nSkip++; lastErr = "cek gagal: " + e.message.slice(0, 50);
    if (!replaying) log(`CEK GAGAL ${sim.m.id.slice(0, 10)} dilewati (${e.message.slice(0, 40)})`);
  }
}
// CEK HONEYPOT: (1) kalau sudah ada orang yang berhasil JUAL di menit pertama -> aman.
// (2) kalau belum, simulasikan pembeli nyata mengirim token ke PoolManager (jalur jual v4) lewat eth_call di blok terbaru.
//     Revert = token memblokir penjualan -> LEWATI.
async function cekHoneypot(sim, sw, tr) {
  const q1 = sim.m.c1 === "0x0000000000000000000000000000000000000000";
  if (sw.some(x => (q1 ? x.a0 : x.a1) < 0)) { sim.honeypot = false; sim.hpWhy = "sudah ada penjual"; return; }
  const holders = [...new Set(tr.filter(t => t[2] === PM).map(t => t[3]))].reverse().slice(0, 4);
  if (!holders.length) { sim.honeypot = true; sim.hpWhy = "tidak ada pembeli & tidak ada penjual"; log(`HONEYPOT? ${sim.m.id.slice(0, 10)} tidak ada pembeli untuk diuji, dilewati`); return; }
  let rpcGagal = 0;
  for (const h of holders.slice(0, 3)) {
    let bal;
    try { bal = BigInt(await rpcQuick("eth_call", [{ to: sim.token, data: "0x70a08231" + h.slice(2).padStart(64, "0") }, "latest"], 3000)); }
    catch (e) { rpcGagal++; continue; }
    if (bal <= 0n) continue;                                   // pemegang ini sudah tidak punya token
    const amount = (bal / 10n > 0n ? bal / 10n : bal).toString(16).padStart(64, "0");
    const data = "0xa9059cbb" + PM.slice(2).padStart(64, "0") + amount;
    try {
      await rpcQuick("eth_call", [{ from: h, to: sim.token, data }, "latest"], 3000);
      sim.honeypot = false; sim.hpWhy = "simulasi jual lolos"; return;
    } catch (e) {
      const msg = String(e.message || "");
      if (/balance|insufficient/i.test(msg)) continue;          // bukan blokir, coba pemegang lain
      if (!/revert|execution/i.test(msg)) { rpcGagal++; continue; }
      if (/revert|execution/i.test(msg)) {
        sim.honeypot = true; sim.hpWhy = "simulasi jual REVERT";
        log(`HONEYPOT ${sim.m.id.slice(0, 10)} token ${sim.token.slice(0, 10)} dilewati: ${msg.slice(0, 70)}`); return;
      }
    }
  }
  sim.honeypot = true;
  if (rpcGagal) { sim.hpWhy = "RPC gagal saat cek"; nRpcFail++; log(`CEK HONEYPOT GAGAL (RPC) ${sim.m.id.slice(0, 10)}, dilewati demi aman`); }
  else { sim.hpWhy = "tidak bisa dibuktikan bisa dijual"; log(`HONEYPOT? ${sim.m.id.slice(0, 10)} penjualan tidak bisa dibuktikan, dilewati`); }
}
async function getLogsAddr(address, from, to) {
  return await rpc("eth_getLogs", [{ address, topics: [T_TRANSFER], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);
}

// ---------- pemrosesan per blok ----------
async function processBlock(blk, events) {
  const per = new Map();
  for (const e of events) {
    if (e.k === "I") {
      if (!replaying) store(e);
      const m = { id: e.id, c0: e.c0, c1: e.c1, fee: e.fee, hooks: e.hooks, init: blk };
      if (safe(m) && ethUsd) {
        const sim = new PoolSim(m, { ethUsd, model, ...REALISTIC, onTrade, onEvent, gate: USE_FILTER ? gate : undefined });
        sim.token = m.c0 === "0x0000000000000000000000000000000000000000" ? m.c1 : m.c0;
        sims.set(e.id, sim);
      }
      continue;
    }
    if (e.k === "S" && e.id === ETH_POOL) { if (!replaying) store(e); const sp = Number(e.sqrtPX96) / Q96; ethUsd = sp * sp * 1e12; continue; }
    if (!sims.has(e.id)) continue;
    if (!replaying) store(e);
    if (!per.has(e.id)) per.set(e.id, { L: [], S: [] });
    const g = per.get(e.id);
    if (e.k === "M") g.L.push(e.d);
    else g.S.push({ blk, li: e.li, tx: e.tx, a0: Number(e.a0), a1: Number(e.a1), sqrtP: Number(e.sqrtPX96) / Q96, L: Number(e.L), fee: e.fee });
  }
  if (USE_FILTER) {
    const perlu = [...sims.values()].filter(s => s.filterOk === undefined && !s.cekJalan && s.ei < 0 && !s.skip && blk >= s.m.init + 600);
    for (const s_ of perlu) {
      const d = decided.get(s_.m.id);
      if (d) { s_.filterOk = d.filterOk; s_.filterScore = d.score; s_.honeypot = d.honeypot ?? undefined; s_.hpWhy = d.hpWhy; s_.cekJalan = true; continue; }
      if (replaying) continue;                                          // tidak ada keputusan tersimpan -> jangan panggil RPC saat putar ulang
      if (!s_.cekJalan) { s_.cekJalan = true; siapkanFilter(s_, blk).then(() => saveDecision(s_)).catch(() => {}); }   // latar belakang
    }
  }
  for (const sim of sims.values()) for (let d = sim.nextDeadline(), g = 0; d < blk && g < 50; d = sim.nextDeadline(), g++) sim.tick(d);   // pesanan jual terisi walau tidak ada swap
  for (const [id, g] of per) sims.get(id).processBlock(blk, g.L, g.S);
  for (const [id, sim] of sims) if (blk >= sim.m.init + sim.hz || sim.allDone()) { sim.finalize(); sims.delete(id); }
}
async function processEvents(events) {
  let i = 0;
  while (i < events.length) { const blk = events[i].blk, grp = []; while (i < events.length && events[i].blk === blk) grp.push(events[i++]); await processBlock(blk, grp); }
}

(async () => {
  const statePath = path.join(HERE, "state.json");
  let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;
  tip = parseInt(await rpc("eth_blockNumber", []), 16);
  if (!state) {
    const start = process.argv[2] ? +process.argv[2] : tip;
    // harga ETH awal: swap terakhir pool ETH/USDG sebelum blok mulai
    let back = 2000, seed = [];
    while (!seed.length && back <= 512000) { seed = await getLogs(start - back, start - 1, [T_SWAP, ETH_POOL]); back *= 4; }
    if (!seed.length) throw new Error("harga ETH awal tidak ketemu");
    store(decode(seed[seed.length - 1]));
    state = { start, last: start - 1 };
    fs.writeFileSync(statePath, JSON.stringify(state));
    log(`MULAI paper trading dari blok ${start} (tip ${tip}). Mode kertas: tidak ada transaksi.`);
  }
  // putar ulang event yang tersimpan (hasil identik, deterministik)
  replaying = true;
  const ev = parseStore(state.last);
  await processEvents(ev);
  replaying = false;
  // pertahankan tanda "realtime" dari sesi sebelumnya
  const rt = new Map();
  if (fs.existsSync(TRADES)) for (const l of fs.readFileSync(TRADES, "utf8").split("\n")) if (l.trim()) { const t = JSON.parse(l); rt.set(`${t.plan}|${t.pool}|${t.exitBlk}`, t.realtime); }
  for (const t of closed) t.realtime = rt.get(`${t.plan}|${t.pool}|${t.exitBlk}`) ?? false;
  fs.writeFileSync(TRADES, closed.map(t => JSON.stringify(t)).join("\n") + (closed.length ? "\n" : ""));
  lastBlk = state.last;
  log(`putar ulang ${ev.length} event tersimpan -> ${closed.length} trade tertutup, ${sims.size} pool dipantau. Lanjut dari blok ${lastBlk + 1}.`);
  writeStatus();

  let lastStatus = 0;
  while (true) {
    try {
      tip = parseInt(await rpc("eth_blockNumber", []), 16);
      while (lastBlk < tip) {
        const to = Math.min(tip, lastBlk + CHUNK);
        const logs = await getLogs(lastBlk + 1, to, [[T_INIT, T_SWAP, T_MOD]]);
        const events = logs.map(decode).filter(Boolean).sort((a, b) => a.blk - b.blk || a.li - b.li);
        await processEvents(events);
        lastBlk = to;
        fs.writeFileSync(statePath, JSON.stringify({ ...state, last: lastBlk }));
        if (Date.now() - lastStatus > 5000) { writeStatus(); lastStatus = Date.now(); }
      }
      lastErr = ""; lastOkPoll = Date.now();
    } catch (e) { lastErr = e.message.slice(0, 120); log("error: " + lastErr); await sleep(5000); }
    if (Date.now() - lastStatus > 5000) { writeStatus(); lastStatus = Date.now(); }
    await sleep(POLL_MS);
  }
})().catch(e => { log("FATAL: " + e.message); process.exit(1); });
