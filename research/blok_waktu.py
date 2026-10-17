"""Cari blok pertama dengan timestamp >= waktu UTC (biner search via RPC publik)."""
import json, sys, urllib.request, datetime
RPC = "https://rpc.mainnet.chain.robinhood.com"
def call(m, p):
    r = urllib.request.Request(RPC, json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), {"Content-Type": "application/json", "User-Agent": "curl/8.5.0"})
    return json.load(urllib.request.urlopen(r, timeout=30))["result"]
def ts(b): return int(call("eth_getBlockByNumber", [hex(b), False])["timestamp"], 16)
def blok(t):
    lo, hi = 1, int(call("eth_blockNumber", []), 16)
    while lo < hi:
        mid = (lo + hi) // 2
        if ts(mid) < t: lo = mid + 1
        else: hi = mid
    return lo
out = {}
for d in sys.argv[1:]:
    t = int(datetime.datetime.fromisoformat(d).replace(tzinfo=datetime.timezone.utc).timestamp())
    out[d] = blok(t)
    print(d, out[d], flush=True)
