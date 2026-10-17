// Hitung 35 fitur filter beli (dasar + holder + graf + price impact) dari swap menit-1 dan transfer token menit-1.
// Dipakai live oleh paper_live.js. Semua hanya memakai data sampai blok keputusan (init+600).
const NATIVE = "0x0000000000000000000000000000000000000000";
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const Q96 = Math.pow(2, 96);

const num = v => (Number.isFinite(v) ? v : NaN);

// sw: [{blk, li, a0, a1, sqrtP, L, fee}] sampai init+600 ; tr: [[blk, li, from, to, amount(BigInt|string)]]
function features(meta, sw, tr, ethUsd) {
  const q1 = meta.c1 === NATIVE;
  const f = { fee: meta.fee, hook: meta.hooks !== NATIVE ? 1 : 0 };
  const keys = ["n_swap", "n_buy", "n_sell", "buy_usd", "sell_usd", "lp_m1", "ret_m1", "flow_lp",
    "n_holders", "top1", "top5", "hhi", "entropy", "gini", "l2_l1", "pool_share", "n_buyers", "n_sellers",
    "g_nodes", "g_edges", "g_density", "g_lambda1", "g_eig_max_nonpool", "g_deg_central", "g_p2p_frac",
    "kyle_lambda", "impact_r2", "impact_cos", "impact_norm", "lam_buy", "lam_sell", "lw_mom", "lw_mom_log"];
  for (const k of keys) f[k] = NaN;

  if (sw.length) {
    const s = [...sw].sort((a, b) => a.blk - b.blk || a.li - b.li);
    const sp = s.map(x => x.sqrtP), L = s.map(x => x.L);
    const base = s.map(x => (q1 ? x.a0 : x.a1)), quote = s.map(x => (q1 ? x.a1 : x.a0));
    const buy = base.map(v => v > 0);
    const usd = quote.map(v => (Math.abs(v) / 1e18) * ethUsd);
    const price = sp.map(v => (q1 ? v * v : 1 / (v * v)));
    const lp = s.map((x, i) => 2 * ((q1 ? L[i] * sp[i] : L[i] / sp[i]) / 1e18) * ethUsd);
    const bu = usd.filter((_, i) => buy[i]).reduce((a, b) => a + b, 0);
    const su = usd.filter((_, i) => !buy[i]).reduce((a, b) => a + b, 0);
    const lpLast = lp[lp.length - 1];
    f.n_swap = s.length; f.n_buy = buy.filter(Boolean).length; f.n_sell = s.length - f.n_buy;
    f.buy_usd = bu; f.sell_usd = su; f.lp_m1 = num(lpLast);
    f.ret_m1 = price[0] > 0 ? price[price.length - 1] / price[0] : NaN;
    f.flow_lp = (bu - su) / Math.max(lpLast, 1);
    // price impact: dlogP = lambda * volume bertanda (kuadrat terkecil)
    const dlp = [], v = [];
    for (let i = 1; i < s.length; i++) {
      const d = Math.log(price[i]) - Math.log(price[i - 1]);
      const vv = buy[i] ? usd[i] : -usd[i];
      if (Number.isFinite(d) && Number.isFinite(vv)) { dlp.push(d); v.push(vv); }
    }
    const dot = (a, b) => a.reduce((s_, x, i) => s_ + x * b[i], 0);
    if (v.length >= 3 && dot(v, v) > 0) {
      const lam = dot(v, dlp) / dot(v, v);
      const res = dlp.map((d, i) => d - lam * v[i]);
      f.kyle_lambda = lam * 100;
      f.impact_r2 = 1 - dot(res, res) / Math.max(dot(dlp, dlp), 1e-18);
      f.impact_cos = dot(v, dlp) / (Math.sqrt(dot(v, v)) * Math.sqrt(dot(dlp, dlp)) + 1e-18);
      f.impact_norm = Math.sqrt(dot(dlp, dlp));
      const bi = v.map((x, i) => (x > 0 ? i : -1)).filter(i => i >= 0);
      const si = v.map((x, i) => (x < 0 ? i : -1)).filter(i => i >= 0);
      if (bi.length >= 2) f.lam_buy = (bi.reduce((s_, i) => s_ + v[i] * dlp[i], 0) / bi.reduce((s_, i) => s_ + v[i] * v[i], 0)) * 100;
      if (si.length >= 2) f.lam_sell = (si.reduce((s_, i) => s_ + v[i] * dlp[i], 0) / si.reduce((s_, i) => s_ + v[i] * v[i], 0)) * 100;
    }
    if (dlp.length >= 1) {
      const w = dlp.map((_, i) => (Number.isFinite(lp[i + 1]) ? lp[i + 1] : 0));
      const ws = w.reduce((a, b) => a + b, 0);
      f.lw_mom = ws > 0 ? dlp.reduce((s_, d, i) => s_ + d * w[i], 0) / ws : NaN;
      f.lw_mom_log = Math.log(Math.max(f.ret_m1, 1e-9)) * Math.log10(Math.max(f.lp_m1, 10));
    }
  }

  // holder + graf dari transfer token
  const bal = new Map(), edges = new Map();
  const sorted = [...tr].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, , fr, to, amt] of sorted) {
    const a = Number(amt);
    if (fr !== NATIVE) bal.set(fr, (bal.get(fr) || 0) - a);
    if (to !== NATIVE) bal.set(to, (bal.get(to) || 0) + a);
    if (fr !== NATIVE && to !== NATIVE && fr !== to) {
      const k = fr < to ? fr + "|" + to : to + "|" + fr;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  const holders = [...bal.entries()].filter(([k, v]) => v > 0 && k !== PM && k !== NATIVE).map(([, v]) => v).sort((a, b) => b - a);
  if (holders.length) {
    const tot = holders.reduce((a, b) => a + b, 0);
    const sh = holders.map(v => v / tot);
    f.n_holders = holders.length;
    f.top1 = sh[0];
    f.top5 = sh.slice(0, 5).reduce((a, b) => a + b, 0);
    f.hhi = sh.reduce((a, b) => a + b * b, 0);
    f.entropy = -sh.reduce((a, b) => a + b * Math.log(b), 0);
    const asc = [...sh].sort((a, b) => a - b);
    let cum = 0, cs = 0;
    for (const x of asc) { cum += x; cs += cum; }
    f.gini = 1 - (2 * cs) / asc.length + 1 / asc.length;
    f.l2_l1 = Math.sqrt(holders.reduce((a, b) => a + b * b, 0)) / tot;
    const totPos = [...bal.values()].filter(v => v > 0).reduce((a, b) => a + b, 0);
    f.pool_share = totPos > 0 ? Math.max(bal.get(PM) || 0, 0) / totPos : NaN;
  }
  const buyers = new Set(), sellers = new Set();
  for (const [, , fr, to] of sorted) {
    if (fr === PM && to !== PM && to !== NATIVE) buyers.add(to);
    if (to === PM && fr !== PM && fr !== NATIVE) sellers.add(fr);
  }
  f.n_buyers = buyers.size; f.n_sellers = sellers.size;
  const nodes = [...new Set([...edges.keys()].flatMap(k => k.split("|")))].sort();
  if (nodes.length >= 3) {
    const idx = new Map(nodes.map((n, i) => [n, i]));
    const n = nodes.length;
    const A = Array.from({ length: n }, () => new Float64Array(n));
    for (const [k, c] of edges) { const [u, w] = k.split("|"); A[idx.get(u)][idx.get(w)] = c; A[idx.get(w)][idx.get(u)] = c; }
    // eigenvector utama lewat iterasi pangkat
    let x = new Float64Array(n).fill(1 / Math.sqrt(n)), lambda = 0;
    for (let it = 0; it < 200; it++) {
      const y = new Float64Array(n);
      for (let i = 0; i < n; i++) { let s_ = 0; for (let j = 0; j < n; j++) s_ += A[i][j] * x[j]; y[i] = s_; }
      const nrm = Math.sqrt(y.reduce((a, b) => a + b * b, 0));
      if (!nrm) break;
      for (let i = 0; i < n; i++) y[i] /= nrm;
      lambda = nrm; x = y;
    }
    const deg = A.map(r => r.reduce((a, b) => a + b, 0));
    const mx = Math.max(...x.map(Math.abs)) || 1e-12;
    let evMaxNonPm = 0;
    nodes.forEach((nd, i) => { if (nd !== PM) evMaxNonPm = Math.max(evMaxNonPm, Math.abs(x[i]) / mx); });
    const dmax = Math.max(...deg);
    f.g_nodes = n; f.g_edges = edges.size;
    f.g_density = edges.size / ((n * (n - 1)) / 2);
    f.g_lambda1 = lambda;
    f.g_eig_max_nonpool = evMaxNonPm;
    f.g_deg_central = deg.reduce((a, d) => a + (dmax - d), 0) / Math.max((n - 1) * (n - 2), 1);
    let p2p = 0, tot = 0;
    for (const [k, c] of edges) { const [u, w] = k.split("|"); tot += c; if (u !== PM && w !== PM) p2p += c; }
    f.g_p2p_frac = tot ? p2p / tot : 0;
  }
  return f;
}

// meniru CSV + fillna(-1) seperti saat latih
const fx = (x, k) => { const v = parseFloat(Number(x).toFixed(k)); return Number.isFinite(v) ? v : -1; };
function vector(f, feats) { return feats.map(k => (Number.isFinite(f[k]) ? f[k] : NaN)); }

module.exports = { features, vector, fx };
