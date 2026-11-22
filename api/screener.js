// GET /api/screener?m=bist → BIST ana hisselerinin son ~6 aylık günlük mumları
const { chart } = require('./_yahoo');

const BIST = ['AKBNK', 'ALARK', 'ARCLK', 'ASELS', 'ASTOR', 'BIMAS', 'BRSAN', 'CCOLA', 'DOAS', 'EKGYO', 'ENKAI', 'EREGL', 'FROTO', 'GARAN',
  'GUBRF', 'HEKTS', 'ISCTR', 'KCHOL', 'KONTR', 'KRDMD', 'MGROS', 'OYAKC', 'PETKM', 'PGSUS', 'SAHOL', 'SASA', 'SISE', 'TCELL', 'THYAO',
  'TOASO', 'TTKOM', 'TUPRS', 'ULKER', 'VAKBN', 'YKBNK', 'AEFES', 'TAVHL', 'HALKB', 'KOZAL', 'MAVI'];

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

module.exports = async (req, res) => {
  if (String(req.query.m || '') !== 'bist') return res.status(400).json({ error: 'geçersiz pazar' });
  const rows = [];
  await pool(BIST, 8, async (s) => {
    try {
      const x = await chart(s + '.IS', '1d', '6mo');
      const q = (x.indicators && x.indicators.quote && x.indicators.quote[0]) || {};
      const m = x.meta || {};
      if (!x.timestamp || !x.timestamp.length) return;
      const r4 = (a) => (a || []).map((v) => (v == null ? null : Math.round(v * 1e4) / 1e4));
      rows.push({ s, t: x.timestamp.map((t) => t * 1000), o: r4(q.open), h: r4(q.high), l: r4(q.low), c: r4(q.close), v: q.volume || [], price: m.regularMarketPrice ?? null, prev: m.chartPreviousClose ?? null });
    } catch (e) { /* bu sembolü atla */ }
  });
  rows.sort((a, b) => a.s.localeCompare(b.s));
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ rows, ts: Date.now() });
};
