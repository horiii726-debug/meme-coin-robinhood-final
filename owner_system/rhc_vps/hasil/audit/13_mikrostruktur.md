# Agent 13 — Mikrostruktur Roket Ekstrem

Data: 2.558 koin berlabel (2.797 dilihat bot), 167.397 swap mentah menit-1 dibaca streaming dari
`data/*/swaps_sorted.csv` (blok ≤ init+600, ditambah tick + tx_hash yang tidak ada di `swaps_m1.json`).
Periode pilih = ags1/ags4/u_ds5d/u_ds24 (646 koin). Periode bukti = m1+m2 (1.912 koin).
Kerja di `hasil/audit/kerja_13/`. Tidak ada file proyek yang diubah.

**Jumlah roket sangat sedikit:** ≥10x = 64 koin (34 lama / 30 bukti), ≥25x = 25 (14 / 11), ≥50x = 11.
Semua 25 koin ≥25x adalah token berbeda (tidak ada duplikat). **Kontrol label diacak lolos:**
AUC acak median 0,50, tapi selang 95% untuk ≥25x adalah **[0,33–0,67]**. Artinya AUC di bawah 0,67
pada label ≥25x **tidak bisa dibedakan dari kebetulan**. Angka di bawah dibaca dengan aturan itu.

## 1. Hipotesis (ditulis sebelum uji — `kerja_13/HIPOTESIS.md`)

H1 pool kecil & sepi · H2 swap kecil seragam tanpa whale · H3 dampak/dolar tinggi ·
H4 jeda pool-lahir→swap-pertama lebih lama · H5 tidak ada jual cepat · H6 likuiditas full-range ·
H7 swap menyebar · H8 (null) semua lemah & tidak stabil · H9 skor roket = negatif untuk uang.

## 2. Tabel fitur → AUC → vonis (label puncak harga, periode bukti m1+m2)

Fitur baru yang saya bangun: 50 buah (ukuran swap, dampak asimetris, jarak antar swap/blok kosong,
kedalaman vs beli, tick & lebar rentang likuiditas, identitas pembeli via pencocokan transfer↔swap
[cocok 100% di 81% pool], jual cepat menit-1).

| Fitur | Arti | AUC ≥25x lama | AUC ≥25x bukti | AUC sesudah disamakan ukuran pool | Vonis |
|---|---|---|---|---|---|
| `mi_buy` (baru) | dampak harga per dolar, beli | 0,58 | **0,81** | 0,62 | proxy pool tipis |
| `mi_sell` (baru) | dampak harga per dolar, jual | 0,59 | **0,82** | 0,65 | proxy pool tipis |
| `me_tick_per_usd` (baru) | tick bergerak per dolar dibeli | 0,62 | **0,82** | 0,56 | proxy pool tipis |
| `lam_buy` / `lam_sell` (lama) | idem, sudah ada di bot | 0,59 / 0,60 | 0,82 / 0,84 | — | sudah dimiliki bot |
| `lp_m1` (lama) | likuiditas pool menit-1 | 0,40 | **0,19** (kecil=roket) | — | **satu-satunya yang kuat** |
| `mf_dom_buyer` (baru) | porsi pembeli terbesar | 0,39 | 0,27 | 0,35 | lemah, di tepi kebetulan |
| `mf_repeat_frac` (baru) | pembeli yang beli lagi | 0,33 | 0,30 | 0,43 | lemah tapi arah konsisten |
| `mi_asym` (baru) | dampak beli ÷ dampak jual | 0,29 | 0,41 | 0,65 | **tanda berbalik → buang** |
| `mg_flip_frac` (baru) | penjual yang tadi membeli | — | 0,63 | 0,64 | dalam pita kebetulan |
| `mt_first_gap` (baru) | jeda pool lahir → swap ke-1 | 0,37 | 0,41 | 0,48 | **H4 salah**: median 0 blok di semua kelompok |
| `me_full`, `me_width`, `me_conc` | lebar/konsentrasi rentang likuiditas | 0,41 | 0,41–0,52 | ~0,45 | **H6 salah**: `me_conc`=1,0 untuk 100% pool (tidak ada variasi) |
| `mt_gap_med`, `mt_blk_uniq`, `mt_same_tx`, `mt_empty_max` | pola waktu/blok kosong | ~0,5 | 0,49–0,57 | ~0,5 | **H7 gagal** |
| `mz_med_buy`, `mz_gini`, `mz_disp`, `mz_max_frac` | ukuran & sebaran swap | ~0,5 | 0,47–0,62 | ~0,45–0,64 | **H2 gagal** |
| `mg_sell_early`, `mg_first_sell`, `mg_sell_n` | jual cepat menit-1 | ~0,54 | 0,43–0,56 | ~0,5 | **H5 gagal** |

