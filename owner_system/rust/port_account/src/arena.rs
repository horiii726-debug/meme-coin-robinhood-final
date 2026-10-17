//! Port baris-demi-baris dari rhc_vps/pipeline/arena.js (simulasi akun $START berurutan waktu).
//!
//! Semua ekspresi floating point ditulis dengan urutan evaluasi yang sama dengan JS
//! (kiri-ke-kanan, reduce mulai dari 0, Math.max/Math.min semantik JS, Math.log fdlibm,
//! toFixed eksak, sort = TimSort V8). Keluaran konsol, berkas DUMP dan OUT ditulis
//! byte-demi-byte sama dengan versi JS.

use crate::jsnum::{
    is_array_index_key, js_max, js_max_all, js_min, js_trim, json_num, json_str, log, num_to_string, parse_float,
    to_fixed, to_fixed_num, to_number, to_number_opt,
};
use crate::v8sort;
use std::collections::{BTreeMap, HashMap};
use std::io::Write;

/// process.env.X (Windows: nama tidak peka huruf besar/kecil, sama seperti Node).
fn env(name: &str) -> Option<String> {
    std::env::var_os(name).map(|v| v.to_string_lossy().into_owned())
}

/// `+(process.env.X || def)`
fn env_num(name: &str, def: f64) -> f64 {
    match env(name) {
        Some(s) if !s.is_empty() => to_number(&s),
        _ => def,
    }
}

/// `!!process.env.X`
fn env_truthy(name: &str) -> Option<String> {
    env(name).filter(|s| !s.is_empty())
}

/// Nama properti Object.prototype: kalau pool/dev bernama seperti ini, objek biasa JS (GAS, devHist)
/// akan mengembalikan fungsi bawaan alih-alih undefined -> perilaku JS aneh/crash. Tidak didukung.
fn is_proto_key(s: &str) -> bool {
    matches!(
        s,
        "__proto__"
            | "constructor"
            | "hasOwnProperty"
            | "isPrototypeOf"
            | "propertyIsEnumerable"
            | "toLocaleString"
            | "toString"
            | "valueOf"
            | "__defineGetter__"
            | "__defineSetter__"
            | "__lookupGetter__"
            | "__lookupSetter__"
    )
}

/// String(x) untuk nilai string-atau-undefined.
fn js_key(s: &Option<String>) -> String {
    match s {
        Some(v) => v.clone(),
        None => "undefined".to_string(),
    }
}

#[derive(Clone, Debug)]
pub struct Row {
    pub ds: Option<String>,
    pub pool: Option<String>,
    pub decide: f64,
    pub entry: f64,
    pub exit: f64,
    pub ret: f64,
    pub gas_tot: f64,
    pub size: f64,
    pub jual: f64,
    pub dev: Option<String>,
    pub lp: f64,
    pub score: f64,
    pub moon: f64,
}

#[derive(Clone, Copy, Debug)]
struct Pos {
    pos: f64,
    lp: f64,
}

#[derive(Clone, Debug)]
struct Closed {
    ret: f64,
    pnl: f64,
    pool: Option<String>,
    ds: Option<String>,
    #[allow(dead_code)]
    blk: f64,
    hold: f64,
}

#[derive(Default)]
struct Tolak {
    ml: u64,
    dev: u64,
    honey: u64,
    slot: u64,
    kill: u64,
    kas: u64,
    noskor: u64,
    eksposur: u64,
}

/// Nilai JSON `t.gasTot||0` / `t.size||0` -> angka. Tipe selain angka/null/false/kosong tidak didukung.
fn json_or_zero(v: Option<&serde_json::Value>, what: &str) -> Result<f64, String> {
    use serde_json::Value;
    match v {
        None | Some(Value::Null) | Some(Value::Bool(false)) => Ok(0.0),
        Some(Value::Number(n)) => {
            let x = n.as_f64().unwrap_or(f64::NAN);
            Ok(if x == 0.0 || x.is_nan() { 0.0 } else { x })
        }
        Some(Value::String(s)) if s.is_empty() => Ok(0.0),
        Some(other) => Err(format!("trades.jsonl: tipe {} tidak didukung oleh port: {}", what, other)),
    }
}

