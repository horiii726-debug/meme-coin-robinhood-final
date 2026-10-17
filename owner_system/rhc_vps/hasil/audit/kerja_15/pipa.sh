#!/bin/bash
cd "$(dirname "$0")"
for V in "$@"; do
  echo "[$(date +%H:%M:%S)] $V"
  node feats15.js $V 2>&1 | tail -1
  python score15.py $V
  V=$V MAXPOS=10 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 node arena15.js
  V=$V TAG=_p5 MAXPOS=5 QTHR=0.90 SLIP=1 EXPMAX=0.5 REM=1 LPCAP=0.01 node arena15.js
done
echo "PIPA SELESAI"
