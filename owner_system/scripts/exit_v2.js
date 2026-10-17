// EXIT DUA FASE — diuji terpisah di periode LAMA (ds5d) dan BARU (ds24).
// Hipotesis dari anatomi 120 moonshot:
//  - koreksi ~48% di tengah kenaikan itu normal -> stop lebar selama naik
//  - fakeout puncak di menit ~8 -> kalau di menit 10 belum >=1,5x, keluar
//  - setelah puncak ambruk 74% dalam 5 menit -> begitu sudah untung besar, kunci ketat
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);
const DIR = process.argv[2] || "ds6d";
const SPLIT = 59886162;               // < SPLIT = ds5d (lama), >= SPLIT = ds24 (baru)
const HZ = 216000, MIN = 600;
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

const RULES = {
  "A trail-50% max15m (lama)":      { trail: 0.50, maxB: 15 * MIN },
  "B stop-80% max60m":              { trail: 0.80, maxB: 60 * MIN },
  "C 2fase: -80% lalu -40% @>=3x":  { trail: 0.80, lockAt: 3, lockTrail: 0.40, maxB: 360 * MIN },
  "D 2fase + buang lemah @10m":     { trail: 0.80, lockAt: 3, lockTrail: 0.40, weakMin: 10, weakX: 1.5, maxB: 360 * MIN },
  "E D + kunci -30% @>=10x":        { trail: 0.80, lockAt: 3, lockTrail: 0.40, lock2At: 10, lock2Trail: 0.30, weakMin: 10, weakX: 1.5, maxB: 360 * MIN },
};

