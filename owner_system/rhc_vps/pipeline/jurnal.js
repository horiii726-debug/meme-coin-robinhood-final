// JURNAL TRADING — satu buku besar yang terus berjalan, bukan hitungan yang dimulai ulang dari $100.
// Menggabungkan trade dari uji maju (JSON) dan dari bot kertas (trades.jsonl), mengurutkan menurut waktu,
// lalu menghitung ekuitas berjalan, setoran awal, dan ringkasan per hari / per minggu.
//
// Pakai:
//   node jurnal.js <berkas trade> [berkas trade ...]        -> bangun/perbarui hasil/jurnal/
//   node jurnal.js --awal 250 bot/trades.jsonl              -> mulai buku dari ekuitas $250
//
// Ekuitas berjalan memakai ukuran posisi yang benar-benar dipakai tiap trade (kolom "posisi"/"size"),
// jadi jurnal ini mencatat apa yang terjadi, bukan mensimulasikan ulang strategi.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let OUT = path.join(ROOT, "hasil", "jurnal");

const args = process.argv.slice(2);
let awal = null;
const berkas = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--awal") { awal = +args[++i]; continue; }
  // Buku terpisah: hasil uji maju dan hasil bot kertas tidak boleh tercampur dalam satu jurnal.
  if (args[i] === "--buku") { OUT = path.join(ROOT, "hasil", "jurnal_" + args[++i]); continue; }
  berkas.push(args[i]);
}
if (!berkas.length) { console.error("pakai: node jurnal.js [--awal N] <berkas trade> [...]"); process.exit(1); }

// ---------- baca ----------
function bacaTrade(p) {
  const isi = fs.readFileSync(p, "utf8").trim();
  if (!isi) return [];
  if (isi[0] === "[") return JSON.parse(isi);
  const out = [];
  for (const l of isi.split("\n")) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch (e) { /* baris rusak dilewati */ }
  }
  return out;
}

// Bentuk trade berbeda antar sumber; disatukan di sini.
function normalkan(t, sumber) {
  const ret = t.ret ?? null;
  const posisi = t.posisi ?? t.akun_posisi ?? t.size ?? null;
  const waktu = t.masuk ?? t.entry_ts ?? null;
  const pnl = t.pnl ?? (posisi !== null && ret !== null ? posisi * (ret - 1) : null);
  return {
    sumber, pool: t.pool, periode: t.ds ?? sumber,
    masuk: waktu, blok_masuk: t.entryBlk ?? null, blok_keluar: t.exitBlk ?? null,
    jam: t.jam ?? (t.hold != null ? +(t.hold / 60).toFixed(2) : null),
    skor: t.skor ?? null, posisi, ret, pnl,
    keluar: t.keluar ?? t.reason ?? null, puncak: t.peak ?? t.peakV ?? null,
  };
}

let trades = [];
for (const b of berkas) {
  const p = path.isAbsolute(b) ? b : path.join(process.cwd(), b);
  const n = bacaTrade(p).map(t => normalkan(t, path.basename(path.dirname(p)) + "/" + path.basename(p)));
  console.log(`${b}: ${n.length} trade`);
  trades = trades.concat(n);
}
// hanya trade yang benar-benar dimiliki akun (ada ukuran posisi)
trades = trades.filter(t => t.posisi != null && t.ret != null);
// urut waktu; kalau tidak ada cap waktu, pakai blok
trades.sort((a, b) => (a.masuk && b.masuk ? String(a.masuk).localeCompare(String(b.masuk)) : (a.blok_masuk || 0) - (b.blok_masuk || 0)));

// ---------- ekuitas berjalan ----------
// Buku lama dipakai lagi kalau ada, supaya jurnal tidak pernah mulai dari nol tanpa alasan.
const bukuLama = path.join(OUT, "ekuitas_terakhir.json");
if (awal === null && fs.existsSync(bukuLama)) {
  try { awal = JSON.parse(fs.readFileSync(bukuLama, "utf8")).ekuitas_awal_buku ?? 100; } catch (e) { awal = 100; }
}
if (awal === null) awal = 100;

let eq = awal, puncak = awal, ddMaks = 0;
const baris = [];
for (const [i, t] of trades.entries()) {
  const pnl = t.pnl != null ? t.pnl : t.posisi * (t.ret - 1);
  eq += pnl;
  puncak = Math.max(puncak, eq);
  ddMaks = Math.max(ddMaks, 1 - eq / puncak);
  baris.push({ no: i + 1, ...t, pnl: +pnl.toFixed(4), ekuitas: +eq.toFixed(2), dd: +(100 * (1 - eq / puncak)).toFixed(1) });
}

// ---------- ringkasan ----------
const menang = baris.filter(b => b.pnl > 0);
const untung = menang.reduce((a, b) => a + b.pnl, 0);
const rugi = -baris.filter(b => b.pnl < 0).reduce((a, b) => a + b.pnl, 0);