/// GAS dari m1/m2 trades.jsonl (hanya plan v4), sama dengan blok try/catch di arena.js:
/// baris yang gagal di-parse menghentikan dataset itu (entri sebelumnya tetap).
fn load_gas() -> Result<HashMap<String, (f64, f64)>, String> {
    use serde_json::Value;
    let mut gas: HashMap<String, (f64, f64)> = HashMap::new();
    for d in ["m1", "m2"] {
        let bytes = match std::fs::read(format!("{}/trades.jsonl", d)) {
            Ok(b) => b,
            Err(_) => continue, // JS: exception tertangkap
        };
        let text = String::from_utf8_lossy(&bytes).into_owned();
        for l in js_trim(&text).split('\n') {
            let t: Value = match serde_json::from_str(l) {
                Ok(v) => v,
                Err(_) => break, // JSON.parse melempar -> keluar dari dataset ini
            };
            let obj = match &t {
                Value::Null => break, // null.plan -> TypeError -> keluar dari dataset ini
                Value::Object(m) => m,
                _ => continue, // angka/string/array: t.plan undefined
            };
            if obj.get("plan") != Some(&Value::String("v4".to_string())) {
                continue;
            }
            let key = match obj.get("pool") {
                Some(Value::String(s)) => s.clone(),
                None => "undefined".to_string(),
                Some(Value::Null) => "null".to_string(),
                Some(Value::Bool(b)) => b.to_string(),
                Some(Value::Number(n)) => num_to_string(n.as_f64().unwrap_or(f64::NAN)),
                Some(other) => return Err(format!("trades.jsonl: pool bertipe {} tidak didukung", other)),
            };
            if is_proto_key(&key) {
                return Err(format!("trades.jsonl: pool bernama '{}' tidak didukung", key));
            }
            let g = json_or_zero(obj.get("gasTot"), "gasTot")?;
            let s = json_or_zero(obj.get("size"), "size")?;
            gas.insert(key, (g, s));
        }
    }
    Ok(gas)
}

/// Baca CSV skor persis seperti arena.js: buang semua CR, trim, pecah LF, pecah koma (tanpa kutip).
fn load_rows(gas: &HashMap<String, (f64, f64)>) -> Result<Vec<Row>, String> {
    let path = env_truthy("SCORED").unwrap_or_else(|| "arena_scored.csv".to_string());
    let bytes = std::fs::read(&path).map_err(|e| format!("ENOENT/IO membaca {}: {}", path, e))?;
    let text = String::from_utf8_lossy(&bytes).replace('\r', "");
    let lines: Vec<&str> = js_trim(&text).split('\n').collect();
    let hdr: Vec<&str> = lines[0].split(',').collect();
    // o[h]=p[i] untuk semua i: kunci duplikat -> indeks terakhir menang
    let col = |name: &str| hdr.iter().rposition(|h| *h == name);
    let (c_ds, c_pool, c_decide, c_entry, c_exit, c_ret) =
        (col("ds"), col("pool"), col("decide"), col("entry"), col("exit"), col("ret"));
    let (c_jual, c_dev, c_lp, c_score, c_moon) = (col("jual_m1"), col("dev"), col("lp_m1"), col("score"), col("moon"));

    let only: Option<Vec<String>> = env_truthy("ONLY").map(|s| s.split(',').map(|x| x.to_string()).collect());
    let blk = env_truthy("BLKFROM").map(|from| {
        let lo = to_number(&from);
        let hi = to_number_opt(env("BLKTO").as_deref());
        (lo, hi)
    });

    let mut rows: Vec<Row> = Vec::with_capacity(lines.len().saturating_sub(1));
    for l in &lines[1..] {
        let p: Vec<&str> = l.split(',').collect();
        let get = |c: Option<usize>| -> Option<&str> { c.and_then(|i| p.get(i).copied()) };
        let pool = get(c_pool).map(|s| s.to_string());
        let pool_key = js_key(&pool);
        if is_proto_key(&pool_key) {
            return Err(format!("CSV: pool bernama '{}' tidak didukung", pool_key));
        }
        let gas_e = gas.get(&pool_key);
        let dev = match get(c_dev) {
            Some(s) if !s.is_empty() => {
                if is_proto_key(s) {
                    return Err(format!("CSV: dev bernama '{}' tidak didukung", s));
                }
                Some(s.to_string())
            }
            _ => None, // o.dev||null
        };
        let lp = match get(c_lp) {
            Some(s) => parse_float(s),
            None => f64::NAN, // parseFloat(undefined)
        };
        let lp = if lp.is_nan() || lp == 0.0 { 0.0 } else { lp }; // ||0
        let score = match get(c_score) {
            Some("") => f64::NAN,
            other => to_number_opt(other),
        };
        let moon = match get(c_moon) {
            None | Some("") => f64::NAN,
            Some(s) => to_number(s),
        };
        let r = Row {
            ds: get(c_ds).map(|s| s.to_string()),
            pool,
            decide: to_number_opt(get(c_decide)),
            entry: to_number_opt(get(c_entry)),
            exit: to_number_opt(get(c_exit)),
            ret: to_number_opt(get(c_ret)),
            gas_tot: gas_e.map(|g| g.0).unwrap_or(0.0),
            size: gas_e.map(|g| g.1).unwrap_or(0.0),
            jual: to_number_opt(get(c_jual)),
            dev,
            lp,
            score,
            moon,
        };
        if let Some(list) = &only {
            match &r.ds {
                Some(ds) if list.iter().any(|x| x == ds) => {}
                _ => continue,
            }
        }
        if let Some((lo, hi)) = blk {
            if !(r.decide >= lo && r.decide <= hi) {
                continue;
            }
        }
        rows.push(r);
    }
    let mut idx: Vec<usize> = (0..rows.len()).collect();
    v8sort::sort(&mut idx, |&a, &b| rows[a].decide - rows[b].decide);
    Ok(idx.into_iter().map(|i| rows[i].clone()).collect())
}

