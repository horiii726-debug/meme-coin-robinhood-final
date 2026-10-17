//! Semantik angka JavaScript (V8) yang dipakai arena.js, supaya hasil Rust identik bit-demi-bit:
//! - `log`           : port fdlibm e_log.c persis seperti `base::ieee754::log` di V8 (Math.log)
//! - `js_max/js_min` : Math.max/Math.min (NaN menular, +0/-0 dibedakan)
//! - `to_number`     : `+str` / `Number(str)` (ToNumber untuk string)
//! - `parse_float`   : parseFloat(str)
//! - `num_to_string` : Number.prototype.toString() / template literal / JSON.stringify
//! - `to_fixed`      : Number.prototype.toFixed(k) (eksak atas nilai biner, seri -> n yang lebih besar)
//! - `json_str`      : JSON.stringify untuk string

#[inline]
fn hi_word(x: f64) -> u32 {
    (x.to_bits() >> 32) as u32
}
#[inline]
fn lo_word(x: f64) -> u32 {
    x.to_bits() as u32
}
#[inline]
fn from_words(hi: u32, lo: u32) -> f64 {
    f64::from_bits(((hi as u64) << 32) | lo as u64)
}
#[inline]
fn set_high_word(x: f64, hi: u32) -> f64 {
    from_words(hi, lo_word(x))
}

/// Math.log milik V8 (fdlibm e_log.c, `base::ieee754::log`).
pub fn log(x_in: f64) -> f64 {
    const LN2_HI: f64 = 6.93147180369123816490e-01;
    const LN2_LO: f64 = 1.90821492927058770002e-10;
    const TWO54: f64 = 1.80143985094819840000e+16;
    const LG1: f64 = 6.666666666666735130e-01;
    const LG2: f64 = 3.999999999940941908e-01;
    const LG3: f64 = 2.857142874366239149e-01;
    const LG4: f64 = 2.222219843214978396e-01;
    const LG5: f64 = 1.818357216161805012e-01;
    const LG6: f64 = 1.531383769920937332e-01;
    const LG7: f64 = 1.479819860511658591e-01;

    let mut x = x_in;
    let mut hx = hi_word(x) as i32;
    let lx = lo_word(x);
    let mut k: i32 = 0;
    if hx < 0x0010_0000 {
        if ((hx & 0x7FFF_FFFF) as u32 | lx) == 0 {
            return f64::NEG_INFINITY; // log(+-0) = -inf
        }
        if hx < 0 {
            return f64::NAN; // log(-#) = NaN
        }
        k -= 54;
        x *= TWO54; // subnormal: skala naik
        hx = hi_word(x) as i32;
    }
    if hx >= 0x7FF0_0000 {
        return x + x;
    }
    k += (hx >> 20) - 1023;
    hx &= 0x000F_FFFF;
    let i0 = (hx + 0x95F64) & 0x10_0000;
    x = set_high_word(x, (hx | (i0 ^ 0x3FF0_0000)) as u32);
    k += i0 >> 20;
    let f = x - 1.0;
    if (0x000F_FFFF & (2 + hx)) < 3 {
        if f == 0.0 {
            if k == 0 {
                return 0.0;
            }
            let dk = k as f64;
            return dk * LN2_HI + dk * LN2_LO;
        }
        let r = f * f * (0.5 - 0.33333333333333333 * f);
        if k == 0 {
            return f - r;
        }
        let dk = k as f64;
        return dk * LN2_HI - ((r - dk * LN2_LO) - f);
    }
    let s = f / (2.0 + f);
    let dk = k as f64;
    let z = s * s;
    let mut i = hx - 0x6147A;
    let w = z * z;
    let j = 0x6B851 - hx;
    let t1 = w * (LG2 + w * (LG4 + w * LG6));
    let t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    i |= j;
    let r = t2 + t1;
    if i > 0 {
        let hfsq = 0.5 * f * f;
        if k == 0 {
            return f - (hfsq - s * (hfsq + r));
        }
        return dk * LN2_HI - ((hfsq - (s * (hfsq + r) + dk * LN2_LO)) - f);
    }
    if k == 0 {
        return f - s * (f - r);
    }
    dk * LN2_HI - ((s * (f - r) - dk * LN2_LO) - f)
}

/// Math.max(a, b): NaN menular; max(-0, +0) = +0.
#[inline]
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == b {
        if a == 0.0 && (a.is_sign_negative() != b.is_sign_negative()) {
            return 0.0;
        }
        return a;
    }
    if a > b {
        a
    } else {
        b
    }
}

