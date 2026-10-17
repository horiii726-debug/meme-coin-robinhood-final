// Ubah data mentah collect.js menjadi format siap-replay (sama dengan data/ags4):
//   pools.csv, liq.csv, swaps_sorted.csv (+ meta.json)
// Pakai: node finalisasi_jendela.js <dirMentah> <fromBlock> <toBlock> <dirKeluar> [--hapus-mentah]
// Langkah:
//  1. tolak jalan bila checkpoint belum lengkap (ada potongan belum "done")
//  2. buang baris rusak + duplikat (pool_id untuk pools; block+log_idx untuk liq/swap)
//     -> duplikat muncul karena collect.js versi lama menulis data lebih dulu dari checkpoint
//  3. swaps: HANYA pool yang lahir di jendela ini + pool ETH/USDG (untuk harga ETH mode "auto").
//     replay.js / state_rows.js hanya memakai pool di pools.csv, jadi saringan ini tidak mengubah hasil,
//     tapi menghemat ±50% disk. liq.csv disimpan utuh (kecil).
//  4. urutkan swap per pool (pool_id, block, log_idx) lewat 32 ember sementara (hemat RAM)
//  5. --hapus-mentah: hapus swaps.csv/liq.csv/pools.csv mentah & sisa berkas lama SETELAH verifikasi hitungan.
const fs = require("fs"), path = require("path"), readline = require("readline");
const [SRC, F, T, OUT] = process.argv.slice(2);
const FROM = +F, TO = +T, CH = 1200;
const DEL = process.argv.includes("--hapus-mentah");
const ETH_POOL = "0x24107d152f14a76d292123265ae3f3c71f863fc2f4ef7ba49d64e78d28ea379e";
if (!SRC || !OUT || !(TO > FROM)) { console.error("pakai: node finalisasi_jendela.js <dirMentah> <from> <to> <dirKeluar> [--hapus-mentah]"); process.exit(1); }
for (const d of ["ags1", "ags4", "u_ds5d", "u_ds24", "m1", "m2"])
  if (path.resolve(OUT) === path.resolve(__dirname, "..", "data", d)) { console.error("TOLAK: tidak boleh menimpa data/" + d); process.exit(1); }
if (fs.existsSync(path.join(OUT, "swaps_sorted.csv"))) { console.error("TOLAK: " + OUT + " sudah berisi swaps_sorted.csv"); process.exit(1); }

const ck = JSON.parse(fs.readFileSync(path.join(SRC, "checkpoint.json"), "utf8"));
const done = new Set(ck.done); const miss = [];
for (let b = FROM; b <= TO; b += CH) if (!done.has(b)) miss.push(b);
if (miss.length) { console.error(`TOLAK: ${miss.length} potongan belum selesai (mis. ${miss.slice(0, 5)}). Jalankan collect.js lagi.`); process.exit(1); }

