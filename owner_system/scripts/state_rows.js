// POTRET KONDISI selama posisi terbuka (tiap >=10 detik), untuk melatih model HOLD vs JUAL.
// Fitur hanya dari masa lalu; label dari masa depan.
// Label: fmax30 = nilai tertinggi 30 menit ke depan / nilai sekarang
//        f5     = nilai 5 menit ke depan / nilai sekarang
//        rug10  = LP ditarik >80% dalam 10 menit ke depan
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const Q96 = Math.pow(2, 96);
const DIR = process.env.DIR || "ds6d";
const SPLIT = +(process.env.SPLIT || 59886162), HZ = +(process.env.HZ || 324000), MIN = 600, STEP = 100;
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const pools = new Map();
for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.split(","); const hooks = p[5].toLowerCase(), bits = BigInt(hooks) & 0x3fffn;
  pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), fee: +p[3], beforeSwap: Number((bits >> 7n) & 1n), init: +p[6], hook: hooks !== NATIVE ? 1 : 0 });
}
const safe = m => (m.c0 === NATIVE || m.c1 === NATIVE) && m.fee <= 5000 && m.beforeSwap === 0;
const liq = new Map();
for (const line of fs.readFileSync(path.join(DIR, "liq.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = line.split(","); const pid = p[0].toLowerCase(); const m = pools.get(pid);
  if (!m || !safe(m)) continue;
  if (!liq.has(pid)) liq.set(pid, []);
  liq.get(pid).push({ blk: +p[1], d: BigInt(p[5]) });
}

const COLS = ["pid", "period", "blk", "lmult", "lpeak", "dd", "t_entry", "b60", "s60", "bu60", "su60", "avgs60", "avgb60",
  "net60_lp", "b300", "s300", "bu300", "su300", "sell_surge", "maxsell60_lp", "ret60", "ret300", "lp_vs_entry", "lp_chg300",
  "accel", "tx60", "gap", "rem_frac", "hook", "fee", "fmax30", "f5", "rug10"];
const out = fs.createWriteStream(process.env.OUT || "state_rows.csv");
out.write(COLS.join(",") + "\n");
let nRows = 0, nPools = 0;

function run(pid, sw) {
  const m = pools.get(pid); if (!m || !safe(m)) return;
  const period = m.init < SPLIT ? "LAMA" : "BARU";
  if (m.init + HZ > +(process.env.ENDBLK || (period === "LAMA" ? 56196161 : 60750162))) return;
  sw.sort((a, b) => a.blk - b.blk || a.li - b.li);
  const qIsC1 = m.c1 === NATIVE;
  const toUsd = r => (Math.abs(r) / 1e18) * ethUsd;
  const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
  const isBuy = x => (qIsC1 ? x.a0 : x.a1) > 0;
  const qUsd = x => (Math.abs(qIsC1 ? x.a1 : x.a0) / 1e18) * ethUsd;
  const all = sw.filter(x => x.blk <= m.init + HZ);
  const ei = all.findIndex(x => x.blk >= m.init + MIN);
  if (ei < 0 || ei >= all.length - 2) return;
  const e = all[ei];
  const size = Math.min(200, 0.01 * lpUsd(e));
  if (!isFinite(size) || size < 20) return;
  const dIn = (size / ethUsd) * 1e18 * (1 - e.fee / 1e6);
  let base;
  if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
  else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
  if (!isFinite(base) || base <= 0) return;
  const val = x => { const bIn = base * (1 - x.fee / 1e6); let r;
    if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; r = x.L * (x.sqrtP - 1 / inv); }
    else { const spb = x.sqrtP + bIn / x.L; r = x.L * (1 / x.sqrtP - 1 / spb); }
    return (!isFinite(r) || r <= 0) ? 0 : toUsd(r) / size; };
  const n = all.length;
  const V = new Float64Array(n); for (let i = ei; i < n; i++) V[i] = val(all[i]);
  const LP = new Float64Array(n); for (let i = 0; i < n; i++) LP[i] = lpUsd(all[i]);
  // sparse table utk max V pada rentang indeks
  const LOG = []; for (let k = 0, p = 1; p <= n; k++, p *= 2) LOG.push(k);
  const sp = [Float64Array.from(V)];
  for (let k = 1; (1 << k) <= n; k++) { const prev = sp[k - 1], cur = new Float64Array(n); const h = 1 << (k - 1);
    for (let i = 0; i + (1 << k) <= n; i++) cur[i] = Math.max(prev[i], prev[i + h]); sp.push(cur); }
  const rmq = (l, r) => { if (l > r) return -Infinity; const k = Math.floor(Math.log2(r - l + 1)); return Math.max(sp[k][l], sp[k][r - (1 << k) + 1]); };
  // likuiditas: kumulatif & blok rug
  const ev = (liq.get(pid) || []).sort((a, b) => a.blk - b.blk);
  let rugBlk = null; { let a = 0n, r = 0n; for (const x of ev) { if (x.d > 0n) a += x.d; else r += -x.d; if (rugBlk === null && a > 0n && r * 100n / a > 80n) rugBlk = x.blk; } }
  const remFracAt = blk => { let a = 0n, r = 0n; for (const x of ev) { if (x.blk > blk) break; if (x.d > 0n) a += x.d; else r += -x.d; } return a > 0n ? Number(r * 1000n / a) / 1000 : 0; };

  nPools++;
  let peak = 1, lastBlk = -1e9, sCnt = 0, sSum = 0;
  let j5 = ei, j30 = ei;
  for (let i = ei + 1; i < n; i++) {
    const x = all[i];
    if (V[i] > peak) peak = V[i];
    if (!isBuy(x)) { sCnt++; sSum += qUsd(x); }
    if (x.blk - lastBlk < STEP) continue;
    if (V[i] <= 0) break;                         // posisi sudah tak bernilai
    lastBlk = x.blk;
    // jendela masa lalu
    let b60 = 0, s60 = 0, bu60 = 0, su60 = 0, maxs60 = 0, tx60 = new Set(), b300 = 0, s300 = 0, bu300 = 0, su300 = 0, i60 = i, i300 = i;
    for (let k = i; k >= 0 && all[k].blk > x.blk - 3000; k--) {
      const y = all[k], u = qUsd(y), buy = isBuy(y);
      if (buy) { b300++; bu300 += u; } else { s300++; su300 += u; }
      i300 = k;
      if (y.blk > x.blk - 600) { i60 = k; tx60.add(y.tx); if (buy) { b60++; bu60 += u; } else { s60++; su60 += u; if (u / Math.max(LP[k], 1) > maxs60) maxs60 = u / Math.max(LP[k], 1); } }
    }
    const refIdx = (k) => Math.max(ei, k - 1);
    const ret60 = V[i] / Math.max(V[refIdx(i60)], 1e-9), ret300 = V[i] / Math.max(V[refIdx(i300)], 1e-9);
    const avgs60 = s60 ? su60 / s60 : 0, avgb60 = b60 ? bu60 / b60 : 0;
    const surge = (s60 && sCnt) ? avgs60 / (sSum / sCnt) : 0;
    // label masa depan
    while (j5 + 1 < n && all[j5 + 1].blk <= x.blk + 3000) j5++;
    while (j30 + 1 < n && all[j30 + 1].blk <= x.blk + 18000) j30++;
    const fmax30 = rmq(i + 1, j30) / V[i];
    const f5 = V[Math.max(j5, i)] / V[i];
    const rug10 = rugBlk !== null && rugBlk > x.blk && rugBlk <= x.blk + 6000 ? 1 : 0;
    const f5Adj = rug10 && rugBlk <= x.blk + 3000 ? 0 : f5;
    out.write([pid, period, x.blk, Math.log(V[i]).toFixed(4), Math.log(peak).toFixed(4), (1 - V[i] / peak).toFixed(4),
      ((x.blk - e.blk) * 0.1 / 60).toFixed(2), b60, s60, bu60.toFixed(0), su60.toFixed(0), avgs60.toFixed(1), avgb60.toFixed(1),
      ((bu60 - su60) / Math.max(LP[i], 1)).toFixed(4), b300, s300, bu300.toFixed(0), su300.toFixed(0), surge.toFixed(3), maxs60.toFixed(4),
      ret60.toFixed(4), ret300.toFixed(4), (LP[i] / Math.max(LP[ei], 1)).toFixed(3), (LP[i] / Math.max(LP[i300], 1)).toFixed(3),
      (b60 + s60) / Math.max((b300 + s300) / 5, 1e-9) > 50 ? 50 : ((b60 + s60) / Math.max((b300 + s300) / 5, 1e-9)).toFixed(3),
      tx60.size, i > 0 ? x.blk - all[i - 1].blk : 0, remFracAt(x.blk), m.hook, m.fee,
      isFinite(fmax30) ? fmax30.toFixed(4) : 1, f5Adj.toFixed(4), rug10].join(",") + "\n");
    nRows++;
  }
}

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps_sorted.csv")), crlfDelay: Infinity });
  let cur = null, sw = [];
  for await (const line of rl) {
    if (!line) continue;
    const i1 = line.indexOf(",");
    const pid = line.slice(0, i1).toLowerCase();
    if (pid === "pool_id") continue;
    if (pid !== cur) { if (cur) run(cur, sw); cur = pid; sw = []; }
    const m = pools.get(pid); if (!m || !safe(m)) continue;
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    sw.push({ blk: +p[1], li: +p[2], tx: p[3], a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
  }
  if (cur) run(cur, sw);
  out.end();
  console.log(`pool: ${nPools} | potret kondisi: ${nRows}`);
})();
