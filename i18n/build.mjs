// _master.json → en.json, fr.json, hi.json, zh.json, ko.json
import fs from 'fs';
const dir = new URL('.', import.meta.url).pathname;
const M = JSON.parse(fs.readFileSync(dir + '_master.json', 'utf8'));
const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join();
for (const l of ['en', 'fr', 'hi', 'zh', 'ko']) {
  const out = {};
  for (const [k, v] of Object.entries(M)) {
    if (v[l] == null) continue;
    if (ph(k) !== ph(v[l])) throw new Error(`${l}: yer tutucu uyuşmuyor: ${k}`);
    out[k] = v[l];
  }
  fs.writeFileSync(dir + l + '.json', JSON.stringify(out));
  console.log(l, Object.keys(out).length);
}
