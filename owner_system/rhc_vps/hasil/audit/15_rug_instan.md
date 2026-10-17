# Agent 15 — Rug Instan & Waktu Masuk

Kerja: `hasil/audit/kerja_15/`. Semua angka dari data on-chain nyata (9 periode, 20.529 pool aman).
Regresi wajib: replay `data/ags4` dengan aturan baru dimatikan = **75 trade identik byte** dengan
`data/ags4/trades.jsonl` ✓ (diulang 2×, terakhir sesudah semua perubahan mesin).

---

## Jawaban singkat

**Tidak ada aturan masuk yang menyelamatkan uang. Dolar yang berhasil diselamatkan: $0.**

Bukan karena tidak dicari. Yang ditemukan:

1. Rug **bisa** ditebak dengan sangat baik di seluruh kolam pool (AUC 0,92–0,94 di periode bukti)
   memakai struktur posisi likuiditas yang belum pernah dipakai — **tapi hanya untuk memisahkan pool
   sampah dari pool sungguhan, dan filter ML lama sudah melakukan itu.**
2. Di dalam **daftar koin yang benar-benar dibeli bot**, rug instan (≤1, ≤3, ≤5 menit) **tidak bisa
   ditebak**: AUC 0,48–0,57, selang kepercayaan mencakup 0,5. Hanya horizon **10 menit** yang lolos
   (AUC 0,692 [0,60–0,78]) — dan itu justru tidak berguna, karena menolak koin yang rug dalam 10 menit
   **merugi** (uji oracle di bawah).
3. Menunda masuk **merusak lebih banyak daripada yang diselamatkannya**, di semua ukuran penundaan,
   dengan selang kepercayaan yang jelas negatif.
4. Perkecil posisi berdasarkan skor rug juga rugi: akun $9.139 → $4.156–$7.693.

Hadiah kalau masalah ini terpecahkan besar (oracle: +$6.980 dan DD 23,6% → 3,8%), jadi ini layak
dikerjakan lagi — tapi **butuh data yang sekarang tidak ada** (bagian terakhir).

---

## Dasar pembanding

Pipa penuh disalin ke `kerja_15/` (replay → fitur → skor ML kausal → arena). Base saya:

| setelan | beli | akun akhir | win | PF | DD | rug dimakan |
|---|---|---|---|---|---|---|
| maks 10 posisi (setelan `wf_penuh.sh`) | 177 | **$11.372,92** | 75,7% | 3,45 | 20,4% | 27 |
| maks 5 posisi (**aturan pemilik**) | 157 | **$9.139,26** | 75,8% | 3,36 | 23,6% | 25 |

Beda dengan angka resmi ($12.746 / 178 trade) = 1 trade: salinan saya memasang gas nyata di **semua**
periode, `arena.js` asli hanya di m1/m2. Semua perbandingan di bawah memakai base saya sendiri.

---

## Kapan rug benar-benar membunuh

178 trade uji maju, dibagi menurut kapan LP ditarik ≥80% (menit sesudah blok keputusan):

| rug terjadi | trade | untung | ret rata2 |
|---|---|---|---|
| 0–1 menit | 10 | **−$940** | 0,10 |
| 1–3 menit | 15 | **−$1.814** | 0,13 |
| 3–7 menit | 11 | +$970 | 1,61 |
| 7–15 menit | 51 | **+$5.773** | 1,66 |
| 15–30 menit | 11 | +$869 | 1,94 |

**Hanya rug ≤3 menit yang fatal.** Rug 7–30 menit justru trade paling untung — mesin keluar lebih dulu,
dan penarikan LP itu sering "kelulusan" launchpad, bukan penipuan. Jadi label "rug 30 menit" yang
diminta di tugas **bukan** label uang; label uang adalah **rug ≤3 menit**. Semua di bawah dilaporkan
bertingkat: ≤1, ≤3, ≤5, ≤10, ≤30 menit.

---

## JALUR A — tanda rug yang belum pernah diuji

### Yang berhasil diekstrak (baru, dari `liq.csv` + `pools.csv`, 9 periode)

