//! rhc-exec — lapisan eksekusi Rust untuk strategi v4 (Robinhood Chain).
//! Tahap 1: skorer CatBoost + uji kesamaan dengan Python/JS. Tanpa kunci dompet, tanpa kirim transaksi.
mod model;
use model::CatModel;
use serde_json::Value;

fn main() {
    let dir = std::env::args().nth(1).unwrap_or_else(|| "../../live".to_string());
    let m = CatModel::load(&format!("{dir}/filter_cat.json")).expect("gagal baca model");
    println!("model CatBoost: {} pohon, {} fitur", m.trees.len(), m.feats.len());

    // uji kesamaan wajib: Rust vs Python
    let raw = std::fs::read_to_string(format!("{dir}/filter_cat_check.json")).expect("gagal baca check");
    let ck: Value = serde_json::from_str(&raw).unwrap();
    let xs = ck["X"].as_array().unwrap();
    let ps = ck["p"].as_array().unwrap();
    let mut maxd = 0.0f64;
    let t0 = std::time::Instant::now();
    for (i, xr) in xs.iter().enumerate() {
        let x: Vec<f64> = xr.as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
        let d = (m.predict(&x) - ps[i].as_f64().unwrap()).abs();
        if d > maxd { maxd = d; }
    }
    let per = t0.elapsed().as_nanos() as f64 / xs.len() as f64;
    println!("cek Rust vs Python ({} sampel): selisih maks {:.2e} | {:.0} ns per skor", xs.len(), maxd, per);
    if maxd > 1e-9 {
        eprintln!("FATAL: model Rust TIDAK sama dengan Python. Jangan dipakai.");
        std::process::exit(1);
    }
    println!("OK: skorer Rust identik dengan Python/JS.");
}