/// q(a,p): kuantil dengan indeks floor(p*n), dibatasi n-1. Indeks tidak valid -> undefined (NaN).
fn q(a: &[f64], p: f64) -> f64 {
    let mut s = a.to_vec();
    v8sort::sort(&mut s, |x, y| x - y);
    let n = s.len() as f64;
    let idx = js_min(n - 1.0, (p * n).floor());
    if idx >= 0.0 && idx < n && idx.fract() == 0.0 {
        s[idx as usize]
    } else {
        f64::NAN // s[NaN] / s[-1] -> undefined; perbandingan dgn undefined selalu salah
    }
}

fn kelly(closed: &[Closed], kcap: f64) -> f64 {
    let n = closed.len();
    if n < 30 {
        return 0.02;
    }
    if n < 100 {
        return 0.094;
    }
    let nf = n as f64;
    let mut best = 0.02f64;
    let mut bv = -1e9f64;
    let mut f = 0.01f64;
    while f <= 0.6 {
        let mut s = 0.0f64;
        let mut ok = true;
        for c in closed {
            let v = 1.0 + f * (c.ret - 1.0);
            if v <= 0.0 {
                ok = false;
                break;
            }
            s += log(v);
        }
        if ok && s / nf > bv {
            bv = s / nf;
            best = f;
        }
        f += 0.005;
    }
    js_max(0.01, js_min(kcap, best / 4.0))
}

#[inline]
fn truthy(x: f64) -> bool {
    x != 0.0 && !x.is_nan()
}

/// [...openPos.values()].reduce((a,x)=>a+x.pos,0)  (urutan sisip Map)
#[inline]
fn sum_open(open: &[(Option<String>, Pos)]) -> f64 {
    let mut a = 0.0f64;
    for (_, p) in open {
        a += p.pos;
    }
    a
}

fn pf(r: &[&Closed]) -> f64 {
    let mut g = 0.0f64;
    for c in r.iter().filter(|c| c.pnl > 0.0) {
        g += c.pnl;
    }
    let mut ls = 0.0f64;
    for c in r.iter().filter(|c| c.pnl <= 0.0) {
        ls += c.pnl;
    }
    let l = -ls;
    if l > 0.0 {
        g / l
    } else {
        f64::INFINITY
    }
}

fn pf_str(v: f64) -> String {
    if v == f64::INFINITY {
        "inf".to_string()
    } else {
        to_fixed(v, 2)
    }
}

fn avg(a: &[f64]) -> f64 {
    let mut s = 0.0f64;
    for &x in a {
        s += x;
    }
    s / js_max(a.len() as f64, 1.0)
}

/// str.slice(0,8) atas unit kode UTF-16.
fn slice8(s: &str) -> String {
    let u: Vec<u16> = s.encode_utf16().take(8).collect();
    String::from_utf16_lossy(&u)
}

