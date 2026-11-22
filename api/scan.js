// GET /api/scan?m=bist|ndx|dji|spx|sse|sectors|indices → her sembol için günlük ölçümler (RSI, hacim, para akışı, performans, teknik skor)
const { chart } = require('./_yahoo');
const MARKETS = require('../data/markets.json');

const SECTORS = [
  ['XU100', 'BIST 100'], ['XU030', 'BIST 30'], ['XBANK', 'Banka'], ['XUMAL', 'Mali'], ['XUSIN', 'Sınai'], ['XHOLD', 'Holding'], ['XUTEK', 'Teknoloji'],
  ['XBLSM', 'Bilişim'], ['XELKT', 'Elektrik'], ['XGIDA', 'Gıda İçecek'], ['XINSA', 'İnşaat'], ['XKMYA', 'Kimya Petrol Plastik'], ['XMANA', 'Metal Ana'],
  ['XMESY', 'Metal Eşya Makina'], ['XTRZM', 'Turizm'], ['XULAS', 'Ulaştırma'], ['XILTM', 'İletişim'], ['XTEKS', 'Tekstil Deri'], ['XSGRT', 'Sigorta'],
  ['XGMYO', 'Gayrimenkul YO'], ['XKAGT', 'Orman Kâğıt Basım'], ['XTAST', 'Taş Toprak'], ['XSPOR', 'Spor'], ['XFINK', 'Finansal Kiralama'], ['XAKUR', 'Aracı Kurumlar'],
  ['XMADN', 'Madencilik'], ['XTCRT', 'Ticaret'], ['XUHIZ', 'Hizmetler'], ['XKOBI', 'KOBİ Sanayi'], ['XYORT', 'Menkul Kıymet YO'],
].map(([s, n]) => ({ s, y: s + '.IS', n }));

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

module.exports = async (req, res) => {
  const m = String(req.query.m || '');
  const list = m === 'sectors' ? SECTORS : MARKETS[m];
  if (!list) return res.status(400).json({ error: 'geçersiz pazar' });
  const { metrics } = await import('../lib/metrics.mjs');
  const rows = [];
  await pool(list, m === 'spx' ? 16 : 10, async (x) => {
    try {
      const r = await chart(x.y, '1d', '2y');
      const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, ts = r.timestamp || [];
      const d = [];
      for (let i = 0; i < ts.length; i++) if (q.close[i] != null) d.push({ t: ts[i] * 1000, o: q.open[i] ?? q.close[i], h: q.high[i] ?? q.close[i], l: q.low[i] ?? q.close[i], c: q.close[i], v: q.volume[i] || 0 });
      const mt = metrics(d); if (!mt) return;
      const price = r.meta && r.meta.regularMarketPrice;
      rows.push({ s: x.s, y: x.y, n: x.n, sec: x.sec, ...mt, p: price || mt.p, t: d.length ? d[d.length - 1].t : null });
    } catch (e) { /* atla */ }
  });
  rows.sort((a, b) => a.s.localeCompare(b.s));
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
  res.status(200).json({ m, rows, ts: Date.now() });
};
