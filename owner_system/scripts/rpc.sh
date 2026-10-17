#!/usr/bin/env bash
# usage: rpc.sh <method> [params-json-array]
M="$1"; P="${2:-[]}"
curl -s -m 60 --doh-url https://cloudflare-dns.com/dns-query \
  -X POST https://rpc.mainnet.chain.robinhood.com \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$M\",\"params\":$P}"
