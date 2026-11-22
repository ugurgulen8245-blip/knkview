// GET /api/search?q=apple → Yahoo Finance sembol araması (tüm borsalar)
const SYM_Q = /^[\p{L}\p{N} .&'^=\-]{1,40}$/u;
const TYPES = { EQUITY: 'Hisse', ETF: 'ETF', INDEX: 'Endeks', CURRENCY: 'Döviz', FUTURE: 'Vadeli', CRYPTOCURRENCY: 'Kripto', MUTUALFUND: 'Fon' };

module.exports = async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || !SYM_Q.test(q)) return res.status(400).json({ error: 'geçersiz arama' });
  const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  for (const h of hosts) {
    try {
      const r = await fetch(`${h}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0&enableFuzzyQuery=true`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (TrendTakip)', Accept: 'application/json' }, signal: AbortSignal.timeout(7000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const out = (j.quotes || []).filter((x) => x.symbol && TYPES[x.quoteType]).map((x) => ({
        y: x.symbol, n: x.shortname || x.longname || x.symbol, ex: x.exchDisp || x.exchange || '', t: TYPES[x.quoteType],
      }));
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(out);
    } catch (e) { /* sıradaki */ }
  }
  res.status(502).json({ error: 'arama yapılamadı' });
};
