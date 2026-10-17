// AUDIT06: panggilan RPC lewat curl + DoH (sama dengan bot), kunci dibaca dari bot/.env, tidak dicetak
const fs=require("fs"),{spawnSync}=require("child_process");
const env={}; for(const l of fs.readFileSync("/c/Users/horii/rhc-quant/rhc_vps/bot/.env".replace("/c/","C:/"),"utf8").split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) env[m[1]]=m[2].trim();}
const RPCS=(env.RPC_URLS||"").split(",").map(s=>s.trim()).filter(Boolean); const DOH=env.DOH_URL;
let idx=0;
function call(method,params){
  for(let a=0;a<6;a++){
    const url=RPCS[idx%RPCS.length];
    const r=spawnSync("curl",["-s","-m","20",...(DOH?["--doh-url",DOH]:[]),"-X","POST",url,"-H","Content-Type: application/json","-d",JSON.stringify({jsonrpc:"2.0",id:1,method,params})],{encoding:"utf8"});
    try{const j=JSON.parse(r.stdout); if(j.error) throw new Error(j.error.message); return j.result;}catch(e){idx++; spawnSync("node",["-e","setTimeout(()=>{},"+(800*2**a)+")"]);}
  }
  return null;
}
module.exports={call,n:RPCS.length};
