# Agent 14 — Anatomi roket: naik, puncak, turun, rug

Data: **semua swap on-chain setelah bot masuk**, sampai batas 9 jam (324.000 blok), 6 periode
(ags1, ags4, u_ds5d, u_ds24 = periode PILIH; m1, m2 = periode BUKTI).
2.590 koin dibeli mesin, **2.385 punya deret waktu setelah masuk** (sisanya mati di blok masuk).
Deret dibangun per **bar 300 blok (± 30 detik)**: harga, nilai posisi kita, likuiditas pool,
jumlah & USD beli vs jual, jual terbesar terhadap likuiditas, jarak antar swap, penarikan LP.
Hipotesis ditulis lebih dulu di `kerja_14/HIPOTESIS.md`. Semua ambang dipilih **hanya di PILIH**,
lalu dibuktikan di **m1+m2**, dengan kontrol acak.

Puncak di sini = **puncak nilai posisi** (sudah termasuk slippage kita sendiri), bukan puncak harga:
61 koin ≥10x, 23 ≥25x, 8 ≥50x, 1 ≥100x.

**Lubang data yang tidak bisa ditutup:** `swaps_sorted.csv` tidak punya kolom pengirim dan
`transfers.json` berhenti di `init+600`. Jadi **"siapa yang menjual" (pembeli awal / holder besar / dev)
TIDAK ADA DATA** untuk fase keluar. Itu dugaan H8 saya dan terbukti.

---

## 1. Anatomi — angka

### a. Menjelang PUNCAK (koin ≥10x, n=60, semua periode)
| menit sebelum puncak | beli per 3 mnt | jual/beli USD 3 mnt | jual terbesar (% LP) | turun dari puncak |
|---|---|---|---|---|
| −30 | 1 (pool sepi) | 0,00 | 0,0% | 5% |
| −10 | 14,5 | 0,11 | 0,2% | 1% |
| −5 | 28 | 0,40 | 1,6% | 5% |
| −3 | 48,5 | 0,49 | 1,6% | 6% |
| −1 | 55 | 0,64 | 2,2% | 6% |
| **puncak** | 66,5 | 0,65 | **4,9%** | 13% |

Bacaan: koin naik justru saat **pembeli makin ramai**. Rasio jual/beli naik pelan 0,11 → 0,65
tapi **tidak pernah melewati 1 sebelum puncak**. Jadi ambang "jual > beli" tidak bisa jadi
peringatan dini puncak — ia baru menyala saat harga sudah jatuh.

### b. Menjelang DUMP (turun ≥50% dari puncak; koin ≥10x, n=54)
| menit sebelum dump | jual/beli 1 mnt | jual/beli 3 mnt | jual terbesar (% LP) | turun dari puncak |
|---|---|---|---|---|
| −10 | 0,20 | 0,19 | 0,3% | 4% |
| −5 | 0,52 | 0,47 | 2,1% | 15% |
| −3 | 0,72 | 0,67 | 2,3% | 19% |
| −1 | 0,78 | 0,67 | 3,5% | 16% |
| **dump** | **2,97** | **1,34** | **8,6%** | **62%** |

Jarak puncak → dump: **median 1,0 menit** (koin ≥10x; 90% koin ≥10x akhirnya dump ≥50%).
Kecepatan: **penurunan 1-bar terbesar median 53–57%**, dan **60–66% dump kehilangan ≥40% dalam satu bar 30 detik**.
Dump cepat: puncak→dump 1,0 menit; dump pelan: 4–5 menit.

**Kesimpulan keras: tekanan jual TIDAK mendahului dump — ia datang bersamaan dengan dump.**
Satu-satunya besaran yang bergerak lebih dulu adalah **turunnya harga dari puncak berjalan** (15% di −5 menit, 19% di −3 menit).

### c. Waktu puncak (menit setelah masuk)
| kelompok | n | median | p10 | p90 |
|---|---|---|---|---|
| ≥10x | 60 | 62,5 | 10,5 | 359 |
| ≥3x | 352 | 11,0 | 5,0 | 104,5 |
| 1,5–3x | 712 | 6,0 | 1,5 | 18,5 |
| <1,5x | 1076 | 2,0 | 0,0 | 15,5 |