// screen menit-1 dari features.csv (hanya data <= menit 1) + struktur dari pools.csv
const feat = new Map();
{
  const L = fs.readFileSync(path.join(DIR, "features.csv"), "utf8").trim().split("\n");
  const H = L[0].split(","); const I = {}; H.forEach((h, i) => I[h] = i);
  for (const l of L.slice(1)) { const p = l.split(","); feat.set(p[0].toLowerCase(), { lag: +p[I.lag_first_swap], nb: +p[I.n_buy_w], bmed: +p[I.buy_size_med_usd], lpg: +p[I.lp_growth], usdg: +p[I.quote_is_usdg] }); }
}
const pools = new Map();
for (const l of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = l.split(","); const pid = p[0].toLowerCase();
  const hooks = p[5].toLowerCase(), bits = BigInt(hooks) & 0x3fffn;
  pools.set(pid, { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), fee: +p[3], hooks, beforeSwap: Number((bits >> 7n) & 1n), init: +p[6] });
}
const rugBlk = new Map();
{
  const cum = new Map();
  for (const l of fs.readFileSync(path.join(DIR, "liq.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = l.split(","); const pid = p[0].toLowerCase();
    if (rugBlk.has(pid)) continue;
    const c = cum.get(pid) || { a: 0n, r: 0n }; const d = BigInt(p[5]);
    if (d > 0n) c.a += d; else c.r += -d;
    cum.set(pid, c);
    if (c.a > 0n && c.r * 100n / c.a > 80n) rugBlk.set(pid, +p[1]);
  }
}
const SCREENS = {
  "S1 aman: ETH, fee<=0,5%, beforeSwap mati": (m, f) => (m.c0 === NATIVE || m.c1 === NATIVE) && m.fee <= 5000 && m.beforeSwap === 0,
  "S2 S1 + aktivitas menit-1": (m, f) => (m.c0 === NATIVE || m.c1 === NATIVE) && m.fee <= 5000 && m.beforeSwap === 0
                                         && f && f.lag <= 5 && f.nb >= 10 && f.bmed >= 20 && f.lpg >= 1.0,
};

const res = {};   // screen -> rule -> period -> [trades]
function run(pid, sw) {
  const m = pools.get(pid); if (!m) return;
  // buang pool yang tindak lanjutnya terpotong di ujung data yang terkumpul
  const DATA_END = m.init < SPLIT ? 56196161 : 60750162;
  if (m.init + HZ > DATA_END) return;
  const f = feat.get(pid);
  const active = Object.entries(SCREENS).filter(([, fn]) => fn(m, f)).map(([k]) => k);
  if (!active.length) return;
  sw.sort((a, b) => a.blk - b.blk || a.li - b.li);
  const qIsC1 = m.c1 === NATIVE;
  const toUsd = r => (Math.abs(r) / 1e18) * ethUsd;
  const lpUsd = x => 2 * toUsd(qIsC1 ? x.L * x.sqrtP : x.L / x.sqrtP);
  const all = sw.filter(x => x.blk <= m.init + HZ);
  const ei = all.findIndex(x => x.blk >= m.init + MIN);
  if (ei < 0 || ei >= all.length - 1) return;
  const e = all[ei];
  const size = Math.min(200, 0.01 * lpUsd(e));
  if (!isFinite(size) || size < 20) return;                       // posisi terlalu kecil = tidak layak
  const dIn = (size / ethUsd) * 1e18 * (1 - e.fee / 1e6);
  let base;
  if (qIsC1) { const sp1 = e.sqrtP + dIn / e.L; base = e.L * (1 / e.sqrtP - 1 / sp1); }
  else { const inv = 1 / e.sqrtP + dIn / e.L; base = e.L * (e.sqrtP - 1 / inv); }
  if (!isFinite(base) || base <= 0) return;
  const val = x => { const bIn = base * (1 - x.fee / 1e6); let r;
    if (qIsC1) { const inv = 1 / x.sqrtP + bIn / x.L; r = x.L * (x.sqrtP - 1 / inv); }
    else { const spb = x.sqrtP + bIn / x.L; r = x.L * (1 / x.sqrtP - 1 / spb); }
    return (!isFinite(r) || r <= 0) ? 0 : toUsd(r) / size; };
  const after = all.slice(ei + 1);
  const V = after.map(val);
  const period = m.init < SPLIT ? "LAMA" : "BARU";
  for (const [rn, R] of Object.entries(RULES)) {
    let peak = 1, trig = -1;
    for (let i = 0; i < after.length; i++) {
      const v = V[i], dt = after[i].blk - e.blk;
      if (v > peak) peak = v;
      if (dt >= R.maxB) { trig = i; break; }
      if (R.weakMin && dt >= R.weakMin * MIN && peak < R.weakX) { trig = i; break; }
      let tr = R.trail;
      if (R.lockAt && peak >= R.lockAt) tr = R.lockTrail;
      if (R.lock2At && peak >= R.lock2At) tr = R.lock2Trail;
      if (v <= peak * (1 - tr)) { trig = i; break; }
    }
    const xi = trig < 0 ? after.length - 1 : Math.min(trig + 1, after.length - 1);
    const intended = trig < 0 ? (m.init + HZ) : after[xi].blk;
    const rb = rugBlk.get(pid);
    const ret = (rb !== undefined && rb <= intended) ? (-0.04 / size) : (V[xi] * size - 0.04) / size;
    for (const s of active) {
      res[s] = res[s] || {}; res[s][rn] = res[s][rn] || { LAMA: [], BARU: [] };
      res[s][rn][period].push({ ret, size });
    }
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
    const p = line.split(",");
    const sqrtP = Number(p[6]) / Q96, L = Number(p[7]);
    if (!isFinite(sqrtP) || sqrtP <= 0 || !isFinite(L) || L <= 0) continue;
    sw.push({ blk: +p[1], li: +p[2], a0: +p[4], a1: +p[5], sqrtP, L, fee: +p[9] });
  }
  if (cur) run(cur, sw);

  const stat = tr => {
    if (!tr.length) return null;
    const r = tr.map(t => t.ret);
    const pnl = tr.reduce((a, t) => a + (t.ret - 1) * t.size, 0);
    const prof = tr.map(t => (t.ret - 1) * t.size).sort((a, b) => b - a);
    const pos = prof.filter(x => x > 0).reduce((a, b) => a + b, 0) || 1;
    return { n: tr.length, win: r.filter(x => x > 1).length / r.length, mean: r.reduce((a, b) => a + b, 0) / r.length,
      x5: r.filter(x => x >= 5).length, x11: r.filter(x => x >= 11).length, pnl, top1: Math.max(prof[0], 0) / pos, pnlNoTop: pnl - Math.max(prof[0], 0) };
  };
  for (const [s, rules] of Object.entries(res)) {
    console.log("\n" + "=".repeat(118));
    console.log(`SCREEN ${s}`);
    console.log("=".repeat(118));
    console.log("aturan exit".padEnd(32) + "| LAMA: n  menang  rata2  >=5x >=11x     PnL  tanpa-top1 | BARU: n  menang  rata2  >=5x >=11x     PnL  tanpa-top1");
    for (const [rn, per] of Object.entries(rules)) {
      const f = x => !x ? " ".repeat(55) :
        `${String(x.n).padStart(5)} ${(100 * x.win).toFixed(0).padStart(5)}% ${((x.mean - 1) * 100).toFixed(0).padStart(5)}% ${String(x.x5).padStart(4)} ${String(x.x11).padStart(4)} ${("$" + x.pnl.toFixed(0)).padStart(8)} ${("$" + x.pnlNoTop.toFixed(0)).padStart(9)} `;
      console.log(rn.padEnd(32) + "|" + f(stat(per.LAMA)) + "|" + f(stat(per.BARU)));
    }
  }
})();
