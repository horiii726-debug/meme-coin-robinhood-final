// RADAR LIVE — MODE KERTAS. Mencatat keputusan, TIDAK mengeksekusi trade apa pun.
// Alur: pantau Initialize -> saring struktural (0 detik) -> tunggu 1 menit ->
//       hitung fitur -> skor model -> catat. Lalu lacak hasilnya untuk validasi.
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Interface, id } = require("ethers");

const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const W = 600;                       // jendela fitur 1 menit
const MODEL_DIR = process.env.MODEL_DIR || "ds24";
const PY = process.env.PY || "C:\\Users\\horii\\AppData\\Local\\Programs\\Python\\Python313\\python.exe";
const LOG = "radar_log.jsonl";
const POLL_MS = parseInt(process.env.POLL_MS || "45000", 10);
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const iface = new Interface([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
]);
const T_INIT = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const T_SWAP = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

const sleep = ms => new Promise(r => setTimeout(r, ms));
function post(body) {
  return new Promise((res, rej) => {
    const p = spawn("curl", ["-s", "-m", "120", "--doh-url", "https://cloudflare-dns.com/dns-query",
      "-X", "POST", "https://rpc.mainnet.chain.robinhood.com", "-H", "Content-Type: application/json",
      "-d", JSON.stringify(body)], { maxBuffer: 1 << 28 });
    let o = ""; p.stdout.on("data", d => o += d);
    p.on("close", () => { try { res(JSON.parse(o)); } catch (e) { rej(new Error("badjson")); } });
  });
}
async function rpc(method, params) {
  for (let a = 0; a < 6; a++) {
    try { const j = await post({ jsonrpc: "2.0", id: 1, method, params }); if (j.error) throw new Error(j.error.message); return j.result; }
    catch (e) { if (a === 5) throw e; await sleep(800 * Math.pow(2, a)); }
  }
}

