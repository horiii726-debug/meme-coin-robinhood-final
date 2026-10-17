#!/usr/bin/env bash
# Penjaga unduhan: pastikan lanjut_agustus.sh (lalu lanjut_riwayat.sh) terus jalan walau prosesnya mati.
# Cek tiap 5 menit; kalau tidak ada collect.js yang hidup, jalankan lagi (resume lewat checkpoint).
# Berhenti: buat pipeline/stop_unduh.txt. Log: pipeline/jaga_unduh.log
cd "$(dirname "$0")"
LOG=jaga_unduh.log
hidup() { powershell -NoProfile -Command "@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*collect.js*' }).Count" 2>/dev/null | tr -d '\r'; }
while true; do
  if [ -f stop_unduh.txt ]; then echo "$(date) stop_unduh.txt -> penjaga berhenti" >> $LOG; exit 0; fi
  n=$(hidup); case "$n" in ''|*[!0-9]*) n=0;; esac
  free=$(df -k . | awk 'NR==2{printf "%.1f", $4/1048576}')
  if [ "$n" -eq 0 ]; then
    if awk -v f="$free" 'BEGIN{exit !(f<6)}'; then
      echo "$(date) disk bebas $free GB < 6 GB -> unduhan ditahan" >> $LOG
    else
      sisa=$(ls ../data/agustus_mentah/*/SUDAH_DIFINALISASI.txt 2>/dev/null | wc -l)
      if [ "$sisa" -lt 7 ]; then
        echo "$(date) unduhan mati -> lanjut_agustus.sh (bebas $free GB, $sisa/7 jendela selesai)" >> $LOG
        nohup bash lanjut_agustus.sh >> lanjut_agustus.log 2>&1 &
      else
        echo "$(date) agustus selesai -> lanjut_riwayat.sh (bebas $free GB)" >> $LOG
        nohup bash lanjut_riwayat.sh >> lanjut_riwayat.log 2>&1 &
      fi
    fi
  fi
  sleep 300
done
