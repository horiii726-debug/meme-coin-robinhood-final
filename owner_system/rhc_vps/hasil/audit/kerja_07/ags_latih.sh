#!/bin/bash
K=/c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_07
cd $K/state
python $K/pipeline/latih_keluar_wf.py A1 state_am_ags01.csv
python $K/pipeline/latih_keluar_wf.py A2 state_am_ags01.csv state_am_ags07.csv
python $K/pipeline/latih_keluar_wf.py A3 state_am_ags01.csv state_am_ags07.csv state_am_ags13.csv
python $K/pipeline/latih_keluar_wf.py A4 state_am_ags01.csv state_am_ags07.csv state_am_ags13.csv state_am_ags18.csv
echo LATIH_SELESAI
