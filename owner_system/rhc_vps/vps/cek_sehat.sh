#!/usr/bin/env bash
# Penjaga: restart bot kalau status.json basi (> 180 dtk) atau tertinggal jauh (> 20.000 blok) setelah 20 menit jalan.
S=/opt/rhc/bot/rust_live/status.json
[ -f /opt/rhc/bot/rust_live/stop.txt ] && exit 0
systemctl is-active --quiet rhc-live.service || exit 0
if [ ! -f "$S" ]; then exit 0; fi
umur=$(( $(date +%s) - $(stat -c %Y "$S") ))
lag=$(jq -r '.lag_blocks // 0' "$S" 2>/dev/null | cut -d. -f1)
uptime=$(jq -r '.uptime_menit // 0' "$S" 2>/dev/null | cut -d. -f1)
if [ "$umur" -gt 180 ]; then
  echo "status basi ${umur} dtk -> restart"; systemctl restart rhc-live.service; exit 0
fi
if [ "${uptime:-0}" -gt 20 ] && [ "${lag:-0}" -gt 20000 ]; then
  echo "tertinggal ${lag} blok -> restart"; systemctl restart rhc-live.service; exit 0
fi
