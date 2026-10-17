// Selang kepercayaan Wilson 95% -- seberapa jauh angka presisi itu bisa meleset?
function wilson(h, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = h / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const m = (z / d) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
const cases = [
  ["netflow>=0.39 & gap_std>=79.7", 2, 3],
  ["ret_w>=2.89 & ada hook", 3, 5],
  ["netflow>=0.39 & accel>=1.27", 3, 5],
  ["lp_growth>=2.04 & ada hook", 2, 5],
  ["lp_entry<13242 & ret_w>=2.89", 4, 9],
  ["lp_entry<9708 & ret_w>=2.89", 3, 8],
];
console.log("aturan (hasil di data uji)".padEnd(34) + "kena/n   presisi   selang 95%        cukup utk klaim 50%?");
console.log("-".repeat(100));
for (const [name, h, n] of cases) {
  const [lo, hi] = wilson(h, n);
  const ok = lo >= 0.5 ? "YA" : "TIDAK (batas bawah " + (100*lo).toFixed(0) + "%)";
  console.log(name.padEnd(34) + (h + "/" + n).padEnd(8) + (100*h/n).toFixed(0).padStart(5) + "%    "
    + (100*lo).toFixed(0).padStart(3) + "% - " + (100*hi).toFixed(0).padStart(3) + "%      " + ok);
}
console.log("\nBerapa sampel yang DIBUTUHKAN untuk membuktikan presisi >=50%?");
for (const p of [0.55, 0.6, 0.65]) {
  let n = 5;
  while (n < 5000) { const [lo] = wilson(Math.round(p * n), n); if (lo >= 0.5) break; n++; }
  console.log(`  kalau presisi sebenarnya ${(100*p).toFixed(0)}% -> butuh ${n} trade untuk yakin`);
}
