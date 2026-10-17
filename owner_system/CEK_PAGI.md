# Cek Pagi — 2026-09-13
Disiapkan ~01:00–01:35. Semua proses sudah diverifikasi jalan, bukan sekadar dinyalakan.

## LANGSUNG LIHAT INI
```bash
cd "/c/Users/horii/AppData/Local/Temp/claude/C--Users-horii/d3c68c69-721e-4a96-9ee3-703ba452c3f6/scratchpad"
cat overnight_status.txt      # pipeline sampai mana
cat RINGKASAN_6HARI.md        # hasil lengkap (kalau pipeline sudah selesai)
wc -l radar_log.jsonl         # jumlah sinyal live
```

## 3 proses berjalan

**1. Kolektor data 5 hari** — blok 55.566.162–59.886.161
Log: `collect5d.log`. Kecepatan ~4 MB/mnt. Checkpoint berurutan, jadi berapa pun yang
terkumpul tetap berupa rentang utuh dan langsung terpakai.

**2. Pipeline otomatis v3** — `overnight.sh`
Menunggu kolektor (maks 6,5 jam) lalu jalan sendiri:
gabung → sort eksternal → fitur+simulasi (streaming) → deployer → tabel ML →
latih → audit noise & stabilitas → **walk-forward per hari** → `RINGKASAN_6HARI.md`

**3. Radar live MODE KERTAS** — TERVERIFIKASI BEKERJA
Sinyal pertama tercatat 18:31: p100=67,7% p400=19,1% p1000=3,5% LP=$22.438
Log: `radar_log.jsonl` (satu JSON per baris). **Tidak ada eksekusi trade.**

Lihat sinyal berskor tinggi:
```bash
node -e 'require("fs").readFileSync("radar_log.jsonl","utf8").trim().split("\n").map(JSON.parse).filter(r=>r.p400>=0.3).forEach(r=>console.log(r.ts,r.pool.slice(0,14),"p400="+r.p400,"p1000="+r.p1000,"LP=\$"+r.lp_entry_usd))'
```

## 3 bug yang ketemu & diperbaiki sebelum jalan
1. **`dev_bq.js` menulis ke path hardcoded** — akan menimpa 15.596 baris data deployer
   dengan file kosong. Sudah di-backup (`deployers_bq.BACKUP.csv`) + diparameterkan.
2. **RAM cuma 7,9 GB, heap disetel 9 GB** — di atas RAM fisik, pasti gagal di data 6 hari.
   Pipeline ditulis ulang jadi streaming per-pool (sort eksternal + proses satu pool).
   Hasil: **36 detik dengan heap 2 GB**, sebelumnya belasan menit dengan 9 GB.
3. **Radar gagal memanggil Python** — path gaya Git Bash tidak dikenali Node. Diperbaiki.

## Perubahan metode yang perlu kamu tahu
Horizon label dipendekkan dari 6 jam ke **1 jam**. Alasannya: p90 waktu-ke-puncak = 45 menit,
dan strateginya memang keluar dalam 15 menit. Efeknya base rate turun jadi lebih jujur:
`>=+400%` 6,0% (dari 11,2%), `>=+1000%` 1,9% (dari 4,9%).

## Yang TIDAK dilakukan
Tidak ada trade dengan uang beneran. Itu butuh kunci dompetmu dan keputusanmu.

## Keputusan yang menunggu
1. **Buka test set?** Fase 7 — sekali saja, tidak bisa diulang.
2. Kalau walk-forward menunjukkan ada hari yang gagal → itu jawaban, dan artinya
   belum layak uang nyata.
3. Berapa lama paper trading sebelum uang masuk (rencanamu: 2 minggu).

---

## Tambahan (01:36)

**Hipotesis exit-momentum sudah diuji dan DITOLAK.**
Exit saat tenaga beli melemah menaikkan tingkat menang (35,4% vs 28,7%) tapi RUGI,
karena memotong pemenang terlalu cepat (`>=+100%` anjlok 13,3% -> 1,1%).
Trailing stop sederhana tetap terbaik. Detail di STRATEGY_FINDINGS.md.

**Skrip Fase 7 sudah siap** (`/c/Users/horii/AppData/Local/Temp/claude/C--Users-horii/d3c68c69-721e-4a96-9ee3-703ba452c3f6/scratchpad/phase7_test.py`)
Membuka test set, rata-rata 10 seed, lalu MENYEGEL hasilnya supaya tidak bisa dibuka ulang.
Hanya jalan kalau kamu konfirmasi eksplisit:
```bash
cd "/c/Users/horii/AppData/Local/Temp/claude/C--Users-horii/d3c68c69-721e-4a96-9ee3-703ba452c3f6/scratchpad"
SAYA_YAKIN=YA "C:/Users/horii/AppData/Local/Programs/Python/Python313/python.exe" phase7_test.py ds6d
```
**Jangan jalankan sebelum lihat hasil walk-forward per hari.** Kalau ada hari yang gagal,
membuka test set cuma membakar satu-satunya kesempatan yang kamu punya.

**Perkiraan data pagi:** kolektor ~3,8 chunk/menit, watchdog stop 07:10
-> sekitar 1.400/3600 chunk = ~2 hari data tambahan. Total ~3 hari.
Tabel ML diperkirakan naik dari 1.963 jadi ~6.000 baris.
