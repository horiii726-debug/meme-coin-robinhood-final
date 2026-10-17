"""Walk-forward 'one system' backtest: the bot learns continuously, never sees the future.

Stages (run in order, each skips work already done):
  prepare      per window: exit-model training rows (state_rows.js) + minute-1 features (feat_dump)
  exitmodels   per window k: danger / up models trained ONLY on rows whose label horizon ended before window k
  replay       per window k: counterfactual trade for every candidate coin, using window k's exit models
  scores       causal entry-filter scores: CatBoost retrained every RETRAIN newly-closed coins
  sim          continuous $100 account across all windows (equity, Kelly, dev history carried over)

Usage: python wf.py <stage> [--settings KEY=VAL ...] [--tag NAME] [--windows FILE]
"""
import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
REPO = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug")
DATA = WORK / "data"
MODELS = WORK / "wf_models"
PIPE = REPO / "rhc_vps/pipeline"
BOT = REPO / "rhc_vps/bot"
LIVE = REPO / "rust/rhc-live/target/release/rhc-live"
REPLAY = REPO / "rust/port_engine/target/release/replay"
FEAT_DUMP = REPO / "rust/port_features/target/release/feat_dump"
NODE = sorted(Path("/opt/nvm/versions/node").glob("*/bin/node"))[-1]

HZ = 324000            # 9 h hold limit in blocks
LABEL_HZ = 18000       # exit-model labels look 30 min ahead
DECIDE = 600           # entry decision at init + 1 minute
MIN_EXIT_POOLS = 150   # below this, no exit ML (like the owner's first walk-forward stage)
MAX_EXIT_ROWS = 800_000
RETRAIN = 100          # entry filter retrain every 100 newly-closed coins
MIN_START = 60         # entry filter needs 60 labels before scoring
FEATS = json.loads((BOT / "filter_cat.json").read_text())["feats"]
AUDIT = '{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000,"failBuy":0.0185,"failSell":0.0054}'


def windows(path):
    rows = [l.split() for l in Path(path).read_text().splitlines() if l.strip()]
    rows = [(n, int(a), int(b)) for n, a, b in rows]
    return sorted(rows, key=lambda r: r[1])


def ready(name):
    d = DATA / name
    return all((d / f).exists() for f in ("swaps_sorted.csv", "trades.jsonl", "swaps_m1.json", "transfers.json"))


def sh(cmd, cwd=None, env=None):
    r = subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})}, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip().splitlines()[-1:] or [""]


# ---------------------------------------------------------------- prepare
def prepare(wins):
    def one(w):
        name, a, b = w
        d = DATA / name
        out = []
        if not (d / "state_rows.csv").exists():
            rc, msg = sh([str(NODE), "--max-old-space-size=16000", "state_rows.js"], cwd=PIPE,
                         env={"DIR": str(d), "SPLIT": "99999999", "ENDBLK": str(b + HZ), "OUT": str(d / "state_rows.tmp")})
            if rc == 0:
                (d / "state_rows.tmp").rename(d / "state_rows.csv")
            out.append(f"state_rows {msg[0]}")
        if not (d / "features.jsonl").exists():
            rc, msg = sh([str(FEAT_DUMP), str(d / "features.tmp"), "--root", str(DATA), name])
            if rc == 0:
                (d / "features.tmp").rename(d / "features.jsonl")
            out.append(f"features {msg[0]}")
        return f"{name}: " + " | ".join(out)
    todo = [w for w in wins if ready(w[0])]
    with ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(one, todo):
            print(r, flush=True)


# ---------------------------------------------------------------- exit models
def export_hgb(m, feats, note):
    trees = [{k: it[0].nodes[k].tolist() for k in ("value", "feature_idx", "num_threshold", "missing_go_to_left", "left", "right", "is_leaf")}
             for it in m._predictors]
    return {"feats": feats, "baseline": float(np.ravel(m._baseline_prediction)[0]), "trees": trees, "note": note}


