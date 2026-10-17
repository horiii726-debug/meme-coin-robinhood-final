"""System A test: September-tuned settings, with and without walk-forward retraining of the entry filter.

Retraining: before each 2-day window, CatBoost (system params, 34 features) is refit on the official training set
(arena_feats, Aug 2-Sep 17) plus every new coin whose trade CLOSED before that window starts (exitBlk < window start).
Accounts: continuous $100 from 18 Sep to 15 Oct, and October only (fresh $100 at 30 Sep).
Usage: python system_a.py
"""
import json
import os
import re
import subprocess
import sys
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
ALL = [f"w{i:02d}" for i in range(14)]
OCT = ALL[6:]
OFFICIAL = {"MAX_POS": "10"}
SYS_A = {"QTHR": "0.80", "MAX_POS": "10", "DANGER_TH": "0.5", "TRAIL_PUNCAK": "0.4", "TUTUP_SAAT_RUG": "1", "DUMP_FRAC": "0.05", "KELLY_MAKS": "0.15"}


def retrain_scores():
    from catboost import CatBoostClassifier
    arena = pd.read_csv(REPO / "rhc_vps/data/arena_feats.csv")
    new = load(ALL)
    ex = {}
    for w in ALL:
        for l in (WORK / "data" / w / "trades.jsonl").read_text().splitlines():
            if '"plan":"v4"' in l:
                t = json.loads(l)
                ex[t["pool"]] = t["exitBlk"]
    new["exit"] = [ex.get(p, np.inf) for p in new.pool]
    thr0 = {}
    for w in ALL:
        start = WIN[w][0]
        known = new[new.exit < start]
        Xtr = np.vstack([X(arena, BASE), X(known, BASE)]) if len(known) else X(arena, BASE)
        ytr = np.concatenate([arena.win.values, (known.ret.values > 1).astype(int)]) if len(known) else arena.win.values
        m = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0, verbose=0, allow_writing_files=False)
        m.fit(Xtr, ytr)
        te = new[new.window == w]
        pd.DataFrame({"pool": te.pool.values, "score": m.predict_proba(X(te, BASE))[:, 1]}).to_csv(WORK / "data" / w / "rscore.csv", index=False)
        thr0[w] = float(np.quantile(m.predict_proba(Xtr)[:, 1], 0.9))
        print(f"  {w}: retrained on {len(arena)} + {len(known)} closed new coins", flush=True)
    return thr0


def chain(tag, wins, settings, score=None, thr0=None):
    env = {**os.environ, **settings}
    tmp = WORK / "sysa_tmp" / tag
    tmp.mkdir(parents=True, exist_ok=True)
    prev, m, dd = None, None, 0.0
    for w in wins:
        a, b = WIN[w]
        args = [str(LIVE), "sim", str(WORK / "data" / w), str(a), str(b), str(tmp / f"{w}.jsonl"), "--bot", str(BOT), "--akun-out", str(tmp / f"{w}_a.json")]
        if score:
            args += ["--skor", str(WORK / "data" / w / score), "--thr0", f"{thr0[wins[0]] * (0.97 if settings.get('QTHR') == '0.80' else 1):.6f}"]
        if prev:
            args += ["--akun-in", str(prev)]
        r = subprocess.run(args, capture_output=True, text=True, env=env)
        m = LINE.search(r.stdout)
        if not m:
            return None
        dd = max(dd, float(m[7]))
        prev = tmp / f"{w}_a.json"
    return {"end": float(m[6]), "dd": dd, "trades": int(m[1]), "win": float(m[3])}


def main():
    thr0 = retrain_scores()
    rows = []
    for period, wins in (("28 days (18 Sep-15 Oct)", ALL), ("October only (30 Sep-15 Oct)", OCT)):
        for name, settings, score in (("Official (frozen model)", OFFICIAL, None),
                                      ("Official settings + retrain every 2 days", OFFICIAL, "rscore.csv"),
                                      ("System A settings (frozen model)", SYS_A, None),
                                      ("System A + retrain every 2 days", SYS_A, "rscore.csv")):
            r = chain(re.sub(r"\W+", "_", f"{period}_{name}"), wins, settings, score, thr0)
            rows.append({"period": period, "system": name, **(r or {})})
            print(f"{period:30s} {name:42s} $100 -> ${r['end']:>10,.0f} | DD {r['dd']:4.1f}% | trades {r['trades']} | win {r['win']:.1f}%", flush=True)
    (WORK / "system_a.json").write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
