// GET /api/quotes?s=THYAO.IS,GC=F,USDTRY=X  →  son fiyat + önceki kapanış
const { chart, SYM_RE } = require('./_yahoo');

module.exports = async (req, res) => {
  const list = String(req.query.s || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40);
  if (!list.length || !list.every((x) => SYM_RE.test(x))) {
    return res.status(400).json({ error: 'geçersiz sembol' });
  }
  const out = await Promise.all(list.map(async (s) => {
    try {
      const x = await chart(s, '1d', '5d');
      const m = x.meta || {};
      const closes = ((x.indicators && x.indicators.quote && x.indicators.quote[0]) || {}).close || [];
      const valid = closes.filter((v) => v != null);
      const prev = valid.length >= 2 ? valid[valid.length - 2] : (m.chartPreviousClose ?? null);
      return { s, price: m.regularMarketPrice ?? null, prev };
    } catch (e) {
      return { s, price: null, prev: null, error: String(e.message || e) };
    }
  }));
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  res.status(200).json(out);
};
