#!/bin/bash
cd "$(dirname "$0")"
while [ ! -f uang4.flag ]; do sleep 20; done
bash run_uang.sh rug > log_rug.txt 2>&1
bash run_uang.sh trail30rug > log_trail30rug.txt 2>&1
echo DONE > uang5.flag
