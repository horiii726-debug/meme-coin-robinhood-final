// Pembuat dataset sintetis (deterministik) untuk uji kesamaan kasus tepi JS vs Rust:
// blok/li kembar (stabilitas sort), swap kosong, sqrtP/L nol, harga tak-hingga, transfer ke diri
// sendiri, mint/burn NATIVE, saldo negatif, jumlah raksasa (> 2^53, 1e400 -> Infinity),
// string angka aneh (" 12 ", "+5", "0x1f", "", "abc", "1e3"), angka JSON (bukan string),
// alamat huruf besar, pool c1 = NATIVE (cabang q1), hook non-NATIVE, trade v3 / tanpa swap.
// Pakai: node fuzz_gen.js <dir_root> [nDataset] [nKoinPerDataset] [seed]
const fs = require("fs");
const root = process.argv[2];
const nDs = +(process.argv[3] || 4);
const nCoin = +(process.argv[4] || 400);
let st = (+(process.argv[5] || 12345)) >>> 0 || 1;
const r32 = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st; };
const rnd = () => r32() / 4294967296;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const hex = n => { let s = ""; for (let i = 0; i < n; i++) s += "0123456789abcdef"[ri(0, 15)]; return s; };
const NATIVE = "0x0000000000000000000000000000000000000000";
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const digits = n => { let s = String(ri(1, 9)); for (let i = 1; i < n; i++) s += ri(0, 9); return s; };
const caseMix = a => (rnd() < 0.2 ? a.toUpperCase().replace("0X", "0x") : a);

function bigStr(lo, hi) { return digits(ri(lo, hi)); }
function amtCell() {
  const u = rnd();
  if (u < 0.70) return bigStr(15, 28);
  if (u < 0.78) return bigStr(29, 45);           // > 2^53, banyak digit
  if (u < 0.82) return "0";
  if (u < 0.86) return ri(1, 1e6);               // angka JSON
  if (u < 0.87) return "1e400";                  // -> Infinity
  if (u < 0.88) return pick([" 123 ", "+5", "0x1f", "", "abc", "1e3", "-7", "0b101", "  ", ".5", "5."]);
  if (u < 0.89) return 1e22 * rnd();             // angka JSON pecahan
  return bigStr(5, 20);
}

for (let d = 0; d < nDs; d++) {
  const D = `${root}/fz${d}`;
  fs.mkdirSync(D, { recursive: true });
  const poolsCsv = ["pool_id,c0,c1,fee,tick_spacing,hooks,init_block"];
  const trades = [], sw = {}, tf = {};
  const addrs = Array.from({ length: ri(8, 60) }, () => "0x" + hex(40));
  for (let c = 0; c < nCoin; c++) {
    const pool = "0x" + hex(64);
    const tok = "0x" + hex(40);
    const q1 = rnd() < 0.15;
    const c0 = q1 ? tok : NATIVE, c1 = q1 ? NATIVE : tok;
    const hooks = rnd() < 0.3 ? "0x" + hex(40).toUpperCase() : NATIVE;
    const fee = pick(["500", "3000", "10000", "8388608", "999060", "0x10", " 100", "abc"]);
    poolsCsv.push([caseMix(pool), caseMix(c0), caseMix(c1), fee, ri(1, 200), caseMix(hooks), ri(1, 1e7)].join(","));
    const init = 25000000 + ri(0, 1e6);
    const ethUsd = 1500 + 1000 * rnd();
    trades.push(JSON.stringify({ plan: "v3", pool, init, ethUsd }));
    trades.push(JSON.stringify({ plan: "v4", pool, init, ethUsd, entryBlk: init + 630 }));
    const kind = rnd();
    if (kind < 0.04) continue;                        // tanpa swaps -> dilewati
    // swaps
    const ns = kind < 0.08 ? 0 : ri(1, kind < 0.5 ? 6 : 80);
    const blkSpan = ri(1, 40);
    const rows = [];
    let sqrtP = BigInt(digits(ri(26, 31)));
    for (let i = 0; i < ns; i++) {
      const buy = rnd() < 0.6;
      const qa = digits(ri(14, 20)), ba = digits(ri(18, 28));
      const a0 = q1 ? (buy ? ba : "-" + ba) : (buy ? "-" + qa : qa);
      const a1 = q1 ? (buy ? "-" + qa : qa) : (buy ? ba : "-" + ba);
      const step = BigInt(Math.floor(rnd() * 1e6)) - 500000n;
      sqrtP = sqrtP + (sqrtP * step) / 10000000n;
      if (sqrtP <= 0n) sqrtP = 1n;
      let sp = sqrtP.toString();
      const u = rnd();
      if (u < 0.02) sp = "0";
      const L = u > 0.98 ? "0" : digits(ri(18, 26));
      const r = [init + ri(0, blkSpan), ri(0, 4), rnd() < 0.03 ? "0" : a0, a1, sp, L, ri(100, 10000)];
      if (rnd() < 0.02) r[2] = ri(-1e9, 1e9);       // angka JSON
      rows.push(r);
    }
    sw[pool] = rows;
    // transfers
    if (kind > 0.96) { tf[pool] = { token: tok, tr: [] }; continue; }
    const nt = ri(0, kind < 0.3 ? 8 : 300);
    const tr = [];
    const party = () => { const u = rnd(); return u < 0.25 ? PM : u < 0.33 ? NATIVE : caseMix(pick(addrs)); };
    for (let i = 0; i < nt; i++) {
      let fr = party(), to = party();
      if (rnd() < 0.03) to = fr;                     // transfer ke diri sendiri
      tr.push([init + ri(0, blkSpan), ri(0, 6), fr, to, amtCell()]);
    }
    tf[pool] = { token: tok, tr };
  }
  fs.writeFileSync(`${D}/pools.csv`, poolsCsv.join("\n") + "\n");
  fs.writeFileSync(`${D}/trades.jsonl`, trades.join("\n") + "\n");
  fs.writeFileSync(`${D}/swaps_m1.json`, JSON.stringify(sw));
  fs.writeFileSync(`${D}/transfers.json`, JSON.stringify(tf));
}
console.error(`fuzz: ${nDs} dataset x ${nCoin} koin -> ${root}`);