**Poin utama:** setelah dibandingkan hanya antar koin berukuran pool sama (AUC dalam kuintil `lp_m1`),
**semua** fitur mikrostruktur baru jatuh ke 0,35–0,65 — di dalam pita kebetulan. Tidak ada satu pun
yang menambah informasi di atas "seberapa tipis pool-nya".

## 3. Presisi di puncak skor (periode bukti, n=1.912; dasar ≥10x = 1,6%, ≥25x = 0,6%)

| Diurut menurut | top 1% (n=19) ≥10x | top 2% (n=38) | top 5% (n=95) | ≥25x di top 5% | rug (pk_val<0,5) | ret rata-rata |
|---|---|---|---|---|---|---|
| `mi_buy` | 1 (5,3%) | 3 (7,9%) | 3 (3,2%) | 1 | 1,1% | 1,46 |
| `mi_sell` | 0 | 0 | 4 (4,2%) | 3 | 9,5% | 1,47 |
| `lp_m1` terkecil | 1 (5,3%) | 1 (2,6%) | 3 (3,2%) | 1 | 11,6% | 1,10 |
| `md_pool_bought` terkecil | 0 | 0 | 4 (4,2%) | 2 | **23,2%** | 0,88 |
| model **A+ 8 fitur** (pra-daftar) | 2 (10,5% [2,3–29,7]) | 3 (7,9%) | 3 (3,2%) | **0** | 5,3% | **0,81** |
| filter bot sekarang (fitur lama) | 1 (5,3%) | 1 (2,6%) | 1 (1,1%) | 1 | 37,9% | 1,10 |

Model A+ (8 fitur dipilih **hanya** di periode lama: `md_maxbuy_L, mf_dev_buy, me_width, mf_match,
mt_span, mi_decay, mt_same_blk, mt_first_gap`) → **AUC bukti 0,45–0,48**, di tengah pita kontrol acak
[0,31–0,69]. **Gagal total.** Lolos ±63 koin/hari dari ±450 koin/hari yang dilihat, menangkap 2 dari
30 koin ≥10x di top-1%, dan ret rata-ratanya 0,81 (**rugi**).

## 4. Aturan "sidik jari" dalam bahasa sederhana

Ambang dicari di periode lama, lalu dibuktikan di m1+m2 tanpa disentuh lagi.

> **Aturan yang dicari mesin:** pool di bawah **$15.948**, kurang dari **5 swap**, kurang dari
> **6 pembeli** di menit pertama.

| | periode lama (tempat memilih) | **periode bukti m1+m2** |
|---|---|---|
| koin kena | 95 (14,7%) | 200 (10,5%) |
| benar ≥10x | 9 = **9,5%** (dasar 5,3%) | 4 = **2,0%** [0,7–4,7] (dasar 1,6%) |
| benar ≥25x | 6 = **6,3%** (dasar 2,2%) | **0** [0–1,2] (dasar 0,6%) |
| roket yang tertangkap | 9 dari 34 (26%) | 4 dari 30 (**13%**) |
| rug (nilai posisi puncak < 0,5×) | 13,7% | **28,5%** (dasar 5,6%) |
| ret rata-rata | 1,55 | **1,03** (dasar 1,13) |

**Aturan itu tidak lolos.** Lift 1,80× di periode pemilihan turun jadi 1,25× di periode bukti dan
selang kepercayaannya memuat "tidak ada efek sama sekali". Yang naik justru tingkat rug: 5× lipat.

### Yang benar-benar bertahan: pita likuiditas

Satu-satunya pola yang **berulang di kedua periode** adalah ukuran pool — dan bentuknya bukan
"makin kecil makin bagus", tapi **pita**:

