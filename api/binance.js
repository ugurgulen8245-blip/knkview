// GET /api/binance?u=/api/v3/klines?symbol=ETHUSDT&interval=1h&limit=1000
// Tarayıcı Binance'e doğrudan bağlanamadığında (operatör/engelleyici) yedek yol.
// Sadece herkese açık piyasa verisi uçları; başka adres kabul edilmez.
const ALLOW = /^\/api\/v3\/(klines|ticker\/24hr|ticker\/price)(\?[A-Za-z0-9_=&%.,\[\]"\-]*)?$/;
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

module.exports = async (req, res) => {
  const u = String(req.query.u || '');
  if (u.length > 6000 || !ALLOW.test(u)) return res.status(400).json({ error: 'geçersiz istek' });
  let last;
  for (const h of HOSTS) {
    try {
      const r = await fetch(h + u, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) { last = 'HTTP ' + r.status; if (r.status === 400) return res.status(400).json({ error: last }); continue; }
      const body = await r.text();
      res.setHeader('Cache-Control', u.includes('/klines') ? 's-maxage=5, stale-while-revalidate=10' : 's-maxage=4, stale-while-revalidate=10');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(body);
    } catch (e) { last = String(e.message || e); }
  }
  res.status(502).json({ error: last || 'Binance hatası' });
};