/// Math.min(a, b): NaN menular; min(-0, +0) = -0.
#[inline]
pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == b {
        if a == 0.0 && (a.is_sign_negative() != b.is_sign_negative()) {
            return -0.0;
        }
        return a;
    }
    if a < b {
        a
    } else {
        b
    }
}

/// Math.max(...a) (tanpa argumen -> -Infinity).
pub fn js_max_all(a: &[f64]) -> f64 {
    let mut m = f64::NEG_INFINITY;
    for &x in a {
        m = js_max(m, x);
    }
    m
}

/// StrWhiteSpaceChar ECMAScript (WhiteSpace + LineTerminator), dipakai trim/ToNumber/parseFloat.
pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
            | '\u{FEFF}'
    )
}

/// String.prototype.trim()
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(is_js_whitespace)
}

/// Bilangan bulat berbasis 2/8/16 -> double terdekat (seri ke genap), sama dengan V8
/// (InternalStringToIntDouble: dropped bits + zero tail).
fn parse_pow2_radix(digits: &str, bits_per_digit: u32) -> f64 {
    if digits.is_empty() {
        return f64::NAN;
    }
    let radix = 1u32 << bits_per_digit;
    // kumpulkan bit (MSB dulu), buang nol di depan
    let mut bits: Vec<u8> = Vec::with_capacity(digits.len() * bits_per_digit as usize);
    for c in digits.chars() {
        let d = match c.to_digit(radix) {
            Some(d) => d,
            None => return f64::NAN,
        };
        for b in (0..bits_per_digit).rev() {
            bits.push(((d >> b) & 1) as u8);
        }
    }
    let first = match bits.iter().position(|&b| b == 1) {
        Some(p) => p,
        None => return 0.0,
    };
    let bits = &bits[first..];
    let nbits = bits.len();
    if nbits <= 53 {
        let mut v: u64 = 0;
        for &b in bits {
            v = (v << 1) | b as u64;
        }
        return v as f64;
    }
    let mut m: u64 = 0;
    for &b in &bits[..53] {
        m = (m << 1) | b as u64;
    }
    let round_bit = bits[53] == 1;
    let sticky = bits[54..].iter().any(|&b| b == 1);
    if round_bit && (sticky || (m & 1) == 1) {
        m += 1;
    }
    // nilai = m * 2^(nbits-53)
    let e = (nbits - 53) as i32;
    let mut v = m as f64;
    for _ in 0..e {
        v *= 2.0;
        if v.is_infinite() {
            break;
        }
    }
    v
}

/// Kenali StrUnsignedDecimalLiteral (tanpa "Infinity") mulai dari b[i]. Kembalikan
/// (indeks akhir, string ternormalisasi yang aman diurai Rust) bila ada minimal satu digit.
/// `need_full_exp`: bila eksponen tidak lengkap ("1e", "1e+"), bagian eksponen tidak ikut.
fn scan_decimal(b: &[u8], start: usize) -> Option<(usize, String)> {
    let mut i = start;
    let int_s = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    let int_part = &b[int_s..i];
    let mut frac_part: &[u8] = &[];
    if i < b.len() && b[i] == b'.' {
        let fs = i + 1;
        let mut j = fs;
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
        }
        if int_part.is_empty() && j == fs {
            return None; // "." saja bukan angka
        }
        frac_part = &b[fs..j];
        i = j;
    }
    if int_part.is_empty() && frac_part.is_empty() {
        return None;
    }
    let mut norm = String::new();
    norm.push_str(if int_part.is_empty() { "0" } else { std::str::from_utf8(int_part).unwrap() });
    norm.push('.');
    norm.push_str(if frac_part.is_empty() { "0" } else { std::str::from_utf8(frac_part).unwrap() });
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        let mut j = i + 1;
        let mut esign = "";
        if j < b.len() && (b[j] == b'+' || b[j] == b'-') {
            if b[j] == b'-' {
                esign = "-";
            }
            j += 1;
        }
        let ds = j;
        while j < b.len() && b[j].is_ascii_digit() {
            j += 1;
        }
        if j > ds {
            norm.push('e');
            norm.push_str(esign);
            norm.push_str(std::str::from_utf8(&b[ds..j]).unwrap());
            i = j;
        }
    }
    Some((i, norm))
}

fn parse_norm(norm: &str) -> f64 {
    // norm berbentuk  D+.D+[e[-]D+]  -> parse Rust dibulatkan benar (sama dengan V8 StringToDouble)
    norm.parse::<f64>().unwrap_or(f64::NAN)
}

