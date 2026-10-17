// Dev sebenarnya = EOA yang MENGIRIM transaksi mint pertama token (bukan pemegang terbesar, yang bisa kontrak launchpad).
// Langkah: log mint pertama (from=0x0) -> txHash -> eth_getTransactionByHash -> field "from".
const fs=require("fs"); const {spawnSync}=require("child_process");
const T="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO="0x"+"0".repeat(64);
const pad=a=>"0x"+a.slice(2).toLowerCase().padStart(64,"0");
const OUT=(process.env.OUT||"dev_creator2")+".json";
const done=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,"utf8")):{};
function call(reqs){
  for(let a=0;a<8;a++){
    const r=spawnSync("curl",["-s","-m","90","--doh-url","https://cloudflare-dns.com/dns-query","-X","POST","https://rpc.mainnet.chain.robinhood.com","-H","Content-Type: application/json","--data-binary","@-"],
      {input:JSON.stringify(reqs),maxBuffer:1<<29});
    try{const j=JSON.parse(r.stdout.toString()); if(Array.isArray(j)&&j.every(x=>"result" in x)) return j.sort((x,y)=>x.id-y.id).map(x=>x.result);}catch(e){}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Math.min(20000,800*2**a));
  }
  throw new Error("RPC gagal");
}
const tugas=[];
const DIRS=process.argv.slice(2);
for(const D of DIRS){
  const tf=JSON.parse(fs.readFileSync(`${D}/transfers.json`,"utf8"));
  for(const t of fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(x=>x.plan==="v4")){
    const e=tf[t.pool]; if(!e||done[t.pool]) continue;
    tugas.push({pool:t.pool,token:e.token,init:t.init,ret:t.ret,ds:D});
  }
}
console.error("koin perlu ditelusuri:",tugas.length);
const B=15;
for(let i=0;i<tugas.length;i+=B){
  const part=tugas.slice(i,i+B);
  // 1) log mint (from = 0x0) di menit-1
  const logs=call(part.map((x,k)=>({jsonrpc:"2.0",id:k,method:"eth_getLogs",params:[{address:x.token,topics:[T,ZERO],fromBlock:"0x"+Math.max(0,x.init-36000).toString(16),toBlock:"0x"+(x.init+600).toString(16)}]})));
  const perlu=[];
  part.forEach((x,k)=>{const L=logs[k]; if(L&&L.length) perlu.push({x,tx:L[0].transactionHash}); else done[x.pool]={dev:null,why:"tanpa mint",ret:x.ret};});
  if(perlu.length){
    const txs=call(perlu.map((p,k)=>({jsonrpc:"2.0",id:k,method:"eth_getTransactionByHash",params:[p.tx]})));
    perlu.forEach((p,k)=>{const t=txs[k]; done[p.x.pool]={dev:t?t.from.toLowerCase():null,to:t&&t.to?t.to.toLowerCase():null,ret:p.x.ret,why:t?"ok":"tx tidak ada"};});
  }
  fs.writeFileSync(OUT,JSON.stringify(done));
  if((i/B)%6===0) console.error(`  ${Object.keys(done).length}/${tugas.length}`);
}
console.error("SELESAI:",Object.keys(done).length);
