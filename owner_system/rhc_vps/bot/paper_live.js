// PAPER TRADING LIVE v2/v3/v4 — MODE KERTAS. TIDAK ADA TRANSAKSI, TIDAK ADA KUNCI DOMPET.
// Pakai mesin yang sama dengan backtest (v4engine.js, lulus uji kesamaan 638/638 trade).
// Semua event disimpan ke disk (format sama dengan collect.js). Kalau proses mati, saat hidup lagi
// event diputar ulang lalu lanjut dari blok terakhir, jadi tidak ada celah data.
// Pakai: node paper_live.js [startBlock]
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
// Tulis file penting lewat file sementara + rename: kalau proses mati / disk penuh saat menulis,
// file lama tetap utuh. Tanpa ini, state.json bisa jadi 0 byte dan bot tidak bisa start selamanya.
function tulisAman(p, isi) {
  const t = p + ".tmp";
  fs.writeFileSync(t, isi);
  fs.renameSync(t, p);
}
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
// 2026-09-19 AUDIT: failBuy/failSell sebelumnya TIDAK ADA di sini, artinya bot berjalan dengan asumsi
// 100% transaksi berhasil sekali kirim. Angka di bawah dari pengukuran router nyata (beli 1,85%, jual 0,54%).
// 2026-09-21 AUDIT07: aturan keluar baru, lolos uji maju berpasangan (daftar beli dikunci, bootstrap 95%):
// rugExit + trailing 40% dari puncak + ambang dump 12% LP = +0,0111 ret/trade di periode pilih dan
// +0,0117 di periode bukti, keduanya signifikan. Trailing 15%/20%, jual bertahap, dan melonggarkan
// model bahaya semuanya MERUGI signifikan — jangan dihidupkan tanpa uji maju baru.
const REALISTIC = { latb: 30, entryLat: 30, keepNoAfter: true, strictSnap: true, lpAdjust: true, fillOnTime: true,
  gasUsd: +(process.env.GAS_USD || 0.06), approveUsd: 0.03, worstOrder: true,
  failBuy: +(process.env.FAIL_BUY || 0.0185), failSell: +(process.env.FAIL_SELL || 0.0054),
  rugExit: process.env.TUTUP_SAAT_RUG === "1",
  trail: +(process.env.TRAIL_PUNCAK || 0),
  dumpFrac: +(process.env.DUMP_FRAC || 0.05) };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = s => { const l = `[${new Date().toISOString().slice(0, 19)}] ${s}`; console.log(l); fs.appendFileSync(path.join(HERE, "live.log"), l + "\n"); };

fs.mkdirSync(STORE, { recursive: true });
const model = loadModel(path.join(HERE, "danger_model.json"));
// MODEL KEDUA (2026-09-19): p_naik = peluang harga masih naik >=1,5x dalam 30 menit (AUC 0,758).
// Dipakai sebagai PENAHAN: sinyal bahaya diabaikan kalau model ini masih melihat kenaikan.
const UP_FILE = path.join(HERE, "pnaik_model.json");
const modelUp = fs.existsSync(UP_FILE) ? loadModel(UP_FILE) : null;
// verifikasi kedua model sebelum trading
for (const [nm, mm, ckf] of [["p_bahaya", model, "danger_check.json"], ["p_naik", modelUp, "pnaik_check.json"]]) {
  if (!mm || !fs.existsSync(path.join(HERE, ckf))) continue;
  const ck = JSON.parse(fs.readFileSync(path.join(HERE, ckf), "utf8"));
  let mx = 0; ck.X.forEach((x, i) => { mx = Math.max(mx, Math.abs(mm.predict(x) - ck.p[i])); });
  if (mx > 1e-9) { console.error(`FATAL: model ${nm} JS != Python (${mx.toExponential(2)})`); process.exit(1); }
  console.error(`model ${nm}: parity ${mx.toExponential(2)} OK`);
}
// FILTER BELI (ML): aktif kalau FILTER=1. Skor < ambang -> koin dilewati.
const USE_FILTER = process.env.FILTER === "1";
// Filter beli: CatBoost (utama). Kalau file CatBoost tidak ada, jatuh ke HistGB lama.
const { loadCat } = require("./cat_model");
// Muat ulang model filter dari disk. Parity JS vs Python WAJIB lolos, kalau tidak model lama dipakai terus.
function muatUlangFilter() {
  try {
    const m = loadCat(CAT_FILE);
    const ck = JSON.parse(fs.readFileSync(path.join(HERE, "filter_cat_check.json"), "utf8"));
    let mx = 0; ck.X.forEach((x, i) => { mx = Math.max(mx, Math.abs(m.predict(x) - ck.p[i])); });
    if (mx > 1e-9) { log(`MODEL BARU DITOLAK: parity ${mx.toExponential(2)}. Model lama tetap dipakai.`); return false; }
    const meta = JSON.parse(fs.readFileSync(CAT_FILE, "utf8"));
    filterModel = m;
    log(`MODEL FILTER DIPERBARUI: ${m.n} pohon, dilatih dari ${meta.n_latih || "?"} trade, parity ${mx.toExponential(2)} OK`);
    return true;
  } catch (e) { log("gagal muat model baru: " + e.message.slice(0, 60)); return false; }
}
const CAT_FILE = path.join(HERE, "filter_cat.json");
const USE_CAT = USE_FILTER && fs.existsSync(CAT_FILE);
let filterModel = !USE_FILTER ? null : (USE_CAT ? loadCat(CAT_FILE) : loadModel(path.join(HERE, "filter_model.json")));
const FILTER_THR = !USE_FILTER ? 0 : (USE_CAT ? JSON.parse(fs.readFileSync(CAT_FILE, "utf8")).thr_start ?? 0.195
  : JSON.parse(fs.readFileSync(path.join(HERE, "filter_model.json"), "utf8")).threshold);