/// ToNumber(string) — `+str` / `Number(str)` di JS.
pub fn to_number(s: &str) -> f64 {
    let t = js_trim(s);
    if t.is_empty() {
        return 0.0;
    }
    let b = t.as_bytes();
    if b.len() >= 2 && b[0] == b'0' {
        match b[1] {
            b'x' | b'X' => return parse_pow2_radix(&t[2..], 4),
            b'o' | b'O' => return parse_pow2_radix(&t[2..], 3),
            b'b' | b'B' => return parse_pow2_radix(&t[2..], 1),
            _ => {}
        }
    }
    let mut i = 0usize;
    let mut neg = false;
    if b[0] == b'+' || b[0] == b'-' {
        neg = b[0] == b'-';
        i = 1;
    }
    if &t[i..] == "Infinity" {
        return if neg { f64::NEG_INFINITY } else { f64::INFINITY };
    }
    match scan_decimal(b, i) {
        Some((end, norm)) if end == b.len() => {
            let v = parse_norm(&norm);
            if neg {
                -v
            } else {
                v
            }
        }
        _ => f64::NAN,
    }
}

/// ToNumber untuk nilai yang bisa `undefined` (kolom CSV yang tidak ada) -> NaN.
#[inline]
pub fn to_number_opt(s: Option<&str>) -> f64 {
    match s {
        Some(v) => to_number(v),
        None => f64::NAN,
    }
}

/// parseFloat(str): awalan terpanjang yang memenuhi StrDecimalLiteral, selain itu NaN.
pub fn parse_float(s: &str) -> f64 {
    let t = s.trim_start_matches(is_js_whitespace);
    let b = t.as_bytes();
    let mut i = 0usize;
    let mut neg = false;
    if !b.is_empty() && (b[0] == b'+' || b[0] == b'-') {
        neg = b[0] == b'-';
        i = 1;
    }
    if t[i..].starts_with("Infinity") {
        return if neg { f64::NEG_INFINITY } else { f64::INFINITY };
    }
    match scan_decimal(b, i) {
        Some((_, norm)) => {
            let v = parse_norm(&norm);
            if neg {
                -v
            } else {
                v
            }
        }
        None => f64::NAN,
    }
}

