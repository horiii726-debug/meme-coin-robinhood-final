# Pasang di VPS

Langkah menjalankan bot paper trading dan pipeline backtest di VPS Linux (Ubuntu 22.04/24.04).

## Kebutuhan

| | Minimal |
|---|---|
| CPU | 2 core (4 lebih nyaman untuk latih ulang) |
| RAM | 4 GB |
| Disk | 40 GB (paket 6,2 GB + data baru ±7 MB/hari + ruang latih) |
| Node.js | 20.6 atau lebih baru (butuh `--env-file`) |
| Python | 3.10+ |

## 1. Kirim paket

Dari PC Windows (PowerShell), ganti `user@ip-vps`:

```
scp rhc_vps_final.tar.gz user@ip-vps:~/
```

Di VPS:

```
tar -xzf rhc_vps_final.tar.gz
cd rhc_vps
```

## 2. Pasang perangkat

```
sudo apt update
sudo apt install -y curl python3 python3-pip python3-venv
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

cd pipeline && npm install && cd ..
python3 -m venv venv
./venv/bin/pip install -r pipeline/requirements.txt
```

Pakai Python venv untuk latih ulang otomatis — ubah `PYTHON` di `bot/.env`:

```
PYTHON=/home/USER/rhc_vps/venv/bin/python
```

## 3. Periksa sebelum jalan

```
cd bot
node cek_siap.js
```

Bot juga memeriksa sendiri saat start. Di `runner_err.log` harus muncul:

```
model p_bahaya: parity 2.22e-16 OK
model p_naik: parity 1.11e-16 OK
filter: CatBoost 200 pohon, cek JS vs Python selisih 1.11e-16 OK
```

Kalau salah satu tertulis `FATAL`, bot menolak jalan — itu disengaja.

## 4. Atur `.env`

`bot/.env` sudah berisi setelan final. Yang perlu diubah di VPS:

```
RPC_URLS=https://rpc-berbayar-kamu,https://rpc.mainnet.chain.robinhood.com
DOH_URL=
PYTHON=/home/USER/rhc_vps/venv/bin/python
```

Jangan ubah nilai strategi lain tanpa menguji ulang — hasil $12.746 hanya berlaku untuk setelan persis ini.

## 5. Jalankan

```
cd bot
pm2 start ecosystem.config.js
pm2 save
pm2 startup      # ikuti perintah yang dicetak, supaya bot hidup lagi setelah VPS reboot
```

Pasang deteksi bot hang (pm2 hanya tahu kalau proses mati, bukan kalau macet):

```
crontab -e
* * * * * /home/USER/rhc_vps/bot/cek_sehat.sh >> /home/USER/rhc_vps/bot/cek_sehat.log 2>&1
```

## 6. Pantau

```
pm2 logs rhc-paper          # log berjalan
cat bot/status.json         # equity, posisi, drawdown, ketertinggalan blok
tail -f bot/live.log        # setiap koin yang disaring, dibeli, ditutup
```

Yang harus diperhatikan di `status.json`:

| Kolom | Normal | Waspada |
|---|---|---|
| `lag_blocks` | < 300 | > 3.000 = bot tertinggal dari chain |
| `pengaman.mode_aman` | `mati` | `AKTIF` = RPC bermasalah, bot berhenti beli |
| `pengaman.kill_switch` | `mati` | `AKTIF` = drawdown 60%, bot berhenti beli |
| `last_error` | kosong | `Too Many Requests` terus-menerus = RPC kurang kuat |

## 7. Hentikan

```
pm2 stop rhc-paper
```

---

## Menjalankan ulang backtest di VPS

Semua data historis ada di `data/`. Uji maju penuh (2 Ags – 17 Sep, mulai dari nol):

```
cd pipeline
./wf_penuh.sh
cat ../data/wf_penuh.log
```

Butuh `pipeline/npm install` dan venv Python. Tahap transfer & dev memakai RPC.

## Melanjutkan unduhan Agustus yang berlubang

`data/agustus_mentah/w0*/` berisi data yang distop di tengah jalan (13–67% per jendela) beserta `checkpoint.json`. Kolektor melanjutkan dari titik terakhir:

```
cd pipeline
node collect.js 24800000 26800000 ../data/agustus_mentah/w01_ags01
node collect.js 30000000 32000000 ../data/agustus_mentah/w02_ags07
node collect.js 35000000 37000000 ../data/agustus_mentah/w03_ags13
node collect.js 40000000 42000000 ../data/agustus_mentah/w04_ags18
node collect.js 45000000 47000000 ../data/agustus_mentah/w05_ags24
node collect.js 50000000 52000000 ../data/agustus_mentah/w06_ags30
node collect.js 55000000 57000000 ../data/agustus_mentah/w07_sep05
```

Setelah lengkap, urutkan (`sort -t, -k1,1 -k2,2n -k3,3n -u`) sebelum replay — replay mengharuskan file terkelompok per pool.

## Mengambil seluruh riwayat chain

Chain dimulai sekitar akhir Juli (blok ±20 juta, 26 Juli). Seluruh riwayat sampai sekarang ±1.300 jam ≈ 25 GB mentah → ±1.500 trade. Proses per potongan lalu hapus data mentahnya supaya disk tidak penuh.
