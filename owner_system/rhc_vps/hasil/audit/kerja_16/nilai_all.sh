#!/bin/bash
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16
L=$1; shift
cd $K/base
ringkas(){ echo "$1" | awk '
 /^akun/{gsub(/[$%()]/,"");split($0,a,"-> ");split(a[2],b," ");eq=b[1]}
 /^win/{w=$2;pf=$5}
 /^peluang/{for(i=1;i<=NF;i++)if($i=="beli")n=$(i+1)}
 /DD maks/{for(i=1;i<=NF;i++)if($i=="maks")dd=$(i+1)}
 END{printf "$%s/%st/%s/PF%s/DD%s", eq,n,w,pf,dd}'; }
run(){ env SCORED=${SC:-scored_all.csv} ML=0 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 MAXPOS=5 DAYSTOP=0.15 NAMA=x OUT=$K/eq_tmp "$@" node $K/pipeline/arena16.js 2>&1; }
P=$(run ONLY=am_ags01,am_ags07,am_ags13,am_ags18,am_ags24 "$@"); B=$(run ONLY=m1,m2,u_ds5d,u_ds24 "$@"); F=$(run "$@")
echo "$L | AGUSTUS(pilih) $(ringkas "$P") | SEPT(bukti) $(ringkas "$B") | PENUH $(ringkas "$F")"
echo "$F" | grep -E "^  |^tolak" | sed 's/^/     /'