const lines = f => readline.createInterface({ input: fs.createReadStream(path.join(SRC, f)), crlfDelay: Infinity });
const HEX64 = /^0x[0-9a-f]{64}$/;
// Header sumber dibaca apa adanya: collect.js dengan SIMPAN_IDENTITAS=1 menambah kolom
// (swaps: +sender, liq: +sender,salt) DI AKHIR baris. Kolom tambahan diteruskan utuh, dan
// pemeriksaan jumlah kolom memakai "minimal", bukan "persis", supaya format baru tidak dianggap rusak.
function headerSumber(f, bawaan) {
  try {
    const fd = fs.openSync(path.join(SRC, f), "r"); const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0); fs.closeSync(fd);
    const h = buf.slice(0, n).toString("utf8").split("\n")[0].trim();
    return h.startsWith("pool_id,") ? h : bawaan;
  } catch (e) { return bawaan; }
}
const H_LIQ = headerSumber("liq.csv", "pool_id,block,log_idx,tick_lo,tick_hi,liq_delta");
const H_SWAP = headerSumber("swaps.csv", "pool_id,block,log_idx,tx_hash,a0,a1,sqrt_price,liquidity,tick,fee");
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const st = { pool: 0, poolDup: 0, liq: 0, liqDup: 0, swIn: 0, swKeep: 0, swDup: 0, rusak: 0 };
  // 1) pools
  const pools = new Map();
  for await (const l of lines("pools.csv")) {
    const p = l.split(",");
    if (p[0] === "pool_id" || !l) continue;
    if (p.length < 7 || !HEX64.test(p[0]) || !(+p[6] >= FROM && +p[6] <= TO)) { st.rusak++; continue; }
    if (pools.has(p[0])) { st.poolDup++; continue; }
    pools.set(p[0], l);
  }
  const sortedPools = [...pools.values()].sort((a, b) => +a.split(",")[6] - +b.split(",")[6]);
  fs.writeFileSync(path.join(OUT, "pools.csv"), "pool_id,c0,c1,fee,tick_spacing,hooks,init_block\n" + sortedPools.join("\n") + "\n");
  st.pool = pools.size;
  // 2) liq (utuh, dedupe)
  { const seen = new Set(); const w = fs.createWriteStream(path.join(OUT, "liq.csv"));
    w.write(H_LIQ + "\n");
    for await (const l of lines("liq.csv")) {
      const p = l.split(",");
      if (p[0] === "pool_id" || !l) continue;
      if (p.length < 6 || !HEX64.test(p[0])) { st.rusak++; continue; }
      const k = p[1] + ":" + p[2]; if (seen.has(k)) { st.liqDup++; continue; } seen.add(k);
      if (!w.write(l + "\n")) await new Promise(r => w.once("drain", r));
      st.liq++;
    }
    await new Promise(r => w.end(r)); }
  // 3) swaps -> ember
  const NB = 32, tmp = path.join(OUT, "_ember"); fs.mkdirSync(tmp, { recursive: true });
  const bk = Array.from({ length: NB }, (_, i) => fs.createWriteStream(path.join(tmp, i + ".csv")));
  for await (const l of lines("swaps.csv")) {
    if (!l || l.startsWith("pool_id")) continue;
    st.swIn++;
    const c = l.indexOf(","); const pid = l.slice(0, c);
    if (!pools.has(pid) && pid !== ETH_POOL) continue;
    const p = l.split(",");
    if (p.length < 10 || !HEX64.test(pid)) { st.rusak++; continue; }
    const w = bk[parseInt(pid.slice(2, 4), 16) >> 3];
    if (!w.write(l + "\n")) await new Promise(r => w.once("drain", r));
  }
  await Promise.all(bk.map(w => new Promise(r => w.end(r))));
  // 4) urutkan tiap ember, dedupe, sambung
  const out = fs.createWriteStream(path.join(OUT, "swaps_sorted.csv"));
  out.write(H_SWAP + "\n");
  let bMin = Infinity, bMax = 0;
  for (let i = 0; i < NB; i++) {
    const f = path.join(tmp, i + ".csv");
    const rows = fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => {
      const a = l.indexOf(","), b = l.indexOf(",", a + 1), c = l.indexOf(",", b + 1);
      return { pid: l.slice(0, a), blk: +l.slice(a + 1, b), li: +l.slice(b + 1, c), l };
    });
    rows.sort((x, y) => (x.pid < y.pid ? -1 : x.pid > y.pid ? 1 : 0) || x.blk - y.blk || x.li - y.li);
    let prev = null, buf = [];
    for (const r of rows) {
      const k = r.blk + ":" + r.li;
      if (k === prev) { st.swDup++; continue; } prev = k;
      buf.push(r.l); st.swKeep++;
      if (r.blk < bMin) bMin = r.blk; if (r.blk > bMax) bMax = r.blk;
    }
    if (buf.length && !out.write(buf.join("\n") + "\n")) await new Promise(r => out.once("drain", r));
    fs.unlinkSync(f);
  }
  await new Promise(r => out.end(r));
  fs.rmdirSync(tmp);
  const HZ = 216000, SEC = 0.1;   // 0.1 dtk/blok (data/block_time.json)
  const meta = { sumber: path.resolve(SRC), from: FROM, to: TO, blok_swap: [bMin, bMax],
    jam_data: +((TO - FROM + 1) * SEC / 3600).toFixed(1),
    jam_init_horizon6j: +(Math.max(0, TO - FROM + 1 - HZ) * SEC / 3600).toFixed(1),
    jam_init_horizon9j_audit: +(Math.max(0, TO - FROM + 1 - 324000) * SEC / 3600).toFixed(1),
    saringan_swap: "hanya pool di pools.csv + ETH_POOL", ...st, dibuat: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 1));
  console.log(JSON.stringify(meta));
  if (DEL) {
    if (!(st.pool > 0 && st.swKeep > 0 && st.rusak < 100)) { console.error("verifikasi gagal, mentah TIDAK dihapus"); process.exit(1); }
    for (const f of ["swaps.csv", "liq.csv", "pools.csv", "swaps_sorted.csv", "swaps_m1.json", "trades.jsonl", "transfers.json"]) {
      const p = path.join(SRC, f); if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    fs.writeFileSync(path.join(SRC, "SUDAH_DIFINALISASI.txt"), `hasil di ${path.resolve(OUT)}\n`);
    console.log("mentah dihapus (checkpoint & log disimpan)");
  }
})();
