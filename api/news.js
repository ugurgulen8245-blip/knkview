// GET /api/news?q=Türk Hava Yolları&y=THYAO.IS → Google Haberler (TR) + Yahoo Finance haber başlıkları
const Q_RE = /^[\p{L}\p{M}\p{N} .&'^=\-|()]{1,80}$/u;
const LANGS = ['tr', 'en', 'fr', 'hi', 'zh', 'ko'];
const ent = (s) => s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").trim();

// Dil + ziyaretçinin ülkesine göre Google Haberler sürümü
const EN_CC = ['US', 'GB', 'IN', 'AU', 'CA', 'SG', 'IE', 'NZ', 'ZA', 'NG', 'PH', 'PK', 'KE', 'MY'];
const FR_CC = ['FR', 'BE', 'CH', 'CA', 'MA', 'SN', 'CI'];
function edition(lang, cc) {
  if (lang === 'tr') return ['tr', 'TR'];
  if (lang === 'fr') return ['fr', FR_CC.includes(cc) ? cc : 'FR'];
  if (lang === 'hi') return ['hi', 'IN'];
  if (lang === 'zh') return cc === 'TW' ? ['zh-TW', 'TW'] : cc === 'HK' ? ['zh-HK', 'HK'] : ['zh-CN', 'CN'];
  if (lang === 'ko') return ['ko', 'KR'];
  const g = EN_CC.includes(cc) ? cc : 'US'; return [`en-${g}`, g];
}
async function google(q, lang, cc) {
  const [hl, gl] = edition(lang, cc), lg = hl === 'zh-CN' ? 'zh-Hans' : hl.startsWith('zh') ? 'zh-Hant' : hl.split('-')[0];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${gl}:${lg}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (TrendTakip)' }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) return [];
  const x = await r.text(), out = [];
  for (const it of x.split('<item>').slice(1, 30)) {
    const g = (tag) => { const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return m ? ent(m[1]) : ''; };
    let title = g('title'); const src = g('source'), link = g('link'), t = Date.parse(g('pubDate'));
    if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
    if (title && link && isFinite(t)) out.push({ title, src, link, t, lang });
  }
  return out;
}
async function yahoo(y) {
  const r = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(y)}&quotesCount=0&newsCount=12`, { headers: { 'User-Agent': 'Mozilla/5.0 (TrendTakip)' }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.news || []).map((n) => ({ title: n.title, src: n.publisher, link: n.link, t: (n.providerPublishTime || 0) * 1000, lang: 'en' })).filter((n) => n.title && n.link);
}

module.exports = async (req, res) => {
  const q = String(req.query.q || '').trim(), y = String(req.query.y || '').trim(), lang = LANGS.includes(req.query.lang) ? req.query.lang : 'tr';
  const cc = String(req.query.cc || req.headers['x-vercel-ip-country'] || '').toUpperCase().slice(0, 2);
  if (!q || !Q_RE.test(q) || (y && !Q_RE.test(y))) return res.status(400).json({ error: 'geçersiz sorgu' });
  const parts = await Promise.allSettled([google(q, lang, cc), y && lang === 'en' ? yahoo(y) : Promise.resolve([])]);
  const seen = new Set(), out = [];
  for (const p of parts) if (p.status === 'fulfilled') for (const n of p.value) { const k = n.title.toLowerCase().slice(0, 60); if (!seen.has(k)) { seen.add(k); out.push(n); } }
  out.sort((a, b) => b.t - a.t);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.status(200).json(out.slice(0, 30));
};