### d. DUA CARA KOIN MATI (ini yang terpenting untuk uang)
1. **Dijual habis** — harga runtuh dalam satu bar, tanpa peringatan (di atas).
2. **Rug likuiditas** — dev menarik **100% LP dalam SATU kejadian**. Dari 157 koin yang benar-benar
   dibeli bot di uji akun, **24 koin (15%) mati begini** dan semuanya jadi **nol total (ret −0,001)**.
   LP ditarik pada bar ke-0 sampai ke-14 (**0–7 menit setelah masuk**), 20 dari 24 dengan `rem/add = 1,000`
   persis, tanpa tahap 30% dulu, **0,0 menit** sebelum swap terakhir. Posisi langsung tidak bisa dijual.
   Kerugian: **−$3.061 dari akun $9.139 (33%)**, dan slot posisi terkunci rata-rata **539 menit**.
   Untuk koin yang mati dengan cara (1), LP ditarik ≥10% hanya pada **1–2%** kasus dan selalu **sesudah**
   harga jatuh — jadi "LP ditarik" bukan peringatan dini untuk dump biasa.

---

## 2. Sinyal keluar: seberapa awal, seberapa benar

Sinyal dihitung **kausal** (hanya data sampai bar itu). "lead" positif = menyala **sebelum** puncak
(artinya kita keluar kecepatan); negatif = menyala **sesudah** puncak (yang kita mau, asal jangan terlalu jauh).
"benar" = keluar di ≥50% puncak dan koin tidak naik ≥1,5x lagi sesudahnya.
Sampel: koin dengan puncak ≥3x. PILIH n=130, BUKTI n=284.

| sinyal | nyala (BUKTI) | lead puncak | lead dump | benar | terlalu cepat | terlambat |
|---|---|---|---|---|---|---|
| turun 15% dari puncak (stlh 1,5x) | 81% | +6,0 mnt | +14,5 mnt | 17% | **77%** | 6% |
| turun 30% dari puncak (stlh 1,5x) | 60% | +2,0 mnt | +6,0 mnt | 21% | 57% | 22% |
| jual/beli USD 3 mnt ≥ 1 | 64% | +5,0 mnt | +10,0 mnt | 19% | 66% | 14% |
| jual/beli USD 1 mnt ≥ 2 | 94% | +5,0 mnt | +11,5 mnt | 19% | 75% | 6% |
| >55% swap adalah jual (3 mnt) | 64% | +0,5 mnt | 0,0 mnt | 22% | 42% | 36% |
| satu jual ≥5% likuiditas | 44% | +2,2 mnt | +8,0 mnt | 22% | 58% | 20% |
| satu jual ≥10% likuiditas | 23% | 0,0 mnt | 0,0 mnt | 17% | 38% | 45% |
| LP ditarik ≥30% | **12%** | −0,5 mnt | −23,5 mnt | **79%** | 0% | 21% |
| tidak ada pembeli 5 menit | 42% | −5,0 mnt | −5,0 mnt | 8% | 52% | 41% |

Angka PILIH sejenis (turun 15%: benar 9%, cepat 79%; turun 30%: benar 15%, cepat 50%;
LP ditarik ≥30%: nyala 12%, benar 93%).

Bacaan penting:
- **Tidak ada sinyal tekanan yang mendahului puncak.** Yang paling dekat puncak justru
  "lebih dari 55% swap adalah jual", dan itu menyala **0,5 menit sesudah** puncak — sudah telat 62% nilai.
- Sinyal yang paling sering "benar" (LP ditarik ≥30%, 79–93%) hampir tidak pernah menyala (12%)
  dan **tidak menyelamatkan uang** karena likuiditasnya sudah hilang saat menyala.
- Semua sinyal lain terlalu cepat 38–77% kali.

### Puncak sementara vs puncak akhir (ini satu-satunya sinyal tekanan yang nyata)
Saat harga turun 30% dari puncak berjalan (setelah naik 1,5x), dipilah menurut jual/beli USD 3 menit:

| kelompok (jual/beli 3 mnt) | PILIH pulih lewat puncak lama | BUKTI pulih | BUKTI puncak berikut / nilai sekarang |
|---|---|---|---|
| paling sedikit jual (kuartil 1) | 68% | 47% | 1,47x |
| kuartil 2 | 40% | 45% | 1,38x |
| kuartil 3 | 19% | 18% | 1,02x |
| paling banyak jual (kuartil 4) | **0%** | **5%** | 1,00x |

AUC "akan pulih" dari rasio jual/beli: **0,83 di PILIH, 0,73 di BUKTI** (kontrol label acak ≈ 0,50).
Jadi hubungan ini **nyata dan bertahan di periode bukti**: kalau saat penurunan pembeli masih menang,
koin sering naik lagi; kalau penjual menang, hampir tidak pernah.
**Tapi lihat bagian 4 — nilai uangnya nol.**

