#!/bin/bash
# cfg.sh base speed end [down] [hang] [extraTip]
cd /c/Users/horii/rhc-quant/rhc_vps/hasil/audit/kerja_10
T=$(node -e "console.log(Date.now())")
echo "{\"base\":$1,\"speed\":$2,\"t0\":$T,\"end\":$3,\"down\":${4:-false},\"hang\":${5:-false},\"extraTip\":${6:-0}}" > mock_cfg.json
cat mock_cfg.json
