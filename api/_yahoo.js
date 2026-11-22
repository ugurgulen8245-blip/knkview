// Yahoo Finance yardımcıları (sunucu tarafı). Tarayıcı Yahoo'ya doğrudan bağlanamaz (CORS),
// bu yüzden Vercel fonksiyonu aracı olur.
const SYM_RE = /^[A-Za-z0-9.=^\-]{1,20}$/;
const INTERVALS = new Set(['1m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo']);
const RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']);
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

async function chart(symbol, interval, range) {
  let lastErr;
  for (const host of [...HOSTS, ...HOSTS]) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (KnkView)', Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); if (r.status === 429 || r.status >= 500) await new Promise((ok) => setTimeout(ok, 400)); else if (r.status === 404) break; continue; }
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res) { lastErr = new Error('sonuç yok'); continue; }
      return res;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Yahoo hatası');
}

module.exports = { chart, SYM_RE, INTERVALS, RANGES };
