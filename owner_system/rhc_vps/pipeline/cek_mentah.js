// Audit data mentah hasil collect.js (tanpa mengubah apa pun).
// Pakai: node cek_mentah.js <dir> <fromBlock> <toBlock> [--perbaiki]
//  - hitung swap/liq/init per potongan 1200 blok
//  - potongan "done" di checkpoint tapi 0 event  -> curiga hilang (buffer belum tertulis saat proses mati)
//  - potongan ada di file tapi belum "done"      -> akan diunduh ulang (duplikat, dibuang saat finalisasi)
//  - baris rusak (jumlah kolom salah)
//  --perbaiki : keluarkan potongan curiga (0 event) + 3*PAR potongan terakhir yang tertulis dari checkpoint,
//               supaya collect.js mengunduhnya ulang (duplikat aman, dibuang oleh finalisasi).
const fs = require("fs"), path = require("path"), readline = require("readline");
const [DIR, F, T] = process.argv.slice(2); const FROM = +F, TO = +T, CH = 1200;
const fix = process.argv.includes("--perbaiki");
const ck = JSON.parse(fs.readFileSync(path.join(DIR, "checkpoint.json"), "utf8"));
const done = new Set(ck.done);
const chunkOf = b => FROM + Math.floor((b - FROM) / CH) * CH;
const cnt = new Map(); const order = [];
// Jumlah kolom MINIMAL. collect.js dengan SIMPAN_IDENTITAS=1 menambah kolom di akhir
// (swaps: +sender, liq: +sender,salt) -> baris panjang bukan baris rusak.
const NF = { swaps: 10, liq: 6, pools: 7 };
(async () => {
  const bad = {}, dup = {};
  for (const f of ["swaps", "liq", "pools"]) {
    bad[f] = 0; dup[f] = 0;
    const seen = f === "pools" ? new Set() : null;
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(DIR, f + ".csv")), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const p = line.split(",");
      if (p.length < NF[f] || !/^0x[0-9a-f]{64}$/i.test(p[0])) { bad[f]++; continue; }
      const b = +p[f === "pools" ? 6 : 1];
      if (!(b >= FROM && b <= TO)) { bad[f]++; continue; }
      if (seen) { if (seen.has(p[0])) dup[f]++; seen.add(p[0]); }
      const c = chunkOf(b);
      if (!cnt.has(c)) { cnt.set(c, 0); if (f === "swaps") order.push(c); }
      cnt.set(c, cnt.get(c) + 1);
    }
  }
  const all = []; for (let b = FROM; b <= TO; b += CH) all.push(b);
  const doneEmpty = all.filter(c => done.has(c) && !cnt.get(c));
  const notDone = all.filter(c => !done.has(c) && cnt.get(c));
  console.log(JSON.stringify({ dir: DIR, total: all.length, done: all.filter(c => done.has(c)).length,
    kosong_tapi_done: doneEmpty.length, ada_di_file_belum_done: notDone.length, baris_rusak: bad, pool_duplikat: dup.pools,
    contoh_kosong: doneEmpty.slice(0, 5) }));
  if (fix) {
    const tail = order.slice(-9);
    const rm = new Set([...doneEmpty, ...tail]);
    ck.done = ck.done.filter(c => !rm.has(c));
    fs.writeFileSync(path.join(DIR, "checkpoint.json"), JSON.stringify(ck));
    console.log(`checkpoint diperbaiki: ${rm.size} potongan akan diunduh ulang`);
  }
})();
