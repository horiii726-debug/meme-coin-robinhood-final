// Bandingkan keluaran JS (dump_js.js) vs Rust (feat_dump): semua koin x semua fitur.
// Lolos hanya jika: jumlah baris sama, ds/i/pool sama per baris, kunci fitur sama & berurutan,
// NaN<->NaN, Infinity<->Infinity, dan selisih relatif maks < 1e-9 untuk nilai hingga.
// Pakai: node compare.js <js.jsonl> <rust.jsonl>
const fs = require("fs");
const FE = JSON.parse(fs.readFileSync("C:/Users/horii/rhc-quant/rhc_vps/bot/filter_cat.json", "utf8")).feats;
const [a, b] = process.argv.slice(2);
const A = fs.readFileSync(a, "utf8").trim().split("\n");
const B = fs.readFileSync(b, "utf8").trim().split("\n");
const TOL = 1e-9;
const dec = v => (typeof v === "number" ? v : v === "NaN" ? NaN : v === "Infinity" ? Infinity : v === "-Infinity" ? -Infinity : v === "-0" ? -0 : undefined);

let fail = [], nVals = 0, nBit = 0, nNaN = 0, maxRel = 0, maxAt = null, linesIdentical = 0;
const perKey = {};
if (A.length !== B.length) fail.push(`jumlah baris beda: js=${A.length} rust=${B.length}`);
const n = Math.min(A.length, B.length);
for (let r = 0; r < n; r++) {
  if (A[r] === B[r]) linesIdentical++;
  const x = JSON.parse(A[r]), y = JSON.parse(B[r]);
  if (x.ds !== y.ds || x.i !== y.i || x.pool !== y.pool) { fail.push(`baris ${r}: identitas beda ${x.ds}/${x.i}/${x.pool} vs ${y.ds}/${y.i}/${y.pool}`); continue; }
  const kx = Object.keys(x.f), ky = Object.keys(y.f);
  if (kx.join() !== ky.join()) { fail.push(`baris ${r}: daftar kunci beda`); continue; }
  for (const k of FE) if (!(k in x.f)) fail.push(`baris ${r}: fitur model ${k} tidak ada`);
  for (const k of kx) {
    const u = dec(x.f[k]), v = dec(y.f[k]);
    nVals++;
    perKey[k] = perKey[k] || { n: 0, nan: 0, bit: 0, maxRel: 0 };
    const pk = perKey[k]; pk.n++;
    if (u === undefined || v === undefined) { fail.push(`baris ${r} ${k}: nilai tak dikenal ${x.f[k]} / ${y.f[k]}`); continue; }
    if (Number.isNaN(u) || Number.isNaN(v)) {
      if (Number.isNaN(u) && Number.isNaN(v)) { nNaN++; pk.nan++; nBit++; pk.bit++; }
      else fail.push(`baris ${r} ${x.ds}/${x.pool} ${k}: NaN tidak cocok js=${x.f[k]} rust=${y.f[k]}`);
      continue;
    }
    if (Object.is(u, v)) { nBit++; pk.bit++; continue; }
    if (!Number.isFinite(u) || !Number.isFinite(v)) { fail.push(`baris ${r} ${k}: tak-hingga beda js=${u} rust=${v}`); continue; }
    const rel = Math.abs(u - v) / Math.max(Math.abs(u), Math.abs(v));
    if (rel > pk.maxRel) pk.maxRel = rel;
    if (rel > maxRel) { maxRel = rel; maxAt = `${x.ds}/${x.pool} ${k} js=${u} rust=${v}`; }
    if (!(rel < TOL)) fail.push(`baris ${r} ${x.ds}/${x.pool} ${k}: rel=${rel.toExponential(3)} js=${u} rust=${v}`);
  }
}
const byDs = {};
for (const l of A) { const ds = JSON.parse(l).ds; byDs[ds] = (byDs[ds] || 0) + 1; }
console.log(`baris(koin): js=${A.length} rust=${B.length} | per ds: ${JSON.stringify(byDs)}`);
console.log(`nilai dibandingkan=${nVals} | identik bit=${nBit} (termasuk NaN<->NaN=${nNaN}) | baris teks identik byte=${linesIdentical}/${n}`);
console.log(`selisih relatif maks=${maxRel}${maxAt ? " di " + maxAt : ""}`);
const notBit = Object.entries(perKey).filter(([, p]) => p.bit !== p.n);
if (notBit.length) console.log("fitur tidak identik bit:", JSON.stringify(Object.fromEntries(notBit)));
if (fail.length) {
  console.log(`GAGAL: ${fail.length} masalah`);
  for (const f of fail.slice(0, 30)) console.log("  " + f);
  process.exit(1);
}
console.log("LOLOS: semua koin x semua fitur cocok (toleransi relatif < 1e-9)");
