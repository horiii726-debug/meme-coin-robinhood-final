# FASE 0 — Verifikasi Fakta Chain
Tanggal survei: **2026-09-12** · Status gate: **LOLOS**

## KILL CRITERIA F0
> PoolManager gak bisa diverifikasi → stop, lapor.

**Tidak kena.** PoolManager Uniswap v4 = `0x8366a39cc670b4001a1121b8f6a443a643e40951`,
diverifikasi lewat **4 jalur independen**:

1. **keccak256 event-signature.** Hash dihitung sendiri (ethers v6), dicocokkan ke log on-chain:
   - `Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)` → `0x40e9cecb…`
   - `ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)` → `0xf208f491…`
   - `Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)` → `0xdd466e67…`
   Ketiganya **hanya** dipancarkan address ini di seluruh sampel log → pola singleton v4.
2. **Bitquery** (sumber pihak ketiga, independen) melaporkan `ProtocolName="uniswap_v4"`
   pada `SmartContract` yang persis sama.
3. **Interface check.** `eth_getCode` = 24.009 byte; merespon `owner()`,
   `protocolFeeController()`, `protocolFeesAccrued(address)`.
4. **Decoder silang.** Decode `Initialize` milik saya menghasilkan argumen identik
   dengan decoder ABI Bitquery pada event yang sama.

## 1. RPC hidup
| | |
|---|---|
| `eth_chainId` | `0x1237` = **4663** ✅ |
| `web3_clientVersion` | `nitro/v3.11.4-rc.3-7d5ac27/linux-arm64/go1.25.14` |
| Block terakhir saat survei | 61.113.047 |

Stack = **Arbitrum Nitro (Orbit)**, settle ke Ethereum L1 (`l1BlockNumber` ≈ 25,9 juta).
Bukan tebakan: DNS asli `rpc.mainnet.chain.robinhood.com` → CNAME `customer-origin.offchainlabs.com`.

## 2. Umur chain
- Block 0 = genesis placeholder (`timestamp = 0`).
- Block 1 = **2026-04-30T16:52:11Z** → umur **135 hari**.
- Block time terukur **~0,10 detik** (11,1 juta blok / 13 hari). Ini 20x lebih cepat
  dari asumsi umum dan **mengubah ukuran chunk backfill** (lihat §4).

## 3. DEX aktif
Agregasi Bitquery `DEXTrades`, 2026-09-12 06:00–12:40Z (6,6 jam):

| Protokol | Trade | Trader unik |
|---|---:|---:|
| **uniswap_v4** | **848.240** | **63.284** |
| uniswap_v3 (agregat pool) | ~296.000 | ~42.000 |
| pancakeswap_infinity | 29.596 | 1.223 |
| uniswap_v2 (agregat) | 21.126 | 4.328 |
| pancake_swap_v3 | 20.893 | 5.324 |
| seaport_v1.4 (NFT, bukan target) | 11.393 | 1.970 |

Uniswap v4 dominan telak → fokus riset di situ sudah tepat.
Uniswap v3 factory = `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` (10 dari 12 pool sampel
mengembalikannya dari `factory()`; codesize 24.535 B).

**Pool baru: 3.407 dalam ~5,5 jam ≈ 14.700/hari.**

### Quote token (symbol()/decimals() dibaca langsung dari kontrak)
| Symbol | Address | Dec | Sisi-pool (5,5 jam) |
|---|---|---:|---:|
| ETH (native) | `0x0000…0000` | 18 | 1.440 |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | 6 | 1.040 |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | 18 | 99 |

### Hooks
75,8% pool tanpa hook. Hook dominan `0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544` (16,8%).
**Fungsinya BELUM diverifikasi** — jangan diasumsikan launchpad sampai dibuktikan (tugas Fase 1/4).

### Fee tier — temuan yang berdampak ke cost model
602 pool pakai flag fee dinamis `0x800000`. Ada tier ekstrem: 900000 (90%), 841910, 810000.
→ **Fee WAJIB dibaca per-swap dari field `fee` di event `Swap`, bukan dari `Initialize`.**
Kalau pakai fee saat init, cost model Fase 3 akan salah total.

## 4. Kapabilitas RPC publik
| Properti | Hasil | Dampak |
|---|---|---|
| Archive state | **TIDAK** (~1k–10k blok terakhir saja) | blocker, lihat bawah |
| `eth_getLogs` limit | **10.000 log/query**, tidak ada limit range | chunk = 1.500 blok (5,15 log/blok) |
| Latensi trivial | 0,55–2,3 s | — |
| Latensi getLogs 1.000 blok | ~11 s | backfill lambat |
| WebSocket publik | **TIDAK ADA** (upgrade→400, `/ws`→404) | blocker |

