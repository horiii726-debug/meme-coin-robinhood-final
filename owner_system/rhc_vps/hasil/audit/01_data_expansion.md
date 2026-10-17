# Agent 1 — Perluasan Data

## Periode baru SIAP REPLAY (data on-chain nyata, format sama dengan `data/ags4`)
| Folder | Blok | Perkiraan tanggal | Jam data | Jam init (hz 9 j) | Pool | Swap | Ukuran |
|---|---|---|---|---|---|---|---|
| `data/am_ags01` | 24.800.000–26.800.000 | 31 Jul – 3 Ags | 55,6 j | 46,6 j | 16.453 | 928.397 | 247 MB |
| `data/am_ags07` | 30.000.000–32.000.000 | 7 Ags – 9 Ags | 55,6 j | 46,6 j | 23.662 | 1.767.886 | 459 MB |
| `data/am_ags13` | 35.000.000–37.000.000 | 12 Ags – 15 Ags | 55,6 j | 46,6 j | 24.306 | 2.070.310 | 538 MB |
| `data/am_ags18` | 40.000.000–42.000.000 | 18 Ags – 21 Ags | 55,6 j | 46,6 j | 17.006 | 1.683.225 | 442 MB |
| `data/am_ags24` | 45.000.000–47.000.000 | 24 Ags – 26 Ags | 55,6 j | 46,6 j | 25.079 | 3.176.454 | 821 MB |
| **total** | | | **278 j** | **233 j** | **106.506** | **9,6 juta** | **2,5 GB** |

Perintah replay (Fase 2), contoh: `node replay.js ../data/am_ags01 24800000 26800000 ../data/am_ags01/trades.jsonl auto`
Isi tiap folder: `pools.csv`, `liq.csv`, `swaps_sorted.csv`, `meta.json`.

**Tumpang tindih dengan data lama — jangan dihitung dua kali:** `am_ags01` memuat seluruh `ags1` (25,87–26,23 juta), `am_ags18` memuat seluruh `ags4` (40,83–41,18 juta). Sisanya (am_ags07, am_ags13, am_ags24) periode yang benar-benar baru.

## Pemeriksaan mutu yang sudah lolos
- Replay `data/ags4` asli vs versi hasil `finalisasi_jendela.js`: **trades.jsonl identik byte-per-byte** (75 trade, 26 pool) → saringan swap tidak mengubah hasil.
- Silang `am_ags01` vs `ags1`: 3.526/3.526 pool sama, 179.106 swap identik, 0 pool beda.
- Silang `am_ags18` vs `ags4`: 2.337/2.337 pool sama, 163.171 swap identik, 0 pool beda.
- Semua `swaps_sorted.csv` baru: pool terkelompok rapi (0 grup pecah), 0 duplikat `block:log_idx`, 0 baris rusak.
- Dataset lama (`ags1, ags4, u_ds5d, u_ds24, m1, m2`, 12,8 juta swap): diperiksa, **0 duplikat** — hasil uji maju yang berlaku tidak tercemar.

## Status 7 jendela `data/agustus_mentah`
| Jendela | Blok | Potongan | Status |
|---|---|---|---|
| w01_ags01 | 24,8–26,8 jt | 1667/1667 | selesai → `am_ags01` |
| w02_ags07 | 30–32 jt | 1667/1667 | selesai → `am_ags07` |
| w03_ags13 | 35–37 jt | 1667/1667 | selesai → `am_ags13` |
| w04_ags18 | 40–42 jt | 1667/1667 | selesai → `am_ags18` |
| w05_ags24 | 45–47 jt | 1667/1667 | selesai → `am_ags24` |
| w06_ags30 | 50–52 jt | 643/1667 | **sedang diunduh** (5 potongan/menit, sisa ±3,5 jam) |
| w07_sep05 | 55–57 jt | 225/1667 | antre sesudah w06 (±5 jam) |

Penjaga `pipeline/jaga_unduh.sh` sudah jalan: tiap 5 menit memeriksa, menghidupkan lagi unduhan kalau mati,
menahan diri bila disk bebas < 6 GB, dan otomatis pindah ke `lanjut_riwayat.sh` setelah 7 jendela selesai.