`n_add`, `n_rem`, jumlah posisi LP berbeda, `rem_frac` di blok keputusan, log likuiditas ditambah,
pangsa tambahan terbesar, rentang waktu penambahan, **lebar rentang tick posisi utama**,
`tick_lo`/`tick_hi`, penanda rentang penuh, ketidaksimetrisan rentang, `tick_spacing`, hook,
+ posisi harga di dalam rentang tick pada blok keputusan (`pos_rng`, `d_hi`, kecepatan tick).

### Penemuan struktural utama: dua keluarga pool

| keluarga | n kandidat | rug ≤30 mnt | ret rata2 | untung 178 trade |
|---|---|---|---|---|
| `tick_spacing=1`, rentang sempit 46.055 tick (193377..239432) | 536 | **72,4%** | 1,140 | **+$8.170** (110 trade) |
| `tick_spacing=1`, rentang penuh | 170 | 42,9% | 1,181 | +$3.073 (44 trade) |
| `tick_spacing=25` | 1.453 | 1,9% | 1,183 | +$1.405 (13 trade) |
| `tick_spacing=200` | 573 | 0,5% | 0,955 | −$1,50 (11 trade) |

Ini sidik jari "pabrik" yang dicari: pool `tick_spacing=1` rentang sempit adalah kurva ikatan launchpad.
**Tapi keluarga yang paling sering rug adalah keluarga yang menghasilkan 89% untung.** Menolak
`tick_spacing=1` = membuang $11.243 dari $12.646. Filter tingkat keluarga mati di sini.

### AUC model rug (kausal, dilatih ulang berkala, hanya dari pool yang statusnya sudah pasti)

Sumber latih: **SEMUA pool yang terlihat** (20.529), bukan hanya yang dibeli — ini perbaikan yang
diminta. Kontrol label diacak dijalankan.

**(a) Seluruh pool aman yang terlihat** — pilih di periode lama, bukti di m1+m2:

| horizon | AUC lama | AUC bukti (m1+m2) | basis bukti |
|---|---|---|---|
| rug ≤1 mnt | 0,917 | 0,861 | 2,3% |
| rug ≤3 mnt | 0,932 | 0,860 | 4,4% |
| rug ≤5 mnt | 0,939 | 0,864 | 5,8% |
| rug ≤10 mnt | 0,958 | 0,911 | 12,9% |
| rug ≤30 mnt | 0,990 | 0,936 | 15,9% |

Pembanding 34 fitur lama untuk rug ≤30 mnt: AUC 0,676. Kontrol label diacak: 0,40–0,55 (tidak ada
kebocoran). Jadi **struktur LP memang membawa informasi baru yang besar.**

**(b) Tapi di DAFTAR BELI (135 koin m1+m2 yang lolos filter ML + honeypot):**

| horizon | basis | AUC (LP+tick) | CI 95% | kesimpulan |
|---|---|---|---|---|
| rug ≤1 mnt | 5,9% | 0,565 | [0,39–0,73] | tidak ada tanda |
| rug ≤3 mnt | 14,1% | 0,524 | [0,39–0,66] | **tidak ada tanda** |
| rug ≤5 mnt | 20,0% | 0,477 | [0,38–0,60] | tidak ada tanda |
| rug ≤10 mnt | 45,2% | **0,692** | [0,60–0,78] | satu-satunya yang nyata |

Presisi di daftar beli untuk rug ≤3 mnt: 0,146 [0,08–0,21] pada basis 0,141 — **nol angkat.**

Fitur tunggal yang bertahan (signifikan di daftar beli, rug ≤10 mnt): `sym_off` 0,662, `lo_main` 0,661,
kecepatan tick menit-1 0,655, `narrow` 0,607 — semuanya varian dari "ini koin launchpad kurva sempit".

### Reputasi dev memakai SEMUA koin terlihat (perbaikan yang diminta)

Dev diambil dari `dev_creator.json` (2.691 dari 2.847 pool punya dev; 2.177 dev unik, 2.035 di antaranya
hanya punya 1 pool). Aturan kausal: tolak kalau dev punya pool sebelumnya yang **sudah** rug sebelum
blok keputusan koin ini.

- Periode bukti: menyala pada **6 dari 2.125** koin, presisi rug 100%, ret rata-rata koin itu −0,001.
- Periode lama: menyala 5 dari 672, presisi 20%.
- AUC `n_prior_rug` sebagai fitur: 0,504 (bukti).