**Estimasi backfill penuh via RPC publik:** 61,1 juta blok ÷ 1.500 = **40.742 request**
× 11 s = **5,2 hari serial** (~15,6 jam dengan 8x paralel, kalau tidak kena rate limit).

## 5. Bitquery
Endpoint `https://streaming.bitquery.io/graphql`, `network: robinhood` — **valid dan real-time**
(block 61.112.596 @ 12:39:08Z saat chain di 61.113.047; tidak ada lag).

Dataset terverifikasi: **Blocks, DEXTrades, Events, Transfers**.

Dua temuan yang menghemat kerja Fase 1:
- `Events` mengembalikan **argumen ter-decode penuh** + `Transaction.From`.
  → **Masalah "sender = router, bukan trader" (Fase 1 poin 4) selesai tanpa fetch receipt per-tx.**
- `Transfers` mengembalikan Amount yang sudah ter-scale desimal + `Currency.Decimals`.

Gotcha decode: argumen `bytes32` (PoolId) butuh fragment `... on EVM_ABI_Bytes_Value_Arg{ hex }`,
kalau tidak `Value` balik kosong.

Kuota/rate limit free tier **belum terukur** — tidak ada header sisa-poin di respons.
Harus dipantau dari dashboard Bitquery sebelum backfill besar. **Item terbuka.**

---

# BLOCKER — hal yang TIDAK bisa dikerjakan sesuai rencana asli

### B1. ISP mem-blokir RPC (sudah di-workaround)
`rpc.mainnet.chain.robinhood.com` di-DNS-hijack ke `aduankonten.id` (36.86.63.185),
sertifikatnya expired → koneksi mati total. Dibypass dengan DoH
(`curl --doh-url https://cloudflare-dns.com/dns-query`). Klien Rust nanti **wajib** pakai
resolver DoH atau IP di-pin manual. Blockscout & Bitquery tidak terdampak.

### B2. Bukan archive node → dua langkah rencana gugur
- **Fase 1 poin 5** (cross-check `balanceOf(PoolManager)` untuk validasi likuiditas) **tidak bisa
  dijalankan secara historis.** Rekonstruksi likuiditas jadi hanya dari kumulatif `liquidityDelta`,
  **tanpa pembanding independen.** Ini menghapus salah satu safety-check kamu — perlu diganti,
  misal rekonsiliasi dengan `Transfers` masuk/keluar PoolManager.
- **Fase 9 poin 2** (simulasi sell anti-honeypot) hanya bisa live, **tidak bisa di-backtest**.
  Artinya efek filter honeypot tidak akan terukur di angka Fase 7.

### B3. Tidak ada WebSocket publik
Live listener (Fase 1 poin 7) tidak bisa dibangun di endpoint ini. Berdampak ke
Fase 7 poin 2 (pengukuran latensi nyata) dan Fase 8 (paper live). Butuh provider berbayar
atau Bitquery streaming subscription.

### B4. Blockscout API tertutup Cloudflare challenge
"Top 50 kontrak by tx count" dialihkan ke agregasi Bitquery per-protokol (hasilnya lebih relevan).

### B5. Lingkungan build
Tidak ada C compiler maupun Visual Studio. Disk sisa **21,4 GB**.
Rust dipasang dengan host `x86_64-pc-windows-gnu` untuk menghindari VS Build Tools (~6 GB).
Konsekuensi: **`duckdb-rs` (bundled) kemungkinan gagal build.**
Rencana pengganti: polars + parquet (murni Rust) untuk penyimpanan, DuckDB CLI
binary standalone untuk query ad-hoc.

---

# Koreksi terhadap brief

Signature `Initialize` di rencana kamu (6 parameter: `id, currency0, currency1, fee,
tickSpacing, hooks`) adalah **draft Uniswap v4 lama dan tidak match di chain ini**.
Versi final punya 8 parameter (tambahan `sqrtPriceX96, tick`), topic `0xdd466e67…`.
Kalau dipakai apa adanya, decoder Fase 1 tidak akan menemukan satu pun pool.

---

# Angka untuk gate berikutnya (Fase 2)
Belum diuji — ini cuma konteks awal, **bukan** hasil gate:
- Pool baru ~14.700/hari → ambang "< 5/hari" jelas aman.
- Yang **belum** terjawab dan justru menentukan: berapa yang **TRADABLE** (pernah LP ≥ $20.000),
  dan berapa median LP-nya. Ini yang membunuh riset Solana kamu, dan belum terukur di sini.
