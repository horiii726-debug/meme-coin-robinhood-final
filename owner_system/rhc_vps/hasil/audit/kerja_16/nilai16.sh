#!/bin/bash
# nilai16.sh <run_dir_abs> <label> [extra env...] -> PILIH(ds5d+ds24) | BUKTI(m1+m2) | PENUH
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_16
R=$1; L=$2; shift 2
G=$R/gasdyn.json; [ -f $G ] || G=C:/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_06/gas_dinamis_abc.json
cd $R
ringkas(){ echo "$1" | awk '
 /^akun/{gsub(/[$%()]/,"");split($0,a,"-> ");split(a[2],b," ");eq=b[1]}
 /^win/{w=$2;pf=$5}
 /^peluang/{for(i=1;i<=NF;i++)if($i=="beli")n=$(i+1)}
 /DD maks/{for(i=1;i<=NF;i++)if($i=="maks")dd=$(i+1)}
 END{printf "$%s/%st/%s/PF%s/DD%s", eq,n,w,pf,dd}'; }
run(){ env GASALL=1 GASDYN=$G QTHR=${QTHR:-0.90} SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 MAXPOS=${MAXPOS:-5} NOWARM=${NOWARM:-1} DAYSTOP=${DAYSTOP:-0.15} NAMA=x OUT=$K/eq_tmp "$@" node $K/pipeline/arena16.js 2>&1; }
P=$(run ONLY=u_ds5d,u_ds24 "$@"); B=$(run ONLY=m1,m2 "$@"); F=$(run "$@")
echo "$L | PILIH $(ringkas "$P") | BUKTI $(ringkas "$B") | PENUH $(ringkas "$F")"
echo "$F" | grep -E "^  |^tolak|lewat jalur" | sed 's/^/     /'
