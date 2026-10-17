// RPC tiruan (offline) untuk uji keandalan Agent 10. Menyajikan event on-chain nyata data/ags4
// seolah-olah chain berjalan. Tidak menyentuh RPC publik sama sekali.
// Konfigurasi dibaca ulang tiap request dari mock_cfg.json:
//   { base, speed (blok/dtk), t0 (ms), end, down, hang, extraTip }
const http = require("http"), fs = require("fs"), path = require("path");
const D = path.join(__dirname, "..", "..", "..", "data", "ags4");
const CFG = path.join(__dirname, "mock_cfg.json");
const PORT = +(process.argv[2] || 18545);
const LO = +(process.argv[3] || 40800000), HI = +(process.argv[4] || 40860000);
const T_INIT = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
const T_SWAP = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const T_MOD = "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e";
const w = v => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0");
const pad = a => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const hx = n => "0x" + n.toString(16);
const logs = [];
function rows(f) { return fs.readFileSync(path.join(D, f), "utf8").split("\n").slice(1).filter(Boolean).map(l => l.split(",")); }
for (const q of rows("pools.csv")) { const b = +q[6]; if (b < LO || b > HI) continue;
  logs.push({ b, li: 0, topics: [T_INIT, q[0], pad(q[1]), pad(q[2])], data: "0x" + w(q[3]) + w(q[4]) + w(BigInt(q[5])) + w(0) + w(0), tx: "0x" + "11".repeat(32) }); }
for (const q of rows("liq.csv")) { const b = +q[1]; if (b < LO || b > HI) continue;
  logs.push({ b, li: +q[2], topics: [T_MOD, q[0], pad("0x1")], data: "0x" + w(q[3]) + w(q[4]) + w(q[5]) + w(0), tx: "0x" + "22".repeat(32) }); }
for (const q of rows("swaps_sorted.csv")) { const b = +q[1]; if (b < LO || b > HI) continue;
  logs.push({ b, li: +q[2], topics: [T_SWAP, q[0], pad("0x1")], data: "0x" + w(q[4]) + w(q[5]) + w(q[6]) + w(q[7]) + w(q[8]) + w(q[9]), tx: q[3] }); }
logs.sort((a, b) => a.b - b.b || a.li - b.li);
console.log(`mock: ${logs.length} log dimuat, blok ${logs[0].b}..${logs[logs.length - 1].b}`);
let nReq = 0;
function cfg() { return JSON.parse(fs.readFileSync(CFG, "utf8")); }
function tipOf(c) { return Math.min(c.end, c.base + Math.floor((Date.now() - c.t0) / 1000 * c.speed)); }
function lo(b) { let l = 0, h = logs.length; while (l < h) { const m = (l + h) >> 1; if (logs[m].b < b) l = m + 1; else h = m; } return l; }
http.createServer((req, res) => {
  let body = ""; req.on("data", d => body += d);
  req.on("end", () => {
    nReq++;
    const c = cfg();
    if (c.hang) return;                               // tidak pernah menjawab (curl kena -m timeout)
    if (c.down) { req.socket.destroy(); return; }     // koneksi putus
    const j = JSON.parse(body); const tip = tipOf(c);
    const ok = r => res.end(JSON.stringify({ jsonrpc: "2.0", id: j.id, result: r }));
    const err = m => res.end(JSON.stringify({ jsonrpc: "2.0", id: j.id, error: { code: -32000, message: m } }));
    if (j.method === "eth_blockNumber") return ok(hx(tip + (c.extraTip || 0)));
    if (j.method === "eth_chainId") return ok("0x1237");
    if (j.method === "eth_getLogs") {
      const f = j.params[0]; const from = parseInt(f.fromBlock, 16), to = parseInt(f.toBlock, 16);
      if (to > tip) return err("block range extends beyond current head block");
      if ((f.address || "").toLowerCase() !== PM) return ok([]);
      const t0 = f.topics[0], set = Array.isArray(t0) ? t0 : [t0];
      const out = [];
      for (let i = lo(from); i < logs.length && logs[i].b <= to; i++) {
        const L = logs[i];
        if (!set.includes(L.topics[0])) continue;
        if (f.topics[1] && L.topics[1] !== f.topics[1]) continue;
        out.push({ address: PM, topics: L.topics, data: L.data, blockNumber: hx(L.b), logIndex: hx(L.li), transactionHash: L.tx, removed: false });
      }
      return ok(out);
    }
    return err("method not supported by mock: " + j.method);
  });
}).listen(PORT, "127.0.0.1", () => console.log("mock listen " + PORT));
setInterval(() => { try { const c = cfg(); fs.writeFileSync(path.join(__dirname, "mock_tip.txt"), `${new Date().toISOString()} tip=${tipOf(c)} req=${nReq}\n`); } catch (e) {} }, 2000);
