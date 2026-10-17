// Apakah gas price membeli prioritas urutan di dalam blok?
// Kalau ya -> bisa "nyogok" masuk duluan. Kalau tidak -> urutan = siapa cepat sampai sequencer.
const { execFileSync } = require("child_process");
function sleepSync(ms){const e=Date.now()+ms;while(Date.now()<e);}
function rpc(m, p) {
  for (let a=0;a<7;a++){ try { return rpc1(m,p); } catch(e){ if(a===6) throw e; sleepSync(1500*(a+1)); } }
}
function rpc1(m, p) {
  const out = execFileSync("curl", ["-s","-m","90","--doh-url","https://cloudflare-dns.com/dns-query",
    "-X","POST","https://rpc.mainnet.chain.robinhood.com","-H","Content-Type: application/json",
    "-d", JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})],{maxBuffer:1<<28}).toString();
  const j = JSON.parse(out); if (j.error) throw new Error(j.error.message); return j.result;
}
const tip = parseInt(rpc("eth_blockNumber", []), 16);
let checked = 0, sortedDesc = 0, allSame = 0, corrSum = 0;
for (let i = 0; i < 40 && checked < 12; i++) {
  const b = rpc("eth_getBlockByNumber", ["0x"+(tip-500-i*37).toString(16), true]);
  if (!b || !b.transactions || b.transactions.length < 4) continue;
  const g = b.transactions.map(t => Number(BigInt(t.gasPrice || "0x0")));
  checked++;
  const uniq = new Set(g);
  if (uniq.size === 1) { allSame++; continue; }
  // korelasi Spearman antara posisi dan gas price
  const idx = g.map((_, k) => k);
  const rank = [...g].map((v, k) => ({v, k})).sort((a, b2) => b2.v - a.v).map((o, r) => ({k: o.k, r}));
  const rr = new Array(g.length); rank.forEach(o => rr[o.k] = o.r);
  const n = g.length;
  const d2 = idx.reduce((s, k) => s + Math.pow(k - rr[k], 2), 0);
  const rho = 1 - (6 * d2) / (n * (n * n - 1));
  corrSum += rho;
  const isDesc = g.every((v, k) => k === 0 || g[k-1] >= v);
  if (isDesc) sortedDesc++;
  console.log(`blok ${parseInt(b.number,16)} tx=${n} gas unik=${uniq.size} urut-turun=${isDesc} rho=${rho.toFixed(2)}`);
}
console.log(`\nblok diperiksa: ${checked} | gas seragam total: ${allSame} | terurut gas tertinggi dulu: ${sortedDesc}`);
console.log(`rata-rata korelasi posisi vs gas: ${(corrSum/Math.max(1,checked-allSame)).toFixed(3)}`);
console.log(`\n(+1 = gas tinggi selalu duluan/bisa disogok ; ~0 = urutan tidak dipengaruhi gas)`);