**Kesimpulan: benar, memakai semua koin terlihat jauh lebih baik daripada aturan bot sekarang (yang
hanya ingat koin yang dibeli, dan karena itu tidak pernah menolak apa pun) — tapi tetap terlalu jarang
menyala untuk berarti.** Pasang saja karena gratis dan presisinya 100% di periode bukti, jangan
diharapkan menyelamatkan uang.

### Yang TIDAK ADA DATANYA

| yang diminta | status |
|---|---|
| siapa pemilik posisi LP | **tidak ada data** — `liq.csv` = `pool_id,block,log_idx,tick_lo,tick_hi,liq_delta`, tanpa kolom owner/salt/sender |
| apakah LP terkunci atau bisa ditarik seketika | **tidak ada data** — tidak bisa dibedakan dari event; butuh pembacaan state/kontrak locker |
| apakah LP ditambahkan satu sisi | dihitung tidak langsung (posisi harga di dalam rentang tick). AUC 0,37–0,64, tidak stabil |
| dev sudah menarik sebagian sebelum keputusan | **tidak pernah terjadi**: 0 dari 2.797 kandidat punya penarikan LP sebelum `init+600` (`rem_frac` konstan, AUC 0,500) |
| dev mengirim token ke pool lagi | **tidak ada data sesudah menit-1** — `transfers.json` berhenti tepat di `init+600` |
| identitas pengirim swap | **tidak ada data** (P9, sudah diketahui) |

---

## JALUR B — waktu masuk

Mesin disalin (`v4e15.js`) dengan blok keputusan bisa diatur + gerbang "LP masih utuh" saat eksekusi.
Satu lintasan file menjalankan 9 varian sekaligus (3,2 GB swap, 6 periode).

### Uji berpasangan — koin yang sama, ukuran posisi base dikunci, bootstrap 95% (aturan pemilik, maks 5 posisi)

| aturan masuk | koin batal dibeli | dari itu rug ≤3 mnt | dihemat dari rug | hilang di koin lain | **selisih bersih** | CI 95% |
|---|---|---|---|---|---|---|
| tunda 30 dtk (semua koin) | 5 | 5 | +$866 | −$2.609 | **−$1.743** | [−3.662, −51] |
| tunda 1 mnt (semua) | 9 | 9 | +$599 | −$7.091 | **−$6.492** | [−8.997, −4.244] |
| tunda 2 mnt (semua) | 19 | 19 | +$2.096 | −$8.160 | **−$6.064** | [−9.345, −3.064] |
| tunda 4 mnt (semua) | 28 | 28 | +$2.773 | −$12.604 | **−$9.831** | [−14.312, −5.860] |
| tunda 30 dtk hanya koin bertanda rug (τ=0,20) | 1 | 1 | +$86 | −$77 | **+$9** | [−262, +276] |
| tunda 2 mnt hanya koin bertanda (τ=0,20) | 2 | 2 | +$151 | −$329 | **−$178** | [−609, +199] |
| tunda 2 mnt hanya koin bertanda (τ=0,10) | 10 | 10 | +$1.261 | −$6.399 | **−$5.138** | [−7.819, −2.724] |

Mekanismenya jelas (seluruh 2.847 pool, berpasangan): tunda 2 menit **menghindari 98 koin, 98/98 memang
rug ≤3 menit** (ret rata-rata 0,158; 81 di antaranya trade "akhir data"). Tapi pada 2.749 koin yang tetap
dibeli, ret turun **−0,124 [−0,147, −0,101]** dan roket tertangkap turun **141 → 92**. Harga masuk di
kurva ikatan launchpad sudah lari dalam 2 menit.

**Masuk bertahap** (separuh di menit-1, separuh setelah N menit bila LP utuh): secara aritmetika persis
setengah efek di atas (ret gabungan = ½·ret_awal + ½·ret_tunda), jadi **−$3.032 sampai −$871**. Tetap rugi.

**Gerbang "LP masih utuh saat eksekusi"**: **tidak menambah apa-apa**. Mesin sudah melewati pool yang
likuiditasnya hilang (ukuran posisi jatuh di bawah $20). Varian bergerbang = varian tunda polos, beda
paling banyak 1 koin dari 2.847.

