# Bot RHC di VPS Ubuntu — jalan sendiri tanpa Claude

**Mode kertas.** Bot tidak punya kode untuk mengirim transaksi dan tidak memakai kunci dompet.

## Pasang (sekali)
1. VPS Ubuntu 22.04/24.04, minimal 2 vCPU / 4 GB RAM / 40 GB disk. Lokasi di AS (dekat server RPC Robinhood).
2. Unggah `rhc_paket.tar.gz`, lalu jalankan:
   ```
   tar xzf rhc_paket.tar.gz && sudo bash rhc_vps/vps/pasang.sh
   ```
3. Skrip memasang Rust, membangun bot, menguji koneksi RPC, lalu menyalakan 3 layanan:

| Layanan | Tugas |
|---|---|
| `rhc-live` | bot Rust: radar semua DEX + strategi v4 (AUDIT07) + akun kertas; restart otomatis kalau mati |
| `rhc-cek.timer` | tiap 2 menit: restart bot kalau macet atau tertinggal > 20.000 blok |
| `rhc-latih.timer` | tiap hari 03:00 UTC: latih ulang model filter; **dipasang hanya kalau lolos gerbang mutu** |

## Pantau
```
jq . /opt/rhc/bot/rust_live/status.json          # equity, posisi, lag, mode aman
tail -f /opt/rhc/bot/rust_live/live.log          # setiap saringan, beli, tutup
jq '.jumlah, .potensi_tumbuh[:5]' /opt/rhc/bot/rust_live/radar.json
tail /opt/rhc/bot/rust_live/latih_ulang.jsonl    # keputusan latih ulang (diterima/ditolak + angka)
```
Notifikasi HP (opsional): isi `TELEGRAM_TOKEN` dan `TELEGRAM_CHAT_ID` di `/opt/rhc/bot/.env`, lalu `sudo systemctl restart rhc-live`.

## Berkas penting (`/opt/rhc/bot/rust_live/`)
| Berkas | Isi |
|---|---|
| `trades.jsonl`, `events.jsonl` | semua trade & kejadian |
| `decisions.jsonl` | skor & keputusan tiap koin (bahan putar ulang) |
| `labels.jsonl` | data latih otomatis (fitur menit-1 + hasil tiap koin) |
| `radar.json` | semua koin meme aktif: baru, potensi tumbuh, bangun dari tidur |
| `radar_labels.jsonl` | snapshot radar + hasil 1 jam / 6 jam (bahan riset koin lama) |
| `store/`, `arsip_store_*` | data mentah on-chain (bisa dihapus arsipnya kalau disk penuh) |

## Aturan yang tetap berlaku
- Strategi trading = AUDIT07 yang sudah lolos semua uji. **Jangan ubah angka di `.env` tanpa uji maju baru.**
- Radar hanya memantau & memberi peringkat. Koin lama/tidur **belum** ditradingkan sampai lolos uji.
- Saham ter-tokenisasi (AAPL, NVDA, ...) otomatis dikecualikan.
- Hentikan rapi: `sudo -u rhc touch /opt/rhc/bot/rust_live/stop.txt`. Jalan lagi: hapus berkas itu, lalu `sudo systemctl restart rhc-live`.
