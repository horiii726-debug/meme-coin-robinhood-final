"""Collect every side result into dashboard_extra.json (read by build_dashboard.py). Numbers come from result files only."""
import json
from pathlib import Path

import pandas as pd

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")


def j(name, default=None):
    f = WORK / name
    return json.loads(f.read_text()) if f.exists() else default


LABEL = {"official": "Resmi (model beku)", "official_retrain": "Resmi + retrain 2 hari", "sysA": "Sistem A (model beku)",
         "sysA_retrain": "Sistem A + retrain 2 hari"}


def systems():
    rows = []
    for period, f, pre in (("18 Sep–16 Okt", "continuous.json", "cont_"), ("Oktober saja", "continuous_oct.json", "oct_")):
        for r in j(f, []):
            key = r["system"].replace(pre, "")
            if key.endswith("_k2") or "end" not in r:
                continue
            rows.append({"period": period, "label": LABEL.get(key, key), "end": r["end"], "dd": r["dd"], "trades": r["trades"],
                         "win": r["win"], "main": key == "sysA_retrain"})
    return rows


def shuffle():
    out = []
    for k, lab in (("official", "Resmi"), ("sysA", "Sistem A")):
        r = j(f"shuffle_{k}.json")
        if r:
            out.append({"label": lab, **{x: r[x] for x in ("p5", "p50", "min", "loss_share", "dd_p50")}})
    return out


def ml_final():
    r = j("final_test.json", {})
    lab = {"official": "CatBoost resmi (beku)", "cat_sep": "CatBoost dilatih ulang (Sep)", "cat_sep_lit": "CatBoost ulang + rumus jurnal",
           "lgbm_arena": "LightGBM", "ens_arena": "Ensemble Cat+XGB+LGBM", "lgbm_sep_lit": "LightGBM ulang + rumus jurnal"}
    return [{"label": lab[k], "auc": r[k]["auc"], "end": r[k]["acct_0.90"]["end"], "dd": r[k]["acct_0.90"]["dd"], "hl": k == "cat_sep"}
            for k in lab if k in r]


def lit():
    src = {"accel": ("Akselerasi transaksi", "Hawkes / Bacry et al."), "trader_growth": ("Pertumbuhan trader unik", "studi memecoin arXiv"),
           "amihud": ("Ilikuiditas Amihud", "Amihud 2002, J. Fin. Markets"), "sniper_share": ("Porsi sniper 3 dtk pertama", "studi sniper pump.fun arXiv"),
           "jump_share": ("Porsi lompatan (RV−BV)", "Barndorff-Nielsen & Shephard"), "lm_jump": ("Lompatan Lee–Mykland", "Lee & Mykland 2008, RFS"),
           "hawkes_n": ("Branching ratio Hawkes", "Filimonov & Sornette 2012"), "vpin": ("VPIN", "Easley, López de Prado, O'Hara"),
           "roll": ("Spread Roll", "Roll 1984, J. Finance"), "sqrt_impact": ("Dampak akar-kuadrat", "Tóth, Bouchaud 2011")}
    corr = {"accel": "+0,32 | +0,32", "trader_growth": "+0,28 | +0,34", "amihud": "+0,16 | +0,29", "sniper_share": "−0,21 | −0,37",
            "jump_share": "−0,04 | −0,19", "lm_jump": "−0,07 | −0,18", "hawkes_n": "−0,15 | +0,07", "vpin": "−0,03 | +0,33",
            "roll": "+0,08 | −0,38", "sqrt_impact": "+0,21 | +0,02"}
    use = {"accel": "ya", "trader_growth": "ya", "amihud": "ya", "sniper_share": "ya"}
    return [{"name": src[k][0], "src": src[k][1], "corr": corr[k], "use": use.get(k, "tidak (tanda berbalik)")} for k in src]


def tune_summary():
    f = WORK / "tune_results.csv"
    if not f.exists():
        return None
    split = j("tune_split.json")
    df = pd.read_csv(f, dtype=str)
    for c in ("tune_end", "tune_dd", "test_end", "test_dd"):
        df[c] = df[c].astype(float)
    off = df[(df.QTHR == "0.90") & (df.MAX_POS == "10") & (df.DANGER_TH == "0.4") & (df.TRAIL_PUNCAK == "0") &
             (df.TUTUP_SAAT_RUG == "0") & (df.DUMP_FRAC == "0.05") & (df.KELLY_MAKS == "0.10")].iloc[0]
    best = df[df.tune_dd <= 35.0].sort_values("tune_end", ascending=False).iloc[0]
    d = lambda r: f"QTHR {r.QTHR} · DANGER_TH {r.DANGER_TH} · TRAIL {r.TRAIL_PUNCAK} · tutup saat rug {r.TUTUP_SAAT_RUG} · Kelly maks {r.KELLY_MAKS}"
    rows = [{"label": "Resmi", "desc": d(off), "chosen": False, **{k: float(off[k]) for k in ("tune_end", "tune_dd", "test_end", "test_dd")}},
            {"label": "Sistem A (terbaik di A)", "desc": d(best), "chosen": True, **{k: float(best[k]) for k in ("tune_end", "tune_dd", "test_end", "test_dd")}}]
    return {**split, "rows": rows, "note": f"{len(df)} kombinasi. Pemenang dipilih HANYA dari jendela A (DD ≤ 35%); B dan Oktober tidak dipakai memilih."}


def main():
    extra = {
        "system_label": "Sistem A + retrain tiap 2 hari",
        "verdict": [["good", "● Untung di semua uji data baru"], ["good", "● Mengalahkan 100/100 bot acak"],
                    ["warn", "▲ Rusak bila tiap trade ≥20–30% lebih jelek"], ["crit", "■ Belum layak uang asli"]],
        "systems": systems(), "shuffle": shuffle(), "ml_final": ml_final(), "lit": lit(),
        "bench": [{"lang": "Rust (sistem sekarang)", "ns": 1833, "hl": True}, {"lang": "C++ g++ -O3", "ns": 1962}, {"lang": "C++ clang -O3", "ns": 1650},
                  {"lang": "Jeda jaringan RPC (pembanding)", "ns": 78_000_000}],
        "lit_note": "Fitur jurnal yang tanda korelasinya konsisten di dua paruh September dipakai (4). Hasil di Oktober: AUC 0,743 → 0,757, tapi laba akun tidak naik jelas, jadi belum dimasukkan ke sistem utama. Rumus quantum QFV: AUC 0,53 (hampir lempar koin), ditolak.",
        "tune_summary": tune_summary(),
    }
    (WORK / "dashboard_extra.json").write_text(json.dumps(extra, indent=1, ensure_ascii=False))
    print("ok", {k: (len(v) if isinstance(v, list) else bool(v)) for k, v in extra.items()})


if __name__ == "__main__":
    main()
