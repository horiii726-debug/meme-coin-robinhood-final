//! Uji kesamaan TimSort V8: baca kasus dari berkas JSON (dibuat uji/sort_cases.js), urutkan dengan
//! komparator yang sama dengan arena.js, tulis permutasi hasil (indeks asal) sebagai JSON baris per kasus.
//! Kasus: {"kind":"ev","b":[...],"k":[0|1,...]}  -> (a,b)=>a.b-b.b||(a.k==="tutup"?-1:1)
//!        {"kind":"num","v":[...]}               -> (a,b)=>a-b      (null = NaN)
//!        {"kind":"desc","v":[...]}              -> (a,b)=>b-a
use port_account::v8sort;
use serde_json::Value;

fn num(v: &Value) -> f64 {
    match v {
        Value::Number(n) => n.as_f64().unwrap(),
        Value::String(s) if s == "Infinity" => f64::INFINITY,
        Value::String(s) if s == "-Infinity" => f64::NEG_INFINITY,
        _ => f64::NAN,
    }
}

fn main() {
    let path = std::env::args().nth(1).expect("berkas kasus");
    let text = std::fs::read_to_string(path).unwrap();
    let cases: Vec<Value> = serde_json::from_str(&text).unwrap();
    let mut out = String::new();
    for c in &cases {
        let kind = c["kind"].as_str().unwrap();
        let perm: Vec<usize> = match kind {
            "ev" => {
                let b: Vec<f64> = c["b"].as_array().unwrap().iter().map(num).collect();
                let k: Vec<bool> = c["k"].as_array().unwrap().iter().map(|x| x.as_i64().unwrap() == 1).collect();
                let mut idx: Vec<usize> = (0..b.len()).collect();
                v8sort::sort(&mut idx, |&x, &y| {
                    let d = b[x] - b[y];
                    if d != 0.0 && !d.is_nan() {
                        d
                    } else if k[x] {
                        -1.0
                    } else {
                        1.0
                    }
                });
                idx
            }
            "num" | "desc" => {
                let v: Vec<f64> = c["v"].as_array().unwrap().iter().map(num).collect();
                let mut idx: Vec<usize> = (0..v.len()).collect();
                if kind == "num" {
                    v8sort::sort(&mut idx, |&x, &y| v[x] - v[y]);
                } else {
                    v8sort::sort(&mut idx, |&x, &y| v[y] - v[x]);
                }
                idx
            }
            _ => panic!("jenis kasus tidak dikenal"),
        };
        out.push_str(&serde_json::to_string(&perm).unwrap());
        out.push('\n');
    }
    print!("{}", out);
}
