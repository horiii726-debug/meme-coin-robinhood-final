#!/usr/bin/env bash
# Uji kesamaan lengkap JS (filter_feats.js asli) vs Rust (port_features).
# Jalankan dari Git Bash:  bash C:/Users/horii/rhc-quant/rust/port_features/acuan/uji_kesamaan.sh
# Gagal (exit != 0) jika ada satu saja perbedaan.
set -euo pipefail
CRATE="C:/Users/horii/rhc-quant/rust/port_features"
CARGO="C:/Users/horii/.cargo/bin/cargo.exe"
cd "$CRATE"
mkdir -p out

echo "== 1. build + unit test"
"$CARGO" build --release 2>&1 | tail -1
"$CARGO" test --release --lib 2>&1 | grep -E "^test result"

echo "== 2. Math.log / Math.log10 / Number.toString: V8 vs port Rust (bit per bit)"
node acuan/math_ref.js out/math_ref.bin 2000000 out/fmt_ref.txt
./target/release/math_check.exe out/math_ref.bin out/fmt_ref.txt
rm -f out/math_ref.bin out/fmt_ref.txt   # berkas acuan besar (~220 MB), dibuat ulang tiap uji

echo "== 3. dataset nyata: m1 m2 u_ds5d u_ds24 ags1 ags4"
node acuan/dump_js.js out/js.jsonl
./target/release/feat_dump.exe out/rust.jsonl
node acuan/compare.js out/js.jsonl out/rust.jsonl
cmp out/js.jsonl out/rust.jsonl && echo "keluaran byte-identik"

echo "== 4. dataset sintetis kasus tepi (3 seed)"
for seed in 12345 777 31337; do
  rm -rf out/fuzz
  node acuan/fuzz_gen.js out/fuzz 4 400 "$seed"
  node acuan/dump_js.js out/fz_js.jsonl --root out/fuzz fz0 fz1 fz2 fz3
  ./target/release/feat_dump.exe out/fz_rust.jsonl --root out/fuzz fz0 fz1 fz2 fz3
  node acuan/compare.js out/fz_js.jsonl out/fz_rust.jsonl
  cmp out/fz_js.jsonl out/fz_rust.jsonl && echo "seed $seed: keluaran byte-identik"
done
rm -rf out/fuzz
echo "SEMUA UJI KESAMAAN LOLOS"