def exit_models(wins):
    from sklearn.ensemble import HistGradientBoostingClassifier
    MODELS.mkdir(exist_ok=True)
    cache = {}
    for k, (name, a, b) in enumerate(wins):
        dst = MODELS / f"{name}_danger.json"
        if dst.exists() or (MODELS / f"{name}_none").exists():
            continue
        parts = []
        for pname, _, _ in wins[:k]:
            f = DATA / pname / "state_rows.csv"
            if not f.exists():
                continue
            if pname not in cache:
                cache[pname] = pd.read_csv(f)
            d = cache[pname]
            parts.append(d[d.blk + LABEL_HZ < a])           # label fully known before window k starts
        if not parts or sum(p.pid.nunique() for p in parts) < MIN_EXIT_POOLS:
            (MODELS / f"{name}_none").touch()
            print(f"{name}: no exit ML yet ({sum(p.pid.nunique() for p in parts) if parts else 0} pools)", flush=True)
            continue
        d = pd.concat(parts, ignore_index=True).sort_values("blk")
        if len(d) > MAX_EXIT_ROWS:
            d = d.iloc[-MAX_EXIT_ROWS:]                      # most recent rows (adapts to regime drift)
        fe = [c for c in d.columns if c not in ("pid", "period", "blk", "fmax30", "f5", "rug10")]
        X = d[fe].replace([np.inf, -np.inf], np.nan).astype(float).fillna(-1).values
        for label, y in (("danger", ((d.f5 <= 0.7) | (d.rug10 == 1)).astype(int).values),
                         ("up", (d.fmax30 >= 1.5).astype(int).values)):
            m = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, max_depth=5, max_leaf_nodes=24, min_samples_leaf=80,
                                               l2_regularization=5.0, early_stopping=True, validation_fraction=0.15,
                                               n_iter_no_change=40, random_state=7)
            m.fit(X, y)
            (MODELS / f"{name}_{label}.json").write_text(json.dumps(export_hgb(m, fe, f"walk-forward {label} for {name}: rows before block {a}")))
        print(f"{name}: exit models from {len(d)} rows / {d.pid.nunique()} pools", flush=True)


def exit_env(name):
    if (MODELS / f"{name}_none").exists():
        return {"DANGER_TH": "1.1", "UP_TH": "1", "TP_UP": "1", "DANGER_FILE": str(BOT / "danger_model.json"), "UP_FILE": ""}
    return {"DANGER_TH": "0.4", "UP_TH": "0.5", "TP_UP": "0.5",
            "DANGER_FILE": str(MODELS / f"{name}_danger.json"), "UP_FILE": str(MODELS / f"{name}_up.json")}


# ---------------------------------------------------------------- replay with WF exit models
def replay(wins):
    def one(w):
        name, a, b = w
        d = DATA / name
        if (d / "trades_wf.jsonl").exists():
            return f"{name}: cached"
        rc, msg = sh([str(REPLAY), str(d), str(a), str(b + HZ), str(d / "trades_wf.tmp"), "auto"], cwd=PIPE,
                     env={**exit_env(name), "AUDIT": AUDIT})
        if rc == 0:
            (d / "trades_wf.tmp").rename(d / "trades_wf.jsonl")
        return f"{name}: {msg[0]}"
    todo = [w for w in wins if ready(w[0]) and ((MODELS / f"{w[0]}_danger.json").exists() or (MODELS / f"{w[0]}_none").exists())]
    with ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(one, todo):
            print(r, flush=True)


# ---------------------------------------------------------------- causal entry scores
def load_coins(wins):
    rows = []
    for name, a, b in wins:
        d = DATA / name
        if not (d / "features.jsonl").exists() or not (d / "trades_wf.jsonl").exists():
            continue
        tr = {}
        for l in (d / "trades_wf.jsonl").read_text().splitlines():
            t = json.loads(l)
            if t.get("plan") == "v4":
                tr[t["pool"]] = t
        for l in (d / "features.jsonl").read_text().splitlines():
            j = json.loads(l)
            t = tr.get(j["pool"])
            if t is None:
                continue
            f = {k: (float(v) if not isinstance(v, str) else np.nan) for k, v in j["f"].items()}
            rows.append({"window": name, "pool": j["pool"], "decide": t["init"] + DECIDE, "exit": t["exitBlk"],
                         "ret": t["ret"], **{k: f.get(k, np.nan) for k in FEATS}})
    return pd.DataFrame(rows).sort_values("decide").reset_index(drop=True)