| likuiditas menit-1 | n (bukti) | ≥10x | ≥25x | rug | nilai posisi puncak (median) | ret rata-rata |
|---|---|---|---|---|---|---|
| < $10rb | 42 | 2,4% | 0% | 4,8% | 1,0× | 0,90 |
| **$10rb – $15rb** | 531 | **3,4%** | **1,5%** | **14,7%** | 0,96× | **1,29** |
| $15rb – $20rb | 286 | 1,1% | 0,7% | 1,4% | 1,48× | 1,15 |
| $20rb – $30rb | 771 | 0,9% | 0,1% | 2,9% | 1,66× | 1,06 |
| **> $30rb** | 282 | **0,4%** | **0%** | 0,4% | 1,55× | 1,02 |

Periode lama (n=646) sejajar pada dua ujungnya, **tapi pita terbaiknya bergeser**: $10–15rb = 5,5%/2,2%,
$15–20rb = 8,9%/5,7%, $20–30rb = 4,1%/0%, **>$30rb = 0%/0% (0 dari 73 koin)**.
Jadi yang berulang bukan pita sempitnya, melainkan **batas kasar $20rb**:

| | pool ≤ $20rb | pool > $20rb |
|---|---|---|
| periode lama | 403 koin · ≥10x 6,7% · **≥25x 3,5%** | 243 koin · ≥10x 2,9% · **≥25x 0%** |
| **periode bukti** | 859 koin (45%) · ≥10x 2,6% · **≥25x 1,2%** | 1.053 koin · ≥10x 0,8% · **≥25x 0,1%** |

**Jawaban untuk pemilik, bahasa sederhana:**
Koin yang naik ribuan persen hampir selalu lahir di **pool kecil, di bawah $20.000** — 12 dari 12 koin
dengan puncak tertinggi (47×–130×) punya likuiditas menit-1 antara **$4,9rb dan $19,7rb**, dan dari
**355 koin dengan pool di atas $30rb, nol** pernah mencapai 25× (di kedua periode). Itu sidik jari
yang nyata dan berulang. Aturannya: *pool di bawah $20rb* menangkap **24 dari 25** koin ≥25x sambil
membuang separuh pasar.

**Tapi sidik jari itu nyaris tidak berguna untuk memilih**, karena separuh pasar masih terlalu banyak:
di antara koin pool <$20rb yang benar-benar ≥25x hanya **1,2 dari 100** (dasar pasar 0,6 dari 100).
Jadi aturannya benar sekitar **1 kali dari 86**, naik dari 1 dari 167 — kurang dari dua kali lipat.
Menyempitkannya lagi tidak membantu: pita "terbaik" berpindah dari $15–20rb (periode lama) ke
$10–15rb (periode bukti), tanda bahwa angka sempit itu hanya kebetulan. Dan di pool $10–15rb,
**15 dari 100 koin mati total** (nilai posisi puncak di bawah setengah modal) — lima kali lipat
rata-rata pasar.

Hal-hal yang diduga jadi sidik jari dan **terbukti salah**: jeda sebelum pembeli pertama (median **0 blok**
di semua kelompok — swap pertama masuk di blok yang sama dengan lahirnya pool, jadi tidak ada "berapa detik"
yang membedakan), lebar/konsentrasi rentang likuiditas (`me_conc` = 1,0 untuk **semua** 2.797 pool — tidak
ada variasi sama sekali), ukuran swap, jarak antar swap, blok kosong, jual cepat menit-1, pembeli
yang membeli lagi.

## 5. Vonis uang (arena.js di salinan; aturan pemilik: maks 5 posisi, 1/4 Kelly, gas nyata, slippage aktif)

| Akun | beli | win | akun akhir | DD maks |
|---|---|---|---|---|
| **Filter bot sekarang (10 posisi, patokan resmi)** | 178 | 75,8% | **$12.746,32** | 20,0% |
| **Filter bot sekarang, aturan pemilik 5 posisi** | 157 | 75,8% | **$9.349,51** | 23,2% |
| + jalur roket A (pra-daftar), MOONQ 0,90 | 138 | 53,6% | $2.192,40 | 30,3% |
| + jalur roket A, MOONQ 0,80 | 130 | 52,3% | $6.241,47 | 21,9% |
| + jalur roket B ("kasus terbaik", arah dipilih tahu m1/m2) | 135 | 52,6% | $3.527,64 | 18,7% |
| + jalur roket B, MOONQ 0,80 | 117 | 42,7% | $565,38 | 26,7% |
| **Hanya aturan sidik jari, filter ML dimatikan** | 53 | **24,5%** | **$281,53** | 15,3% |
| Skor roket menggantikan filter bot | 83 | 28,9% | $170,63 | 32,2% |

