// FASE 4 (lanjutan) — fitur SISI DOMPET, dari jendela fitur saja.
// Menjawab: apakah pembelinya benar-benar orang berbeda, atau segelintir yang menyamar?
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const NATIVE = "0x0000000000000000000000000000000000000000";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const QDEC = { [NATIVE]: 18, [USDG]: 6, [WETH]: 18 };
const Q96 = Math.pow(2, 96);

const DIR = process.argv[2] || "dsp";
const W = parseInt(process.env.W || "3000", 10);
const ethUsd = JSON.parse(fs.readFileSync("eth_usd.json", "utf8")).ethUsd;

(async () => {
  const from = new Map(), gasOf = new Map();
  for (const line of fs.readFileSync(path.join(DIR, "tx_from.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = line.split(",");
    from.set(p[0], p[1].toLowerCase());
    if (p[4]) gasOf.set(p[0], p[4]);
  }
  console.error(`tx_from termuat: ${from.size}`);

  const pools = new Map();
  for (const line of fs.readFileSync(path.join(DIR, "pools.csv"), "utf8").trim().split("\n").slice(1)) {
    const p = line.split(",");
    pools.set(p[0].toLowerCase(), { c0: p[1].toLowerCase(), c1: p[2].toLowerCase(), hooks: p[5].toLowerCase(), init: +p[6] });
  }

  const per = new Map();
  {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, "swaps.csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(",");
      const pid = p[0].toLowerCase(); const m = pools.get(pid); if (!m) continue;
      const blk = +p[1]; if (blk > m.init + W) continue;
      const w = from.get(p[3]); if (!w) continue;
      if (!per.has(pid)) per.set(pid, []);
      per.get(pid).push({ blk, tx: p[3], w, a0: +p[4], a1: +p[5], sqrtP: Number(p[6]) / Q96, L: Number(p[7]) });
    }
  }

  const out = fs.createWriteStream(path.join(DIR, "wallet_features.csv"));
  out.write(["pool_id", "n_buyers_uniq", "n_sellers_uniq", "buys_per_buyer",
    "top1_buyer_share", "top3_buyer_share", "buyer_hhi",
    "repeat_buyer_frac", "oneshot_buyer_frac", "flipper_frac",
    "buyer_seller_overlap", "gas_uniformity", "n_wallets_total"].join(",") + "\n");

  let n = 0;
  for (const [pid, ev] of per) {
    const m = pools.get(pid);
    let qIsC1;
    if (QDEC[m.c1] !== undefined) qIsC1 = true;
    else if (QDEC[m.c0] !== undefined) qIsC1 = false;
    else continue;
    const quote = qIsC1 ? m.c1 : m.c0;
    const usdPer = quote === USDG ? 1 : ethUsd;
    const qdec = QDEC[quote];
    const toUsd = raw => (Math.abs(raw) / Math.pow(10, qdec)) * usdPer;
    const baseAmt = x => qIsC1 ? x.a0 : x.a1;
    const quoteAmt = x => qIsC1 ? x.a1 : x.a0;

    const buys = ev.filter(x => baseAmt(x) > 0), sells = ev.filter(x => baseAmt(x) < 0);
    if (buys.length < 3) continue;

    const bVol = new Map(), bCnt = new Map();
    for (const x of buys) {
      bVol.set(x.w, (bVol.get(x.w) || 0) + toUsd(quoteAmt(x)));
      bCnt.set(x.w, (bCnt.get(x.w) || 0) + 1);
    }
    const sellers = new Set(sells.map(x => x.w));
    const totalV = [...bVol.values()].reduce((s, x) => s + x, 0) || 1;
    const shares = [...bVol.values()].map(v => v / totalV).sort((a, b) => b - a);
    const hhi = shares.reduce((s, x) => s + x * x, 0);

    const buyers = [...bCnt.keys()];
    const repeat = buyers.filter(w => bCnt.get(w) > 1).length;
    const oneshot = buyers.length - repeat;
    const overlap = buyers.filter(w => sellers.has(w)).length;

    // flipper: beli lalu jual dalam jendela yang sama
    const firstBuy = new Map();
    for (const x of buys) if (!firstBuy.has(x.w)) firstBuy.set(x.w, x.blk);
    let flip = 0;
    for (const w of buyers) {
      const fb = firstBuy.get(w);
      if (sells.some(x => x.w === w && x.blk > fb)) flip++;
    }

    // keseragaman gas: proporsi tx yang memakai gasPrice paling umum (tanda bot)
    const gc = new Map();
    for (const x of ev) { const g = gasOf.get(x.tx); if (g) gc.set(g, (gc.get(g) || 0) + 1); }
    const gTot = [...gc.values()].reduce((s, x) => s + x, 0) || 1;
    const gUni = gc.size ? Math.max(...gc.values()) / gTot : 0;

    out.write([pid, buyers.length, sellers.size, (buys.length / buyers.length).toFixed(3),
      shares[0].toFixed(4), shares.slice(0, 3).reduce((s, x) => s + x, 0).toFixed(4), hhi.toFixed(4),
      (repeat / buyers.length).toFixed(4), (oneshot / buyers.length).toFixed(4),
      (flip / buyers.length).toFixed(4), (overlap / buyers.length).toFixed(4),
      gUni.toFixed(4), new Set(ev.map(x => x.w)).size].join(",") + "\n");
    n++;
  }
  out.end();
  console.error(`fitur dompet ditulis: ${n}`);
})();
