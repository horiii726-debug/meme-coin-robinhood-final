// Acuan Math.log / Math.log10 dari V8 (Node) untuk menguji port fdlibm di Rust bit-per-bit.
// Keluaran biner: per kasus 3 x float64 LE = [x, Math.log(x), Math.log10(x)].
// Pakai: node math_ref.js <out.bin> [jumlah_acak] [fmt_ref.txt]
const fs = require("fs");
const out = process.argv[2];
const N = +(process.argv[3] || 2000000);

// PRNG deterministik (xorshift32) supaya kasus uji bisa diulang.
let st = 0x9e3779b9 >>> 0;
const rnd32 = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st; };
const buf = new ArrayBuffer(8), dv = new DataView(buf);
const fromWords = (hi, lo) => { dv.setUint32(0, lo, true); dv.setUint32(4, hi, true); return dv.getFloat64(0, true); };

const xs = [];
// 1) pola bit acak, semua eksponen (termasuk subnormal), tanda positif
for (let i = 0; i < N; i++) xs.push(fromWords(rnd32() & 0x7fffffff, rnd32()));
// 2) seragam di [0.5, 2): wilayah reduksi argumen paling sensitif
for (let i = 0; i < N; i++) xs.push(0.5 + 1.5 * (rnd32() / 4294967296));
// 3) sangat dekat 1 (|f| < 2^-20 cabang khusus)
for (let k = -5000; k <= 5000; k++) xs.push(1 + k * Math.pow(2, -52), 1 + k * Math.pow(2, -30), 1 + k * Math.pow(2, -21));
// 4) skala harga / likuiditas memecoin
for (let i = 0; i < N / 4; i++) xs.push(Math.pow(10, -20 + 40 * (rnd32() / 4294967296)));
// 5) kasus khusus
xs.push(0, -0, -1, -1e-300, Infinity, -Infinity, NaN, 1, 2, 10, 0.1, Number.MIN_VALUE, Number.MAX_VALUE, 2.2250738585072014e-308, 2.225073858507201e-308);
for (let e = -323; e <= 308; e++) xs.push(Number("1e" + e));
for (let e = -1074; e <= 1023; e++) xs.push(Math.pow(2, e));

const arr = new Float64Array(xs.length * 3);
for (let i = 0; i < xs.length; i++) {
  const x = xs[i];
  arr[3 * i] = x; arr[3 * i + 1] = Math.log(x); arr[3 * i + 2] = Math.log10(x);
}
fs.writeFileSync(out, Buffer.from(arr.buffer));
console.error(`math_ref: ${xs.length} kasus -> ${out} (node ${process.version}, v8 ${process.versions.v8})`);

// Berkas kedua (opsional): acuan Number.prototype.toString untuk pemformat angka Rust.
// Baris: "<bit hex 16 digit> <String(x)>". Termasuk banyak kasus seri (nilai eksak di tengah
// dua kandidat digit terpendek), mis. bilangan besar dengan pecahan biner pendek.
if (process.argv[4]) {
  const lines = [];
  const bits = x => { dv.setFloat64(0, x, true); return dv.getUint32(4, true).toString(16).padStart(8, "0") + dv.getUint32(0, true).toString(16).padStart(8, "0"); };
  const M = Math.floor(N / 2);
  for (let i = 0; i < M; i++) { const x = fromWords(rnd32() & 0x7fefffff, rnd32()); lines.push(bits(x) + " " + String(x)); }
  for (let i = 0; i < M; i++) { // kandidat seri: bilangan bulat besar + pecahan biner
    const x = Math.floor(rnd32() * 65536 * (1 + rnd32() % 4096)) + (rnd32() % 64) / 64; lines.push(bits(x) + " " + String(x)); }
  for (let i = 0; i < M; i++) { const x = Math.pow(10, -30 + 60 * (rnd32() / 4294967296)); lines.push(bits(x) + " " + String(x)); }
  for (let i = 0; i < M / 4; i++) { const x = (rnd32() * 4294967296 + rnd32()) * 4; lines.push(bits(x) + " " + String(x)); } // > 2^53
  for (const x of [0.1, 0.2, 0.3, 1e21, 1e-7, 1e-6, 123e-20, 5e-324, Number.MAX_VALUE, 2 ** 53, 2 ** 53 + 2, 1 / 3])
    lines.push(bits(x) + " " + String(x));
  fs.writeFileSync(process.argv[4], lines.join("\n") + "\n");
  console.error(`fmt_ref: ${lines.length} kasus -> ${process.argv[4]}`);
}
