// Simulasi "disk penuh" TANPA memenuhi disk: dimuat lewat `node -r ./penuh.js`.
// Selama file DISK_PENUH ada di folder kerja, semua tulis gagal dengan ENOSPC seperti aslinya:
//  - writeFileSync: file tujuan terpotong jadi 0 byte dulu (open 'w' berhasil, write gagal) lalu melempar ENOSPC
//  - appendFileSync / writeSync: melempar ENOSPC tanpa menulis apa pun
const fs = require("fs"), path = require("path");
const FLAG = path.join(process.cwd(), "DISK_PENUH");
const enospc = p => { const e = new Error(`ENOSPC: no space left on device, write '${p}'`); e.code = "ENOSPC"; return e; };
const penuh = () => fs.existsSync(FLAG);
const oWFS = fs.writeFileSync, oAFS = fs.appendFileSync, oWS = fs.writeSync, oTrunc = fs.truncateSync;
fs.writeFileSync = function (p, ...a) { if (penuh()) { try { if (fs.existsSync(p)) oTrunc(p, 0); else oWFS(p, ""); } catch (e) {} throw enospc(p); } return oWFS.call(fs, p, ...a); };
fs.appendFileSync = function (p, ...a) { if (penuh()) throw enospc(p); return oAFS.call(fs, p, ...a); };
fs.writeSync = function (fd, ...a) { if (penuh()) throw enospc("fd" + fd); return oWS.call(fs, fd, ...a); };
