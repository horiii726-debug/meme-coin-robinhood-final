"""Count pool births and tradable pools (same rule as engine safe()) per block range, plus block timestamps."""
import json, sys, time, urllib.request
RPC = "https://rpc.mainnet.chain.robinhood.com"
PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
T_INIT = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438"
NATIVE = "0x" + "0" * 40

def call(m, p):
    for k in range(10):
        r = urllib.request.Request(RPC, json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(),
                                   {"Content-Type": "application/json", "User-Agent": "curl/8.5.0"})
        try:
            j = json.load(urllib.request.urlopen(r, timeout=60))
        except Exception:
            time.sleep(2 ** k); continue
        if "error" in j:
            if "429" in str(j["error"]) or "Too Many" in str(j["error"]):
                time.sleep(2 ** k); continue
            raise RuntimeError(j["error"])
        return j["result"]
    raise RuntimeError("rpc failed")

def tradable(l):
    c0, c1 = "0x" + l["topics"][2][26:], "0x" + l["topics"][3][26:]
    d = l["data"][2:]
    fee = int(d[0:64], 16); hooks = int(d[128:192], 16)
    return (c0 == NATIVE or c1 == NATIVE) and fee <= 5000 and ((hooks >> 7) & 1) == 0

start, end, step = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
for a in range(start, end, step):
    b = min(a + step - 1, end)
    born = trad = 0; s = a; w = step
    while s <= b:
        e = min(s + w - 1, b)
        try:
            ls = call("eth_getLogs", [{"address": PM, "topics": [T_INIT], "fromBlock": hex(s), "toBlock": hex(e)}])
        except RuntimeError as ex:
            if "exceed" in str(ex) or "limit" in str(ex):
                w //= 2; continue
            raise
        born += len(ls); trad += sum(tradable(l) for l in ls); s = e + 1
    ts = int(call("eth_getBlockByNumber", [hex(a), False])["timestamp"], 16)
    print(time.strftime("%Y-%m-%d %H:%M", time.gmtime(ts)), a, b, "born", born, "tradable", trad, flush=True)
