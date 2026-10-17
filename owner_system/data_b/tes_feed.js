// Tes sequencer feed Arbitrum: resolve via DoH, sambung TLS ke IP dengan SNI, minta upgrade WebSocket.
const tls=require("tls"), crypto=require("crypto"), {execFileSync}=require("child_process");
const doh=h=>{const r=execFileSync("curl",["-s","-m","15","-H","Accept: application/dns-json",
  `https://cloudflare-dns.com/dns-query?name=${h}&type=A`],{encoding:"utf8"});
  const j=JSON.parse(r); return (j.Answer||[]).filter(a=>a.type===1).map(a=>a.data);};
function coba(host,path,port=443){
  return new Promise(res=>{
    let ips; try{ips=doh(host);}catch(e){return res(`${host}${path}:${port} -> DNS gagal`);}
    if(!ips.length) return res(`${host}${path}:${port} -> tidak ada A record`);
    const key=crypto.randomBytes(16).toString("base64");
    const s=tls.connect({host:ips[0],port,servername:host,timeout:12000,rejectUnauthorized:false},()=>{
      s.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nArbitrum-Feed-Server-Version: 2\r\n\r\n`);
    });
    let buf=""; const selesai=m=>{try{s.destroy()}catch(e){} res(m);};
    s.on("data",d=>{buf+=d; if(buf.length>400||buf.includes("\r\n\r\n")){
      const baris=buf.split("\r\n")[0];
      selesai(`${host}${path}:${port} -> ${baris}${buf.includes("101")?"  ✅ WEBSOCKET TERSAMBUNG":""}`);}});
    s.on("timeout",()=>selesai(`${host}${path}:${port} -> waktu habis`));
    s.on("error",e=>selesai(`${host}${path}:${port} -> ${e.code||e.message}`));
  });
}
(async()=>{
  const H="feed.mainnet.chain.robinhood.com";
  for(const [h,p,port] of [[H,"/relay",443],[H,"/relay/feed",443],[H,"/ws",443],[H,"/feed",443],
    ["sequencer.mainnet.chain.robinhood.com","/relay",443],["sequencer.mainnet.chain.robinhood.com","/ws",443]])
    console.log(await coba(h,p,port));
})();