---

## 3. Tiga tanda dengan angka (presisi kausal, potret tiap 5 menit)

| tanda | aturan | PILIH presisi (dasar) | BUKTI presisi (dasar) | angkat vs acak |
|---|---|---|---|---|
| **masih mau naik** | ≥5 pembelian dalam 3 mnt **dan** jual/beli USD 3 mnt ≤ 1,0 | **41,9%** (14,6%) | **41,1%** (22,1%) | 2,88x / **1,86x** |
| **sudah puncak** | turun ≥30% dari puncak berjalan | 74,0% (73,3%) | 71,2% (66,5%) | 1,01x / **1,07x** |
| sudah puncak (versi tekanan) | jual/beli 3 mnt ≥ 1 setelah 1,5x | 51,7% | 48,8% | 0,70x / **0,73x** |
| **mau rug** | LP ditarik ≥30% | 1,0% | 0,0% | 0,39x / **0,00x** |
| mau rug (versi jual besar) | satu jual ≥5% likuiditas | 13,0% | 15,2% | 5,40x / **1,70x** |

Kontrol acak (nyala 25% acak) memberi angkat 1,00–1,04x di semua tanda — jadi angka di atas bukan kebetulan hitung.

Terjemahan sederhana:
- **Tanda "masih mau naik" itu NYATA**: kalau pembeli masih berdatangan dan uang beli masih
  mengalahkan uang jual, peluang koin naik ≥1,5x lagi **41%**, dua kali lipat peluang biasanya.
  Ini tanda untuk **MENAHAN**, bukan untuk keluar.
- **Tanda "sudah puncak" praktis TIDAK ADA.** Kapan pun kita lihat, 67–73% koin memang sudah
  lewat puncaknya. "Turun 30%" hanya menaikkan tebakan itu 1 persen poin. Versi tekanan jual malah
  **lebih buruk dari tebakan buta** (angkat 0,7x): saat jual sudah mengalahkan beli, sering sudah terlambat.
- **Tanda "mau rug" TIDAK ADA.** LP ditarik 100% dalam satu kejadian, 0 menit sebelum swap terakhir.
  Versi "satu jual ≥5% likuiditas" tampak bagus di periode pilih (5,4x) tapi runtuh di periode bukti (1,7x,
  presisi 15%) — **gagal**.

---

## 4. Uji uang (salinan mesin di `kerja_14/`, aturan pemilik: maks 5 posisi, 1/4 Kelly, gas nyata)

Mesin disalin ke `kerja_14/v4engine.js`, ditambah aturan keluar lewat env `X14`. **Cek wajib lolos:**
replay `data/ags4` dengan `X14` mati menghasilkan **75 trade identik** dengan `data/ags4/trades.jsonl` (beda 0).
Model keluar per periode memakai `wf_bahaya_W*/wf_naik_W*` persis seperti `wf_penuh.sh` (tidak ada intip masa depan).

| aturan keluar | akun akhir | beli | win | PF | DD maks | trade berubah (dari 157 yang dibeli) |
|---|---|---|---|---|---|---|
| **sekarang (dasar)** | **$9.139** | 157 | 75,8% | 3,36 | 23,6% | — |
| trailing 15% setelah 1,5x | $4.327 | 171 | 74,3% | 4,67 | 28,3% | 57 |
| trailing 20% setelah 1,5x | $5.898 | 160 | 76,3% | 5,23 | 33,6% | 28 |
| trailing 30% setelah 1,5x (pilihanku dari PILIH) | $10.294 | 164 | 75,0% | 3,77 | **19,0%** | 6 |
| trailing 40% setelah 1,5x | $9.290 | 147 | 72,8% | 3,48 | **16,1%** | **0** |
| trailing 50% setelah 1,5x | $12.746 | 170 | 77,1% | 4,73 | 16,9% | **0** |
| **tekanan (keluar 15% bila jual menang, 30% bila tidak)** | $10.387 | 169 | 78,1% | 4,29 | 21,6% | 14 |

Dengan maks 10 posisi: dasar $11.373 | t15 $4.979 | t20 $7.858 | t30 $13.440 | t40 $13.425 | t50 $13.895 | tekanan $11.765.