/// Galat yang meniru exception JS yang tidak tertangkap (stdout sebelum titik itu tetap tercetak).
pub struct JsCrash(pub String);

macro_rules! log_line {
    ($out:expr, $($arg:tt)*) => {{
        let s = format!($($arg)*);
        $out.write_all(s.as_bytes()).map_err(|e| JsCrash(e.to_string()))?;
        $out.write_all(b"\n").map_err(|e| JsCrash(e.to_string()))?;
    }};
}

pub fn run(out: &mut dyn Write) -> Result<(), JsCrash> {
    let gas = load_gas().map_err(JsCrash)?;
    let rows = load_rows(&gas).map_err(JsCrash)?;

    let start = env_num("START", 100.0);
    let maxpos = env_num("MAXPOS", 20.0);
    let kill = env_num("KILL", 0.60);
    const THR0: f64 = 0.195;
    let kcap = env_num("KCAP", 0.10);
    let minpos = env_num("MINPOS", 0.25);
    let slip_on = env("SLIP").as_deref() == Some("1");
    let expmax = env_num("EXPMAX", 1.0);
    let rem = env("REM").as_deref() == Some("1");
    let sopt = env("SOPT").as_deref() == Some("1");
    let qthr = env_num("QTHR", 0.30);
    let moonq = env_num("MOONQ", 0.0);
    let lpcap = env_num("LPCAP", 0.0);
    let fix = env_num("FIXFRAC", 0.0);
    let nbagi = env_num("NBAGI", 1.0);
    let honey = env("HONEY").as_deref() != Some("0");
    let devr = env("DEV").as_deref() != Some("0");
    let mlr = env("ML").as_deref() != Some("0");
    let dump_path = env_truthy("DUMP");

    let mut recent_moon: Vec<f64> = Vec::new();
    let mut n_moon: u64 = 0;
    let mut cash = start;
    let mut peak = start;
    let mut dd_max = 0.0f64;
    let mut killed = false;
    let mut open: Vec<(Option<String>, Pos)> = Vec::new(); // Map: urutan sisip, set() pada kunci lama = ganti nilai di tempat
    let mut closed: Vec<Closed> = Vec::new();
    let mut recent: Vec<f64> = Vec::new();
    let mut dev_hist: HashMap<String, Vec<f64>> = HashMap::new();
    let mut eq_curve: Vec<(f64, f64)> = Vec::new();

    // event: (blok, tutup?, indeks baris)
    let mut ev: Vec<(f64, bool, usize)> = Vec::with_capacity(rows.len() * 2);
    for (i, t) in rows.iter().enumerate() {
        ev.push((t.decide, false, i));
        ev.push((t.exit, true, i));
    }
    // (a,b)=>a.b-b.b||(a.k==="tutup"?-1:1)  -- tidak konsisten saat seri -> wajib TimSort V8
    v8sort::sort(&mut ev, |a, b| {
        let d = a.0 - b.0;
        if d != 0.0 && !d.is_nan() {
            d
        } else if a.1 {
            -1.0
        } else {
            1.0
        }
    });

    let mut tolak = Tolak::default();
    let mut beli: u64 = 0;
    let mut besar_count: u64 = 0;
    let mut dump = String::new();
    let mut n_dump: usize = 0;
    let mut kelly_log: Vec<f64> = Vec::new();
    let mut conc_log: Vec<f64> = Vec::new();
    let use_fix = fix > 0.0;

    for &(eb, tutup, ti) in &ev {
        let t = &rows[ti];
        if tutup {
            let pi = match open.iter().position(|(k, _)| *k == t.pool) {
                Some(i) => i,
                None => continue,
            };
            let p = open.remove(pi).1;
            let slip = if slip_on && p.lp > 0.0 { js_min(0.9, 2.0 * p.pos / p.lp) } else { 0.0 };
            // t.gasTot selalu terdefinisi (angka) -> syarat tinggal t.size truthy
            let g_t = if truthy(t.size) { t.gas_tot } else { 0.0 };
            let gross_ret = if truthy(g_t) && truthy(t.size) { t.ret + g_t / t.size } else { t.ret };
            let back = js_max(0.0, p.pos * gross_ret * (1.0 - slip) - g_t);
            cash += back;
            closed.push(Closed {
                ret: t.ret,
                pnl: back - p.pos,
                pool: t.pool.clone(),
                ds: t.ds.clone(),
                blk: eb,
                hold: (t.exit - t.entry) * 0.1013 / 60.0,
            });
            if let Some(d) = &t.dev {
                dev_hist.entry(d.clone()).or_default().push(t.ret);
            }
            let eq = cash + sum_open(&open);
            peak = js_max(peak, eq);
            dd_max = js_max(dd_max, 1.0 - eq / peak);
            if !killed && 1.0 - eq / peak > kill {
                killed = true;
            }
            eq_curve.push((eb, to_fixed_num(eq, 2)));
            continue;
        }
        // === keputusan beli, urutan sama dengan bot live ===
        if mlr {
            if !t.score.is_finite() {
                tolak.noskor += 1;
                continue;
            }
            recent.push(t.score);
            if recent.len() > 100 {
                recent.remove(0);
            }
            let thr = if recent.len() < 30 { THR0 } else { q(&recent, qthr) };
            let mut lolos_moon = false;
            if moonq > 0.0 && t.moon.is_finite() {
                recent_moon.push(t.moon);
                if recent_moon.len() > 100 {
                    recent_moon.remove(0);
                }
                if recent_moon.len() >= 30 && t.moon >= q(&recent_moon, moonq) {
                    lolos_moon = true;
                }
            }
            if t.score < thr && !lolos_moon {
                tolak.ml += 1;
                continue;
            }
            if t.score < thr && lolos_moon {
                n_moon += 1;
            }
        }
        if devr {
            if let Some(d) = &t.dev {
                if let Some(h) = dev_hist.get(d) {
                    if h.iter().any(|&r| r < 0.3) {
                        tolak.dev += 1;
                        continue;
                    }
                }
            }
        }
        if honey && t.jual == 0.0 {
            tolak.honey += 1;
            continue;
        }
        if killed {
            tolak.kill += 1;
            continue;
        }
        if open.len() as f64 >= maxpos {
            tolak.slot += 1;
            continue;
        }
        // kelly() murni (hanya bergantung pada `closed`, yang tidak berubah di sisa langkah ini)
        let kel = if use_fix { f64::NAN } else { kelly(&closed, kcap) };
        let frac0 = if use_fix { fix } else { kel / nbagi };
        {
            let eq_now = cash + sum_open(&open);
            let terpakai = eq_now - cash;
            if terpakai + js_min(frac0 * eq_now, cash) > expmax * eq_now {
                tolak.eksposur += 1;
                continue;
            }
        }
        let eq = cash + sum_open(&open);
        let g = 0.06 * 3.0 + 0.03;
        let frac = if use_fix { fix } else { kel / nbagi };
        let mut mult = 1.0f64;
        if rem {
            let dd_now = 1.0 - eq / peak;
            mult = if dd_now > 0.30 {
                0.25
            } else if dd_now > 0.20 {
                0.5
            } else if dd_now > 0.10 {
                0.75
            } else {
                1.0
            };
        }
        let mut pos = js_min(frac * eq * mult, cash - g);
        if sopt && t.lp > 0.0 && closed.len() >= 30 {
            let mut sr = 0.0f64;
            for c in &closed {
                sr += c.ret;
            }
            let edge = js_max(0.02, sr / closed.len() as f64 - 1.0);
            pos = js_min(pos, edge * t.lp / 4.0);
        }
        if lpcap > 0.0 && t.lp > 0.0 {
            pos = js_min(pos, lpcap * t.lp);
        }
        if pos < minpos {
            tolak.kas += 1;
            continue;
        }
        cash -= pos;
        let np = Pos { pos, lp: t.lp };
        match open.iter_mut().find(|(k, _)| *k == t.pool) {
            Some(slot) => slot.1 = np,
            None => open.push((t.pool.clone(), np)),
        }
        beli += 1;
        if dump_path.is_some() {
            dump.push_str(if n_dump == 0 { "{" } else { ",{" });
            n_dump += 1;
            let mut first = true;
            let mut key = |d: &mut String, k: &str| {
                if !first {
                    d.push(',');
                }
                first = false;
                d.push('"');
                d.push_str(k);
                d.push_str("\":");
            };
            if let Some(pl) = &t.pool {
                key(&mut dump, "pool");
                json_str(pl, &mut dump);
            }
            key(&mut dump, "score");
            json_num(t.score, &mut dump);
            key(&mut dump, "ret");
            json_num(t.ret, &mut dump);
            key(&mut dump, "pos");
            json_num(to_fixed_num(pos, 2), &mut dump);
            if let Some(ds) = &t.ds {
                key(&mut dump, "ds");
                json_str(ds, &mut dump);
            }
            key(&mut dump, "entry");
            json_num(t.entry, &mut dump);
            key(&mut dump, "exit");
            json_num(t.exit, &mut dump);
            key(&mut dump, "lp");
            json_num(t.lp, &mut dump);
            key(&mut dump, "gasTot");
            json_num(t.gas_tot, &mut dump);
            key(&mut dump, "size");
            json_num(t.size, &mut dump);
            dump.push('}');
        }
        kelly_log.push(if use_fix { fix } else { kel });
        conc_log.push(open.len() as f64);
        if t.lp > 0.0 && pos > 0.01 * t.lp {
            besar_count += 1;
        }
    }

    let eq_akhir = cash + sum_open(&open);
    let all: Vec<&Closed> = closed.iter().collect();
    let wins = closed.iter().filter(|c| c.ret > 1.0).count();
    let nama = env_truthy("NAMA").unwrap_or_else(|| "ARENA".to_string());
    log_line!(out, "\n=== {} ===", nama);
    log_line!(out, "peluang {} | beli {} | tutup {} | lewat jalur roket {}", rows.len(), beli, closed.len(), n_moon);
    log_line!(
        out,
        "tolak: ml {}, dev {}, honeypot {}, slot penuh {}, eksposur penuh {}, kill {}, kas {}, model belum siap {}",
        tolak.ml,
        tolak.dev,
        tolak.honey,
        tolak.slot,
        tolak.eksposur,
        tolak.kill,
        tolak.kas,
        tolak.noskor
    );
    log_line!(
        out,
        "win {}% | PF {} | rug dimakan (ret<0,3) {}",
        to_fixed(100.0 * wins as f64 / js_max(closed.len() as f64, 1.0), 1),
        pf_str(pf(&all)),
        closed.iter().filter(|c| c.ret < 0.3).count()
    );
    log_line!(
        out,
        "akun ${} -> ${} ({}%) | DD maks {}% | kill {}",
        num_to_string(start),
        to_fixed(eq_akhir, 2),
        to_fixed((eq_akhir / start - 1.0) * 100.0, 0),
        to_fixed(100.0 * dd_max, 1),
        if killed { "AKTIF" } else { "tidak" }
    );
    // per periode: urutan Object.entries (kunci indeks-array dulu, menaik; lalu urutan sisip)
    {
        let mut idx_keys: BTreeMap<u32, Vec<&Closed>> = BTreeMap::new();
        let mut str_keys: Vec<(String, Vec<&Closed>)> = Vec::new();
        for c in &closed {
            let k = js_key(&c.ds);
            if let Some(n) = is_array_index_key(&k) {
                idx_keys.entry(n).or_default().push(c);
            } else if let Some(e) = str_keys.iter_mut().find(|(kk, _)| *kk == k) {
                e.1.push(c);
            } else {
                str_keys.push((k, vec![c]));
            }
        }
        let mut groups: Vec<(String, Vec<&Closed>)> = idx_keys.into_iter().map(|(n, v)| (n.to_string(), v)).collect();
        groups.extend(str_keys);
        for (ds, r) in &groups {
            let w = r.iter().filter(|c| c.ret > 1.0).count();
            let mut untung = 0.0f64;
            for c in r {
                untung += c.pnl;
            }
            log_line!(
                out,
                "  {}: {} trade | win {}% | PF {} | untung ${}",
                ds,
                r.len(),
                to_fixed(100.0 * w as f64 / r.len() as f64, 0),
                pf_str(pf(r)),
                to_fixed(untung, 2)
            );
        }
    }
    {
        let mut s: Vec<&Closed> = closed.iter().collect();
        v8sort::sort(&mut s, |a, b| b.pnl - a.pnl);
        let fmt = |c: &Closed, plus: &str| -> Result<String, JsCrash> {
            let pool = c
                .pool
                .as_ref()
                .ok_or_else(|| JsCrash("TypeError: Cannot read properties of undefined (reading 'slice')".into()))?;
            Ok(format!("{} x{} {}${}", slice8(pool), to_fixed(c.ret, 2), plus, to_fixed(c.pnl, 2)))
        };
        let top: Vec<String> = s.iter().take(3).map(|c| fmt(c, "+")).collect::<Result<_, _>>()?;
        log_line!(out, "terbaik: {}", top.join(" | "));
        let from = s.len().saturating_sub(3);
        let bot: Vec<String> = s[from..].iter().map(|c| fmt(c, "")).collect::<Result<_, _>>()?;
        log_line!(out, "terburuk: {}", bot.join(" | "));
    }
    {
        let mut hist: BTreeMap<u64, u64> = BTreeMap::new();
        for &c in &conc_log {
            *hist.entry(c as u64).or_default() += 1;
        }
        let mut holds: Vec<f64> = closed.iter().map(|c| c.hold).collect();
        v8sort::sort(&mut holds, |a, b| a - b);
        if rows.is_empty() {
            return Err(JsCrash("TypeError: Cannot read properties of undefined (reading 'exit')".into()));
        }
        let jam = (rows[rows.len() - 1].exit - rows[0].decide) * 0.1013 / 3600.0;
        if holds.is_empty() {
            return Err(JsCrash("TypeError: Cannot read properties of undefined (reading 'toFixed')".into()));
        }
        log_line!(
            out,
            "TRADE/HARI: {} | lama pegang median {} menit (rata2 {} mnt, terlama {} mnt)",
            to_fixed(beli as f64 / (jam / 24.0), 1),
            to_fixed(holds[holds.len() / 2], 0),
            to_fixed(avg(&holds), 0),
            to_fixed(holds[holds.len() - 1], 0)
        );
        let parts: Vec<String> = hist
            .iter()
            .map(|(k, v)| format!("{} posisi: {}%", k, to_fixed(100.0 * *v as f64 / beli as f64, 0)))
            .collect();
        log_line!(out, "POSISI BERSAMAAN saat membeli: {}", parts.join(" | "));
        log_line!(
            out,
            "KELLY: f*/4 rata2 {}% (maks {}%) | posisi bersamaan rata2 {} (maks {}) | eksposur total rata2 {}% modal",
            to_fixed(100.0 * avg(&kelly_log), 1),
            to_fixed(100.0 * js_max_all(&kelly_log), 1),
            to_fixed(avg(&conc_log), 1),
            num_to_string(js_max_all(&conc_log)),
            to_fixed(100.0 * avg(&kelly_log) * avg(&conc_log), 0)
        );
    }
    {
        let mut sr = 0.0f64;
        for c in &closed {
            sr += c.ret;
        }
        let mean = sr / js_max(closed.len() as f64, 1.0);
        log_line!(
            out,
            "ret rata2 per trade {} (untung bersih {}% per trade)",
            to_fixed(mean, 3),
            to_fixed(100.0 * (mean - 1.0), 1)
        );
    }
    log_line!(
        out,
        "catatan kejujuran: {}/{} posisi melebihi 1% likuiditas pool -> slippage nyata di trade itu bisa lebih buruk dari yang disimulasikan",
        besar_count,
        beli
    );
    out.flush().map_err(|e| JsCrash(e.to_string()))?;
    if let Some(p) = &dump_path {
        let mut s = String::with_capacity(dump.len() + 2);
        s.push('[');
        s.push_str(&dump);
        s.push(']');
        std::fs::write(p, s).map_err(|e| JsCrash(format!("gagal menulis {}: {}", p, e)))?;
    }
    {
        let mut s = String::from("{\"eqCurve\":[");
        for (i, (b, v)) in eq_curve.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            s.push('[');
            json_num(*b, &mut s);
            s.push(',');
            json_num(*v, &mut s);
            s.push(']');
        }
        s.push_str("],\"closed\":");
        s.push_str(&closed.len().to_string());
        s.push_str(",\"eqAkhir\":");
        json_num(eq_akhir, &mut s);
        s.push_str(",\"ddMax\":");
        json_num(dd_max, &mut s);
        s.push('}');
        let p = format!("{}.json", env_truthy("OUT").unwrap_or_else(|| "arena_equity".to_string()));
        std::fs::write(&p, s).map_err(|e| JsCrash(format!("gagal menulis {}: {}", p, e)))?;
    }
    Ok(())
}