/// Number.prototype.toString() (radix 10). Digit terpendek dari Ryu (terpendek, terdekat, seri -> genap),
/// lalu ditata menurut aturan Number::toString ECMAScript.
pub fn num_to_string(x: f64) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    if x == 0.0 {
        return "0".to_string();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity".to_string() } else { "-Infinity".to_string() };
    }
    let neg = x < 0.0;
    let mut buf = ryu::Buffer::new();
    let rs = buf.format_finite(x.abs());
    let (mant, e10) = match rs.find(|c| c == 'e' || c == 'E') {
        Some(k) => (&rs[..k], rs[k + 1..].parse::<i32>().expect("eksponen ryu")),
        None => (rs, 0),
    };
    let (ip, fp) = match mant.find('.') {
        Some(k) => (&mant[..k], &mant[k + 1..]),
        None => (mant, ""),
    };
    // nilai = 0.D x 10^n
    let mut digits: String = format!("{}{}", ip, fp);
    let mut n: i32 = ip.len() as i32 + e10;
    let lead = digits.len() - digits.trim_start_matches('0').len();
    digits = digits[lead..].to_string();
    n -= lead as i32;
    let t = digits.trim_end_matches('0').len();
    digits.truncate(t);
    let k = digits.len() as i32;
    let mut out = String::new();
    if neg {
        out.push('-');
    }
    if k <= n && n <= 21 {
        out.push_str(&digits);
        for _ in 0..(n - k) {
            out.push('0');
        }
    } else if 0 < n && n <= 21 {
        out.push_str(&digits[..n as usize]);
        out.push('.');
        out.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        for _ in 0..(-n) {
            out.push('0');
        }
        out.push_str(&digits);
    } else {
        let e = n - 1;
        out.push_str(&digits[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        out.push(if e >= 0 { '+' } else { '-' });
        out.push_str(&e.abs().to_string());
    }
    out
}

/// Number.prototype.toFixed(k), k <= 6. Eksak atas nilai biner x; seri -> n yang lebih besar.
pub fn to_fixed(x: f64, k: u32) -> String {
    assert!(k <= 6, "to_fixed: k terlalu besar");
    if x.is_nan() {
        return "NaN".to_string();
    }
    if x.abs() >= 1e21 {
        return num_to_string(x); // termasuk +-Infinity
    }
    let neg = x < 0.0; // -0 < 0 salah -> tanpa tanda, sesuai spesifikasi
    let a = x.abs();
    let bits = a.to_bits();
    let e_field = ((bits >> 52) & 0x7FF) as i32;
    let frac = bits & ((1u64 << 52) - 1);
    let (mant, exp2) = if e_field == 0 {
        (frac, -1074i32)
    } else {
        (frac | (1u64 << 52), e_field - 1075)
    };
    let num: u128 = (mant as u128) * 10u128.pow(k);
    let n: u128 = if exp2 >= 0 {
        num << exp2 // a < 1e21 -> exp2 <= 17, num < 2^73 -> muat
    } else {
        let sh = (-exp2) as u32;
        if sh >= 128 {
            0
        } else {
            let q = num >> sh;
            let rem = num - (q << sh);
            let half = 1u128 << (sh - 1);
            if rem >= half {
                q + 1
            } else {
                q
            }
        }
    };
    let mut m = n.to_string();
    if k > 0 {
        let kk = k as usize;
        if m.len() <= kk {
            m = format!("{}{}", "0".repeat(kk + 1 - m.len()), m);
        }
        let split = m.len() - kk;
        m = format!("{}.{}", &m[..split], &m[split..]);
    }
    if neg {
        format!("-{}", m)
    } else {
        m
    }
}

/// `+x.toFixed(k)`
#[inline]
pub fn to_fixed_num(x: f64, k: u32) -> f64 {
    to_number(&to_fixed(x, k))
}

/// JSON.stringify untuk string.
pub fn json_str(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// JSON.stringify untuk angka: non-finite -> null.
pub fn json_num(x: f64, out: &mut String) {
    if x.is_finite() {
        out.push_str(&num_to_string(x));
    } else {
        out.push_str("null");
    }
}

/// Apakah kunci properti JS ini adalah "array index" (diurutkan duluan oleh Object.entries).
pub fn is_array_index_key(s: &str) -> Option<u32> {
    if s.is_empty() || s.len() > 10 {
        return None;
    }
    if !s.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    if s.len() > 1 && s.starts_with('0') {
        return None;
    }
    let v: u64 = s.parse().ok()?;
    if v <= 4_294_967_294 {
        Some(v as u32)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fixed() {
        assert_eq!(to_fixed(2.5, 0), "3");
        assert_eq!(to_fixed(-2.5, 0), "-3");
        assert_eq!(to_fixed(0.25, 1), "0.3");
        assert_eq!(to_fixed(1.005, 2), "1.00");
        assert_eq!(to_fixed(-0.001, 2), "-0.00");
        assert_eq!(to_fixed(-0.0, 2), "0.00");
        assert_eq!(to_fixed(12746.3249, 2), "12746.32");
        assert_eq!(to_fixed(f64::INFINITY, 2), "Infinity");
        assert_eq!(to_fixed(1e21, 2), "1e+21");
        assert_eq!(to_fixed(0.0, 0), "0");
    }
    #[test]
    fn numbers() {
        assert_eq!(to_number(""), 0.0);
        assert_eq!(to_number(" 12 "), 12.0);
        assert!(to_number("1_0").is_nan());
        assert!(to_number("abc").is_nan());
        assert_eq!(to_number("0x1F"), 31.0);
        assert_eq!(to_number(".5"), 0.5);
        assert_eq!(to_number("5."), 5.0);
        assert_eq!(to_number("-.5e1"), -5.0);
        assert!(to_number("1e").is_nan());
        assert!(to_number("inf").is_nan());
        assert!(to_number("-0x10").is_nan());
        assert_eq!(parse_float("12.5abc"), 12.5);
        assert_eq!(parse_float("1e"), 1.0);
        assert_eq!(parse_float("1e+x"), 1.0);
        assert_eq!(parse_float("0x10"), 0.0);
        assert!(parse_float("").is_nan());
        assert!(parse_float("undefined").is_nan());
        assert_eq!(parse_float("-Infinityx"), f64::NEG_INFINITY);
        assert_eq!(num_to_string(1e21), "1e+21");
        assert_eq!(num_to_string(1e-7), "1e-7");
        assert_eq!(num_to_string(0.000001), "0.000001");
        assert_eq!(num_to_string(123.456), "123.456");
        assert_eq!(num_to_string(-1.5e-9), "-1.5e-9");
    }
}
