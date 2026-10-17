# Agent 13 - hipotesis DITULIS SEBELUM UJI (2026-09-20)

H1. Koin ekstrem (pk_price>=25x) lahir di pool KECIL & SEPI: lp_m1, n_swap, n_buyers rendah.
H2. Ukuran swap menit-1 kecil & seragam; tidak ada satu pembeli dominan (max_buy/total rendah).
H3. Dampak harga per dolar tinggi (pool tipis) -> tapi curiga hanya proxy 1/lp_m1.
H4. Jeda pool-lahir -> swap pertama LEBIH LAMA pada koin ekstrem (belum ditemukan sniper/bot).
H5. Hampir tidak ada jual cepat di menit-1 pada koin ekstrem.
H6. Likuiditas full-range (lebar) lebih sering pada koin ekstrem; konsentrasi sempit = pool dirancang untuk dump.
H7. Swap menyebar di banyak blok berbeda (bukan menumpuk 1 blok / 1 tx router).
H8 (kontra / null): semua sinyal lemah; base rate >=25x ~1%, AUC out-of-sample < 0.65,
    presisi top-1% < 10%, dan tidak stabil antara periode lama dan periode bukti.
H9 (uang): skor roket berkorelasi NEGATIF dengan uang (koin sepi lebih sering rug),
    jadi model "setup A+" kalah dari filter bot sekarang dalam uji akun.

Kontrol wajib: label diacak -> AUC harus ~0,50.
