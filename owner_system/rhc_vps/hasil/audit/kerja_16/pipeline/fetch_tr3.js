// Transfer ERC20 menit-1 — hemat RPC: SATU eth_getLogs untuk banyak token sekaligus
// (address = daftar), lalu disaring per koin ke jendela [init, init+600] masing-masing.
// Hasil identik dengan fetch_tr.js, tapi ~20x lebih sedikit permintaan (RPC gratis 429).
const fs=require("fs"); const {spawnSync}=require("child_process");
const T="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const NATIVE="0x0000000000000000000000000000000000000000";
const G=+(process.env.GRP||25), SPAN=+(process.env.SPAN||20000), PAUSE=+(process.env.PAUSE||400);
const wait=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
function call(req){
  let p=PAUSE;
  const NTRY=+(process.env.NTRY||8);
  for(let a=0;a<NTRY;a++){
    const r=spawnSync("curl",["-s","-m","180","--doh-url","https://cloudflare-dns.com/dns-query","-X","POST","https://rpc.mainnet.chain.robinhood.com","-H","Content-Type: application/json","--data-binary","@-"],
      {input:JSON.stringify(req),maxBuffer:1<<29});
    try{const j=JSON.parse(r.stdout.toString()); if(j&&j.result) return j.result;}catch(e){}
    p=Math.min(15000,Math.round(p*1.6)); wait(p);
  }
  return null;
}
for(const D of process.argv.slice(2)){
  const trades=fs.readFileSync(`${D}/trades.jsonl`,"utf8").trim().split("\n").map(JSON.parse).filter(t=>t.plan==="v4");
  const pools=new Map(fs.readFileSync(`${D}/pools.csv`,"utf8").trim().split("\n").slice(1).map(l=>l.trim().split(",")).map(p=>[p[0].toLowerCase(),p]));
  const OUT=`${D}/transfers.json`;
  const done=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,"utf8")):{};
  const todo=trades.filter(t=>!done[t.pool]).map(t=>{const p=pools.get(t.pool); const token=p[1].toLowerCase()===NATIVE?p[2].toLowerCase():p[1].toLowerCase(); return {pool:t.pool,token,init:t.init};})
    .sort((a,b)=>a.init-b.init);
  console.log(new Date().toISOString().slice(11,19),D,"sisa:",todo.length);
  const t0=Date.now(); let i=0, nreq=0;
  while(i<todo.length){
    let j=i+1;
    while(j<todo.length && j-i<G && todo[j].init+600-todo[i].init<=SPAN) j++;
    const grp=todo.slice(i,j);
    const lo=grp[0].init, hi=Math.max(...grp.map(x=>x.init))+600;
    const addr=[...new Set(grp.map(x=>x.token))];
    // adaptif: kalau grup gagal, pecah dua sampai berhasil (jangan pernah membuang koin)
    let sub=[grp], hasil=[];
    while(sub.length){
      const g2=sub.shift(); const lo2=g2[0].init, hi2=Math.max(...g2.map(x=>x.init))+600;
      const a2=[...new Set(g2.map(x=>x.token))];
      const r2=call({jsonrpc:"2.0",id:1,method:"eth_getLogs",params:[{address:a2,topics:[T],fromBlock:"0x"+lo2.toString(16),toBlock:"0x"+hi2.toString(16)}]});
      nreq++;
      if(r2!==null){ hasil.push([g2,r2]); continue; }
      if(g2.length===1){ console.log("  GAGAL koin tunggal",g2[0].pool.slice(0,12),"- dilewati"); continue; }
      const h=Math.ceil(g2.length/2); sub.unshift(g2.slice(0,h),g2.slice(h));
      console.log("  grup",g2.length,"gagal -> dipecah");
      wait(PAUSE);
    }
    const res=[]; for(const [g2,r2] of hasil) res.push(...r2);
    const byA={}; for(const l of res){const a=l.address.toLowerCase(); (byA[a]=byA[a]||[]).push(l);}
    for(const x of grp){
      const L=(byA[x.token]||[]).filter(l=>{const b=parseInt(l.blockNumber,16); return b>=x.init&&b<=x.init+600;});
      done[x.pool]={token:x.token,tr:L.map(l=>[parseInt(l.blockNumber,16),parseInt(l.logIndex,16),"0x"+l.topics[1].slice(26),"0x"+l.topics[2].slice(26),l.data==="0x"?"0":BigInt(l.data).toString()])};
    }
    i=j;
    if(nreq%20===0){ fs.writeFileSync(OUT,JSON.stringify(done));
      const sp=i/((Date.now()-t0)/1000);
      console.log(`  ${Object.keys(done).length}/${trades.length} (${sp.toFixed(1)} koin/dtk, sisa ~${((todo.length-i)/sp/60).toFixed(1)} mnt)`); }
    wait(PAUSE);
  }
  fs.writeFileSync(OUT,JSON.stringify(done));
  console.log(new Date().toISOString().slice(11,19),D,"SELESAI transfer:",Object.keys(done).length,"| permintaan RPC:",nreq);
}
