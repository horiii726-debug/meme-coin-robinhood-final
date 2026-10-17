# Catatan Audit

Empat auditor memeriksa sistem sampai tingkat baris kode pada 19 September 2026: eksekusi order, screening & ML, risiko & akun, data & keandalan. Temuan yang muncul dari lebih dari satu auditor ditandai ★.

## Sudah diperbaiki

| Temuan | Perbaikan |
|---|---|
| ★ Transaksi gagal dimatikan di live (asumsi 100% berhasil) | `failBuy` 1,85%, `failSell` 0,54% aktif |
| ★ Semua pengaman mati kalau `FILTER≠1` | `gate` selalu dipasang; ML cuma satu lapisan di dalamnya |
| ★ Rem & stop darurat pakai dua definisi drawdown berbeda | satu definisi: harga pasar vs puncak harga pasar |
| ★ Ambang saringan jatuh ke nilai awal tiap restart | 100 skor terakhir disimpan di `account.json` |
| ★ Stop darurat & puncak terhapus tiap restart | disimpan di `account.json` |
| ★ Kelly dilatih dari trade yang tidak pernah dibeli akun | hanya dari posisi yang benar-benar dibuka |
| ★ Harga ETH dibekukan 9 jam per koin | diperbarui terus + batas kewajaran anti-manipulasi |
| ★ Putar ulang membeli koin yang belum pernah dicek | tanpa keputusan tersimpan = tidak beli |
| ★ `trades.jsonl` ditimpa tiap restart | tidak ditimpa kalau hasil putar ulang kosong |
| ★ Kegagalan RPC sesaat jadi vonis tolak permanen | tidak disimpan; koin dinilai ulang |
| ★ Mode aman RPC tidak pernah bisa menyala (`lastOkPoll = 0`) | diinisialisasi saat start, diperbarui tiap potongan blok |
| ★ Bot buang RPC menyaring koin basi saat tertinggal | dilewati tanpa panggil RPC |
| Batas pegang live 6 jam, backtest 9 jam | live 9 jam |
| Nilai fitur hilang dikirim NaN, model dilatih dengan −1 | dikirim −1 (4,7% koin dulu salah rute) |
| Ukuran posisi pakai equity harga beli | pakai equity harga pasar |
| Kelly langsung 9,4% dari trade pertama | pemanasan 2% untuk 30 trade; batas atas 0,25 → 0,10 |
| Kelly mengklamp daerah bangkrut | `f` yang membuat akun habis ditolak |
| Cadangan gas tetap $0,21 | dikali jumlah posisi terbuka |
| Pagar eksposur dicek sebelum posisi ditambah (bisa tembus 59%) | dicek sesudah |
| Watchdog tidak mendeteksi bot hang | `cek_sehat.sh`: restart kalau status basi >3 menit atau tertinggal >20.000 blok |
| Gas di backtest proporsional ukuran simulasi | dolar tetap, sama dengan live |
| Monte Carlo: pengacak berperiode 16.404 (~98 jalur unik) | mulberry32 + blok bootstrap (Monte Carlo tidak dipakai di hasil final) |
| Model keluar diuji di data latihnya sendiri | uji maju: tiap periode hanya dilatih dari periode sebelumnya |
| Data historis tidak terurut per pool → trade ganda | diurutkan & dideduplikasi sebelum replay |
| Tanpa batas likuiditas posisi sampai 22,9% isi pool | batas 1% likuiditas (`LP_CAP=0.01`) |

## Belum diperbaiki — membuat hasil terlalu optimis

