"""Merge consecutive windows into ONE dataset so the bot runs as a single continuous account (no boundary resets).

Each pool lives in exactly one window (its birth window, with its full 9 h tail), so concatenation is lossless.
The ETH/USDG price pool appears in every window; duplicates only repeat identical price points.
Usage: python merge_windows.py <out_name> <window> [<window> ...]
"""
import json
import shutil
import sys
from pathlib import Path

DATA = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work/data")


def main():
    out, wins = DATA / sys.argv[1], sys.argv[2:]
    out.mkdir(exist_ok=True)
    for name in ("pools.csv", "swaps_sorted.csv", "liq.csv"):
        with open(out / name, "wb") as fo:
            for i, w in enumerate(wins):
                with open(DATA / w / name, "rb") as fi:
                    head = fi.readline()
                    if i == 0:
                        fo.write(head)
                    shutil.copyfileobj(fi, fo, 1 << 24)
    with open(out / "trades.jsonl", "wb") as fo:
        for w in wins:
            with open(DATA / w / "trades.jsonl", "rb") as fi:
                shutil.copyfileobj(fi, fo, 1 << 24)
    for name in ("swaps_m1.json", "transfers.json", "dev_creator.json"):
        merged = {}
        for w in wins:
            d = json.loads((DATA / w / name).read_text())
            dup = set(d) & set(merged)
            if dup:
                sys.exit(f"{name}: pool in two windows ({len(dup)}), refusing to merge")
            merged.update(d)
        (out / name).write_text(json.dumps(merged))
    print(f"merged {len(wins)} windows into {out}")


if __name__ == "__main__":
    main()
