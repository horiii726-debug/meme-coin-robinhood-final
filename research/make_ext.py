"""Build an extended-universe window: base data + extra pools (WETH-quoted, native-ETH with 0.5% < fee <= 1%).

WETH is 1:1 ETH with 18 decimals, so WETH-quoted pools are rewritten with WETH -> native (0x0) in pools.csv and the
unchanged engine treats them as ETH pools. WETH/native wrapper pools are dropped. Run the pipeline with MAX_FEE=10000.
Usage: python make_ext.py <window>   -> data/x<NN> (e.g. w03 -> x03)
"""
import shutil
import sys
from pathlib import Path

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
NATIVE = "0x" + "0" * 40
WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e"


def main():
    w = sys.argv[1]
    base, ext, out = WORK / "data" / w, WORK / "data_ext" / w, WORK / "data" / ("x" + w[1:])
    out.mkdir(exist_ok=True)
    rows, n_weth = [], 0
    for l in (ext / "pools.csv").read_text().splitlines()[1:]:
        p = l.split(",")
        c0, c1 = p[1].lower(), p[2].lower()
        if {c0, c1} == {WETH, NATIVE}:
            continue
        if WETH in (c0, c1) and NATIVE not in (c0, c1):
            p[1], p[2] = (NATIVE if c0 == WETH else c0), (NATIVE if c1 == WETH else c1)
            n_weth += 1
        rows.append(",".join(p))
    (out / "pools.csv").write_text("pool_id,c0,c1,fee,tick_spacing,hooks,init_block\n" + "\n".join(rows) + "\n")
    for name in ("swaps_sorted.csv", "liq.csv"):
        with open(out / name, "w") as fo:
            with open(base / name) as fb:
                shutil.copyfileobj(fb, fo, 1 << 24)
            with open(ext / name) as fe:
                next(fe)
                for l in fe:
                    if not l.startswith(ETH_POOL):
                        fo.write(l)
    print(f"{out.name}: {len(rows)} pools listed, {n_weth} WETH-quoted pools mapped to native")


if __name__ == "__main__":
    main()
