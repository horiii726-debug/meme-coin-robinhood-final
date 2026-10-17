#!/usr/bin/env bash
# Buat paket VPS (dijalankan di PC): rhc_paket.tar.gz berisi kode Rust (tanpa folder build), model bot,
# skrip latih ulang, data latih dasar, dan berkas VPS. Tidak berisi data mentah besar maupun hasil uji lokal.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/rhc_paket.tar.gz"
mkdir -p "$ROOT/rhc_vps/data"
cp "$ROOT/data_b/arena_feats.csv" "$ROOT/data_b/arena_feats_okt.csv" "$ROOT/rhc_vps/data/" 2>/dev/null || true
cd "$ROOT"
tar czf "$OUT" \
  --exclude='*/target' --exclude='*/rust_live*' --exclude='*/store' --exclude='*.bak*' --exclude='*/node_modules' \
  rust/port_engine rust/port_features rust/rhc-live rust/rhc-exec/src rust/rhc-exec/Cargo.toml \
  rhc_vps/bot/filter_cat.json rhc_vps/bot/filter_cat_check.json \
  rhc_vps/bot/danger_model.json rhc_vps/bot/danger_check.json rhc_vps/bot/pnaik_model.json rhc_vps/bot/pnaik_check.json \
  rhc_vps/pipeline/latih_ulang.py rhc_vps/vps rhc_vps/data/arena_feats.csv rhc_vps/data/arena_feats_okt.csv rhc_vps/CLAUDE.md
ls -la "$OUT"
