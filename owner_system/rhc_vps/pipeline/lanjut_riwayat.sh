#!/usr/bin/env bash
# Perluas riwayat chain per potongan ±2 juta blok, mulai blok 20.000.000 (±26 Juli), mengisi celah
# yang belum ada di data/ (ags1, ags4, u_ds5d, u_ds24, m1, m2) maupun agustus_mentah (w01..w07).
# Jendela w01..w07 berakhir di TO tanpa ekor, jadi pool init di (TO-324000, TO] tidak punya horizon 9 jam di sana;
# segmen sesudahnya mulai di TO-324000 supaya pool itu tetap tercakup (pakai hz=324000 saat replay).
# Tiap segmen: unduh [A, B+324000] (ekor 9 jam supaya pool yang lahir dekat B tetap punya horizon penuh)
#   -> finalisasi ke data/rw_<A>/ (pools.csv, liq.csv, swaps_sorted.csv, meta.json) -> hapus mentah.
# Replay nanti (Fase 2):  node replay.js ../data/rw_<A> <A> <B+324000> ...   => hanya pool init di [A,B] yang dihitung,
#   jadi segmen berurutan TIDAK dobel hitung walau ekornya tumpang tindih.
# Aman dijalankan ulang (resume via checkpoint). Stop: buat pipeline/stop_unduh.txt atau Ctrl+C.
# Pakai: bash lanjut_riwayat.sh [jumlah_segmen_maks]
set -u
cd "$(dirname "$0")"
RAW=../data/riwayat_mentah; mkdir -p $RAW
MIN_GB=6; export PAR=${PAR:-3}; TAIL=324000
MAXSEG=${1:-99}
# A B  (rentang blok init; celah yang belum tercakup data lain)
SEG=(
 "20000000 21999999" "22000000 23999999" "24000000 24799999"
 "26476000 28799999" "28800000 29999999"
 "31676000 33999999" "34000000 34999999"
 "36676000 38999999" "39000000 39999999"
 "41676000 43999999" "44000000 44999999"
 "46676000 48999999" "49000000 49999999"
 "51676000 53999999" "54000000 54999999"
 "56676000 58999999" "59000000 59886161"
 "60750163 61866029" "63600001 64401244" "65698904 66999999"
)
free_gb() { df -k "$RAW" | awk 'NR==2{printf "%.1f", $4/1048576}'; }
n=0
for s in "${SEG[@]}"; do
  [ -f stop_unduh.txt ] && { echo "stop_unduh.txt ada -> berhenti"; exit 0; }
  [ $n -ge $MAXSEG ] && break
  set -- $s; A=$1; B=$2; TO=$((B+TAIL)); NAME=rw_$A; D=$RAW/$NAME; OUT=../data/$NAME
  [ -f "$D/SUDAH_DIFINALISASI.txt" ] && { echo "$NAME sudah selesai"; continue; }
  # perkiraan mentah: ~0,6 GB per juta blok (naik seiring waktu); butuh MIN_GB + 2x
  est=$(awk -v a=$A -v t=$TO 'BEGIN{printf "%.1f", (t-a)/1e6*0.6*2}')
  f=$(free_gb)
  if awk -v f=$f -v n=$MIN_GB -v e=$est 'BEGIN{exit !(f<n+e)}'; then echo "$NAME: disk bebas $f GB < $MIN_GB+$est GB -> berhenti"; exit 1; fi
  echo "=== $NAME  init $A..$B  unduh $A..$TO  (disk bebas $f GB)  $(date)"
  mkdir -p "$D"
  for try in 1 2 3; do
    node collect.js $A $TO "$D" 2>>"$D/err.log"; rc=$?
    [ $rc -eq 0 ] && break
    [ -f stop_unduh.txt ] && exit 0
    echo "$NAME: collect rc=$rc, coba lagi ($try)"; sleep 60
  done
  [ $rc -ne 0 ] && { echo "$NAME: belum utuh, jalankan ulang nanti"; exit 1; }
  node finalisasi_jendela.js "$D" $A $TO "$OUT" --hapus-mentah || { echo "$NAME: finalisasi gagal"; exit 1; }
  node -e "const f='$OUT/meta.json',m=require('./'+f);m.init_range=[$A,$B];m.replay_args='$A $TO';require('fs').writeFileSync(f,JSON.stringify(m,null,1))"
  n=$((n+1))
done
echo "selesai $(date)"