// --- riwayat deployer dari data historis (untuk fitur reputasi) ---
const devRep = new Map();
try {
  const devOf = new Map(), ib = new Map();
  for (const l of fs.readFileSync(path.join(MODEL_DIR, "deployers_bq.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(","); devOf.set(p[0].toLowerCase(), p[1].toLowerCase()); ib.set(p[0].toLowerCase(), +p[2]);
  }
  const best = new Map();
  const L = fs.readFileSync(path.join(MODEL_DIR, "sim.csv"), "utf8").trim().split("\n");
  const bi = L[0].split(",").indexOf("best_mult");
  for (const l of L.slice(1)) { const p = l.split(","); best.set(p[0].toLowerCase(), +p[bi]); }
  for (const [pid, d] of devOf) {
    const b = best.get(pid); if (b === undefined) continue;
    const a = devRep.get(d) || { n: 0, h2: 0, h11: 0, h101: 0, sum: 0 };
    a.n++; a.sum += Math.min(b, 200);
    if (b >= 2) a.h2++; if (b >= 11) a.h11++; if (b >= 101) a.h101++;
    devRep.set(d, a);
  }
  console.error(`riwayat deployer termuat: ${devRep.size} alamat`);
} catch (e) { console.error("riwayat deployer tidak tersedia:", e.message); }

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

function buildFeatures(pool, swaps, densityCount) {
  const { c0, c1, feeInit, ts, hooks, init } = pool;
  let qIsC1;
  if (QDEC[c1] !== undefined) qIsC1 = true;
  else if (QDEC[c0] !== undefined) qIsC1 = false;
  else return null;
  const quote = qIsC1 ? c1 : c0, qdec = QDEC[quote];
  const usdPer = quote === USDG ? 1 : ethUsd;
  const toUsd = r => (Math.abs(r) / Math.pow(10, qdec)) * usdPer;
  const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
  const baseAmt = x => qIsC1 ? x.a0 : x.a1;
  const quoteAmt = x => qIsC1 ? x.a1 : x.a0;
  const win = swaps.filter(x => x.blk <= init + W).sort((a, b) => a.blk - b.blk);
  if (win.length < 1) return null;

  const buys = win.filter(x => baseAmt(x) > 0), sells = win.filter(x => baseAmt(x) < 0);
  const bUsd = buys.map(x => toUsd(quoteAmt(x))), sUsd = sells.map(x => toUsd(quoteAmt(x)));
  const buyVol = bUsd.reduce((s, x) => s + x, 0), sellVol = sUsd.reduce((s, x) => s + x, 0);
  const lpEntry = lpUsd(win[0]), lpEndW = lpUsd(win[win.length - 1]);
  const lpPeakW = Math.max(...win.map(lpUsd).filter(isFinite));
  const txSet = new Map();
  for (const x of win) txSet.set(x.tx, (txSet.get(x.tx) || 0) + 1);
  const bundled = [...txSet.values()].filter(v => v > 1).length;
  const gaps = []; for (let i = 1; i < win.length; i++) gaps.push(win[i].blk - win[i - 1].blk);
  const halfB = init + W / 2;
  const h1 = win.filter(x => x.blk <= halfB).length, h2 = win.length - h1;
  const rels = win.map(x => qIsC1 ? x.sqrtP * x.sqrtP : 1 / (x.sqrtP * x.sqrtP)).filter(v => isFinite(v) && v > 0);
  const logrets = []; for (let i = 1; i < rels.length; i++) { const r = Math.log(rels[i] / rels[i - 1]); if (isFinite(r)) logrets.push(r); }
  let peakR = rels[0] || 1, ddW = 0;
  for (const r of rels) { if (r > peakR) peakR = r; const dd = 1 - r / peakR; if (dd > ddW) ddW = dd; }

  const rep = pool.dev ? devRep.get(pool.dev) : null;
  const bits = BigInt(hooks) & 0x3fffn;
  return {
    pool_id: pool.id,
    lp_entry_usd: lpEntry, lp_end_w_usd: lpEndW, lp_peak_w_usd: lpPeakW,
    lp_growth: lpEndW / Math.max(lpEntry, 1), lp_adds_w: 0, lp_removes_w: 0, lp_rem_frac_w: 0,
    n_swap_w: win.length, n_buy_w: buys.length, n_sell_w: sells.length,
    buy_sell_cnt_ratio: buys.length / Math.max(sells.length, 1),
    buyvol_usd_w: buyVol, sellvol_usd_w: sellVol,
    flow_imbalance: (buyVol - sellVol) / Math.max(buyVol + sellVol, 1e-9),
    netflow_over_lp: (buyVol - sellVol) / Math.max(lpEntry, 1),
    buy_size_med_usd: med(bUsd), buy_size_mean_usd: mean(bUsd), sell_size_med_usd: med(sUsd),
    max_buy_usd: bUsd.length ? Math.max(...bUsd) : 0,
    max_buy_over_lp: (bUsd.length ? Math.max(...bUsd) : 0) / Math.max(lpEntry, 1),
    n_tx_w: txSet.size, swaps_per_tx: win.length / Math.max(txSet.size, 1),
    bundled_frac: bundled / Math.max(txSet.size, 1),
    lag_first_swap: win[0].blk - init, gap_med_blocks: med(gaps), gap_std_blocks: std(gaps),
    swaps_per_min: win.length / (W * 0.1 / 60), accel_2nd_half: h2 / Math.max(h1, 1),
    ret_w: rels.length ? rels[rels.length - 1] / rels[0] : 1,
    vol_logret_w: std(logrets), maxdd_w: ddW,
    up_move_frac: logrets.filter(r => r > 0).length / Math.max(logrets.length, 1),
    fee_init: feeInit, fee_med_w: med(win.map(x => x.fee)),
    fee_dynamic: feeInit === 8388608 ? 1 : 0,
    has_hook: hooks === NATIVE ? 0 : 1, tick_spacing: ts,
    quote_is_usdg: quote === USDG ? 1 : 0,
    dev_n_prev: rep ? rep.n : 0,
    dev_rate2: rep && rep.n ? rep.h2 / rep.n : -1,
    dev_rate11: rep && rep.n ? rep.h11 / rep.n : -1,
    dev_has11: rep && rep.h11 > 0 ? 1 : 0,
    dev_has101: rep && rep.h101 > 0 ? 1 : 0,
    dev_avg_mult: rep && rep.n ? rep.sum / rep.n : -1,
    launch_density_10m: densityCount,
    hook_beforeSwap: Number((bits >> 7n) & 1n),
    quote_eth: (c0 === NATIVE || c1 === NATIVE) ? 1 : 0,
  };
}

function scoreRows(rows) {
  const tmp = "radar_score_in.json";
  fs.writeFileSync(tmp, JSON.stringify(rows));
  const out = execFileSync(PY, ["score.py", MODEL_DIR], { input: fs.readFileSync(tmp), maxBuffer: 1 << 26 }).toString();
  return JSON.parse(out);
}

(async () => {
  let last = parseInt(await rpc("eth_blockNumber", []), 16);
  console.error(`RADAR MODE KERTAS mulai di blok ${last}. Tidak ada eksekusi trade.`);
  const watch = new Map();          // poolId -> pool info, menunggu jendela 1 menit
  const recentBirths = [];          // untuk kepadatan launch

  while (true) {
    try {
      const tip = parseInt(await rpc("eth_blockNumber", []), 16);
      if (tip > last) {
        const logs = await rpc("eth_getLogs", [{ address: PM, topics: [T_INIT],
          fromBlock: "0x" + (last + 1).toString(16), toBlock: "0x" + tip.toString(16) }]);
        for (const l of logs) {
          const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
          const blk = parseInt(l.blockNumber, 16);
          recentBirths.push(blk);
          const hooks = d.hooks.toLowerCase();
          const c0 = d.currency0.toLowerCase(), c1 = d.currency1.toLowerCase();
          const bits = BigInt(hooks) & 0x3fffn;
          const beforeSwap = Number((bits >> 7n) & 1n);
          // SARINGAN STRUKTURAL INSTAN
          const pass = hooks !== NATIVE && (c0 === NATIVE || c1 === NATIVE) && beforeSwap === 0;
          if (!pass) continue;
          watch.set(d.id.toLowerCase(), { id: d.id.toLowerCase(), c0, c1, feeInit: Number(d.fee),
            ts: Number(d.tickSpacing), hooks, init: blk, tx: l.transactionHash });
        }
        while (recentBirths.length && tip - recentBirths[0] > 6000) recentBirths.shift();
        console.error(`[poll] blok ${last + 1}..${tip} | ${logs.length} pool baru | ${watch.size} dalam pantauan`);
        last = tip;
      }

      // pool yang jendelanya sudah lengkap -> hitung fitur + skor
      const ready = [...watch.values()].filter(p => tip >= p.init + W + 20);
      if (ready.length) {
        const rows = [];
        for (const p of ready) {
          watch.delete(p.id);
          try {
            if (!p.dev) {
              const tx = await rpc("eth_getTransactionByHash", [p.tx]);
              p.dev = tx && tx.from ? tx.from.toLowerCase() : null;
            }
            const sl = await rpc("eth_getLogs", [{ address: PM, topics: [T_SWAP, p.id],
              fromBlock: "0x" + p.init.toString(16), toBlock: "0x" + (p.init + W).toString(16) }]);
            const swaps = sl.map(l => {
              const d = iface.parseLog({ topics: l.topics, data: l.data }).args;
              return { blk: parseInt(l.blockNumber, 16), tx: l.transactionHash,
                a0: Number(d.amount0), a1: Number(d.amount1),
                sqrtP: Number(d.sqrtPriceX96) / Q96, L: Number(d.liquidity), fee: Number(d.fee) };
            }).filter(x => isFinite(x.sqrtP) && x.sqrtP > 0 && x.L > 0);
            const f = buildFeatures(p, swaps, recentBirths.length);
            if (f) rows.push(f);
            else console.error(`  ${p.id.slice(0, 12)} dilewati: ${swaps.length} swap di menit-1 (butuh >=1, quote dikenal)`);
          } catch (e) { console.error("skip", p.id.slice(0, 12), e.message.slice(0, 50)); }
        }
        if (rows.length) {
          const scores = scoreRows(rows);
          for (let i = 0; i < rows.length; i++) {
            const rec = { ts: new Date().toISOString(), pool: rows[i].pool_id, init_block: ready.find(r => r.id === rows[i].pool_id)?.init,
              dev: ready.find(r => r.id === rows[i].pool_id)?.dev,
              p100: scores[i].p100, p400: scores[i].p400, p1000: scores[i].p1000,
              lp_entry_usd: Math.round(rows[i].lp_entry_usd), n_swap_w: rows[i].n_swap_w,
              ret_w: +rows[i].ret_w.toFixed(3), netflow_over_lp: +rows[i].netflow_over_lp.toFixed(4),
              dev_has11: rows[i].dev_has11, features: rows[i] };
            fs.appendFileSync(LOG, JSON.stringify(rec) + "\n");
            const flag = scores[i].p400 >= 0.30 ? "  *** KANDIDAT KUAT ***" : "";
            console.error(`[${rec.ts.slice(11, 19)}] ${rows[i].pool_id.slice(0, 14)} p100=${scores[i].p100} p400=${scores[i].p400} p1000=${scores[i].p1000} LP=$${rec.lp_entry_usd} swap=${rec.n_swap_w}${flag}`);
          }
        }
      }
    } catch (e) { console.error("loop error:", e.message.slice(0, 60)); }
    await sleep(POLL_MS);
  }
})();
