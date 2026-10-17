//! Skor filter beli (CatBoost beku) untuk keluaran feat_dump.
//! Pakai: skor <model filter_cat.json> <fitur.jsonl> <keluaran.csv>
//! Nilai fitur yang hilang (null/NaN) diisi -1, sama dengan saat model dilatih (fillna(-1)).
#[path = "../model.rs"]
mod model;
use model::CatModel;
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 4 { eprintln!("pakai: skor <filter_cat.json> <fitur.jsonl> <keluaran.csv>"); std::process::exit(2); }
    let m = CatModel::load(&a[1]).expect("model");
    let f = std::fs::File::open(&a[2]).expect("fitur");
    let mut out = std::fs::File::create(&a[3]).expect("keluaran");
    writeln!(out, "pool,score").unwrap();
    let mut n = 0usize;
    for line in BufReader::new(f).lines() {
        let line = line.unwrap(); if line.trim().is_empty() { continue; }
        let v: Value = serde_json::from_str(&line).expect("json");
        let fe = &v["f"];
        let x: Vec<f64> = m.feats.iter().map(|k| match fe.get(k).and_then(|z| z.as_f64()) {
            Some(z) if z.is_finite() => z, _ => -1.0 }).collect();
        writeln!(out, "{},{}", v["pool"].as_str().unwrap(), m.predict(&x)).unwrap();
        n += 1;
    }
    eprintln!("skor: {} koin, {} pohon, {} fitur", n, m.trees.len(), m.feats.len());
}
