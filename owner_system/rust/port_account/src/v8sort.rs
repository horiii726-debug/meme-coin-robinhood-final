//! Port Array.prototype.sort milik V8 (third_party/v8/builtins/array-sort.tq, TimSort).
//!
//! Kenapa tidak memakai `sort_by` bawaan Rust: komparator event di arena.js
//! `(a,b)=>a.b-b.b||(a.k==="tutup"?-1:1)` TIDAK konsisten untuk dua event dengan blok sama
//! dan jenis sama (cmp(a,b) dan cmp(b,a) sama-sama -1 atau sama-sama +1), dan komparator
//! `a.decide-b.decide` menghasilkan NaN bila ada blok NaN. Untuk komparator seperti itu,
//! urutan hasil ditentukan oleh langkah-langkah algoritma V8 itu sendiri, jadi algoritmanya
//! ditiru persis: run alami + binary insertion sort sampai minrun, stack run dengan
//! invariant V8, MergeLow/MergeHigh dengan galloping (minGallop awal 7).
//!
//! Komparator mengembalikan f64 (hasil ToNumber dari nilai kembali fungsi JS);
//! semua uji `order < 0` / `order >= 0` mengikuti semantik JS (NaN -> salah).

const MIN_GALLOP_WINS: isize = 7;

struct State {
    min_gallop: isize,
    runs: Vec<(usize, usize)>, // (base, length)
}

fn compute_min_run_length(n_arg: usize) -> usize {
    let mut n = n_arg;
    let mut r = 0usize;
    while n >= 64 {
        r |= n & 1;
        n >>= 1;
    }
    n + r
}

/// Urutkan `a` persis seperti V8 `Array.prototype.sort(cmp)` (elemen tanpa undefined/hole).
pub fn sort<T: Copy, F: FnMut(&T, &T) -> f64>(a: &mut [T], mut cmp: F) {
    let length = a.len();
    if length < 2 {
        return;
    }
    let mut st = State { min_gallop: MIN_GALLOP_WINS, runs: Vec::new() };
    let mut remaining = length;
    let mut low = 0usize;
    let min_run = compute_min_run_length(remaining);
    while remaining != 0 {
        let mut cur = count_and_make_run(a, low, low + remaining, &mut cmp);
        if cur < min_run {
            let forced = min_run.min(remaining);
            binary_insertion_sort(a, low, low + cur, low + forced, &mut cmp);
            cur = forced;
        }
        st.runs.push((low, cur));
        merge_collapse(a, &mut st, &mut cmp);
        low += cur;
        remaining -= cur;
    }
    merge_force_collapse(a, &mut st, &mut cmp);
}

fn count_and_make_run<T: Copy, F: FnMut(&T, &T) -> f64>(a: &mut [T], low_arg: usize, high: usize, cmp: &mut F) -> usize {
    let low = low_arg + 1;
    if low == high {
        return 1;
    }
    let mut run_length = 2usize;
    let element_low = a[low];
    let element_low_pre = a[low - 1];
    let order = cmp(&element_low, &element_low_pre);
    let is_descending = order < 0.0;
    let mut previous = element_low;
    let mut idx = low + 1;
    while idx < high {
        let current = a[idx];
        let order = cmp(&current, &previous);
        if is_descending {
            if order >= 0.0 {
                break;
            }
        } else if order < 0.0 {
            break;
        }
        previous = current;
        run_length += 1;
        idx += 1;
    }
    if is_descending {
        a[low_arg..low_arg + run_length].reverse();
    }
    run_length
}

fn binary_insertion_sort<T: Copy, F: FnMut(&T, &T) -> f64>(a: &mut [T], low: usize, start_arg: usize, high: usize, cmp: &mut F) {
    let mut start = if low == start_arg { start_arg + 1 } else { start_arg };
    while start < high {
        let mut left = low;
        let mut right = start;
        let pivot = a[start];
        while left < right {
            let mid = left + ((right - left) >> 1);
            let order = cmp(&pivot, &a[mid]);
            if order < 0.0 {
                right = mid;
            } else {
                left = mid + 1;
            }
        }
        let mut p = start;
        while p > left {
            a[p] = a[p - 1];
            p -= 1;
        }
        a[left] = pivot;
        start += 1;
    }
}