### Pipa penuh (model dilatih ulang seperti biasa) — wajib dilaporkan, TIDAK sah sebagai bukti

| varian | beli | akun (maks 10) | akun (maks 5, aturan pemilik) |
|---|---|---|---|
| base | 177 | $11.372,92 | **$9.139,26** |
| tunda 30 dtk | 183 | $7.754,37 | $4.056,71 |
| tunda 1 mnt | 167 | $384,76 | $422,90 |
| tunda 2 mnt | 174 | $1.357,06 | $2.226,96 |
| tunda 4 mnt | 165 | $94,36 | $90,91 |
| tunda 2 mnt, τ=0,10 | 207 | $6.031,85 | $2.166,46 |
| tunda 2 mnt, τ=0,20 | 181 | **$13.655,61** | **$10.305,60** |

Baris terakhir terlihat +$1.166 — **itu derau, bukan aturan.** Uji berpasangan pada koin yang sama untuk
aturan yang persis sama memberi **−$178 [−609, +199]**. Perbedaannya datang dari daftar beli yang
bergeser karena model dilatih ulang. Inilah alasan uji berpasangan wajib.

---

## Menolak koin vs memperkecil posisi

**(a) Filter keras** (tolak koin bertanda rug), periode bukti m1+m2 saja, aturan pemilik:

| ambang | koin ditolak | akun akhir |
|---|---|---|
| tanpa filter | 0 | **$4.527,89** |
| τ=0,20 | 31 | $3.303,90 |
| τ=0,15 | 107 | $629,52 |
| τ=0,12 | 158 | $227,04 |
| τ=0,10 | 189 | $129,80 |
| τ=0,05 | 226 | $93,96 |

Sesuai temuan audit lain: menolak koin memiskinkan aliran label, dan koin bertanda rug adalah koin yang
menghasilkan untung.

**(b) Perkecil posisi** (daftar koin **identik**, 157 trade, win 75,8% di semua varian — jadi ini
perbandingan berpasangan murni):

| skor | ambang | pengali | akun akhir | selisih berpasangan (bukti) | CI 95% |
|---|---|---|---|---|---|
| base | — | — | **$9.139,26** | — | — |
| p_rug≤30mnt | 0,90 | ×0,5 | $7.693,42 | — | — |
| p_rug≤5mnt | 0,25 | ×0,5 | $7.636,02 | −$541 | [−964, −170] |
| p_rug≤3mnt | 0,15 | ×0,5 | $7.177,65 | −$2.376 | [−3.494, −1.242] |
| p_rug≤10mnt | 0,55 | ×0,5 | $7.269,96 | −$1.045 | [−1.567, …] |
| p_rug≤10mnt | 0,40 | ×0,5 | $6.184,05 | −$2.408 | signifikan |
| p_rug≤1mnt | 0,05 | ×0,5 | $5.849,28 | −$3.128 | [−4.470, −1.863] |
| linear ×(1−p_rug10) | — | — | $4.156,06 | — | — |

**Semua negatif, sebagian besar signifikan.** Skor rug memperkecil pemenang sama banyaknya dengan
pecundang, karena di dalam daftar beli skor itu tidak memisahkan apa-apa (lihat tabel AUC di atas).

---

## Batas atas: oracle (tahu masa depan) — berapa hadiahnya kalau ini terpecahkan

Tolak persis koin yang memang rug, aturan pemilik, maks 5 posisi:

| oracle menolak | beli | akun akhir | selisih | win | PF | DD |
|---|---|---|---|---|---|---|
| — (base) | 157 | $9.139,26 | — | 75,8% | 3,36 | 23,6% |
| rug ≤1 mnt | 156 | $11.194,94 | **+$2.056** | 79,5% | 4,54 | 23,6% |
| rug ≤3 mnt | 152 | $15.073,46 | **+$5.934** | 87,5% | 9,08 | **7,1%** |
| rug ≤5 mnt | 145 | $16.118,97 | **+$6.980** | 89,0% | 19,99 | **3,8%** |
| rug ≤10 mnt | 99 | $6.238,47 | −$2.901 | 86,9% | 20,57 | 6,0% |

