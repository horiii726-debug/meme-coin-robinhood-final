#!/usr/bin/env bash
# Lanjutkan 7 jendela data/agustus_mentah (resume via checkpoint), lalu finalisasi tiap jendela
# ke data/am_<nama>/ dan hapus data mentahnya. Aman dijalankan ulang kapan saja.
# Pakai (Git Bash, dari folder pipeline):  bash lanjut_agustus.sh [w01 w02 ...]
# Hentikan dengan Ctrl+C (collect.js menyelesaikan potongan berjalan dulu) atau buat file pipeline/stop_unduh.txt
set -u
cd "$(dirname "$0")"
A=../data/agustus_mentah
MIN_GB=6          # sisa disk minimum
export PAR=${PAR:-3}
declare -A R=( [w01_ags01]="24800000 26800000" [w02_ags07]="30000000 32000000" [w03_ags13]="35000000 37000000"
               [w04_ags18]="40000000 42000000" [w05_ags24]="45000000 47000000" [w06_ags30]="50000000 52000000"
               [w07_sep05]="55000000 57000000" )
# perkiraan ukuran mentah akhir (GB) — dipakai untuk cek disk sebelum mulai
declare -A GB=( [w01_ags01]=0.4 [w02_ags07]=0.8 [w03_ags13]=0.9 [w04_ags18]=0.7 [w05_ags24]=1.1 [w06_ags30]=2.4 [w07_sep05]=3.4 )
ORDER="w01_ags01 w04_ags18 w02_ags07 w03_ags13 w05_ags24 w06_ags30 w07_sep05"
if [ $# -gt 0 ]; then ORDER=""; for x in "$@"; do for w in "${!R[@]}"; do [[ $w == $x* ]] && ORDER="$ORDER $w"; done; done; fi

free_gb() { df -k "$A" | awk 'NR==2{printf "%.1f", $4/1048576}'; }
for w in $ORDER; do
  [ -f stop_unduh.txt ] && { echo "stop_unduh.txt ada -> berhenti"; exit 0; }
  D=$A/$w; set -- ${R[$w]}; FROM=$1; TO=$2; OUT=../data/am_${w#*_}
  if [ -f "$D/SUDAH_DIFINALISASI.txt" ]; then echo "$w sudah selesai -> $OUT"; continue; fi
  f=$(free_gb); need=$(awk -v a=$MIN_GB -v b=${GB[$w]} 'BEGIN{print a+b}')
  if awk -v f=$f -v n=$need 'BEGIN{exit !(f<n)}'; then echo "$w: disk bebas ${f} GB < ${need} GB -> lewati"; continue; fi
  echo "=== $w  blok $FROM..$TO  (disk bebas ${f} GB)  $(date)"
  node cek_mentah.js "$D" $FROM $TO --perbaiki
  for try in 1 2 3; do
    node collect.js $FROM $TO "$D" 2>>"$D/err.log"; rc=$?
    [ $rc -eq 0 ] && break
    [ -f stop_unduh.txt ] && exit 0
    echo "$w: collect keluar rc=$rc, coba lagi ($try) setelah 60 dtk"; sleep 60
  done
  [ $rc -ne 0 ] && { echo "$w: belum utuh, lanjutkan nanti"; continue; }
  node finalisasi_jendela.js "$D" $FROM $TO "$OUT" --hapus-mentah || { echo "$w: finalisasi gagal"; continue; }
done
echo "selesai putaran $(date)"
