"""ONE continuous account over the merged dataset (data/all): no window resets, open positions carry over naturally.

Systems:
  official            frozen production model, official settings
  official_retrain    official settings, entry filter retrained every 2 days (arena + new coins closed before the window)
  sysA                frozen model, September-tuned settings (best of tune set A)
  sysA_retrain        tuned settings + retraining
Usage: python continuous.py
"""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from lit_test import X, BASE, load  # noqa: E402

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
REPO = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug")
BOT = REPO / "rhc_vps/bot"
LIVE = REPO / "rust/rhc-live/target/release/rhc-live"
LINE = re.compile(r"beli (\d+) \| tutup (\d+) \| win ([\d.]+)% \| PF ([\d.inf]+) \| akun \$([\d.]+) -> \$([\d.]+) \| DD maks ([\d.]+)%")
WIN = {l.split()[0]: (int(l.split()[1]), int(l.split()[2])) for l in (WORK / "windows.txt").read_text().splitlines() if l.strip()}
WINS = [f"w{i:02d}" for i in range(15)]
FROM, TO = WIN["w00"][0], WIN["w14"][1]
OFFICIAL = {"MAX_POS": "10"}
SYS_A = {"QTHR": "0.80", "MAX_POS": "10", "DANGER_TH": "0.5", "TRAIL_PUNCAK": "0.4", "TUTUP_SAAT_RUG": "1", "DUMP_FRAC": "0.05", "KELLY_MAKS": "0.15"}
THR0 = float(json.loads((BOT / "filter_cat.json").read_text())["thr_start"])


def retrain_last():
    """Scores for w14 with the same walk-forward rule as system_a.py (arena + new coins closed before w14 starts)."""
    from catboost import CatBoostClassifier
    if (WORK / "data" / "w14" / "rscore.csv").exists():
        return
    arena = pd.read_csv(REPO / "rhc_vps/data/arena_feats.csv")
    new = load(WINS)
    ex = {}
    for w in WINS:
        for l in (WORK / "data" / w / "trades.jsonl").read_text().splitlines():
            if '"plan":"v4"' in l:
                t = json.loads(l)
                ex[t["pool"]] = t["exitBlk"]
    new["exit"] = [ex.get(p, np.inf) for p in new.pool]
    known = new[new.exit < WIN["w14"][0]]
    m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False)
    m.fit(np.vstack([X(arena, BASE), X(known, BASE)]), np.concatenate([arena.win.values, (known.ret.values > 1).astype(int)]))
    te = new[new.window == "w14"]
    pd.DataFrame({"pool": te.pool.values, "score": m.predict_proba(X(te, BASE))[:, 1]}).to_csv(WORK / "data" / "w14" / "rscore.csv", index=False)


def run(name, settings, score):
    out = WORK / "chain" / name
    out.mkdir(parents=True, exist_ok=True)
    args = [str(LIVE), "sim", str(WORK / "data" / "all"), str(FROM), str(TO), str(out / "all.jsonl"), "--bot", str(BOT),
            "--akun-out", str(out / "all_akun.json")]
    if score:
        args += ["--skor", str(WORK / "data" / "all" / "rscore.csv"), "--thr0", f"{THR0:.6f}"]
    r = subprocess.run(args, capture_output=True, text=True, env={**os.environ, **settings})
    m = LINE.search(r.stdout)
    if not m:
        return {"system": name, "error": r.stderr[-400:]}
    return {"system": name, "end": float(m[6]), "dd": float(m[7]), "trades": int(m[1]), "win": float(m[3]), "pf": m[4],
            "rejects": r.stdout.split("tolak:")[-1].strip()[:300]}


def main():
    retrain_last()
    pd.concat([pd.read_csv(WORK / "data" / w / "rscore.csv") for w in WINS]).to_csv(WORK / "data" / "all" / "rscore.csv", index=False)
    jobs = [("cont_official", OFFICIAL, False), ("cont_official_retrain", OFFICIAL, True), ("cont_sysA", SYS_A, False), ("cont_sysA_retrain", SYS_A, True),
            ("cont_sysA_retrain_k2", {**SYS_A, "KELLY_MIN": "0.02"}, True), ("cont_official_k2", {**OFFICIAL, "KELLY_MIN": "0.02"}, False)]
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = list(ex.map(lambda j: run(*j), jobs))
    for r in res:
        print(json.dumps(r), flush=True)
    (WORK / "continuous.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