#[inline]
fn run_len(st: &State, i: usize) -> usize {
    st.runs[i].1
}

/// true bila run_length(n-2) > run_length(n-1) + run_length(n).
fn run_invariant_established(st: &State, n: isize) -> bool {
    if n < 2 {
        return true;
    }
    let n = n as usize;
    run_len(st, n - 2) > run_len(st, n - 1) + run_len(st, n)
}

fn merge_collapse<T: Copy, F: FnMut(&T, &T) -> f64>(a: &mut [T], st: &mut State, cmp: &mut F) {
    while st.runs.len() > 1 {
        let mut n: isize = st.runs.len() as isize - 2;
        if !run_invariant_established(st, n + 1) || !run_invariant_established(st, n) {
            if run_len(st, (n - 1) as usize) < run_len(st, (n + 1) as usize) {
                n -= 1;
            }
            merge_at(a, st, n as usize, cmp);
        } else if run_len(st, n as usize) <= run_len(st, (n + 1) as usize) {
            merge_at(a, st, n as usize, cmp);
        } else {
            break;
        }
    }
}

fn merge_force_collapse<T: Copy, F: FnMut(&T, &T) -> f64>(a: &mut [T], st: &mut State, cmp: &mut F) {
    while st.runs.len() > 1 {
        let mut n: isize = st.runs.len() as isize - 2;
        if n > 0 && run_len(st, (n - 1) as usize) < run_len(st, (n + 1) as usize) {
            n -= 1;
        }
        merge_at(a, st, n as usize, cmp);
    }
}

fn merge_at<T: Copy, F: FnMut(&T, &T) -> f64>(a: &mut [T], st: &mut State, i: usize, cmp: &mut F) {
    let stack_size = st.runs.len();
    let (mut base_a, mut length_a) = st.runs[i];
    let (base_b, mut length_b) = st.runs[i + 1];
    st.runs[i].1 = length_a + length_b;
    if i + 3 == stack_size {
        st.runs[i + 1] = st.runs[i + 2];
    }
    st.runs.pop();

    let key_right = a[base_b];
    let k = gallop_right(a, key_right, base_a, length_a, 0, cmp);
    base_a += k;
    length_a -= k;
    if length_a == 0 {
        return;
    }
    let key_left = a[base_a + length_a - 1];
    length_b = gallop_left(a, key_left, base_b, length_b, length_b - 1, cmp);
    if length_b == 0 {
        return;
    }
    if length_a <= length_b {
        merge_low(a, st, base_a, length_a, base_b, length_b, cmp);
    } else {
        merge_high(a, st, base_a, length_a, base_b, length_b, cmp);
    }
}

/// Posisi key di arr[base..base+length) (kiri dari elemen yang sama). Lihat GallopLeft V8.
fn gallop_left<T: Copy, F: FnMut(&T, &T) -> f64>(arr: &[T], key: T, base: usize, length: usize, hint: usize, cmp: &mut F) -> usize {
    let base = base as isize;
    let length = length as isize;
    let hint = hint as isize;
    let mut last_ofs: isize = 0;
    let mut offset: isize = 1;
    let at = |i: isize| arr[i as usize];

    let order = cmp(&at(base + hint), &key);
    if order < 0.0 {
        let max_ofs = length - hint;
        while offset < max_ofs {
            let order = cmp(&at(base + hint + offset), &key);
            if order >= 0.0 {
                break;
            }
            last_ofs = offset;
            offset = (offset << 1) + 1;
            if offset <= 0 {
                offset = max_ofs;
            }
        }
        if offset > max_ofs {
            offset = max_ofs;
        }
        last_ofs += hint;
        offset += hint;
    } else {
        let max_ofs = hint + 1;
        while offset < max_ofs {
            let order = cmp(&at(base + hint - offset), &key);
            if order < 0.0 {
                break;
            }
            last_ofs = offset;
            offset = (offset << 1) + 1;
            if offset <= 0 {
                offset = max_ofs;
            }
        }
        if offset > max_ofs {
            offset = max_ofs;
        }
        let tmp = last_ofs;
        last_ofs = hint - offset;
        offset = hint - tmp;
    }
    last_ofs += 1;
    while last_ofs < offset {
        let m = last_ofs + ((offset - last_ofs) >> 1);
        let order = cmp(&at(base + m), &key);
        if order < 0.0 {
            last_ofs = m + 1;
        } else {
            offset = m;
        }
    }
    offset as usize
}

