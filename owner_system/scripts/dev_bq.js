// Ambil DEPLOYER tiap pool lewat Bitquery Events (Transaction.From sudah tersedia di sana).
// Jauh lebih hemat daripada 154 round-trip eth_getTransactionByHash.
const { spawn } = require("child_process");
const fs = require("fs");

const TOKEN = process.env.BQ_TOKEN;
const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const sleep = ms => new Promise(r => setTimeout(r, ms));

function gql(query) {
  return new Promise((res, rej) => {
    const p = spawn("curl", ["-s", "-m", "180", "-X", "POST", "https://streaming.bitquery.io/graphql",
      "-H", "Content-Type: application/json", "-H", "Authorization: Bearer " + TOKEN,
      "-d", JSON.stringify({ query })], { maxBuffer: 1024 * 1024 * 300 });
    let out = "";
    p.stdout.on("data", d => out += d);
    p.on("close", () => { try { res(JSON.parse(out)); } catch (e) { rej(new Error("badjson: " + out.slice(0, 200))); } });
  });
}

(async () => {
  const [FROM, TO] = fs.readFileSync(process.env.RANGE_FILE || "range.txt", "utf8").trim().split(/\s+/).map(Number);
  const STEP = parseInt(process.env.STEP || "60000", 10);
  const w = fs.createWriteStream(process.env.OUT_CSV || "ds24/deployers_bq.csv");
  w.write("pool_id,deployer,init_block\n");
  let total = 0, fail = 0;

  for (let b = FROM; b <= TO; b += STEP) {
    const t = Math.min(b + STEP - 1, TO);
    const q = `{
      EVM(network: robinhood dataset: realtime) {
        Events(
          limit: {count: 25000}
          orderBy: {ascending: Block_Number}
          where: {
            Log: {SmartContract: {is: "${PM}"}, Signature: {Name: {is: "Initialize"}}}
            Block: {Number: {ge: "${b}", le: "${t}"}}
          }
        ) {
          Block { Number }
          Transaction { From }
          Arguments { Name Value { ... on EVM_ABI_Bytes_Value_Arg { hex } } }
        }
      }
    }`;
    let r = null;
    for (let a = 0; a < 4; a++) {
      try { r = await gql(q); break; } catch (e) { if (a === 3) { } else await sleep(2000 * (a + 1)); }
    }
    if (!r || r.errors || !r.data) {
      fail++;
      console.error(`GAGAL ${b}..${t}: ${r && r.errors ? JSON.stringify(r.errors).slice(0, 150) : "no data"}`);
      continue;
    }
    const ev = r.data.EVM.Events || [];
    for (const e of ev) {
      const idArg = e.Arguments.find(a => a.Name === "id");
      const pid = idArg && idArg.Value && idArg.Value.hex;
      if (!pid || !e.Transaction || !e.Transaction.From) continue;
      const h = pid.startsWith("0x") ? pid : "0x" + pid;
      w.write(`${h.toLowerCase()},${e.Transaction.From.toLowerCase()},${e.Block.Number}\n`);
      total++;
    }
    console.error(`  ${b}..${t}: ${ev.length} event (total ${total})`);
  }
  w.end();
  console.error(`SELESAI: ${total} pool ter-atribusi, ${fail} rentang gagal`);
})();
