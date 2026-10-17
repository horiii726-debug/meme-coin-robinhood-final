const { execFileSync } = require("child_process");
function rpc(method, params = []) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const out = execFileSync("curl", ["-s","-m","90","--doh-url","https://cloudflare-dns.com/dns-query",
    "-X","POST","https://rpc.mainnet.chain.robinhood.com","-H","Content-Type: application/json","-d",body],
    { maxBuffer: 1024*1024*512 }).toString();
  const j = JSON.parse(out);
  if (j.error) throw new Error(method + ": " + j.error.message);
  return j.result;
}
module.exports = { rpc };
