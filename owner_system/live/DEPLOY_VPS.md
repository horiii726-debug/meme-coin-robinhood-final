# Deploy paper trading ke VPS

Mode kertas: bot membaca chain dan mencatat trade simulasi. Tidak ada wallet, tidak ada private key, tidak ada transaksi.

## Yang dibutuhkan
- VPS Linux (Ubuntu 22.04/24.04), RAM minimal 2 GB (4 GB kalau mau menjalankan backtest juga)
- Node.js 20 atau lebih baru, `curl`, `git`
- RPC Robinhood Chain (chainId 4663). Disarankan 1 utama + 1-2 cadangan.

## Langkah
```bash
# 1. pasang Node 20 dan pm2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs curl
sudo npm install -g pm2

# 2. salin folder live/ ke VPS (dari PC): scp -r live/ user@IP_VPS:~/rhc-live
cd ~/rhc-live
cp .env.example .env
nano .env            # isi RPC_URLS; KOSONGKAN DOH_URL di VPS

# 3. cek kesiapan (harus "SIAP JALAN")
node --env-file=.env cek_siap.js

# 4. jalankan terus dengan pm2
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup          # ikuti perintah yang dicetak supaya hidup lagi setelah VPS restart
```

## Memantau
```bash
pm2 status
tail -f live.log                 # MASUK / TUTUP / FILTER / HONEYPOT
cat status.json                  # akun, drawdown, filter, pengaman
```

## Pengaman yang aktif
| Pengaman | Isi |
|---|---|
| Filter ML | model 150 pohon, 34 fitur menit-1, ambang bergerak (30% skor terendah dari 100 koin terakhir) |
| Cek honeypot | lolos kalau sudah ada penjual di menit-1; kalau belum, simulasi transfer pembeli nyata ke PoolManager lewat `eth_call`; revert = dilewati |
| Data segar | tidak beli kalau tertinggal > 30 dtk dari chain atau RPC gagal > 15 dtk |
| Batas posisi | maksimal 20 posisi terbuka |
| Ukuran posisi | 1/4 Kelly (9,4% dari 1.754 trade historis; pakai data live setelah 100 trade) |
| RPC cadangan | pindah otomatis ke URL berikutnya kalau gagal |
| Aturan jual | TP1 +20% jual 60%, model bahaya, dump >=5% LP, LP ditarik >30%, stop -40%, stop bencana, batas 9 jam |

## Berhenti
```bash
pm2 stop rhc-paper
```