Data mentah tiap jendela dihapus otomatis setelah difinalisasi. Disk bebas saat laporan ini: **14 GB**.

## Sisa pekerjaan & cara melanjutkan (semua resume lewat checkpoint)
```
cd pipeline && bash jaga_unduh.sh &              # PENJAGA: hidupkan lagi unduhan kalau mati, lalu lanjut ke riwayat
cd pipeline && bash lanjut_agustus.sh            # lanjut w06, w07 (lewati yang sudah selesai)
cd pipeline && bash lanjut_agustus.sh w07        # pilih jendela tertentu
cd pipeline && bash lanjut_riwayat.sh 1          # 1 potongan riwayat lama (mulai blok 20 juta = 26 Juli)
node cek_mentah.js <dir> <from> <to> [--perbaiki]     # audit/perbaiki data mentah
node finalisasi_jendela.js <dirMentah> <from> <to> <dirKeluar> [--hapus-mentah]
# hentikan kapan saja: buat file pipeline/stop_unduh.txt
```
- **w06 + w07**: ±9 jam unduh lagi, mentah ±2,3 + ±3,4 GB (dihapus otomatis), hasil akhir ±1,1 + ±1,6 GB. Perkiraan tambahan: ±110 jam pasar, ±60 ribu pool.
- **Riwayat lama (blok 20 juta = 26 Juli ke atas + celah antar jendela)**: `lanjut_riwayat.sh` berisi 20 segmen ±2 juta blok; perkiraan **±1,5–4 jam dan ±0,5–0,9 GB hasil akhir per segmen** (total ±40 jam, ±12 GB). Tiap segmen mengunduh 324.000 blok ekstra di ujung supaya pool yang lahir di akhir segmen tetap punya horizon 9 jam, dan segmen sesudah w01..w07 dimulai 324.000 blok lebih awal karena alasan yang sama. Belum dimulai: saya hanya memegang 1 slot pekerjaan berat, jadi menunggu w06/w07 selesai.

## Temuan
- **PARAH — `data/` seluruhnya hardlink ke `C:\Users\horii\rhc-quant\data_b\`** (mis. `data/m1/swaps_sorted.csv` = `data_b/m1/swaps_sorted.csv`). Menghapus mentah di `rhc_vps` tidak mengembalikan ruang selama salinan `data_b` ada, dan `collect.js` yang menambah baris ikut mengubah berkas di `data_b`. Saran: hapus `data_b/arena/w01..w05` yang sudah difinalisasi (aman, hasilnya sudah ada di `data/am_*`) untuk mengembalikan beberapa GB.
- **SEDANG — `pipeline/collect.js` (versi lama, baris ±97):** potongan dicatat `done` saat data masih di buffer tulis → kalau proses mati, bisa ada lubang senyap. **Diperbaiki**: tulis → tunggu callback → baru `done`.
- **SEDANG — `pipeline/collect.js` (versi lama, baris ±100):** checkpoint hanya tiap 25 potongan → saat dilanjutkan, potongan diunduh dua kali; nyata 17–23 potongan per jendela, **16 ribu–69 ribu swap duplikat** per jendela. `replay.js` tidak punya penangkal duplikat (swap ganda = harga & likuiditas ganda). **Diperbaiki + dedupe wajib** di `finalisasi_jendela.js`.
- **RINGAN — `pipeline/collect.js`:** potongan gagal (`Too Many Requests`/`badjson`, 44–66 per jendela) dulu hanya ditulis di log. Sekarang diulang otomatis maks 3 putaran, keluar kode 2 bila masih gagal (skrip induk mengulang).
- **RINGAN:** saringan `topics` pada `eth_getLogs` hanya menghemat ±1% (balasan didominasi event Swap).
- **RINGAN:** ada berkas nyasar `data/1` (41 KB, 20 Sep 15:05) — bukan hasil alat saya, kemungkinan salah redirect skrip lain.
