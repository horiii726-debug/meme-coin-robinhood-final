# Kalau PC dimatikan / restart

Folder kerja (temporary, berisiko dihapus Windows):
`C:\Users\horii\AppData\Local\Temp\claude\C--Users-horii\d3c68c69-721e-4a96-9ee3-703ba452c3f6\scratchpad`

## Data yang SUDAH AMAN (permanen di `C:\Users\horii\rhc-quant\`)

| Isi | Ukuran |
|---|---|
| `data/ds24/swaps.csv` — 4.279.026 swap | 1.023 MB |
| `data/ds24/liq.csv` — 635.488 event likuiditas | 66 MB |
| `data/ds24/pools.csv` — 15.582 pool | 3 MB |
| `data/ds24/deployers_bq.csv` — 15.596 atribusi pembuat | 2 MB |
| `data/ds24/model.joblib` — **model terlatih** | 1 MB |
| `data/ds24/` features.csv, sim.csv, ml.csv | 3 MB |
| `scripts/` — 49 skrip (pipeline, radar, analisis) | kecil |
| Laporan `.md` di root | kecil |

`data/ds5d/` akan disalin **otomatis** begitu kolektor berhenti (`autosave.sh` sedang memantau).

## Yang MATI saat PC dimatikan
Ketiga proses berhenti dan **tidak menyala sendiri**: kolektor, pipeline, radar.

## Apakah riwayat blockchain-nya hilang?

**Tidak.** Data itu ada di blockchain-nya sendiri dan bisa diambil ulang kapan saja
dengan `collect.js`. Yang kita simpan hanya salinan lokal supaya tidak perlu
mengunduh ulang berjam-jam.

Yang **tidak bisa** diambil ulang:
- `radar_log.jsonl` — rekaman sinyal live real-time. Hilang ya hilang.
- Data deployer Bitquery untuk rentang lama — `realtime` hanya menyimpan ~4-5 hari ke belakang.
  Lewat dari itu butuh plan berbayar (`archive`).

## Melanjutkan kolektor setelah restart

Checkpoint disimpan tiap 25 chunk, jadi lanjut dari posisi terakhir (tidak mengulang):

```bash
cd "/c/Users/horii/AppData/Local/Temp/claude/C--Users-horii/d3c68c69-721e-4a96-9ee3-703ba452c3f6/scratchpad"
PAR=3 node --max-old-space-size=4096 collect.js 55566162 59886161 ds5d
```

Kalau folder temporary sudah terhapus, pulihkan dulu:

```bash
SD="/c/Users/horii/AppData/Local/Temp/claude/C--Users-horii/d3c68c69-721e-4a96-9ee3-703ba452c3f6/scratchpad"
mkdir -p "$SD"
cp /c/Users/horii/rhc-quant/scripts/* "$SD/"
cp -r /c/Users/horii/rhc-quant/data/ds24 "$SD/"
cp -r /c/Users/horii/rhc-quant/data/ds5d "$SD/" 2>/dev/null
```

## Menyalakan radar lagi

```bash
cd "$SD"
POLL_MS=60000 MODEL_DIR=ds24 node --max-old-space-size=1500 radar.js
```

## Saran

Kalau PC mau dimatikan lama, **jangan matikan sebelum autosave selesai** — cek:
```bash
grep AUTOSAVE "$SD/overnight_status.txt"
```
Kalau sudah ada baris "AUTOSAVE: selesai", aman dimatikan.
