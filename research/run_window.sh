#!/bin/bash
# Out-of-sample window test with FROZEN models (trained up to 17-19 Sep 2026).
# Usage: run_window.sh <name> <from_block> <to_block>
# Steps: download -> replay (all candidate coins, counterfactual) -> minute-1 data -> account sims -> ablations.
set -u
NAME=$1; FROM=$2; TO=$3
REPO=/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/repo/horiii-debug
WORK=/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work
LIVE=$REPO/rust/rhc-live/target/release/rhc-live
REPLAY=$REPO/rust/port_engine/target/release/replay
BOT=$REPO/rhc_vps/bot
D=$WORK/data/$NAME
LOG=$WORK/logs/$NAME.log
mkdir -p $D $WORK/logs
say(){ echo "[$(date -u +%H:%M:%S)] $*" | tee -a $LOG; }

# Realistic cost model used by the owner's own official tests.
export AUDIT='{"latb":30,"entryLat":30,"keepNoAfter":true,"strictSnap":true,"lpAdjust":true,"fillOnTime":true,"gasUsd":0.06,"approveUsd":0.03,"worstOrder":true,"hz":324000,"failBuy":0.0185,"failSell":0.0054}'

if [ ! -s $D/swaps_sorted.csv ]; then
  say "download $FROM-$TO"
  JALUR=${JALUR:-6} $LIVE fast $FROM $TO $D 2>&1 | grep -E "DONE|SELESAI|GAGAL|phase 1" | tee -a $LOG
fi

# replay variants: full models / no danger model / no p_up model / no exit ML at all
replay(){ # $1=outfile, rest=env
  local out=$1; shift
  [ -s $D/$out ] && return
  (cd $REPO/rhc_vps/pipeline && env "$@" $REPLAY $D $FROM $((TO+324000)) $D/$out auto 2>&1 | tail -1 | sed "s/^/$out: /" | tee -a $LOG)
}
replay trades.jsonl          DANGER_TH=0.4 UP_TH=0.5 TP_UP=0.5 DANGER_FILE=$BOT/danger_model.json UP_FILE=$BOT/pnaik_model.json
replay trades_nodanger.jsonl DANGER_TH=1.1 UP_TH=0.5 TP_UP=0.5 DANGER_FILE=$BOT/danger_model.json UP_FILE=$BOT/pnaik_model.json
replay trades_noup.jsonl     DANGER_TH=0.4 UP_TH=1 TP_UP=1 DANGER_FILE=$BOT/danger_model.json UP_FILE=
replay trades_noexitml.jsonl DANGER_TH=1.1 UP_TH=1 TP_UP=1 DANGER_FILE=$BOT/danger_model.json UP_FILE=

if [ ! -s $D/transfers.json ]; then
  say "minute-1 data"
  JALUR=4 $LIVE fast1 $D 2>&1 | grep -E "DONE|SELESAI|GAGAL" | tee -a $LOG
fi

# account sims ($100 start). a07 = VPS settings, official = default settings.
sim(){ # $1=tag, $2=env string, rest=extra args
  local tag=$1 envs=$2; shift 2
  [ -s $D/sim_$tag.jsonl ] && return
  r=$(env $envs $LIVE sim $D $FROM $TO $D/sim_$tag.jsonl --bot $BOT "$@" 2>/dev/null | head -2 | tr '\n' ' ')
  echo "$tag | $r" | tee -a $LOG
}
A07="TUTUP_SAAT_RUG=1 TRAIL_PUNCAK=0.4 DUMP_FRAC=0.12 MAX_POS=5"
OFF="MAX_POS=10"
sim a07          "$A07"
sim official     "$OFF"
sim a07_nodanger "$A07 DANGER_TH=1.1"
sim a07_noup     "$A07" --naik -
sim a07_nofilter "$A07 FILTER=0"
say "done"
