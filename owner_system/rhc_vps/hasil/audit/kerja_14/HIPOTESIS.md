# Agent 14 — HIPOTESIS ditulis SEBELUM uji (2026-09-20)

Pertanyaan: setelah bot MASUK, sinyal on-chain apa yang mendahului PUNCAK dan RUG,
dan bisakah aturan keluar berbasis tekanan beli/jual mengalahkan exit sekarang?

H1 (naik). Selama koin masih naik, tekanan beli dominan: rasio USD beli/jual per 1-3 menit > 1,5
    dan jumlah swap per menit naik (akselerasi). Puncak TIDAK datang saat pembeli masih ramai.
H2 (puncak). 1-5 menit SEBELUM puncak harga, rasio jual/beli sudah naik (net flow berbalik negatif)
    dan ukuran jual rata-rata membesar dibanding rata-rata jual sebelumnya ("tanda pucuk" versi terukur).
H3 (puncak, versi pesimis). Puncak memecoin di pool tipis datang TANPA peringatan: satu jual besar
    membuat puncak dan penurunan pada blok yang sama; sinyal tekanan telat 0 menit -> tidak berguna.
H4 (rug). Rug/dump didahului oleh: (a) penarikan LP (liq_delta negatif) dan/atau
    (b) satu jual >= 5% likuiditas. Minimal salah satunya muncul >= 1 menit sebelum harga hancur.
H5 (sepi). Pembeli berhenti datang (0 swap beli selama >= 5 menit) adalah tanda akhir yang lebih andal
    daripada tekanan jual: koin mati pelan lebih sering daripada dijual ramai.
H6 (uang). Aturan "trailing longgar yang hanya aktif setelah 1,5x + konfirmasi tekanan jual"
    mengalahkan exit sekarang di periode pilih DAN periode bukti.
H7 (kontra / null, yang paling mungkin benar). Semua sinyal tekanan hanya mengulang informasi
    yang sudah dipakai model bahaya; perbaikan di periode pilih tidak bertahan di m1/m2,
    ambang acak sama baiknya, dan kebocoran "batas 9 jam" tidak tertutup.
H8 (data). Alamat pembeli/penjual SETELAH menit 1 tidak ada di data (transfers.json berhenti di init+600,
    swaps_sorted.csv tidak punya kolom pengirim) -> "pembeli baru vs lama", "dev jual", "holder besar jual"
    TIDAK BISA diuji. Diperkirakan jadi lubang terbesar laporan ini.

Kontrol wajib: ambang acak + aturan acak (keluar di bar acak dengan laju sinyal yang sama).
Periode pilih: ags1, ags4, u_ds5d, u_ds24. Periode bukti: m1, m2. Tidak ada penyetelan di m1/m2.
