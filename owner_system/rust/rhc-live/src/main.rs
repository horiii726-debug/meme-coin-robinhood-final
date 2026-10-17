//! rhc-live — bot paper-live RHC dalam Rust. MODE KERTAS: tidak ada transaksi, tidak ada kunci dompet.
//!   rhc-live sim <dir_data> <dari_blok> <sampai_blok> <keluaran.jsonl> [--bot DIR] [--env FILE] [--devpre CSV]
//!   rhc-live live [--bot DIR] [--env FILE]
mod bot;
#[path = "../../rhc-exec/src/model.rs"]
mod catmodel;
mod cfg;
mod kelas;
mod live;
mod radar;
mod net;
mod sim;
mod unduh;
mod fast_download;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let opt = |k: &str| args.iter().position(|a| a == k).and_then(|i| args.get(i + 1)).cloned();
    let bot_dir = opt("--bot").unwrap_or("C:/Users/horii/rhc-quant/rhc_vps/bot".into());
    let env_file = opt("--env");
    let cfg = cfg::Cfg::load(env_file.as_deref());
    let r = match args.get(1).map(|s| s.as_str()) {
        Some("sim") if args.len() >= 6 => sim::jalan(
            cfg,
            sim::SimArg {
                dir: args[2].clone(),
                from: args[3].parse().unwrap_or(0.0),
                to: args[4].parse().unwrap_or(f64::INFINITY),
                out: args[5].clone(),
                bot_dir,
                dev_pre: opt("--devpre"),
                skor: opt("--skor"),
                thr0: opt("--thr0").and_then(|v| v.parse().ok()),
                danger: opt("--danger"),
                naik: opt("--naik"),
                akun_in: opt("--akun-in"),
                akun_out: opt("--akun-out"),
            },
        ),
        Some("live") => live::jalan(cfg, &bot_dir),
        Some("unduh") if args.len() >= 5 => net::Rpc::new(&cfg.rpc_urls, cfg.doh).and_then(|r| unduh::unduh(&r, args[2].parse().unwrap_or(0), args[3].parse().unwrap_or(0), &args[4])),
        Some("fast") if args.len() >= 5 => net::Rpc::new(&cfg.rpc_urls, cfg.doh).and_then(|r| fast_download::download_fast(&r, args[2].parse().unwrap_or(0), args[3].parse().unwrap_or(0), &args[4])),
        Some("fast1") if args.len() >= 3 => net::Rpc::new(&cfg.rpc_urls, cfg.doh).and_then(|r| fast_download::minute1_fast(&r, &args[2])),
        Some("menit1") if args.len() >= 3 => net::Rpc::new(&cfg.rpc_urls, cfg.doh).and_then(|r| unduh::menit1(&r, &args[2])),
        _ => Err("pakai: rhc-live sim <dir> <dari> <sampai> <out.jsonl> [--bot DIR] [--env FILE] [--devpre CSV]\n      rhc-live live [--bot DIR] [--env FILE]".into()),
    };
    if let Err(e) = r {
        eprintln!("GAGAL: {e}");
        std::process::exit(1);
    }
}
