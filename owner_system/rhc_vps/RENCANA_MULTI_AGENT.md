# Rencana Multi-Agent — Audit & Pembuktian Strategi RHC

Dijalankan di PC Windows biasa dengan **10 agent + 1 orchestrator**. Fakta, angka, aturan, dan lingkungan ada di `CLAUDE.md` (sudah dimuat otomatis) — tidak diulang di sini.

**Tujuan:** perbanyak trade, temukan kebocoran/bug, dan buktikan edge bertahan — **terutama di rezim pasar sepi dan saat pasar hancur**, bukan hoki 13–17 September saja.

## Cara hemat baca
- Orchestrator memberi tiap agent **hanya** berkas di kolom "Baca" — agent tidak membuka `STRATEGI_FINAL.md`, `CATATAN_AUDIT.md`, atau rencana ini kecuali tercantum.
- Agent tidak membaca ulang `CLAUDE.md` (sudah dimuat) dan tidak membaca laporan agent lain; Orchestrator yang menggabungkan.
- Data besar (`data/*/swaps_sorted.csv`) jangan dibuka — pakai lewat skrip.

## Batas PC
- Maksimal **2 pekerjaan berat bersamaan** (unduh, replay, latih model). Agent yang cuma membaca kode boleh jalan paralel lebih banyak.
- Disk ±14 GB bebas: Data Expansion memproses per potongan ±2 juta blok lalu menghapus data mentahnya.
- RPC gratis + DoH: beri jeda antar permintaan; kalau `Too Many Requests` berulang, turunkan paralelisme.

## Aturan untuk semua agent
1. Uji maju saja; parameter dipilih di satu periode dan dibuktikan di periode lain.
2. Tulis hipotesis **sebelum** menguji; hasil yang gagal tetap dilaporkan.
3. Pembanding tetap = `bot/.env` apa adanya. Eksperimen di salinan, jangan ubah bot.
4. Laporan: `hasil/audit/<agent>.md` — maksimal 1 halaman: temuan (PARAH/SEDANG/RINGAN), file:baris, bukti angka, usul perbaikan.

## Agent

| # | Agent | Fase | Baca |
|---|---|---|---|
| 1 | Data Expansion | 1 | `pipeline/collect.js`, `data/agustus_mentah/*/checkpoint.json`, `DEPLOY_VPS.md` bagian unduhan |
| 3 | Leakage Auditor | 1 | `bot/filter_feats.js`, `pipeline/arena_score.py`, `pipeline/latih_keluar_wf.py`, `pipeline/retrain_filter.py` |
| 4 | Code/Logic Auditor | 1 | `bot/v4engine.js`, `bot/paper_live.js`, `pipeline/arena.js`, `CATATAN_AUDIT.md` bagian keandalan |
| 6 | Execution Auditor | 1 | `bot/v4engine.js`, `CATATAN_AUDIT.md` bagian "terlalu optimis" |
| 9 | Risk & Portfolio Auditor | 1 | `bot/paper_live.js` (akun, Kelly, rem, stop), `pipeline/arena.js`, `pipeline/mc_pro.js` |
| 10 | Reliability/Ops Auditor | 1 | `bot/paper_live.js` (polling, simpan, putar ulang), `bot/jalankan_windows.ps1` |
| 2 | Trade Coverage | 2 | `data/arena_scored.csv`, `hasil/uji_maju_final/trade_final178_lengkap.json`, `pipeline/arena_score_moon.py` |
| 5 | Statistical Auditor | 2 | `hasil/uji_maju_final/`, `data/arena_scored.csv`, `data/block_time.json` |
| 7 | Experiment Scientist | 2 | `pipeline/wf_penuh.sh`, `pipeline/arena.js`, daftar perbaikan dari agent 2, 5, 6, 9 |
| 8 | Red-Team Validator | 2 | `pipeline/arena.js`, `pipeline/mc_pro.js`, `data/worst_windows.json` |
| — | Orchestrator | 0 & 3 | semua laporan `hasil/audit/*.md` |

## Fase 0 — Orchestrator
- Cek paket: `node bot/cek_siap.js` (3 model lolos parity) dan replay `data/ags4` = 75 trade identik.
- Buat `hasil/audit/`. Jalankan Fase 1.

## Fase 1 — paralel, tidak butuh data baru

**1. Data Expansion** *(paling lama, mulai pertama)*
- Lanjutkan 7 jendela `data/agustus_mentah/` sampai utuh (ada checkpoint).
- Lalu seluruh riwayat chain dari blok ±20 juta (26 Juli), per potongan: unduh → urutkan & dedupe per pool → replay → ambil menit-1, transfer, dev → hapus data mentah.
- Target ±1.300 jam → ±1.500 trade. Laporkan periode baru ke Orchestrator.

