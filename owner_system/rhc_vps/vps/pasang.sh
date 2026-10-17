#!/usr/bin/env bash
# PASANG BOT RHC (Rust, MODE KERTAS) DI VPS UBUNTU 22.04/24.04 — jalan terus tanpa Claude.
# Pakai (sebagai root, dari folder paket hasil ekstrak):  sudo bash rhc_vps/vps/pasang.sh
# Hasil: /opt/rhc (kode + model + data), user sistem "rhc", layanan systemd:
#   rhc-live.service   bot Rust (restart otomatis kalau mati)
#   rhc-cek.timer      tiap 2 menit: restart bot kalau status basi > 3 menit / tertinggal > 20.000 blok
#   rhc-latih.timer    tiap hari 03:00 UTC: latih ulang model filter DENGAN GERBANG MUTU
# TIDAK ADA transaksi uang asli: kode bot tidak punya fungsi kirim transaksi & tidak memakai kunci dompet.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"          # folder yang berisi rhc_vps/ dan rust/
DST=/opt/rhc
echo "== 1. paket sistem"
apt-get update -y
apt-get install -y build-essential pkg-config libssl-dev ca-certificates curl python3 python3-venv rsync jq
echo "== 2. user & folder"
id rhc >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/rhc --shell /usr/sbin/nologin rhc
mkdir -p "$DST"
rsync -a --delete --exclude target --exclude 'rust_live*' "$SRC/rust/" "$DST/rust/"
rsync -a --exclude 'rust_live' --exclude 'store' --exclude 'node_modules' "$SRC/rhc_vps/" "$DST/"
[ -f "$DST/bot/.env" ] || cp "$DST/vps/env.vps" "$DST/bot/.env"
chown -R rhc:rhc "$DST"
echo "== 3. Rust (rustup, untuk user rhc) + build rilis"
sudo -u rhc -H bash -c 'command -v cargo >/dev/null || curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal'
sudo -u rhc -H bash -c "source ~/.cargo/env && cd $DST/rust/rhc-live && cargo build --release"
install -m 755 "$DST/rust/rhc-live/target/release/rhc-live" /usr/local/bin/rhc-live
install -m 755 "$DST/rust/rhc-live/target/release/cek_net" /usr/local/bin/rhc-cek-net
echo "== 4. Python (hanya untuk latih ulang model)"
sudo -u rhc -H python3 -m venv "$DST/venv"
sudo -u rhc -H "$DST/venv/bin/pip" install --quiet catboost pandas numpy scikit-learn
echo "== 5. uji mandiri sebelum dinyalakan"
sudo -u rhc -H env RPC_URLS="$(grep -E '^RPC_URLS=' $DST/bot/.env | cut -d= -f2-)" /usr/local/bin/rhc-cek-net
echo "== 6. layanan systemd"
install -m 644 "$DST/vps/rhc-live.service" /etc/systemd/system/
install -m 644 "$DST/vps/rhc-cek.service" "$DST/vps/rhc-cek.timer" /etc/systemd/system/
install -m 644 "$DST/vps/rhc-latih.service" "$DST/vps/rhc-latih.timer" /etc/systemd/system/
install -m 755 "$DST/vps/cek_sehat.sh" /usr/local/bin/rhc-cek-sehat
# batas ukuran log journald supaya disk tidak penuh
mkdir -p /etc/systemd/journald.conf.d && printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/rhc.conf
systemctl daemon-reload
systemctl restart systemd-journald
systemctl enable --now rhc-live.service rhc-cek.timer rhc-latih.timer
sleep 15
systemctl --no-pager status rhc-live.service | head -12
echo
echo "SELESAI. Pantau:  jq . $DST/bot/rust_live/status.json   |   tail -f $DST/bot/rust_live/live.log"
echo "Radar:            jq '.jumlah, .potensi_tumbuh[:5]' $DST/bot/rust_live/radar.json"
echo "Hentikan rapi:    sudo -u rhc touch $DST/bot/rust_live/stop.txt   (hapus berkasnya untuk jalan lagi)"
