"""Sambung sekali ke relay sequencer feed Robinhood Chain, simpan N pesan pertama."""
import asyncio, json, sys, time
import websockets
URL = "wss://feed.mainnet.chain.robinhood.com"
async def main(n, out):
    t0 = time.time()
    async with websockets.connect(URL, additional_headers={"Arbitrum-Feed-Client-Version": "2"}, max_size=2**24, open_timeout=20) as ws:
        print("TERSAMBUNG", round(time.time() - t0, 3), "dtk", flush=True)
        with open(out, "w") as f:
            for i in range(n):
                m = await asyncio.wait_for(ws.recv(), 30)
                f.write(json.dumps({"t": time.time(), "msg": json.loads(m)}) + "\n")
        print("diterima", n, "pesan dalam", round(time.time() - t0, 2), "dtk")
asyncio.run(main(int(sys.argv[1]), sys.argv[2]))
