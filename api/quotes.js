// GET /api/quotes?s=THYAO.IS,GC=F,AAPL  →  son fiyat + önceki kapanış (en fazla 60 sembol)
const { chart, SYM_RE } = require('./_yahoo');

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

module.exports = async (req, res) => {
  const list = [...new Set(String(req.query.s || '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 60);
  if (!list.length || !list.every((x) => SYM_RE.test(x))) return res.status(400).json({ error: 'geçersiz sembol' });
  const out = new Array(list.length);
  await pool(list, 12, async (s, k) => {
    try {
      const x = await chart(s, '1d', '5d');
      const m = x.meta || {};
      const closes = ((x.indicators && x.indicators.quote && x.indicators.quote[0]) || {}).close || [];
      const valid = closes.filter((v) => v != null);
      const prev = valid.length >= 2 ? valid[valid.length - 2] : (m.chartPreviousClose ?? null);
      out[k] = { s, price: m.regularMarketPrice ?? null, prev, n: m.shortName || m.longName || null, cur: m.currency || null };
    } catch (e) {
      out[k] = { s, price: null, prev: null, error: String(e.message || e) };
    }
  });
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  res.status(200).json(out);
};