/// Seperti gallop_left tetapi kanan dari elemen yang sama. Lihat GallopRight V8.
fn gallop_right<T: Copy, F: FnMut(&T, &T) -> f64>(arr: &[T], key: T, base: usize, length: usize, hint: usize, cmp: &mut F) -> usize {
    let base = base as isize;
    let length = length as isize;
    let hint = hint as isize;
    let mut last_ofs: isize = 0;
    let mut offset: isize = 1;
    let at = |i: isize| arr[i as usize];

    let order = cmp(&key, &at(base + hint));
    if order < 0.0 {
        let max_ofs = hint + 1;
        while offset < max_ofs {
            let order = cmp(&key, &at(base + hint - offset));
            if order >= 0.0 {
                break;
            }
            last_ofs = offset;
            offset = (offset << 1) + 1;
            if offset <= 0 {
                offset = max_ofs;
            }
        }
        if offset > max_ofs {
            offset = max_ofs;
        }
        let tmp = last_ofs;
        last_ofs = hint - offset;
        offset = hint - tmp;
    } else {
        let max_ofs = length - hint;
        while offset < max_ofs {
            let order = cmp(&key, &at(base + hint + offset));
            if order < 0.0 {
                break;
            }
            last_ofs = offset;
            offset = (offset << 1) + 1;
            if offset <= 0 {
                offset = max_ofs;
            }
        }
        if offset > max_ofs {
            offset = max_ofs;
        }
        last_ofs += hint;
        offset += hint;
    }
    last_ofs += 1;
    while last_ofs < offset {
        let m = last_ofs + ((offset - last_ofs) >> 1);
        let order = cmp(&key, &at(base + m));
        if order < 0.0 {
            offset = m;
        } else {
            last_ofs = m + 1;
        }
    }
    offset as usize
}

enum EndLow {
    Succeed,
    CopyB,
}

