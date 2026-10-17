// Same CatBoost oblivious-tree evaluation as rhc-exec/src/model.rs (f32 compare, f64 sum).
use std::time::Instant;
struct Tree { feat: Vec<usize>, border: Vec<f32>, leaf: Vec<f64> }
fn main() {
    let txt = std::fs::read_to_string("model.txt").unwrap();
    let mut it = txt.lines();
    let h: Vec<&str> = it.next().unwrap().split_whitespace().collect();
    let (n, scale, bias): (usize, f64, f64) = (h[0].parse().unwrap(), h[1].parse().unwrap(), h[2].parse().unwrap());
    let mut trees = Vec::new();
    for _ in 0..n {
        let _d: usize = it.next().unwrap().trim().parse().unwrap();
        let feat = it.next().unwrap().split_whitespace().map(|s| s.parse().unwrap()).collect();
        let border = it.next().unwrap().split_whitespace().map(|s| s.parse::<f64>().unwrap() as f32).collect();
        let leaf = it.next().unwrap().split_whitespace().map(|s| s.parse().unwrap()).collect();
        trees.push(Tree { feat, border, leaf });
    }
    let raw = std::fs::read("x.bin").unwrap();
    let x: Vec<f64> = raw.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().unwrap())).collect();
    let nf = 34; let nv = x.len() / nf;
    let reps = 200;
    let t0 = Instant::now();
    let mut chk = 0.0f64;
    for _ in 0..reps {
        for v in 0..nv {
            let row = &x[v * nf..(v + 1) * nf];
            let mut s = 0.0f64;
            for t in &trees {
                let mut idx = 0usize;
                for k in 0..t.feat.len() { if (row[t.feat[k]] as f32) > t.border[k] { idx |= 1 << k; } }
                s += t.leaf[idx];
            }
            chk += 1.0 / (1.0 + (-(scale * s + bias)).exp());
        }
    }
    let ns = t0.elapsed().as_nanos() as f64 / (reps * nv) as f64;
    println!("RUST  {nv} vectors x {reps} reps | {ns:.1} ns per prediction | checksum {:.12}", chk / reps as f64);
}