**Setiap** varian pemburu roket kalah dari filter bot yang ada, tanpa kecuali. Jalur roket menurunkan
win rate dari 75,8% ke 43–54% dan sekaligus **merebut slot** (beli turun 157 → 117–138), jadi ia
membayar dua kali. Akun "hanya sidik jari" untung $181 dalam ±148 jam pasar, dan itupun hanya dari m2
(+$170) sementara di m1 ia **rugi −$18 dengan win rate 7%** — jadi untungnya berasal dari segelintir
koin beruntung, bukan dari keunggulan yang berulang.

**Temuan audit sebelumnya terkonfirmasi: skor roket berkorelasi negatif dengan uang.** Penyebabnya
terlihat jelas di tabel pita: pita $10–15rb yang paling sering meledak juga yang paling sering mati
(rug 14,7% vs 2,9%) dan nilai posisi puncak mediannya **0,96×** — artinya koin khas di pita itu
**tidak pernah** bernilai lebih dari modal masuk.

Catatan kejujuran: varian yang **membuang** koin dari aliran (pita LP sebagai filter keras) tidak
sebanding apple-to-apple, karena model ML kausal jadi dilatih dari aliran yang lebih miskin — semuanya
turun ($640–$7.105). Perbandingan yang sah adalah baris MOONQ, yang hanya **menambah** koin; dan itupun
semuanya rugi relatif.

## 6. Usul untuk Agent 7

1. **Jangan pasang jalur roket / filter "setup A+".** Dibuktikan rugi di 6 varian berbeda, termasuk
   varian yang sengaja saya beri keuntungan tidak adil (fitur dipilih dengan melihat periode bukti).
2. **Pakai pita likuiditas hanya sebagai rambu risiko, bukan filter beli.** Pool $10–15rb punya rug
   14,7% (5× rata-rata). Kalau mau, perkecil ukuran posisi di pita itu — jangan tolak koinnya, karena
   menolak justru memiskinkan aliran latih model dan menurunkan akun.
3. **Kebocoran yang sebenarnya bukan di pintu masuk, tapi di pintu keluar.** Koin yang mencapai ≥10x
   menawarkan **nilai posisi puncak median 18,7×** (≥25x: 40,2×), tapi bot cuma merealisasikan
   **median 2,36×**. Ini lubang jauh lebih besar daripada seleksi masuk.
4. **Batas 9 jam bukan penyebabnya.** Puncak nilai posisi untuk koin ≥10x datang pada **median 61 menit**,
   p90 **359 menit** — semuanya di dalam 9 jam. Kerugian −$3.703 pada 30 trade batas-9-jam berasal dari
   koin yang memang sudah mati, bukan dari roket yang dipotong. Memperpanjang horizon tidak akan menolong;
   memperbaiki aturan keluar (trailing pada koin yang sudah bergerak) yang menolong.
5. `me_conc` bernilai 1,0 untuk seluruh 2.797 pool dan `mt_first_gap` bermedian 0 — kalau ada rencana
   memakai "konsentrasi likuiditas" atau "kecepatan sniper" sebagai fitur, di rantai ini fitur itu
   memang tidak punya variasi. Jangan buang waktu.
6. Satu-satunya arah baru yang belum mati tapi juga belum terbukti: `mf_dom_buyer` rendah (beli menit-1
   tersebar ke beberapa dompet, tidak didominasi satu). Top-1% menurut fitur ini di periode bukti:
   ret rata-rata **1,70**, nilai posisi puncak median **4,03×**, rug **0%** — tapi n=19 koin dan AUC-nya
   di dalam pita kebetulan. **Jangan dipakai sebelum diuji di data periode baru**, bukan di data ini lagi.
