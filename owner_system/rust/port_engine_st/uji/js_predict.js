// Prediksi model pohon memakai loadModel ASLI dari v4engine.js (hanya dibaca, tidak diubah).
// Pakai: node js_predict.js <model.json> <check.json> <out_pred.json>
const fs = require("fs");
const { loadModel } = require("C:/Users/horii/rhc-quant/rhc_vps/pipeline/v4engine.js");
const [MODEL, CHECK, OUT] = process.argv.slice(2);
const m = loadModel(MODEL), ck = JSON.parse(fs.readFileSync(CHECK, "utf8"));
const pred = ck.X.map(x => m.predict(x));
// tulis dengan toString JS (round-trip eksak)
fs.writeFileSync(OUT, "[" + pred.map(String).join(",") + "]");
let mx = 0; ck.X.forEach((x, k) => { mx = Math.max(mx, Math.abs(pred[k] - ck.p[k])); });
console.log(`JS ${MODEL}: selisih maks vs sklearn ${mx.toExponential(3)}`);
