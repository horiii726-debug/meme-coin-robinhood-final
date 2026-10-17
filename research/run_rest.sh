#!/bin/bash
# After the first batch: rerun OOS windows (fills failed steps), then all history windows.
W=/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work
while pgrep -f run_all.sh >/dev/null; do sleep 30; done
export JALUR=4
cat $W/windows.txt $W/windows_hist.txt | xargs -P 3 -L 1 $W/run_window.sh > $W/logs/run_rest.out 2>&1
echo REST DONE >> $W/logs/run_rest.out
