#!/bin/bash
# Stage everything for the GitHub repo robinhood-final-meme. Nothing is deleted from the server; data is zstd-compressed.
set -euo pipefail
S=/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad
OUT=/root/robinhood-final-meme
mkdir -p $OUT/owner_system $OUT/research $OUT/data $OUT/dashboard

# 1) owner system + all code changes (build outputs and the old .git excluded)
rsync -a --exclude target --exclude .git $S/repo/horiii-debug/ $OUT/owner_system/

# 2) research: scripts, results, logs, chain outputs, temporary experiment outputs
cd $S/rhc_work
rsync -a --exclude '/data/' --exclude '/data_ext/' --exclude '__pycache__/' \
      --include '*/' --include '*.py' --include '*.sh' --include '*.json' --include '*.csv' --include '*.txt' \
      --include '*.html' --include '*.jsonl' --exclude '*' ./ $OUT/research/
mkdir -p $OUT/research/data_level_results
cp data/*.json $OUT/research/data_level_results/ 2>/dev/null || true
cp $S/rhc_dashboard.html $OUT/dashboard/
mkdir -p $OUT/research/bench && cp -r $S/bench/bench.cpp $S/bench/rs/src $S/bench/rs/Cargo.toml $OUT/research/bench/ 2>/dev/null || true

# 3) data: every window, every file, compressed (merged all/ and oct/ are exact copies of w-windows -> merge_windows.py)
compress_dir() {  # $1 = source window dir, $2 = target dir
  mkdir -p "$2"
  for f in "$1"/*; do
    [ -f "$f" ] || continue
    b=$(basename "$f")
    zstd -q -T0 -9 -f "$f" -o "$2/$b.zst"
  done
}
for d in data/w* data/h* data/x*; do compress_dir "$d" "$OUT/data/$(basename $d)"; done
for d in data_ext/*; do compress_dir "$d" "$OUT/data/ext_$(basename $d)"; done
du -sh $OUT/*
find $OUT -type f -size +95M -exec ls -la {} \;