**3. Leakage Auditor**
- Periksa tiap fitur: tidak boleh memakai data setelah `init+600`. Uji label diacak (AUC ≈ 0,50).
- Pastikan pelatih hanya memakai trade `exit < blok keputusan`.
- Cari bias: koin mati dibuang, pemilihan periode, pemilihan 34 fitur yang melihat label seluruh data.

**4. Code/Logic Auditor**
- Cari bug di mesin dan bot. Daftar **setiap** perbedaan aturan `pipeline/arena.js` vs `bot/paper_live.js`.

**6. Execution Auditor**
- Perbaiki 4 asumsi optimis: penjualan kita menggerakkan harga pool, order jual di posisi terakhir blok, antrean nonce, gas dinamis. Ukur latensi p90 dari paper live.
- Jawab: **berapa hasil $12.746 menyusut** setelah perbaikan ini.

**9. Risk & Portfolio Auditor**
- Kelly, akuntansi akun, rem, stop darurat, eksposur: identik di bot, arena, dan Monte Carlo? Semua pakai equity harga pasar?
- **Korelasi:** di jam terburuk, berapa posisi rugi berbarengan? Usulkan batas posisi baru per 30 menit, batas rugi harian, batas per dev.

**10. Reliability/Ops Auditor**
- Uji pemulihan: bot dimatikan paksa saat posisi terbuka, RPC putus 10 menit, satu baris `trades.jsonl` rusak, disk hampir penuh.
- Pastikan `jalankan_windows.ps1` me-restart bot yang hang atau tertinggal.
- Butir keandalan terbuka: reorg, fsync, `parseStore` membaca seluruh CSV (gagal start ±80 hari lagi), rotasi `snaps_live.jsonl`.

## Fase 2 — setelah data baru masuk

**2. Trade Coverage** — dari 2.797 koin cuma 178 dibeli:
- Per penyebab tolak (ML / honeypot / model belum siap / slot / eksposur): berapa yang sebenarnya untung, rug, atau roket?
- Uji: model siap sejak menit pertama (latih dari data historis), cek honeypot lewat simulasi jual Universal Router, jalur roket (label `ret ≥ 2`).

**5. Statistical Auditor**
- Selang kepercayaan win rate, PF, return (bootstrap per blok waktu).
- **Hasil per rezim** — ramai / normal / sepi / hancur (ukur dari jumlah koin lahir, rug rate, return v4 mentah).
- Uji permutasi: saringan ML vs pilih acak. Persen minggu untung, kemarau terpanjang.
- Jawab tegas: **edge ada di semua rezim, atau cuma rezim ramai?**

**7. Experiment Scientist** — tiap usulan lewat uji maju, satu per satu:
- Keluar lebih cepat dari koin yang berhenti bergerak (kebocoran batas 9 jam)
- Label filter berbasis payoff (`ret ≥ 2` atau regresi `log(ret)`)
- Detektor rezim: kecilkan taruhan / berhenti saat pasar sepi atau hancur
- Frekuensi latih ulang 10 / 20 / 50 / 100 trade
- **Diterima hanya jika** lebih baik di periode yang tidak dipakai memilihnya **dan** tidak memperburuk rezim jelek.

**8. Red-Team Validator** — data nyata dulu, sintetis kalau terpaksa (beri label):
- Seminggu jam terburuk, gelombang rug, gas ×5 & ×10, RPC mati 10 menit saat posisi terbuka, ETH −20% sehari, likuiditas pool −50%, pesaing selalu satu blok lebih cepat.
- Tiap skenario: drawdown maks, stop darurat bekerja?, lama pulih.

## Fase 3 — Orchestrator
- `hasil/audit/LAPORAN_AKHIR.md`: temuan diurutkan dari paling parah; sudah vs belum diperbaiki.
- Uji maju ulang di seluruh data dengan semua perbaikan yang diterima → angka final baru.
- Perbarui grafik (`pipeline/viz_pro.py`) dan web.
- Nilai syarat di bawah. **Tanya pemilik** sebelum mengubah bot.

## Syarat "layak uang asli" — ditetapkan sebelum hasil dilihat

| Syarat | Batas |
|---|---|
| Trade uji maju | ≥ 1.000 |
| PF skenario realistis (biaya +5%, gas 2×) | ≥ 1,5 |
| Minggu yang untung | ≥ 70% |
| Rezim sepi/hancur | drawdown < 40%, tidak kena stop darurat |
| Paper live 2 minggu | laju untung ≥ 50% dari uji maju |
| Parity model & replay | tetap lolos |

Satu syarat gagal → belum uang asli. Sebutkan syarat mana dan kenapa.
