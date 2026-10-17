//! Biner `arena`: pengganti `node arena.js`. Semua setelan lewat variabel lingkungan yang sama
//! (START, MAXPOS, KILL, KCAP, MINPOS, SLIP, EXPMAX, REM, SOPT, QTHR, MOONQ, LPCAP, FIXFRAC, NBAGI,
//! HONEY, DEV, ML, ONLY, BLKFROM, BLKTO, SCORED, DUMP, OUT, NAMA). Jalankan dari folder data_b.
use std::io::Write;

fn main() {
    let stdout = std::io::stdout();
    let mut out = std::io::BufWriter::new(stdout.lock());
    let res = port_account::arena::run(&mut out);
    let _ = out.flush();
    if let Err(port_account::arena::JsCrash(msg)) = res {
        eprintln!("{}", msg);
        std::process::exit(1);
    }
}
