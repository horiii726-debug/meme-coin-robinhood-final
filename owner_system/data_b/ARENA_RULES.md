# ARENA — aturan uji (dikunci sebelum melihat hasil)

Tujuan: menguji sistem seolah-olah live, di data bagus DAN data buruk, tanpa melihat masa depan.

## Urutan keputusan per koin (persis seperti bot live)
1. Koin lahir di blok `init`. Bot memantau.
2. Di blok `init+600` (menit ke-1) bot menghitung 34 fitur HANYA dari swap & transfer sampai blok itu.
3. **Filter ML (CatBoost)** — skor dari model yang dilatih HANYA dari trade yang sudah TUTUP sebelum
   blok keputusan koin ini. Model dilatih ulang tiap 100 trade tutup. Ambang = kuantil 30% dari
   100 skor terakhir (ambang bergerak, sama seperti live). 30 koin pertama pakai ambang awal 0,195.
4. **Reputasi dev** — dev = dompet pengirim transaksi mint. Daftar-hitam: tolak hanya kalau dev itu
   punya koin sebelumnya (yang sudah tutup sebelum blok ini) dengan ret < 0,3.
5. **Cek honeypot** — versi kausal: kalau di menit-1 belum ada satu pun penjualan berhasil, koin
   dilewati. (Di live ini dilengkapi eth_call; di backtest tidak ada state historis, jadi dipakai
   aturan konservatif ini.)
6. **Ukuran posisi** = 1/4 Kelly kausal x equity saat itu, dibatasi kas. Kelly dihitung hanya dari
   trade yang sudah tutup (warm-up 2% untuk 30 trade pertama, 0,094 sampai 100 trade).
   Tanpa cap 1% likuiditas, tanpa batas $200 (dihapus atas perintah pemilik 18 Sep 2026).
7. **Batas portofolio** — maksimum 20 posisi terbuka; kill switch berhenti beli kalau equity turun
   35% dari puncak.
8. **Masuk** di blok `init+630` (menit-1 + 3 detik), harga urutan terburuk di blok itu.
9. **Keluar**: TP1 +20% jual 60%; sisanya keluar saat model bahaya, dump LP >= 5%, LP ditarik > 30%,
   stop -40%, trailing bencana 10% dari puncak, atau batas pegang 9 jam.
10. **Biaya**: gas $0,06 per swap, approve $0,03, kegagalan transaksi sesuai ukuran nyata.

## Yang DILARANG (anti-nyontek)
- Model tidak boleh dilatih dari trade yang belum tutup pada saat keputusan.
- Ambang, Kelly, dan reputasi dev tidak boleh memakai data setelah blok keputusan.
- Aturan exit & kill switch tidak boleh disetel ulang setelah melihat hasil.
- Periode buruk tidak boleh dibuang. Semua periode yang terkumpul dipakai.

## Laporan yang dihasilkan
Per periode (bagus/buruk) dan keseluruhan: jumlah peluang, jumlah beli, alasan tolak, win rate,
PF, kurva equity, drawdown maksimum, trade terbaik/terburuk.

## Biaya, slippage, dan bot pesaing (semua diaktifkan)
- **Slippage**: dihitung dari matematika AMM v4 sungguhan (sqrtPriceX96 & likuiditas pool saat itu),
  bukan angka tebakan. Pembelian besar menggerakkan harga sendiri (price impact) dan itu ikut dihitung.
- **Gas**: $0,06 per swap (diukur dari receipt on-chain, median $0,054), approve token $0,03.
- **Bot pesaing** (`worstOrder: true`): kalau transaksi kita satu blok dengan bot lain, kita dianggap
  dieksekusi TERAKHIR — harga sudah digerakkan bot lain lebih dulu. Ini asumsi terburuk.
- **Latensi**: keputusan di menit-1, order baru terisi 3 detik kemudian (30 blok). Order jual juga
  terisi 30 blok setelah sinyal, bukan seketika.
- **Transaksi gagal**: beli gagal 1,85% (gas tetap hangus, koin tidak didapat), jual gagal 0,54%
  per percobaan dengan pengulangan (tiap ulangan menambah gas dan menunda keluar). Angka ini dari
  pengukuran nyata router, bukan tebakan.
- **Fee pool** dipakai apa adanya dari konfigurasi tiap pool.
