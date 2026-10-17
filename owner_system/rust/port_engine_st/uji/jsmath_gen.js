// Buat kasus uji semantik angka JS (Node/V8) untuk jsmath_selftest (Rust).
// Pakai: node jsmath_gen.js <out.txt> [n]
const fs = require("fs");
const out = process.argv[2], N = +(process.argv[3] || 200000);
const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer);
const hb = x => { f64[0] = x; return u64[0].toString(16).padStart(16, "0"); };
// PRNG deterministik (xorshift) supaya kasus bisa diulang
let s = 0x9e3779b97f4a7c15n;
const rnd64 = () => { s ^= (s << 13n) & 0xffffffffffffffffn; s ^= s >> 7n; s ^= (s << 17n) & 0xffffffffffffffffn; return s; };
const rnd = () => Number(rnd64() >> 11n) / 2 ** 53;
const randBits = () => { u64[0] = rnd64(); return f64[0]; };
const L = [];
const specials = [0, -0, 1, -1, 0.5, 2, Math.E, 1e-300, 5e-324, -5e-324, 1e300, Infinity, -Infinity, NaN, 709.78, 709.79, -745.1, -745.2, 2 ** -28, 0.34657, 1.03972, 1.0000001, 0.9999999];
for (const x of specials) { L.push(`exp\t${hb(x)}\t${hb(Math.exp(x))}`); L.push(`log\t${hb(x)}\t${hb(Math.log(x))}`); }
for (let i = 0; i < N; i++) {
  const a = (rnd() - 0.5) * 60; L.push(`exp\t${hb(a)}\t${hb(Math.exp(a))}`);
  const b = (rnd() - 0.5) * 1500; L.push(`exp\t${hb(b)}\t${hb(Math.exp(b))}`);
  const c = randBits(); L.push(`exp\t${hb(c)}\t${hb(Math.exp(c))}`);
  const d = Math.exp((rnd() - 0.5) * 40); L.push(`log\t${hb(d)}\t${hb(Math.log(d))}`);
  const e = Math.abs(randBits()); L.push(`log\t${hb(e)}\t${hb(Math.log(e))}`);
  const g = 1 + (rnd() - 0.5) * 1e-5; L.push(`log\t${hb(g)}\t${hb(Math.log(g))}`);
}
// toFixed: nilai acak, nilai seri (kelipatan 2^-m), nilai dekat batas pembulatan, besar, negatif
for (let i = 0; i < N; i++) {
  const k = i % 5;
  const cands = [
    (rnd() - 0.5) * 10 ** (rnd() * 8 - 2),
    Math.round((rnd() - 0.5) * 1e6) / 2 ** (1 + (i % 12)),
    (Math.floor(rnd() * 1e6) + 0.5) / 10 ** k,
    (rnd() - 0.5) * 1e22, randBits(),
    Math.log(rnd() * 100 + 1e-9),
  ];
  for (const x of cands) L.push(`fix\t${hb(x)}\t${k}\t${hb(parseFloat(x.toFixed(k)))}`);
}
for (let i = 0; i < N; i++) {
  const cands = [randBits(), (rnd() - 0.5) * 10 ** (rnd() * 50 - 25), rnd() * 1000, Math.round(rnd() * 1e6), 0.1 * Math.round(rnd() * 100), 1e21, 1e-7, 1e-6, 123e-9];
  for (const x of cands) L.push(`str\t${hb(x)}\t${String(x)}`);
}
const strs = ["", " ", " 12 ", "12", "-12", "+12", "1.5", ".5", "5.", "-.5", "1e5", "1E-5", "1e", "e5", "abc", "0x1f", "0X1F", "0b101", "0o17", "-0x1f", "Infinity", "-Infinity", "+Infinity", "inf", "nan", "NaN", "1,2", "\t7\n", "1_000",
  "1201920018950851653924242154881546", "45511120289441348798092", "-142415982700000000", "30991340196315490327325313", "79228162514264337593543950336", "0.1", "0.30000000000000004", "9007199254740993", "1e400", "-1e400", "1e-400"];
for (const t of strs) L.push(`num\t${t.replace(/\t/g, " ").replace(/\n/g, " ")}\t${hb(+t.replace(/\t/g, " ").replace(/\n/g, " "))}`);
for (let i = 0; i < N; i++) {
  let d = ""; const len = 1 + Math.floor(rnd() * 40); for (let j = 0; j < len; j++) d += Math.floor(rnd() * 10);
  if (rnd() < 0.3) d = "-" + d;
  L.push(`num\t${d}\t${hb(+d)}`);
  L.push(`big\t${d}\t${hb(Number(BigInt(d)))}`);
  const fl = (rnd() * 1e6).toString() + "e" + Math.floor(rnd() * 40 - 20); L.push(`num\t${fl}\t${hb(+fl)}`);
}
const h32 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
for (let i = 0; i < N / 10; i++) { const t = "0x" + rnd64().toString(16) + "|v4|exit|" + (i % 5); L.push(`h32\t${t}\t${hb(h32(t))}`); }
const mm = [NaN, 0, -0, 1, -1, 1e-9, Infinity, -Infinity];
for (const a of mm) for (const b of mm) { L.push(`max\t${hb(a)}\t${hb(b)}\t${hb(Math.max(a, b))}`); L.push(`min\t${hb(a)}\t${hb(b)}\t${hb(Math.min(a, b))}`); }
for (let i = 0; i < N / 10; i++) { const a = (rnd() - 0.5) * 100, b = Math.round(a * 2) / 2; L.push(`rnd\t${hb(a)}\t${hb(Math.round(a))}`); L.push(`rnd\t${hb(b)}\t${hb(Math.round(b))}`); }
for (const a of [0.49999999999999994, -0.5, 0.5, -0.49999999999999994, 2.5, -2.5, -0, 1e300]) L.push(`rnd\t${hb(a)}\t${hb(Math.round(a))}`);
fs.writeFileSync(out, L.join("\n") + "\n");
console.error(`kasus: ${L.length}`);