// verifikasi predictor JS == Python sebelum jalan (wajib, jangan trading dgn model beda)
if (USE_CAT) {
  const ck = JSON.parse(fs.readFileSync(path.join(HERE, "filter_cat_check.json"), "utf8"));
  let mx = 0; ck.X.forEach((x, i) => { mx = Math.max(mx, Math.abs(filterModel.predict(x) - ck.p[i])); });
  if (mx > 1e-9) { console.error("FATAL: CatBoost JS != Python (" + mx.toExponential(2) + ")"); process.exit(1); }
  console.error(`filter: CatBoost ${filterModel.n} pohon, cek JS vs Python selisih ${mx.toExponential(2)} OK`);
}
const ZERO32 = "0x" + "0".repeat(64);
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NATIVE0 = "0x0000000000000000000000000000000000000000";
let nSkip = 0, nPass = 0;
// AKUN VIRTUAL (siap VPS): modal, 1/4 Kelly, batas posisi. Nilai dari uji 2026-09-18 (FORWARD_TEST_RULES.md).
// Modal awal. LANJUT_JURNAL=1 -> bot meneruskan ekuitas dari buku jurnalnya sendiri (hasil/jurnal_bot/,
// dibuat oleh pipeline/jurnal.js) sehingga akun tidak mulai ulang dari $100 tiap kali. Default mati, karena
// buku sekarang masih berisi hasil SIMULASI; nyalakan setelah jurnal berisi hasil kertas/uang yang berjalan.
const START_USD = (() => {
  const dasar = +(process.env.START_USD || 100);
  if (process.env.LANJUT_JURNAL !== "1") return dasar;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(HERE, "..", "hasil", "jurnal_bot", "ekuitas_terakhir.json"), "utf8"));
    if (Number.isFinite(j.ekuitas_sekarang) && j.ekuitas_sekarang > 0) {
      console.error(`modal awal dari jurnal: $${j.ekuitas_sekarang} (${j.trade} trade tercatat)`);
      return j.ekuitas_sekarang;
    }
  } catch (e) { console.error("jurnal tidak terbaca, pakai START_USD: " + e.message.slice(0, 50)); }
  return dasar;
})();
const KELLY_HIST = 0.094;          // 1/4 Kelly dari 1.754 trade historis; dipakai sampai ada 100 trade live
const MAX_POS = +(process.env.MAX_POS || 20);
const EXP_MAX = +(process.env.EXP_MAX || 0.5);
// Batas pegang 9 JAM. Mesin default 6 jam (216000 blok) padahal SELURUH backtest/arena memakai 9 jam
// (324000). Audit 19 Sep: live menjual paksa 3 jam lebih awal dari yang diuji.
const HZ_LIVE = +(process.env.HZ_LIVE || 324000);
// Batas posisi 1% likuiditas pool. Uji maju final ($100 -> $12.746) memakai batas ini. Tanpa batas, posisi
// sempat mencapai 22,9% isi pool di uji — di ukuran itu pembelian kita sendiri menggerakkan harga dan angka
// keuntungan simulasi tidak bisa dipercaya. Ini batas fisik pasar, bukan aturan strategi.
const LP_CAP = +(process.env.LP_CAP || 0.01);   // batas equity yang boleh terpakai serentak
const HONEYPOT = process.env.HONEYPOT !== "0";
const FRESH_BLOCKS = +(process.env.FRESH_BLOCKS || 300);    // data dianggap basi kalau tertinggal > 30 dtk
const acct = { cash: START_USD, locked: 0, peak: START_USD, dd: 0, open: new Map(), closed: 0, wins: 0, liveRets: [] };
const recentScores = [];
// AUDIT07-D: jangan beli selama model masih "pemanasan" (<30 skor -> ambang jatuh ke thr_start in-sample
// 0,195 yang dipilih di data latihnya sendiri). Di uji maju 15 dari 18 trade awal rugi 20,5% per trade;
// mematikannya menurunkan drawdown penuh 20,6% -> 10,7%.
const LARANG_PEMANASAN = process.env.LARANG_PEMANASAN === "1";
// AUDIT07-I: rem harian. Berhenti beli kalau equity harga pasar turun lebih dari sekian dari equity awal
// hari WIB. Di data uji 0 trade tertolak (asuransi, bukan sumber untung).
const REM_HARIAN = +(process.env.REM_HARIAN || 0);
let hariWIBNow = null, eqAwalHari = null, nPemanasan = 0, nRemHarian = 0;
// KEPUTUSAN CEK DISIMPAN: supaya saat restart/putar ulang hasilnya sama persis dan tidak memanggil RPC lagi
const DECISIONS = path.join(HERE, "decisions.jsonl");
// STRATEGI B: reputasi dev. dev = pemegang token terbesar di menit-1. Hanya beli kalau dev belum pernah bikin koin yang rug (ret < 0,3).
const DEVFILE = path.join(HERE, "dev_history.json");
const FEATS_LIVE = path.join(HERE, "feats_live.jsonl");
// Potret kondisi selama posisi terbuka -> bahan latih ulang model KELUAR (p_bahaya & p_naik).
// Model keluar yang tidak pernah diperbarui terbukti membusuk: yang lama jatuh ke AUC 0,595 (setara lempar koin).
const SNAPS_LIVE = path.join(HERE, "snaps_live.jsonl");
let nSnapTulis = 0;
function catatPotret(s_) {
  if (replaying || nSnapTulis > 2e6) return;      // jangan tulis saat putar ulang, dan batasi ukuran file
  try { fs.appendFileSync(SNAPS_LIVE, JSON.stringify({ p: s_.pool, b: s_.blk, v: +s_.v.toFixed(5), pd: +s_.pd.toFixed(5), pu: s_.pu === null ? null : +s_.pu.toFixed(5), f: s_.f.map(x => (Number.isFinite(x) ? +x.toFixed(6) : null)) }) + String.fromCharCode(10)); nSnapTulis++; } catch (e) {}
}
// Model harus terus belajar: koin baru lahir dengan pola baru, model beku makin lama makin salah menilai.
// Arena: model beku $398 vs model belajar-ulang $2.661, dan yang beku melewatkan 44 koin bagus.
const RETRAIN_TIAP = +(process.env.RETRAIN_TIAP || 100);   // latih ulang tiap sekian trade TUTUP
let retrainPada = 0, retrainJalan = false;
const DEV_RULE = process.env.DEV_RULE !== "0";
const devHist = (() => { try { return fs.existsSync(DEVFILE) ? JSON.parse(fs.readFileSync(DEVFILE, "utf8")) : {}; } catch (e) { console.error("dev_history.json rusak, dianggap kosong: " + e.message.slice(0, 60)); return {}; } })();
const devOf = {};                       // pool -> alamat dev
// 2026-09-18 (perintah pemilik): DAFTAR-HITAM, bukan daftar-putih. Uji 27 jam koin baru:
//   daftar-putih (dev harus dikenal) -> 0 trade;  daftar-hitam -> 131 trade, PF 1,75, DD 36%.
//   Alasan: dev baru netral (rug 3,8%), yang berbahaya hanya dev yang sudah terbukti rug (35,4% ulang).
function devBoleh(dev) {
  if (!DEV_RULE) return true;
  const h = devHist[dev];
  if (!h || !h.length) return true;                        // dev belum dikenal -> netral, boleh
  return !h.some(r => r < 0.3);                            // tolak hanya kalau pernah bikin koin rug
}
function catatDev(pool, ret) {
  const d = devOf[pool]; if (!d) return;
  (devHist[d] = devHist[d] || []).push(ret);
  fs.writeFileSync(DEVFILE, JSON.stringify(devHist));
}
const decided = new Map();
if (fs.existsSync(DECISIONS)) for (const l of fs.readFileSync(DECISIONS, "utf8").split(String.fromCharCode(10))) if (l.trim()) { try { const d = JSON.parse(l); decided.set(d.pool, d); } catch (e) {} }
function saveDecision(sim) {
  if (sim.cekGagal) return;      // jangan simpan keputusan yang lahir dari kegagalan RPC
  const d = { pool: sim.m.id, filterOk: sim.filterOk, score: sim.filterScore ?? null, honeypot: sim.honeypot ?? null, hpWhy: sim.hpWhy ?? null, dev: sim.dev ?? null, t: new Date().toISOString() };
  decided.set(d.pool, d); fs.appendFileSync(DECISIONS, JSON.stringify(d) + String.fromCharCode(10));
}
let nEksposur = 0, nHoneypot = 0, nStale = 0, nFull = 0, lastOkPoll = Date.now(), nRpcFail = 0, nKill = 0, nDev = 0, nRpcMati = 0;
// MODE AMAN: kalau RPC tidak memberi data sehat selama RPC_DEAD_MS, bot BERHENTI membeli.
// Data basi = harga basi = order buta. Untuk uang asli ini wajib: lebih baik kehilangan peluang
// daripada mengirim order berdasarkan keadaan chain yang sudah tidak berlaku.
// Setelah RPC pulih, bot menunggu RPC_WARM_MS polling sehat dulu sebelum boleh membeli lagi.
const RPC_DEAD_MS = +(process.env.RPC_DEAD_MS || 60000);
const RPC_WARM_MS = +(process.env.RPC_WARM_MS || 30000);
let rpcMatiSejak = 0, rpcPulihSejak = 0, modeAman = false;
function cekRpcSehat() {
  const sekarang = Date.now();
  const lama = sekarang - lastOkPoll;
  if (lama > RPC_DEAD_MS) {
    if (!modeAman) { modeAman = true; rpcMatiSejak = sekarang; rpcPulihSejak = 0;
      log(`MODE AMAN AKTIF: RPC tidak sehat ${(lama/1000).toFixed(0)} dtk. BERHENTI MEMBELI. Posisi terbuka tetap dipantau.`); }
    return false;
  }
  if (modeAman) {
    if (!rpcPulihSejak) { rpcPulihSejak = sekarang; log(`RPC pulih. Menunggu ${(RPC_WARM_MS/1000).toFixed(0)} dtk data sehat sebelum boleh membeli lagi.`); return false; }
    if (sekarang - rpcPulihSejak < RPC_WARM_MS) return false;
    modeAman = false; rpcPulihSejak = 0;
    log(`MODE AMAN SELESAI: RPC sehat kembali (mati ${((sekarang - rpcMatiSejak)/1000).toFixed(0)} dtk). Boleh membeli lagi.`);
  }
  return true;
}
// 1/4 Kelly. Disamakan dengan arena & Monte Carlo (audit 19 Sep):
//  - tahap pemanasan 2% untuk 30 trade pertama (live dulu langsung 9,4% = 4,7x lebih besar dari yang diuji)
//  - f yang membuat akun habis DITOLAK, bukan diklamp (klamp membuat optimizer boleh memilih daerah bangkrut)
//  - batas atas 0,10: 0,25 di satu memecoin berarti 2 koin memegang seluruh pagar eksposur 50%
//  - jendela 500 trade terakhir: rezim pasar berubah, dan menghindari O(n) yang makin berat
const KELLY_MAKS = +(process.env.KELLY_MAKS || 0.10);
const kellyNow = () => {
  const all = acct.liveRets;
  if (all.length < 30) return 0.02;
  if (all.length < 100) return KELLY_HIST;
  const r = all.length > 500 ? all.slice(-500) : all;
  let best = 0.01, bestG = -1e18;
  for (let i = 1; i < 200; i++) {
    const f = i / 200;
    let g = 0, ok = true;
    for (const x of r) { const v = 1 + f * (x - 1); if (v <= 0) { ok = false; break; } g += Math.log(v); }
    if (ok && g > bestG) { bestG = g; best = f; }
  }
  return Math.max(0.01, Math.min(KELLY_MAKS, best / 4));
};
// 2026-09-19: ambang dinaikkan dari "buang 30% terburuk" jadi "ambil 10% TERBAIK".
// Arena 2.125 peluang: ambil-70% -> $406 (DD 34%, rugi di pasar jelek); ambil-10% -> $2.164 (DD 17%, untung di
// pasar jelek). Slot jadi hampir selalu kosong sehingga koin terbaik tidak pernah terlewat karena slot penuh.
const QTHR = +(process.env.QTHR || 0.90);
const thrNow = () => {
  if (recentScores.length < 30) return FILTER_THR;
  const s = [...recentScores].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(QTHR * s.length))];
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
// Coba lagi (endpoint berikutnya + waktu lebih panjang) sebelum menyerah. Tanpa ini, RPC rumah yang
// lambat membuat koin bagus dilewati dengan alasan "CEK GAGAL".
async function rpcQuick(method, params, ms = 4000) {
  let last;
  for (let a = 0; a < 3; a++) {
    try { return await rpcOnce(method, params, ms); }
    catch (e) { last = e; rpcIdx++; }
  }
  throw last;
}
function rpcOnce(method, params, ms = 4000) {
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
// Dibaca BARIS DEMI BARIS. File store tumbuh ±26 MB/hari; membacanya sekaligus menabrak batas panjang
// string Node (±537 juta karakter) setelah ±21 hari dan bot mati permanen. Baris rusak dilewati, tidak
// mematikan bot (satu baris terpotong karena listrik mati pernah membuat bot gagal start selamanya).
async function parseStore(maxBlk) {
  const ev = [];
  for (const f of Object.keys(HEAD)) {
    const p = path.join(STORE, f); if (!fs.existsSync(p)) continue;
    const tmp = p + ".tmp";
    let dropped = 0, rusak = 0, baris = 0;
    const out = fs.openSync(tmp, "w");
    fs.writeSync(out, HEAD[f] + "\n");
    const rl = readline.createInterface({ input: fs.createReadStream(p, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const raw of rl) {
      const l = raw.trim(); if (!l) continue;
      if (baris++ === 0 && l === HEAD[f]) continue;
      let e = null;
      try {
        const q = l.split(",");
        e = f === "pools.csv" ? { k: "I", id: q[0], c0: q[1], c1: q[2], fee: +q[3], ts: +q[4], hooks: q[5], blk: +q[6], li: +(q[7] ?? -1) }
          : f === "swaps.csv" ? { k: "S", id: q[0], blk: +q[1], li: +q[2], tx: q[3], a0: BigInt(q[4]), a1: BigInt(q[5]), sqrtPX96: BigInt(q[6]), L: BigInt(q[7]), tick: +q[8], fee: +q[9] }
          : { k: "M", id: q[0], blk: +q[1], li: +q[2], tlo: +q[3], thi: +q[4], d: BigInt(q[5]) };
        if (!e.id || !Number.isFinite(e.blk) || !Number.isFinite(e.li)) e = null;
      } catch (err) { e = null; }
      if (!e) { rusak++; continue; }
      if (e.blk > maxBlk) { dropped++; continue; }
      ev.push(e); fs.writeSync(out, l + "\n");
    }
    rl.close(); fs.closeSync(out);
    if (dropped || rusak) { fs.renameSync(tmp, p); log(`${f}: ${dropped} event sisa potongan tak selesai dibuang (akan diambil ulang)${rusak ? `, ${rusak} baris rusak dilewati` : ""}`); }
    else { try { fs.unlinkSync(tmp); } catch (e) {} }
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
    if (!replaying) catatDev(t.pool, t.ret);
    const o = acct.open.get(t.pool);
    if (o) {
      acct.open.delete(t.pool); acct.locked -= o.pos;
      const g = t.gasTot ?? 0.2;
      const back = Math.max(0, o.pos * (t.ret + g / t.size) - g);
      acct.cash += back; acct.closed++; if (back > o.pos) acct.wins++;
      t.akun_posisi = o.pos; t.akun_kembali = back;
      acct.liveRets.push(back / o.pos);          // hanya trade yang benar-benar dibeli akun
      const eq = acct.cash + acct.locked; acct.peak = Math.max(acct.peak, eq); acct.dd = Math.max(acct.dd, 1 - eq / acct.peak);
      if (!replaying) cobaLatihUlang();
    }
  }
  if (!replaying) {
    fs.appendFileSync(TRADES, JSON.stringify(t) + "\n");
    if (t.plan === "v4") {
      const pa = t.akun_posisi, pnlA = pa !== undefined ? (t.akun_kembali - pa) : null;
      log(`TUTUP v4 ${t.pool.slice(0, 10)} ${t.ret >= 1 ? "+" : ""}${(100 * (t.ret - 1)).toFixed(0)}% | akun ${pnlA === null ? "tidak punya posisi" : `$${pa.toFixed(2)} -> $${t.akun_kembali.toFixed(2)} (${pnlA >= 0 ? "+" : ""}$${pnlA.toFixed(2)})`} | hold ${t.hold.toFixed(0)}m | ${t.reason}`);
    }
  }
}
// ukuran posisi akun: 1/4 Kelly x equity, hanya dibatasi kas (tanpa cap likuiditas / batas nominal)
function ukuranAkun() {
  const g = (0.06 * 3 + 0.03) * (acct.open.size + 1);     // cadangan gas untuk semua posisi terbuka
  // Ekuitas HARGA PASAR: memakai harga beli membuat bot membesarkan taruhan justru saat portofolio tenggelam.
  const E = Math.max(0, ekuitasSekarang().equity);
  return Math.max(0, Math.min(kellyNow() * E * remDrawdown(), acct.cash - g));
}
// Latih ulang model dari SELURUH trade yang sudah tutup (riwayat + live). Jalan di latar, bot tetap trading
// dengan model lama sampai model baru lolos verifikasi.
function cobaLatihUlang() {
  if (retrainJalan || acct.closed - retrainPada < RETRAIN_TIAP) return;
  retrainJalan = true; retrainPada = acct.closed;
  log(`LATIH ULANG MODEL dimulai (${acct.closed} trade tutup)...`);
  // jalur relatif struktur paket: bot/ + pipeline/ + data/. Linux umumnya pakai "python3".
  const PY = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const py = spawn(PY, [path.join(HERE, "..", "pipeline", "retrain_filter.py")], { cwd: path.join(HERE, "..", "pipeline"), env: { ...process.env, BOT_DIR: HERE } });
  let err = "";
  py.stderr.on("data", d => err += d);
  py.on("error", e => { retrainJalan = false; log("python tidak bisa dijalankan: " + e.message); });
  py.on("close", code => {
    retrainJalan = false;
    if (code === 0) muatUlangFilter();
    else log(`latih ulang gagal (kode ${code}) ${err.slice(0, 80)}. Model lama tetap dipakai.`);
  });
}
function onEvent(e) {
  if (e.type === "entry" && e.plan !== "v3" ) {
    const sim = sims.get(e.pool); const g = 0.06 * 3 + 0.03;
    const E = acct.cash + acct.locked;
    const pos = Math.min(e.size, acct.cash - g);        // e.size sudah = 1/4 Kelly x equity (sizeFn)
    if (pos >= 1 && acct.open.size < MAX_POS) { acct.cash -= pos; acct.locked += pos; acct.open.set(e.pool, { pos, size: e.size }); e.akunPos = pos; }
    else e.akunPos = 0;                                    // tidak jadi masuk (kas/slot tidak cukup)
  }
  if (replaying) return;
  e.ts = new Date().toISOString(); e.lag = tip - e.blk;
  fs.appendFileSync(EVENTS, JSON.stringify(e) + "\n");
  // tampilkan uang AKUN yang benar-benar dipakai (Kelly x equity, dibatasi 1% likuiditas), bukan nominal mesin
  if (e.type === "entry") log(e.akunPos ? `MASUK ${e.pool.slice(0, 10)} posisi akun $${e.akunPos.toFixed(2)} (kas $${acct.cash.toFixed(2)}) LP $${e.lp.toFixed(0)} (kertas)`
    : `LEWAT ${e.pool.slice(0, 10)} tidak jadi masuk (kas/slot tidak cukup)`);
}
// KILL SWITCH: berhenti buka posisi baru kalau equity turun terlalu dalam dari puncak (default 35%).
// REM BERTAHAP (2026-09-19) menggantikan kill switch permanen.
// Uji Monte Carlo 10.000 jalur: kill permanen -> median $12.809, DD 43%, 74% jalur bot MATI selamanya.
// Rem bertahap (ukuran dikecilkan saat drawdown dalam, tanpa stop total) -> median $19.401, DD 36,6%.
// "Tunggu pulih" terbukti JEBAKAN: kalau bot berhenti beli, equity tidak bisa naik, jadi tidak pernah pulih.
// STOP DARURAT tetap ada di batas yang jauh lebih dalam, sebagai jaring terakhir.
const KILL_DD = +(process.env.KILL_DD || 0.60);      // stop darurat (dulu 0,35)
const REM_AKTIF = process.env.REM !== "0";
function remDrawdown() {
  if (!REM_AKTIF) return 1;
  const mtm = ekuitasSekarang();
  acct.peakMtm = Math.max(acct.peakMtm || START_USD, mtm.equity);
  const dd = 1 - mtm.equity / acct.peakMtm;              // satu definisi drawdown: harga pasar vs puncak harga pasar
  return dd > 0.30 ? 0.25 : dd > 0.20 ? 0.5 : dd > 0.10 ? 0.75 : 1;
}
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
const AKUN_FILE = path.join(HERE, "account.json");
// Stop darurat, puncak, dan 100 skor terakhir HILANG setiap restart kalau tidak disimpan.
// Akibatnya bot yang sudah kena stop langsung membeli lagi, dan ambang saringan jatuh ke nilai awal.
function simpanAkun() {
  try { fs.writeFileSync(AKUN_FILE + ".tmp", JSON.stringify({ killed, peakMtm: acct.peakMtm, peak: acct.peak, dd: acct.dd, recentScores, liveRets: acct.liveRets.slice(-500), t: Date.now() })); fs.renameSync(AKUN_FILE + ".tmp", AKUN_FILE); } catch (e) {}
}
function muatAkun() {
  try {
    if (!fs.existsSync(AKUN_FILE)) return;
    const a = JSON.parse(fs.readFileSync(AKUN_FILE, "utf8"));
    killed = !!a.killed; acct.peakMtm = a.peakMtm || START_USD; acct.peak = a.peak || START_USD; acct.dd = a.dd || 0;
    if (Array.isArray(a.recentScores)) { recentScores.length = 0; recentScores.push(...a.recentScores.slice(-100)); }
    if (Array.isArray(a.liveRets)) { acct.liveRets.length = 0; acct.liveRets.push(...a.liveRets); }
    log(`keadaan akun dimuat: stop darurat ${killed ? "AKTIF" : "mati"}, puncak $${(acct.peakMtm||0).toFixed(2)}, ${recentScores.length} skor, ${acct.liveRets.length} ret`);
  } catch (e) { log("gagal muat account.json: " + e.message.slice(0, 50)); }
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
  tulisAman(path.join(HERE, "status.json"), JSON.stringify({ updated: new Date().toISOString(), mode: "KERTAS (tanpa transaksi)",
    last_block: lastBlk, tip, lag_blocks: tip - lastBlk, rpc_diam_dtk: +((Date.now() - lastOkPoll) / 1000).toFixed(0), eth_usd: ethUsd && +ethUsd.toFixed(2), pools_tracked: sims.size, v4_open: open,
    uptime_min: +((Date.now() - started) / 60000).toFixed(1), last_error: lastErr, filter: USE_FILTER ? { ambil: nPass, lewati: nSkip, ambang: +thrNow().toFixed(3) } : "mati", pengaman: { honeypot_dilewati: nHoneypot, ditolak_reputasi_dev: nDev, cek_rpc_gagal: nRpcFail, mode_aman: modeAman ? `AKTIF (RPC mati ${((Date.now()-rpcMatiSejak)/1000).toFixed(0)} dtk, berhenti beli)` : "mati", dilewati_rpc_mati: nRpcMati, data_basi: nStale, slot_penuh: nFull, eksposur_penuh: nEksposur, batas_eksposur: (100*EXP_MAX).toFixed(0)+"%", maks_posisi: MAX_POS, kill_switch: killed ? "AKTIF (berhenti beli)" : `mati (batas ${(100*KILL_DD).toFixed(0)}%)`, dilewati_kill: nKill, dilewati_pemanasan: nPemanasan, dilewati_rem_harian: nRemHarian, keluar_baru: { tutup_saat_rug: REALISTIC.rugExit, trailing_puncak: REALISTIC.trail, ambang_dump: REALISTIC.dumpFrac } }, akun: { modal_awal: START_USD, equity_harga_beli: +(acct.cash + acct.locked).toFixed(2), equity_harga_pasar: +mtm.equity.toFixed(2), nilai_posisi_sekarang: +mtm.nilaiPosisi.toFixed(2), drawdown_pasar: +(100 * ddMtm).toFixed(1), kas: +acct.cash.toFixed(2), terpakai: +acct.locked.toFixed(2), posisi_terbuka: acct.open.size, trade_selesai: acct.closed, win_rate: acct.closed ? +(100 * acct.wins / acct.closed).toFixed(1) : null, drawdown_maks: +(100 * acct.dd).toFixed(1), kelly: +kellyNow().toFixed(4) }, results: st }, null, 1));
}

// ---------- filter beli (ML) ----------
function gate(sim) {
  // DATA SEGAR: di live nyata tidak mungkin beli tepat menit-1 kalau bot tertinggal > 30 dtk dari chain, atau RPC gagal > 15 dtk
  if (!replaying && (tip - (sim.m.init + 630) > FRESH_BLOCKS || Date.now() - lastOkPoll > 15000)) { nStale++; sim.skipWhy2 = "data basi"; return false; }
  if (HONEYPOT && sim.honeypot === true) { nHoneypot++; return false; }
  if (acct.open.size >= MAX_POS) { nFull++; return false; }
  // PAGAR EKSPOSUR (2026-09-19): jangan pertaruhkan lebih dari EXP_MAX bagian equity serentak.
  // 1/4 Kelly menghitung SATU taruhan dengan seluruh modal; 10 posisi x 9,4% = 94% equity -> bahaya.
  // Uji arena: batas 50% memberi hasil IDENTIK ($7.913, DD 12,8%) karena eksposur alaminya cuma 43%.
  {
    const E = acct.cash + acct.locked;
    if (E > 0 && acct.locked >= EXP_MAX * E) { nEksposur++; return false; }
  }
  if (killed) { nKill++; return false; }
  if (LARANG_PEMANASAN && USE_FILTER && recentScores.length < 30) { nPemanasan++; return false; }
  if (REM_HARIAN > 0) {
    const eqPasar = ekuitasSekarang().equity;
    const hari = Math.floor((Date.now() / 1000 + 7 * 3600) / 86400);       // hari kalender WIB
    if (hariWIBNow === null || hari !== hariWIBNow) { hariWIBNow = hari; eqAwalHari = eqPasar; }
    if (eqAwalHari > 0 && eqPasar < eqAwalHari * (1 - REM_HARIAN)) { nRemHarian++; return false; }
  }
  if (replaying) return sim.filterOk === undefined ? false : sim.filterOk;   // tanpa keputusan tersimpan = jangan beli   // putar ulang: tanpa cek jaringan
  if (!cekRpcSehat()) { nRpcMati++; return false; }        // RPC tidak sehat -> jangan beli apa pun
  const telat = tip - (sim.m.init + 630);
  const siap = (!USE_FILTER || sim.filterOk !== undefined) && (!HONEYPOT || sim.filterOk === false || sim.honeypot !== undefined);
  if (!siap) {
    if (telat > 100) { nStale++; if (!sim.loggedWait) { sim.loggedWait = true; log(`TUNGGU CEK ${sim.m.id.slice(0, 10)} > 10 dtk, dilewati`); } return false; }
    return null;                                            // tunggu hasil cek, jangan beli buta
  }
  if (DEV_RULE && sim.devOk === false) { nDev++; return false; }
  if (!USE_FILTER) return true;          // pagar risiko di atas tetap berlaku; hanya lapisan ML yang dilewati
  return sim.filterOk;
}
async function siapkanFilter(sim, blk) {
  if (!USE_FILTER || sim.filterOk !== undefined || sim.ei >= 0 || sim.skip) return;
  // Saat bot tertinggal jauh dari ujung chain, koin ini PASTI ditolak "data basi" di gerbang.
  // Menyaringnya tetap memakan panggilan RPC dan memperlambat pengejaran (audit 19 Sep: tertinggal
  // 5,4 jam sambil menyaring koin basi dan kena "Too Many Requests"). Lewati tanpa menembak RPC.
  if (tip - (sim.m.init + 630) > FRESH_BLOCKS) { sim.filterOk = false; sim.basi = true; nStale++; return; }
  const init = sim.m.init;
  if (blk < init + 600) return;
  try {
    const logs = await rpcQuick("eth_getLogs", [{ address: sim.token, topics: [T_TRANSFER], fromBlock: "0x" + init.toString(16), toBlock: "0x" + (init + 600).toString(16) }], 3000);
    const tr = logs.map(l => [parseInt(l.blockNumber, 16), parseInt(l.logIndex, 16),
      "0x" + l.topics[1].slice(-40).toLowerCase(), "0x" + l.topics[2].slice(-40).toLowerCase(), BigInt(l.data).toString()]);
    const sw = sim.sw.filter(x => x.blk <= init + 600);
    const f = FEAT.features(sim.m, sw, tr, sim.ethUsd);
    // dev = dompet yang MENGIRIM transaksi mint token (creator EOA).
    // Pemegang terbesar tidak dipakai lagi: 2026-09-18 ketahuan alamat teratas justru kontrak launchpad (155 koin).
    {
      let best = null;
      try {
        const mint = await rpcQuick("eth_getLogs", [{ address: sim.token, topics: [T_TRANSFER, ZERO32],
          fromBlock: "0x" + Math.max(0, init - 36000).toString(16), toBlock: "0x" + (init + 600).toString(16) }], 2500);
        if (mint && mint.length) {
          const tx = await rpcQuick("eth_getTransactionByHash", [mint[0].transactionHash], 2000);
          if (tx && tx.from) best = tx.from.toLowerCase();
        }
      } catch (e) { best = null; }                          // tidak ketemu -> dev tidak dikenal -> netral (boleh)
      if (best) devOf[sim.m.id] = best;
      sim.dev = best; sim.devOk = devBoleh(best);
    }
    // simpan fitur koin ini; nanti dipasangkan dengan hasil trade-nya untuk melatih ulang model
    try { fs.appendFileSync(FEATS_LIVE, JSON.stringify({ pool: sim.m.id, blk: init + 600, f }) + String.fromCharCode(10)); } catch (e) {}
    sim.capUsd = Infinity;                                                  // cap 1% likuiditas dihapus (perintah pemilik 2026-09-18)
    // WAJIB -1, bukan NaN: model dilatih dengan fillna(-1). NaN membuat perbandingan selalu ke cabang kiri
    // sehingga 4,7% koin dirutekan ke daun yang salah tanpa error (audit 19 Sep).
    const x = filterModel.feats.map(k => (Number.isFinite(f[k]) ? f[k] : -1));
    const p = filterModel.predict(x);
    recentScores.push(p); if (recentScores.length > 100) recentScores.shift();
    const thr = thrNow();
    sim.filterScore = p; sim.filterOk = p >= thr;
    if (sim.filterOk) nPass++; else nSkip++;
    if (!replaying) {
      const dh = devHist[sim.dev] || [];
      log(`SARING ${sim.m.id.slice(0, 10)} | skor ${p.toFixed(3)} ${sim.filterOk ? "lolos" : "TOLAK(ml)"} | dev ${sim.dev ? sim.dev.slice(0, 8) : "?"} ${dh.length} koin sebelumnya ${sim.devOk ? (dh.length ? "bersih" : "baru/netral") : "TOLAK(dev pernah rug)"} | ukuran akun $${ukuranAkun().toFixed(2)}`);
    }
    if (HONEYPOT && sim.filterOk && !replaying) await cekHoneypot(sim, sw, tr);
  } catch (e) {
    // data pengecekan tidak didapat cepat -> jangan beli buta
    // Kegagalan RPC sesaat TIDAK boleh jadi vonis permanen: dulu koin ditandai tolak lalu disimpan ke
    // decisions.jsonl selamanya, jadi bot "belajar" menolak koin karena RPC sibuk, bukan karena koinnya buruk.
    sim.cekGagal = true; sim.cekJalan = false; lastErr = "cek gagal: " + e.message.slice(0, 50);
    if (tip - (sim.m.init + 630) > 100) { sim.filterOk = false; nSkip++; }   // anggaran waktu habis -> lewati saja
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
    try { bal = BigInt(await rpcQuick("eth_call", [{ to: sim.token, data: "0x70a08231" + h.slice(2).padStart(64, "0") }, "latest"], 2000)); }
    catch (e) { rpcGagal++; continue; }
    if (bal <= 0n) continue;                                   // pemegang ini sudah tidak punya token
    const amount = (bal / 10n > 0n ? bal / 10n : bal).toString(16).padStart(64, "0");
    const data = "0xa9059cbb" + PM.slice(2).padStart(64, "0") + amount;
    try {
      await rpcQuick("eth_call", [{ from: h, to: sim.token, data }, "latest"], 2000);
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
        const sim = new PoolSim(m, { ethUsd, model, modelUp, onSnap: catatPotret, ...REALISTIC, onTrade, onEvent, gate,   // SELALU dipasang: seluruh pagar risiko ada di dalamnya, tidak boleh bergantung FILTER
          hz: HZ_LIVE, maxUsd: Infinity, lpFrac: Infinity, minUsd: 1,       // batas $200 & cap 1% likuiditas dihapus
          sizeFn: (lp) => Math.min(ukuranAkun(), LP_CAP > 0 && lp > 0 ? LP_CAP * lp : Infinity) });                       // ukuran = 1/4 Kelly x equity, dibatasi kas
        sim.token = m.c0 === "0x0000000000000000000000000000000000000000" ? m.c1 : m.c0;
        sims.set(e.id, sim);
      }
      continue;
    }
    if (e.k === "S" && e.id === ETH_POOL) {
      if (!replaying) store(e);
      const sp = Number(e.sqrtPX96) / Q96, baru = sp * sp * 1e12;
      // Batas kewajaran: satu swap manipulatif di pool ETH/USDG bisa menggeser SELURUH sizing & valuasi.
      if (baru > 500 && baru < 20000 && (!ethUsd || Math.abs(baru / ethUsd - 1) < 0.10)) {
        ethUsd = baru;
        for (const s_ of sims.values()) s_.ethUsd = ethUsd;     // jangan bekukan harga ETH per pool selama 9 jam
      }
      continue;
    }
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
      if (d) { s_.filterOk = d.filterOk; s_.filterScore = d.score; s_.honeypot = d.honeypot ?? undefined; s_.hpWhy = d.hpWhy; s_.dev = d.dev ?? null; if (Number.isFinite(d.score)) { recentScores.push(d.score); if (recentScores.length > 100) recentScores.shift(); } if (d.dev) devOf[s_.m.id] = d.dev; s_.devOk = devBoleh(d.dev); s_.cekJalan = true; continue; }
      if (replaying) continue;                                          // tidak ada keputusan tersimpan -> jangan panggil RPC saat putar ulang
      if (!s_.cekJalan) { s_.cekJalan = true; siapkanFilter(s_, blk).then(() => saveDecision(s_)).catch(() => {}); }   // latar belakang
    }
  }
  for (const sim of sims.values()) for (let d = sim.nextDeadline(), g = 0; d < blk && g < 50; d = sim.nextDeadline(), g++) sim.tick(d);   // pesanan jual terisi walau tidak ada swap
  for (const [id, g] of per) sims.get(id).processBlock(blk, g.L, g.S);
  for (const [id, sim] of sims) if (blk >= sim.m.init + sim.hz || sim.allDone()) { sim.finalize(); sims.delete(id); }
}
let denyutPutarUlang = 0;
async function processEvents(events) {
  let i = 0;
  while (i < events.length) {
    const blk = events[i].blk, grp = []; while (i < events.length && events[i].blk === blk) grp.push(events[i++]); await processBlock(blk, grp);
    // Denyut saat putar ulang: tanpa ini status.json diam selama putar ulang (tumbuh ±18 dtk per hari data)
    // dan penjaga membunuh bot sebelum sempat selesai start — lingkaran mati.
    if (replaying && Date.now() - denyutPutarUlang > 5000) {
      denyutPutarUlang = Date.now();
      try { tulisAman(path.join(HERE, "status.json"), JSON.stringify({ updated: new Date().toISOString(), mode: "KERTAS (tanpa transaksi)", fase: "putar_ulang", putar_ulang_blok: blk, putar_ulang_sisa_event: events.length - i, lag_blocks: 0, uptime_min: +((Date.now() - started) / 60000).toFixed(1) }, null, 1)); } catch (e) {}
    }
  }
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
    tulisAman(statePath, JSON.stringify(state));
    log(`MULAI paper trading dari blok ${start} (tip ${tip}). Mode kertas: tidak ada transaksi.`);
  }
  // keadaan akun dimuat SEBELUM putar ulang: stop darurat & puncak harus berlaku selama putar ulang,
  // dan riwayat Kelly dibangun ulang dari trade — bukan ditambahkan lagi dari account.json (dulu riwayat
  // tergandakan tiap restart sehingga ukuran posisi melompat sampai 4,7x dari yang diuji).
  muatAkun();
  const retSimpanan = acct.liveRets.splice(0), skorSimpanan = recentScores.splice(0);
  // putar ulang event yang tersimpan (hasil identik, deterministik)
  replaying = true;
  const ev = await parseStore(state.last);
  await processEvents(ev);
  replaying = false;
  // Putar ulang adalah sumber kebenaran. Simpanan hanya dipakai kalau putar ulang tidak menghasilkan apa-apa
  // (misalnya store terhapus tapi account.json masih ada).
  if (!acct.liveRets.length && retSimpanan.length) acct.liveRets.push(...retSimpanan);
  if (!recentScores.length && skorSimpanan.length) recentScores.push(...skorSimpanan.slice(-100));
  log(`riwayat akun: ${acct.liveRets.length} ret, ${recentScores.length} skor (simpanan ${retSimpanan.length}/${skorSimpanan.length})`);
  // pertahankan tanda "realtime" dari sesi sebelumnya
  const rt = new Map();
  if (fs.existsSync(TRADES)) for (const l of fs.readFileSync(TRADES, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try { const t = JSON.parse(l); rt.set(`${t.plan}|${t.pool}|${t.exitBlk}`, t.realtime); } catch (e) { /* baris rusak dilewati, bukan mematikan bot */ }
  }
  for (const t of closed) t.realtime = rt.get(`${t.plan}|${t.pool}|${t.exitBlk}`) ?? false;
  if (closed.length) tulisAman(TRADES, closed.map(t => JSON.stringify(t)).join("\n") + "\n");
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
        lastOkPoll = Date.now();            // tiap potongan berhasil = RPC sehat (jangan tunggu kejar selesai)
        tulisAman(statePath, JSON.stringify({ ...state, last: lastBlk }));
        if (Date.now() - lastStatus > 5000) { writeStatus(); simpanAkun(); lastStatus = Date.now(); }
      }
      lastErr = ""; lastOkPoll = Date.now();
    } catch (e) { lastErr = e.message.slice(0, 120); log("error: " + lastErr); await sleep(5000); }
    if (Date.now() - lastStatus > 5000) { writeStatus(); simpanAkun(); lastStatus = Date.now(); }
    await sleep(POLL_MS);
  }
})().catch(e => { log("FATAL: " + e.message); process.exit(1); });
