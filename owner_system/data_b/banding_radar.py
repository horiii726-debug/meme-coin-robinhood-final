# Pembanding radar on-chain (Rust, lewat RPC) vs jalur trading v4 vs DEX Screener (HANYA untuk verifikasi, bukan sumber bot).
# Pakai: python banding_radar.py <dir rust_live>
import json, sys, os, subprocess, collections

D = sys.argv[1]
R = json.load(open(os.path.join(D, "radar.json"), encoding="utf8"))
S = json.load(open(os.path.join(D, "status.json"), encoding="utf8"))
K = json.load(open(os.path.join(D, "kelas_token.json"))) if os.path.exists(os.path.join(D, "kelas_token.json")) else {}
semua = R["semua_aktif"]
print(f"=== RADAR (blok {R['blok']:.0f}) ===")
print("jumlah:", R["jumlah"], "| pool dikenal:", R["pool_dikenal"], "| swap tercatat:", R["swap_tercatat"])
print("cakupan:", R.get("cakupan"))
print("jenis DEX koin aktif:", dict(collections.Counter(x["fitur"]["dex"].split(":")[0] for x in semua)))
print("klasifikasi token:", dict(collections.Counter(K.values())))
print("saham dikecualikan:", [(d["simbol"] or d["token"][:10], d["swap_24j"]) for d in R["terdeteksi_dikecualikan"]])
print("\n10 teratas dari", len(semua), "koin aktif (daftar lengkap ada di radar.json):")
for x in semua[:10]:
    f = x["fitur"]
    print(f'  {x["token"][:10]} {f["dex"][:18]:18s} panas {x["panas"]:5.2f} | tx5m {f["tx_5m"]:3.0f} tumbuh_tx {f["tumbuh_tx"]:.1f} | pelaku5m {f["pelaku_5m"]:3.0f} (sebelum {f["pelaku_5m_sebelum"]:.0f}) | vol5m ${f["usd_beli_5m"]+f["usd_jual_5m"]:,.0f} | likuid ${f["likuid_usd"]:,.0f}')
print("\npotensi tumbuh:", len(R["potensi_tumbuh"]), "koin | baru 1 jam:", len(R["baru_1jam"]), "| bangun dari tidur:", len(R["bangun_dari_tidur"]))

# --- jalur trading v4 vs radar ---
v4_radar = {x["pool"] for x in semua if x["fitur"]["dex"].startswith("uniswap-v4")}
print(f"\n=== vs JALUR TRADING v4 === pool v4 aktif di radar: {len(v4_radar)} | pool v4 yang dipantau jalur trading: {S['pools_dipantau']}")

# --- verifikasi silang DEX Screener (sekali, untuk cek cakupan) ---
C = r"C:/PortableGit/mingw64/bin/curl.exe"
def ds(path):
    out = subprocess.run([C, "-s", "-m", "20", "--doh-url", "https://cloudflare-dns.com/dns-query", "https://api.dexscreener.com" + path], capture_output=True).stdout
    try:
        return json.loads(out.decode("utf8", "replace"))
    except Exception:
        return None
tok = [x["token"] for x in semua if x["token"]][:30]
pairs = ds("/tokens/v1/robinhood/" + ",".join(tok)) or []
dikenal_ds = {p["baseToken"]["address"].lower() for p in pairs} | {p["quoteToken"]["address"].lower() for p in pairs}
print(f"\n=== vs DEX SCREENER (verifikasi) === dari 30 token teramai radar, dikenal DS: {sum(t in dikenal_ds for t in tok)}/30")
# arah sebaliknya: pair DS yang aktif 5 menit terakhir, apakah radar melihatnya on-chain?
aktif_radar = {x["pool"] for x in semua}
terlihat = set(R.get("terlihat_5m", []))
cari = []
for q in ["robinhood", "hood", "meme", "ai", "pepe", "cat", "dog", "trump", "moon", "inu"]:
    r = ds("/latest/dex/search?q=" + q) or {}
    cari += [p for p in (r.get("pairs") or []) if p.get("chainId") == "robinhood"]
uniq = {p["pairAddress"].lower(): p for p in cari}
aktif_ds = [p for p in uniq.values() if (p.get("txns", {}).get("m5", {}).get("buys", 0) + p.get("txns", {}).get("m5", {}).get("sells", 0)) > 0]
lihat = [p for p in aktif_ds if p["pairAddress"].lower() in terlihat]
peringkat = [p for p in aktif_ds if p["pairAddress"].lower() in aktif_radar]
print(f"pair DS yang ada transaksi 5 menit terakhir: {len(aktif_ds)} | TERLIHAT on-chain oleh radar: {len(lihat)} | sudah masuk peringkat meme: {len(peringkat)}")
for p in aktif_ds:
    if p["pairAddress"].lower() not in terlihat:
        print("   TIDAK terlihat radar:", p["dexId"], p.get("labels"), p["pairAddress"][:14], p["baseToken"]["symbol"], "/", p["quoteToken"]["symbol"], "tx5m", p["txns"]["m5"])
