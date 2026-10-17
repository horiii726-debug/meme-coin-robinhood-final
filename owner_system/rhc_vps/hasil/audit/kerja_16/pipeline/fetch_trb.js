// Transfer ERC20 menit-1 (init..init+600) untuk koin yang ditrade v4. Resumable.
const fs=require("fs"); const {spawnSync}=require("child_process");
const T="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NATIVE="0x0000000000000000000000000000000000000000";
const D=process.argv[2];
const trades=fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(t=>t.plan==="v4");
const pools=new Map(fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
const OUT=`${D}/transfers.json`;
const done=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,"utf8")):{};
const todo=trades.filter(t=>!done[t.pool]).map(t=>{const p=pools.get(t.pool); const token=p[1].toLowerCase()===NATIVE?p[2].toLowerCase():p[1].toLowerCase(); return {pool:t.pool,token,init:t.init};});
console.error(D,"sisa:",todo.length);
function batch(calls){
  for(let a=0;a<10;a++){
    const r=spawnSync("curl",["-s","-m","120","--doh-url","https://cloudflare-dns.com/dns-query","-X","POST","https://rpc.mainnet.chain.robinhood.com","-H","Content-Type: application/json","--data-binary","@-"],
      {input:JSON.stringify(calls.map((c,i)=>({jsonrpc:"2.0",id:i,method:"eth_getLogs",params:[c]}))),maxBuffer:1<<29});
    try{const j=JSON.parse(r.stdout.toString()); if(Array.isArray(j)&&j.every(x=>x.result)) return j.sort((x,y)=>x.id-y.id).map(x=>x.result);}catch(e){}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Math.min(30000,1000*2**a));
  }
  throw new Error("RPC gagal");
}
const B=+(process.env.BSZ||20);
for(let i=0;i<todo.length;i+=B){
  const part=todo.slice(i,i+B);
  const res=batch(part.map(x=>({address:x.token,topics:[T],fromBlock:"0x"+x.init.toString(16),toBlock:"0x"+(x.init+600).toString(16)})));
  part.forEach((x,k)=>{done[x.pool]={token:x.token,tr:res[k].map(l=>[parseInt(l.blockNumber,16),parseInt(l.logIndex,16),"0x"+l.topics[1].slice(26),"0x"+l.topics[2].slice(26),l.data==="0x"?"0":BigInt(l.data).toString()])};});
  fs.writeFileSync(OUT,JSON.stringify(done));
  if((i/B)%5===0) console.error(`  ${Object.keys(done).length}/${trades.length}`);
}
console.error(D,"SELESAI transfer:",Object.keys(done).length);