function kelompok(fn) {
  const m = new Map();
  for (const b of baris) {
    if (!b.masuk) continue;
    const k = fn(String(b.masuk));
    if (!m.has(k)) m.set(k, { kunci: k, trade: 0, pnl: 0, menang: 0, ekuitas_akhir: 0 });
    const g = m.get(k); g.trade++; g.pnl += b.pnl; if (b.pnl > 0) g.menang++; g.ekuitas_akhir = b.ekuitas;
  }
  return [...m.values()].map(g => ({ ...g, pnl: +g.pnl.toFixed(2), win: +(100 * g.menang / g.trade).toFixed(1) }));
}
const hari = kelompok(s => s.slice(0, 10));
// minggu ISO sederhana: tahun + nomor minggu
const minggu = kelompok(s => { const d = new Date(s.replace(" ", "T") + "Z"); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const hariMinggu = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - hariMinggu + 3); const th = t.getUTCFullYear(); const m1 = new Date(Date.UTC(th, 0, 4)); return `${th}-M${1 + Math.round(((t - m1) / 86400000 - 3 + ((m1.getUTCDay() + 6) % 7)) / 7)}`; });

const ringkas = {
  dibuat: new Date().toISOString(),
  sumber: berkas,
  ekuitas_awal_buku: awal,
  ekuitas_sekarang: +eq.toFixed(2),
  laba_bersih: +(eq - awal).toFixed(2),
  kelipatan: +(eq / awal).toFixed(2),
  trade: baris.length,
  win_rate: baris.length ? +(100 * menang.length / baris.length).toFixed(1) : null,
  profit_factor: rugi > 0 ? +(untung / rugi).toFixed(2) : null,
  drawdown_maks_persen: +(100 * ddMaks).toFixed(1),
  hari_dagang: hari.length,
  hari_untung: hari.filter(h => h.pnl > 0).length,
  minggu_dagang: minggu.length,
  minggu_untung: minggu.filter(m => m.pnl > 0).length,
  hari_terbaik: hari.length ? hari.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null,
  hari_terburuk: hari.length ? hari.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null,
};

// ---------- tulis ----------
fs.mkdirSync(OUT, { recursive: true });
const kolom = ["no", "masuk", "periode", "pool", "skor", "posisi", "ret", "pnl", "ekuitas", "dd", "jam", "keluar", "puncak"];
const csv = [kolom.join(",")].concat(baris.map(b => kolom.map(k => {
  const v = b[k]; if (v == null) return "";
  return typeof v === "string" && v.includes(",") ? `"${v}"` : v;
}).join(",")));
fs.writeFileSync(path.join(OUT, "jurnal.csv"), csv.join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "ringkasan.json"), JSON.stringify(ringkas, null, 1));
fs.writeFileSync(path.join(OUT, "per_hari.csv"), ["tanggal,trade,menang,win_persen,pnl,ekuitas_akhir"].concat(hari.map(h => `${h.kunci},${h.trade},${h.menang},${h.win},${h.pnl},${h.ekuitas_akhir}`)).join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "per_minggu.csv"), ["minggu,trade,menang,win_persen,pnl,ekuitas_akhir"].concat(minggu.map(h => `${h.kunci},${h.trade},${h.menang},${h.win},${h.pnl},${h.ekuitas_akhir}`)).join("\n") + "\n");
// Dipakai bot: lanjutkan dari ekuitas terakhir, jangan mulai ulang dari $100.
fs.writeFileSync(path.join(OUT, "ekuitas_terakhir.json"), JSON.stringify({ ekuitas_awal_buku: awal, ekuitas_sekarang: ringkas.ekuitas_sekarang, trade: ringkas.trade, diperbarui: ringkas.dibuat }, null, 1));

console.log(`\nJURNAL  ${OUT}`);
console.log(`  setoran awal buku : $${awal.toFixed(2)}`);
console.log(`  ekuitas sekarang  : $${ringkas.ekuitas_sekarang.toFixed(2)}  (${ringkas.kelipatan}x)`);
console.log(`  trade             : ${ringkas.trade}, win ${ringkas.win_rate}%, PF ${ringkas.profit_factor}, DD maks ${ringkas.drawdown_maks_persen}%`);
console.log(`  hari dagang       : ${ringkas.hari_dagang} (untung ${ringkas.hari_untung})`);
console.log(`  minggu dagang     : ${ringkas.minggu_dagang} (untung ${ringkas.minggu_untung})`);
if (ringkas.hari_terbaik) console.log(`  hari terbaik      : ${ringkas.hari_terbaik.kunci} $${ringkas.hari_terbaik.pnl}`);
if (ringkas.hari_terburuk) console.log(`  hari terburuk     : ${ringkas.hari_terburuk.kunci} $${ringkas.hari_terburuk.pnl}`);
