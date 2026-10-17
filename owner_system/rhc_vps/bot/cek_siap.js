// Cek kesiapan sebelum jalan di VPS: file lengkap, model cocok, RPC bisa diakses, alamat terverifikasi.
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const here = __dirname; let ok = true;
// Muat .env sendiri kalau bot dijalankan tanpa --env-file: tanpa DOH_URL, cek RPC di koneksi rumah
// (DNS dibajak ISP) SELALU gagal walaupun bot sebenarnya sehat.
try {
  for (const baris of fs.readFileSync(path.join(here, ".env"), "utf8").split(/\r?\n/)) {
    const m = baris.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/); if (!m) continue;
    const v = m[2].replace(/\s+#.*$/, "").trim();
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch (e) {}
const pass = m => console.log("  OK   " + m), fail = m => { console.log("  GAGAL " + m); ok = false; };
console.log("1. File wajib");
for (const f of ["paper_live.js", "v4engine.js", "filter_feats.js", "cat_model.js", "danger_model.json", "pnaik_model.json", "filter_cat.json"]) fs.existsSync(path.join(here, f)) ? pass(f) : fail(f + " tidak ada");
console.log("2. Model ML identik dengan versi Python");
const { loadModel } = require("./v4engine");
const { loadCat } = require("./cat_model");
// Ketiga model yang benar-benar dipakai bot. Model tanpa berkas cek = GAGAL, bukan "lewat":
// trading dengan model yang belum dibuktikan sama dengan versi Python tidak boleh terjadi.
for (const [m, c, muat] of [["danger_model.json", "danger_check.json", loadModel], ["pnaik_model.json", "pnaik_check.json", loadModel], ["filter_cat.json", "filter_cat_check.json", loadCat]]) {
  if (!fs.existsSync(path.join(here, c))) { fail(c + " tidak ada (parity " + m + " tidak bisa dibuktikan)"); continue; }
  const model = muat(path.join(here, m)), ck = JSON.parse(fs.readFileSync(path.join(here, c), "utf8"));
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