| Temuan | Dampak | Perbaikan yang diusulkan |
|---|---|---|
| Penjualan kita tidak menggerakkan harga pool | TP1 60% lalu sisa 40% dijual dari harga yang seolah belum ada penjualan; membesarkan hasil di koin multi-bagger | state pool bayangan yang digeser tiap eksekusi kita |
| Order jual dianggap paling depan dalam blok | beli dianggap paling belakang, jual paling depan — bias searah menguntungkan | pengisian jual di swap terakhir blok target |
| Tidak ada antrean nonce satu dompet | 10 penjualan dianggap serentak dalam 3 detik; justru saat pasar rontok | antrean dompet di mesin, atau beberapa dompet eksekusi |
| Gas konstan $0,06 | tidak ada lonjakan; gas 10× menghapus seluruh edge di posisi kecil | gas dinamis dari basefee, tolak beli kalau gas > 3% posisi |
| `stateNow(blk)` mengabaikan `blk` | harga masuk/pengisian bisa memakai swap beberapa blok setelahnya | cari swap terakhir dengan `blk ≤ target` |
| Latensi observasi tidak dihitung | 3 detik = kirim→mine saja; nyatanya bot baru melihat swap 1,5–3 detik kemudian | ukur `e.lag` dari `events.jsonl`, pakai p90 |
| Keluar di batas horizon instan tanpa latensi | koin sepi di akhir 9 jam dijual seketika | perlakukan sebagai sinyal keluar biasa |
| Hook pool hanya dicek bit `beforeSwap` | hook `afterSwapReturnsDelta` bisa mengambil sebagian hasil jual | tolak semua flag swap-delta |
| Matematika AMM mengasumsikan likuiditas satu rentang tick | hasil lebih buruk kalau harga melewati batas tick | teruskan `tickLower/tickUpper` ke mesin |

## Belum diperbaiki — keandalan & screening

| Temuan | Dampak |
|---|---|
| Cek honeypot menguji `transfer()` ke PoolManager, bukan swap v4 lewat router | token fee-on-transfer 100% atau hook yang memblokir jual bisa lolos |
| Urutan klasifikasi error honeypot terbalik | revert "insufficient balance" dianggap bukan honeypot |
| Aturan "belum ada penjual = tolak" | tidak mengurangi rug (17,4% vs 16,6%) tapi membuang 4 dari 12 roket |
| Penelusuran dev: jendela cuma 1 jam sebelum pool lahir | 18% koin devnya tidak pernah ketemu dan otomatis lolos aturan dev |
| Satu alamat relayer/launchpad bisa dilabeli dev | pernah memblokir 40 koin sekaligus |
| Latih ulang otomatis tanpa uji mutu | model yang lebih jelek tetap dipakai asal lolos parity |
| `thr_start` dihitung in-sample | ambang awal setelah retrain terlalu tinggi |
| Label filter `win = ret > 1` | model mengejar "untung sedikit pun", bukan roket — bertentangan dengan tujuan sniping |
| Ambang saringan murni relatif, tanpa lantai | kalau semua koin jelek, tetap beli 10% terbaik dari yang jelek |
| Tidak ada penanganan reorg | log dari blok yang dibatalkan masuk permanen ke store |
| `parseStore` membaca seluruh CSV sekaligus | ±80 hari lagi file melebihi batas string Node → bot tidak bisa start |
| Tidak ada fsync sebelum `state.json` | mati listrik bisa meninggalkan lubang data permanen |
| `snaps_live.jsonl` tanpa batas ukuran nyata | ±30 MB/hari, tanpa rotasi |
| Tidak ada batas kerugian harian, batas per dev, atau aturan korelasi antar koin | 5 posisi di pasar yang rontok bersamaan = satu taruhan besar |

## Parameter yang dipilih dengan melihat hasil (risiko overfitting)

| Parameter | Status |
|---|---|
| Saringan 10% terbaik (`QTHR=0.90`) | lolos uji silang dua arah (m1→m2 dan m2→m1); 0,80 terbukti gagal |
| `UP_TH` / `TP_UP` = 0,5 | dipilih dari satu periode — **perlu divalidasi di data baru** |
| Slot 10 | dipilih dari data yang sama dengan pengujiannya |
| Tangga rem 10/20/30% | dari Monte Carlo atas data historis yang sama |
