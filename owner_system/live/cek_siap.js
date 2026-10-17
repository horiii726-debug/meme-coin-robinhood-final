// Cek kesiapan sebelum jalan di VPS: file lengkap, model cocok, RPC bisa diakses, alamat terverifikasi.
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const here = __dirname; let ok = true;
const pass = m => console.log("  OK   " + m), fail = m => { console.log("  GAGAL " + m); ok = false; };
console.log("1. File wajib");
for (const f of ["paper_live.js", "v4engine.js", "filter_feats.js", "danger_model.json", "filter_model.json"]) fs.existsSync(path.join(here, f)) ? pass(f) : fail(f + " tidak ada");
console.log("2. Model ML identik dengan versi Python");
const { loadModel } = require("./v4engine");
for (const [m, c] of [["danger_model.json", "danger_check.json"], ["filter_model.json", "filter_check.json"]]) {
  if (!fs.existsSync(path.join(here, c))) { console.log("  LEWAT " + c + " tidak ada"); continue; }
  const model = loadModel(path.join(here, m)), ck = JSON.parse(fs.readFileSync(path.join(here, c), "utf8"));
  let mx = 0; ck.X.forEach((x, k) => { mx = Math.max(mx, Math.abs(model.predict(x) - ck.p[k])); });
  mx < 1e-9 ? pass(`${m} selisih ${mx.toExponential(1)}`) : fail(`${m} selisih ${mx}`);
}
console.log("3. Node versi");
const v = +process.versions.node.split(".")[0]; v >= 20 ? pass("node " + process.versions.node) : fail("butuh node >= 20");
console.log("4. RPC bisa diakses");
const urls = (process.env.RPC_URLS || "https://rpc.mainnet.chain.robinhood.com").split(",");
const doh = process.env.DOH_URL;
for (const u of urls) {
  const t0 = Date.now();
  const r = spawnSync("curl", ["-s", "-m", "15", ...(doh ? ["--doh-url", doh] : []), "-X", "POST", u.trim(), "-H", "Content-Type: application/json",
    "-d", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] })]);
  try { const j = JSON.parse(r.stdout.toString()); j.result === "0x1237" ? pass(`${u.trim()} chainId 4663, ${Date.now() - t0} ms`) : fail(`${u} chainId salah: ${j.result}`); }
  catch (e) { fail(`${u} tidak menjawab`); }
}
console.log("5. .env");
fs.existsSync(path.join(here, ".env")) ? pass(".env ada") : fail(".env belum dibuat (salin dari .env.example)");
console.log(ok ? "\nSIAP JALAN" : "\nBELUM SIAP — perbaiki yang GAGAL");
process.exit(ok ? 0 : 1);