fn merge_low<T: Copy, F: FnMut(&T, &T) -> f64>(
    a: &mut [T],
    st: &mut State,
    base_a: usize,
    length_a_arg: usize,
    base_b: usize,
    length_b_arg: usize,
    cmp: &mut F,
) {
    let mut length_a = length_a_arg;
    let mut length_b = length_b_arg;
    let temp: Vec<T> = a[base_a..base_a + length_a].to_vec();
    let mut dest = base_a;
    let mut cursor_temp = 0usize;
    let mut cursor_b = base_b;

    a[dest] = a[cursor_b];
    dest += 1;
    cursor_b += 1;

    let end = 'blk: {
        length_b -= 1;
        if length_b == 0 {
            break 'blk EndLow::Succeed;
        }
        if length_a == 1 {
            break 'blk EndLow::CopyB;
        }
        let mut min_gallop = st.min_gallop;
        loop {
            let mut wins_a: isize = 0;
            let mut wins_b: isize = 0;
            loop {
                let order = cmp(&a[cursor_b], &temp[cursor_temp]);
                if order < 0.0 {
                    a[dest] = a[cursor_b];
                    dest += 1;
                    cursor_b += 1;
                    wins_b += 1;
                    length_b -= 1;
                    wins_a = 0;
                    if length_b == 0 {
                        break 'blk EndLow::Succeed;
                    }
                    if wins_b >= min_gallop {
                        break;
                    }
                } else {
                    a[dest] = temp[cursor_temp];
                    dest += 1;
                    cursor_temp += 1;
                    wins_a += 1;
                    length_a -= 1;
                    wins_b = 0;
                    if length_a == 1 {
                        break 'blk EndLow::CopyB;
                    }
                    if wins_a >= min_gallop {
                        break;
                    }
                }
            }
            min_gallop += 1;
            let mut first = true;
            while wins_a >= MIN_GALLOP_WINS || wins_b >= MIN_GALLOP_WINS || first {
                first = false;
                min_gallop = std::cmp::max(1, min_gallop - 1);
                st.min_gallop = min_gallop;

                let wa = gallop_right(&temp, a[cursor_b], cursor_temp, length_a, 0, cmp);
                wins_a = wa as isize;
                if wa > 0 {
                    a[dest..dest + wa].copy_from_slice(&temp[cursor_temp..cursor_temp + wa]);
                    dest += wa;
                    cursor_temp += wa;
                    length_a -= wa;
                    if length_a == 1 {
                        break 'blk EndLow::CopyB;
                    }
                    if length_a == 0 {
                        break 'blk EndLow::Succeed;
                    }
                }
                a[dest] = a[cursor_b];
                dest += 1;
                cursor_b += 1;
                length_b -= 1;
                if length_b == 0 {
                    break 'blk EndLow::Succeed;
                }

                let wb = gallop_left(a, temp[cursor_temp], cursor_b, length_b, 0, cmp);
                wins_b = wb as isize;
                if wb > 0 {
                    a.copy_within(cursor_b..cursor_b + wb, dest);
                    dest += wb;
                    cursor_b += wb;
                    length_b -= wb;
                    if length_b == 0 {
                        break 'blk EndLow::Succeed;
                    }
                }
                a[dest] = temp[cursor_temp];
                dest += 1;
                cursor_temp += 1;
                length_a -= 1;
                if length_a == 1 {
                    break 'blk EndLow::CopyB;
                }
            }
            min_gallop += 1;
            st.min_gallop = min_gallop;
        }
    };
    match end {
        EndLow::Succeed => {
            if length_a > 0 {
                a[dest..dest + length_a].copy_from_slice(&temp[cursor_temp..cursor_temp + length_a]);
            }
        }
        EndLow::CopyB => {
            a.copy_within(cursor_b..cursor_b + length_b, dest);
            a[dest + length_b] = temp[cursor_temp];
        }
    }
}

enum EndHigh {
    Succeed,
    CopyA,
}

