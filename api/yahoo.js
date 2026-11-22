// GET /api/yahoo?s=THYAO.IS&i=60m&r=1y  →  mum verisi
const { chart, SYM_RE, INTERVALS, RANGES } = require('./_yahoo');

module.exports = async (req, res) => {
  const s = String(req.query.s || '');
  const i = String(req.query.i || '1d');
  const r = String(req.query.r || '1y');
  if (!SYM_RE.test(s) || !INTERVALS.has(i) || !RANGES.has(r)) {
    return res.status(400).json({ error: 'geçersiz parametre' });
  }
  try {
    const x = await chart(s, i, r);
    const q = (x.indicators && x.indicators.quote && x.indicators.quote[0]) || {};
    const ts = x.timestamp || [];
    const m = x.meta || {};
    const intraday = !['1d', '1wk', '1mo'].includes(i);
    res.setHeader('Cache-Control', `s-maxage=${intraday ? 15 : 120}, stale-while-revalidate=60`);
    res.status(200).json({
      s,
      t: ts.map((t) => t * 1000),
      o: q.open || [], h: q.high || [], l: q.low || [], c: q.close || [], v: q.volume || [],
      price: m.regularMarketPrice ?? null,
      prev: m.chartPreviousClose ?? m.previousClose ?? null,
      cur: m.currency || null,
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