Koin dengan puncak nilai posisi ≥10x yang berhasil dipegang sampai ≥50% puncaknya:
**12 dari 16 di SEMUA varian** (tidak berubah). Rata-rata bagian puncak yang tertangkap 66% di semua varian.

### Kenapa tabel itu TIDAK boleh dibaca sebagai "trailing 50% lebih baik"
Trailing 40% dan 50% **tidak pernah menyala** pada 157 koin yang benar-benar dibeli bot
(0 trade berubah), tapi akunnya tetap bergerak $9.290 → $12.746. Penyebabnya: aturan keluar
mengubah `ret` 2.847 trade → label `win` berubah → **model saringan ML dilatih ulang dengan label lain
→ bot membeli koin yang berbeda**. Jadi selisih akun itu **kebisingan pemilihan koin, bukan mutu aturan keluar**.

Uji berpasangan (koin yang sama, daftar beli dasar, beda log-ret per trade, bootstrap 95%):

| aturan | trade berubah | beda log-ret rata2 | selang 95% |
|---|---|---|---|
| trailing 15% | 57 | **+0,177** | −0,101 … +0,540 |
| trailing 20% | 28 | +0,145 | −0,051 … +0,432 |
| trailing 30% | 6 | −0,003 | −0,009 … +0,002 |
| trailing 40% / 50% | 0 | 0,000 | — |
| tekanan (adaptif) | 14 | **−0,009** | −0,017 … −0,003 |

**Tidak satu pun beda yang meyakinkan.** Trailing 15–20% menaikkan hasil rata-rata per trade tapi
selangnya melewati nol, dan akunnya justru turun separuh. Aturan tekanan sedikit **merugikan**.

### Aturan baru yang saya rancang sendiri: tutup paksa saat rug terdeteksi
24 dari 157 koin mati karena LP ditarik 100% dan tetap "dipegang" sampai batas 9 jam
(rata-rata 539 menit) walau nilainya sudah nol. Saya tambahkan: **begitu LP ditarik >80%,
tutup posisi saat itu juga** (uangnya tetap hilang, tapi slot dan modal bebas).

| | akun (maks 5) | akun (maks 10) | lama pegang rata2 | DD |
|---|---|---|---|---|
| dasar | $9.139 | $11.373 | 94 mnt | 23,6% |
| tutup paksa saat rug | $8.815 | $8.815 | **15 mnt** | 24,5% |
| tutup paksa saat rug + trailing 30% | $8.398 | $8.398 | 15 mnt | 24,5% |

**Gagal.** Slot ternyata **bukan** pembatas: dengan tutup-paksa, hasil maks 5 dan maks 10 jadi identik
(slot tidak pernah penuh), dan akunnya sedikit lebih rendah. Yang membatasi ukuran taruhan adalah
1/4 Kelly + batas eksposur 50%, bukan jumlah slot. Jadi "modal terkunci 9 jam di posisi nol" ternyata
**tidak memakan biaya kesempatan** pada aturan pemilik sekarang. (Tetap perlu dipasang di bot LIVE
supaya laporan posisi jujur, tapi jangan diharapkan menambah uang.)

---

## 5. Yang gagal (ditulis apa adanya)

| yang diuji | hasil di PILIH | hasil di BUKTI (m1+m2) | vonis |
|---|---|---|---|
| Trailing adaptif: ketat 15% bila jual menang, longgar 30% bila tidak | +331 (terbaik di PILIH) | +509 vs +549 trailing rata | **GAGAL** — kalah dari trailing biasa di luar sampel |
| "Tahan sampai 30% kalau pembeli masih menang" (gerbang tekanan) | −4 (bootstrap −145…+123) | +88 (+36…+141) — tapi **tanpa gerbang** +87 | **GAGAL** — semua untungnya dari menunggu 30%, bukan dari tekanan |
| Trailing + konfirmasi tekanan (AND) | 231 vs 260 trailing biasa | 473 vs 458 | **GAGAL** — konfirmasi menunda keluar, tidak menambah |
| Keluar saat satu jual ≥3–5% likuiditas | 152–176 vs 296 | 446–534 vs 549 | **GAGAL** — 58–85% terlalu cepat |
| Keluar saat pembeli berhenti datang 5–20 menit | −72 … −46 (rugi) | +58 … +218 vs +549 | **GAGAL** |
| Keluar saat LP ditarik ≥30% | nyala 12%, tidak mengubah uang | idem | **GAGAL** untuk dump; rug sudah telanjur |
| Aturan berjenjang (ambang beda untuk <3x / 3–10x / >10x) | terbaik 341 (0,4/0,3/0,2) | 548 vs 549 rata | **GAGAL** — urutan terbaik tidak pindah periode |
| Stop rugi bawah (jual bila nilai <0,6–0,8 sebelum 1,5x) | 90–98 vs 296 | 30–36 vs 549 | **GAGAL BESAR** |
| Tutup paksa saat rug (bebaskan slot) | — | $8.815 vs $9.139 | **GAGAL** — slot bukan pembatas |
| Kontrol acak (keluar di bar acak) | 36–84 vs 296 | 199–304 vs 549 | dilewati semua aturan trailing (bagus: bukan kebetulan) |