Dua hal penting:
1. Hadiahnya besar — **+$6.980 dan drawdown 23,6% → 3,8%**. Masalah ini layak dikerjakan lagi.
2. Baris terakhir membunuh satu-satunya sinyal yang nyata: **menolak koin yang rug ≤10 menit merugi
   $2.901**, walau dilakukan dengan pengetahuan sempurna. Jadi AUC 0,692 pada horizon 10 menit tidak
   bisa dipakai sebagai filter masuk, betapa pun bagusnya modelnya.

## Sensitivitas ekor (untung orde-1, daftar beli base)

| | total | tanpa 1 terburuk | tanpa 3 | tanpa 5 | tanpa 1 terbaik | tanpa 3 | tanpa 5 |
|---|---|---|---|---|---|---|---|
| semua | $9.536 | $10.021 | $10.648 | $11.174 | $8.970 | $8.000 | $7.185 |

Lima trade terburuk hanya bernilai **$1.638** (17% untung); lima trade terbaik bernilai **$2.351**.
Jadi perbaikan apa pun dari sisi rug terbatas di kisaran $1,6rb–$7,0rb, sedangkan kerusakan dari menunda
masuk (−$6.000 ke atas) langsung melampauinya. Ini penjelasan pokok kenapa jalur B kalah.

---

## Kesimpulan & saran

1. **Jangan pasang filter rug di sisi masuk, jangan tunda masuk, jangan perkecil posisi berdasarkan skor
   rug.** Semua varian rugi, dengan bukti berpasangan dan CI. Dolar diselamatkan: **$0**.
2. **Pasang aturan reputasi dev versi "semua koin terlihat"** (bot sekarang hanya ingat koin yang dibeli
   sehingga inert). Presisi 100% di periode bukti tapi hanya menyala 6 dari 2.125 koin — gratis, bukan
   solusi.
3. Rug instan pada koin yang lolos filter **terbukti tidak bisa ditebak** dari seluruh data on-chain yang
   tersimpan sekarang: AUC 0,52 [0,39–0,66] untuk rug ≤3 menit di daftar beli, presisi 0,146 pada basis
   0,141. Ini menutup P2 dari sisi "fitur baru dari data lama".
4. **Satu-satunya sinyal nyata adalah rug ≤10 menit (AUC 0,692 [0,60–0,78])**, dan tempatnya bukan di
   sisi masuk (oracle membuktikan itu rugi) melainkan **sebagai masukan model KELUAR**: koin dengan
   `p_rug10` tinggi layak diberi trailing lebih ketat / batas pegang lebih pendek. Ini wilayah Agent 07;
   skornya sudah tersedia di `kerja_15/prug_multi.csv` (kolom `p_rug1..p_rug30`, kausal, siap pakai).
5. **Data yang kurang untuk bisa maju** (urut nilai):
   - **Pemilik posisi LP + status kunci.** `liq.csv` tidak menyimpan owner/salt. Tanpa ini "LP terkunci?"
     dan "siapa yang menarik?" tidak bisa dijawab. Butuh perubahan collector (`ModifyLiquidity` menyimpan
     `sender`/`salt`, plus pembacaan kontrak locker).
   - **Pengirim swap** (P9 — sudah diketahui).
   - **Transfer token sesudah `init+600`.** Sekarang berhenti tepat di menit-1, jadi "dev menambah/menarik
     token dari pool sesudah menit-1" tidak bisa diuji.
   - Kalau ketiganya ada, hipotesis yang belum bisa diuji: apakah penarik LP = dompet yang sama dengan
     penambah, dan apakah dompet itu sudah menarik LP di pool lain sebelumnya.

## Berkas

`kerja_15/`: `lp_feat.js` (ekstrak struktur LP), `tickpos.js`, `gate_multi.py` (model rug bertingkat
kausal → `prug_multi.csv`), `rug_dalam.py` (model di wilayah keputusan), `v4e15.js` + `replay15.js`
(mesin salinan, blok masuk bisa diatur + gerbang LP), `pasangan.py` / `uang_pasangan.py` / `ekor_shrink.py`
(uji berpasangan + bootstrap + sensitivitas ekor), `feats15.js` / `score15.py` / `arena15.js` (pipa penuh),
`out/` (trade mentah 9 varian × 6 periode), `arena_*.json` (hasil akun per varian).