fn merge_high<T: Copy, F: FnMut(&T, &T) -> f64>(
    a: &mut [T],
    st: &mut State,
    base_a: usize,
    length_a_arg: usize,
    base_b: usize,
    length_b_arg: usize,
    cmp: &mut F,
) {
    let mut length_a = length_a_arg as isize;
    let mut length_b = length_b_arg as isize;
    let temp: Vec<T> = a[base_b..base_b + length_b_arg].to_vec();
    let mut dest: isize = (base_b + length_b_arg) as isize - 1;
    let mut cursor_temp: isize = length_b - 1;
    let mut cursor_a: isize = (base_a + length_a_arg) as isize - 1;
    let ix = |i: isize| i as usize;

    a[ix(dest)] = a[ix(cursor_a)];
    dest -= 1;
    cursor_a -= 1;

    let end = 'blk: {
        length_a -= 1;
        if length_a == 0 {
            break 'blk EndHigh::Succeed;
        }
        if length_b == 1 {
            break 'blk EndHigh::CopyA;
        }
        let mut min_gallop = st.min_gallop;
        loop {
            let mut wins_a: isize = 0;
            let mut wins_b: isize = 0;
            loop {
                let order = cmp(&temp[ix(cursor_temp)], &a[ix(cursor_a)]);
                if order < 0.0 {
                    a[ix(dest)] = a[ix(cursor_a)];
                    dest -= 1;
                    cursor_a -= 1;
                    wins_a += 1;
                    length_a -= 1;
                    wins_b = 0;
                    if length_a == 0 {
                        break 'blk EndHigh::Succeed;
                    }
                    if wins_a >= min_gallop {
                        break;
                    }
                } else {
                    a[ix(dest)] = temp[ix(cursor_temp)];
                    dest -= 1;
                    cursor_temp -= 1;
                    wins_b += 1;
                    length_b -= 1;
                    wins_a = 0;
                    if length_b == 1 {
                        break 'blk EndHigh::CopyA;
                    }
                    if wins_b >= min_gallop {
                        break;
                    }
                }
            }
            min_gallop += 1;
            let mut first = true;
            while wins_a >= MIN_GALLOP_WINS || wins_b >= MIN_GALLOP_WINS || first {
                first = false;
                min_gallop = std::cmp::max(1, min_gallop - 1);
                st.min_gallop = min_gallop;

                let k = gallop_right(a, temp[ix(cursor_temp)], base_a, ix(length_a), ix(length_a - 1), cmp) as isize;
                wins_a = length_a - k;
                if wins_a > 0 {
                    dest -= wins_a;
                    cursor_a -= wins_a;
                    a.copy_within(ix(cursor_a + 1)..ix(cursor_a + 1 + wins_a), ix(dest + 1));
                    length_a -= wins_a;
                    if length_a == 0 {
                        break 'blk EndHigh::Succeed;
                    }
                }
                a[ix(dest)] = temp[ix(cursor_temp)];
                dest -= 1;
                cursor_temp -= 1;
                length_b -= 1;
                if length_b == 1 {
                    break 'blk EndHigh::CopyA;
                }

                let k = gallop_left(&temp, a[ix(cursor_a)], 0, ix(length_b), ix(length_b - 1), cmp) as isize;
                wins_b = length_b - k;
                if wins_b > 0 {
                    dest -= wins_b;
                    cursor_temp -= wins_b;
                    a[ix(dest + 1)..ix(dest + 1 + wins_b)]
                        .copy_from_slice(&temp[ix(cursor_temp + 1)..ix(cursor_temp + 1 + wins_b)]);
                    length_b -= wins_b;
                    if length_b == 1 {
                        break 'blk EndHigh::CopyA;
                    }
                    if length_b == 0 {
                        break 'blk EndHigh::Succeed;
                    }
                }
                a[ix(dest)] = a[ix(cursor_a)];
                dest -= 1;
                cursor_a -= 1;
                length_a -= 1;
                if length_a == 0 {
                    break 'blk EndHigh::Succeed;
                }
            }
            min_gallop += 1;
            st.min_gallop = min_gallop;
        }
    };
    match end {
        EndHigh::Succeed => {
            if length_b > 0 {
                let d0 = dest - (length_b - 1);
                a[ix(d0)..ix(d0 + length_b)].copy_from_slice(&temp[0..ix(length_b)]);
            }
        }
        EndHigh::CopyA => {
            dest -= length_a;
            cursor_a -= length_a;
            a.copy_within(ix(cursor_a + 1)..ix(cursor_a + 1 + length_a), ix(dest + 1));
            a[ix(dest)] = temp[ix(cursor_temp)];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn konsisten_sama_dengan_stable_sort() {
        // komparator konsisten -> hasil harus sama dengan sort stabil biasa
        let mut seed: u64 = 12345;
        for len in [0usize, 1, 2, 5, 31, 64, 65, 200, 1000, 5000] {
            let v: Vec<(u32, usize)> = (0..len)
                .map(|i| {
                    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                    (((seed >> 33) % 50) as u32, i)
                })
                .collect();
            let mut a = v.clone();
            sort(&mut a, |x, y| x.0 as f64 - y.0 as f64);
            let mut b = v.clone();
            b.sort_by_key(|x| x.0);
            assert_eq!(a, b, "len {}", len);
        }
    }
}