Kontrol acak bekerja seperti seharusnya: aturan trailing jelas mengalahkan keluar acak di tingkat koin,
tapi **tidak satu pun aturan mengalahkan exit bot sekarang di tingkat akun**.

### Jebakan metode yang harus diketahui Agent 7
Membandingkan aturan keluar lewat pipa lengkap (replay → `build_feats2` → `arena_score` → `arena`)
**tidak sah untuk perbandingan halus**: aturan keluar mengubah `ret`, `ret` mengubah label `win`,
label mengubah model saringan, dan bot lalu **membeli koin yang berbeda**. Terbukti: trailing 40% dan 50%
tidak menyala sama sekali pada koin yang dibeli, tapi akun berubah $9.290 → $12.746.
**Perbandingan yang sah = berpasangan pada daftar beli yang dikunci** (seperti tabel di bagian 4).

---

## 6. Usul final untuk Agent 7

1. **Jangan ganti aturan keluar berdasarkan tekanan beli/jual.** Sudah diuji 30+ varian
   (rasio USD 1/3/10 menit, pecahan swap jual, jual besar %LP, penjual unik, sejak-puncak, adaptif,
   berjenjang). Yang terbaik di periode pilih selalu kalah di m1+m2, dan uji berpasangan
   memberi **−0,009 log-ret (selang −0,017 … −0,003)** — sedikit merugikan.
2. **Koreksi angka yang beredar:** "trailing 15% setelah 1,5x ≈ $18,2rb" **tidak benar**.
   Di mesin sebenarnya dengan gas nyata dan aturan pemilik, trailing 15% memberi **$4.327**
   (vs $9.139 sekarang). Perkiraan kasar itu melewatkan gas, slippage, jeda eksekusi, dan efek slot.
3. **Kalau tetap mau memasang trailing, pasang yang LEBAR (≥40%) sebagai rem darurat saja.**
   Pada koin yang benar-benar dibeli bot ia **tidak pernah menyala** (0/157) sehingga tidak merusak apa pun,
   tapi di seluruh 2.847 trade ia memangkas ekor terburuk dan menurunkan DD maks (23,6% → 16,1%).
   Ini satu-satunya perubahan yang saya anggap aman diuji maju. Jangan pasang 15% atau 20%.
4. **Tambahkan "tutup paksa saat LP ditarik >80%" di bot LIVE** — bukan untuk untung (terbukti tidak
   menambah), tapi supaya `status.json` tidak melaporkan posisi mati sebagai posisi hidup selama 9 jam.
5. **Kebocoran "batas 9 jam" bukan masalah keluar, tapi masalah MASUK.** Dari 27 trade "akhir data"
   (−$3.061), **24 adalah rug LP 100% dalam 0–7 menit setelah masuk** dan **25 dari 27 tidak pernah
   mencapai TP1**. Tidak ada aturan keluar yang bisa menyelamatkannya — likuiditasnya hilang seketika.
   Perbaikannya harus di saringan masuk (kenali pola dev yang akan menarik LP), bukan di exit.
6. **Yang boleh dipercaya dari laporan ini** hanyalah tanda "masih mau naik"
   (pembeli ramai + jual/beli ≤1 → peluang naik ≥1,5x lagi 41% vs 22% biasanya, bertahan di m1+m2).
   Itu tanda untuk **MENUNDA jual**, bukan untuk menjual — dan fungsi itu sudah dikerjakan
   model `p_naik` (UP_TH/TP_UP) yang sekarang dipakai. Tidak perlu aturan baru.

Berkas kerja: `hasil/audit/kerja_14/` (bar per 30 detik 6 periode, skrip `bar.py`, `anat.py`, `lead.py`,
`rule*.py`, `dip.py`, `tanda.py`, `lain.py`, `beda.py`, salinan mesin + hasil replay `tr_*`, arena `eq_*`).
