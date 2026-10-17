#!/bin/bash
# Run every window (OOS Sep 18-Oct 15 first, then history Jul 1-Sep 18), 3 at a time.
W=/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work
export JALUR=4
cat $W/windows.txt $W/windows_hist.txt | xargs -P 3 -L 1 $W/run_window.sh > $W/logs/run_all.out 2>&1
echo ALL WINDOWS DONE >> $W/logs/run_all.out
