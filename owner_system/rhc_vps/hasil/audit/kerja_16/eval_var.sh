#!/bin/bash
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16; cd $K
V=$1
python bangun_r15.py $V > /tmp/bv_$V.txt 2>&1
mv base/scored_r15.csv base/scored_$V.csv
head -1 /tmp/bv_$V.txt
SC=scored_$V.csv bash $K/nilai_all.sh "$V" 2>&1 | head -1