def scores(wins, tag):
    from catboost import CatBoostClassifier
    df = load_coins(wins)
    X = df[FEATS].replace([np.inf, -np.inf], np.nan).fillna(-1).values
    y = (df.ret > 1.0).values
    decide, exitb = df.decide.values, df.exit.values
    order_exit = np.sort(exitb)
    sc = np.full(len(df), np.nan)
    model, trained_at, n_fits = None, 0, 0
    for i in range(len(df)):
        n_known = int(np.searchsorted(order_exit, decide[i], side="left"))   # coins closed strictly before decision
        if n_known >= MIN_START and (model is None or n_known - trained_at >= RETRAIN):
            idx = np.where(exitb < decide[i])[0]
            if len(set(y[idx])) > 1:
                model = CatBoostClassifier(iterations=200, learning_rate=0.05, depth=4, l2_leaf_reg=5.0, random_seed=0,
                                           verbose=0, allow_writing_files=False, thread_count=16)
                model.fit(X[idx], y[idx])
                trained_at, n_fits = n_known, n_fits + 1
        if model is not None:
            sc[i] = model.predict_proba(X[i:i + 1])[0, 1]
    df["score"] = sc
    for name, g in df.groupby("window"):
        g[["pool", "score"]].to_csv(DATA / name / f"scores_{tag}.csv", index=False)
    df.drop(columns=FEATS).to_csv(WORK / f"coins_{tag}.csv", index=False)
    print(f"entry filter retrained {n_fits}x | coins scored {np.isfinite(sc).sum()}/{len(df)}", flush=True)


# ---------------------------------------------------------------- continuous account
SIM_RE = r"beli (\d+) \| tutup (\d+) \| win ([\d.]+)% \| PF ([\d.inf]+) \| akun \$([\d.]+) -> \$([\d.]+) \| DD maks ([\d.]+)%"


def sim(wins, tag, settings, out_tag, reset_each=False):
    import re
    env = dict(s.split("=", 1) for s in settings)
    prev = None
    res = []
    for name, a, b in wins:
        d = DATA / name
        sc = d / f"scores_{tag}.csv"
        if not sc.exists():
            continue
        args = [str(LIVE), "sim", str(d), str(a), str(b), str(d / f"simwf_{out_tag}.jsonl"), "--bot", str(BOT),
                "--skor", str(sc), "--thr0", "1.01", "--akun-out", str(d / f"akun_{out_tag}.json")]
        if (MODELS / f"{name}_none").exists():
            env_w = {**env, "DANGER_TH": "1.1", "UP_TH": "1", "TP_UP": "1"}
            args += ["--naik", "-"]
        else:
            env_w = dict(env)
            args += ["--danger", str(MODELS / f"{name}_danger.json"), "--naik", str(MODELS / f"{name}_up.json")]
        if prev is not None and not reset_each:
            args += ["--akun-in", str(prev)]
        r = subprocess.run(args, capture_output=True, text=True, env={**os.environ, **env_w})
        m = re.search(SIM_RE, r.stdout)
        if not m:
            print(f"{name}: sim failed {r.stderr[-200:]}", flush=True)
            break
        rec = {"window": name, "buys": int(m[1]), "win": float(m[3]), "pf": float(m[4]), "start": float(m[5]),
               "end": float(m[6]), "dd": float(m[7])}
        res.append(rec)
        prev = d / f"akun_{out_tag}.json"
    pd.DataFrame(res).to_csv(WORK / f"sim_{out_tag}.csv", index=False)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stage")
    ap.add_argument("--windows", default=str(WORK / "windows_all.txt"))
    ap.add_argument("--tag", default="wf")
    ap.add_argument("--out", default="base")
    ap.add_argument("--settings", nargs="*", default=[])
    ap.add_argument("--reset", action="store_true")
    a = ap.parse_args()
    wins = windows(a.windows)
    if a.stage == "prepare":
        prepare(wins)
    elif a.stage == "exitmodels":
        exit_models([w for w in wins if (DATA / w[0] / "state_rows.csv").exists()])
    elif a.stage == "replay":
        replay(wins)
    elif a.stage == "scores":
        scores(wins, a.tag)
    elif a.stage == "sim":
        for r in sim(wins, a.tag, a.settings, a.out, a.reset):
            print(json.dumps(r), flush=True)
    else:
        sys.exit("unknown stage")


if __name__ == "__main__":
    main()
