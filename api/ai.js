// POST /api/ai → yapay zekâ analist yorumu (Claude). Giriş gerekir; kullanıcı başına günlük kota Supabase'de tutulur.
// Gövde: { sym, name, lang, facts: {...}, news: [{ title, s, re }] } — veriler tarayıcıda zaten hesaplanmış olanlardır.
const SB_URL = 'https://inaizgsiavqiadggeszx.supabase.co';
const SB_KEY = 'sb_publishable_28t9XpY5ksn1B48kmjOsxg_EGWDeQoD';
const MODEL = process.env.AI_MODEL || 'claude-haiku-5-5';
const USER_LIMIT = Number(process.env.AI_USER_DAILY || 10), GLOBAL_LIMIT = Number(process.env.AI_GLOBAL_DAILY || 2000);
const LANG = { tr: 'Türkçe', en: 'English', fr: 'français', hi: 'हिन्दी (Hindi)', zh: '简体中文 (Simplified Chinese)', ko: '한국어 (Korean)' };
const HEAD = {
  tr: ['Genel görünüm', 'Güçlü yanlar', 'Riskler', 'Haberler', 'İzlenecek seviyeler'],
  en: ['Overview', 'Strengths', 'Risks', 'News', 'Levels to watch'],
  fr: ['Vue d\'ensemble', 'Points forts', 'Risques', 'Actualités', 'Niveaux à surveiller'],
  hi: ['समग्र स्थिति', 'मज़बूत पक्ष', 'जोखिम', 'ख़बरें', 'देखने लायक स्तर'],
  zh: ['总体情况', '优势', '风险', '新闻', '关注价位'],
  ko: ['전체 흐름', '강점', '위험', '뉴스', '주목할 가격대'],
};
const DISC = { tr: 'Bu yorum yapay zekâ tarafından otomatik üretilmiştir; yatırım tavsiyesi değildir.', en: 'This commentary is generated automatically by AI; it is not investment advice.', fr: 'Ce commentaire est généré automatiquement par une IA ; ce n\'est pas un conseil en investissement.', hi: 'यह टिप्पणी AI ने अपने आप बनाई है; यह निवेश सलाह नहीं है।', zh: '本点评由 AI 自动生成，不构成投资建议。', ko: '이 해설은 AI가 자동으로 생성했으며 투자 조언이 아닙니다.' };

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; }
}
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST gerekli' });
  const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPI_API_KEY;
  if (!key) return res.status(503).json({ error: 'nokey' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'login' });
  const b = readBody(req), lang = LANG[b.lang] ? b.lang : 'tr';
  const sym = clip(b.sym, 30).replace(/[^\w.=^\-/ ]/g, ''), name = clip(b.name, 80);
  if (!sym) return res.status(400).json({ error: 'sembol gerekli' });

  // kota (kullanıcının kendi oturumuyla; geçersiz oturum burada reddedilir)
  let quota;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/ai_take`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user_limit: USER_LIMIT, p_global_limit: GLOBAL_LIMIT }), signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) return res.status(401).json({ error: 'login' });
    quota = await r.json();
  } catch (e) { return res.status(502).json({ error: 'kota kontrol edilemedi' }); }
  if (!quota || !quota.ok) return res.status(429).json({ error: quota && quota.reason === 'global' ? 'global' : quota && quota.reason === 'login' ? 'login' : 'limit', limit: USER_LIMIT });

  const facts = clip(JSON.stringify(b.facts || {}), 5000);
  const news = (Array.isArray(b.news) ? b.news : []).slice(0, 12).map((n) => `- ${clip(n.title, 160)}${n.s ? ` [${n.s > 0 ? '+' : '-'}]` : ''}${n.re != null && isFinite(n.re) ? ` (${Number(n.re).toFixed(1)}% since)` : ''}`).join('\n');
  const H = HEAD[lang];
  const system = `You are the analyst assistant of TrendTakip, a charting website. Write ONLY in ${LANG[lang]}.
Rules:
- Use only the data provided. Do not invent numbers, events or fundamentals. If data is missing, say so briefly.
- Educational market commentary, not personal investment advice: never tell the reader to buy, sell or hold, never give personal price targets or position sizes. Describe what the data shows, scenarios and risks.
- Plain language for a retail investor; explain any jargon in a few words.
- Structure with exactly these bold headings, each followed by 1–3 short sentences or "- " bullets: **${H[0]}**, **${H[1]}**, **${H[2]}**, **${H[3]}**, **${H[4]}**.
- Total length 150–230 words. No tables, no code, no emojis.
- End with this exact line: ${DISC[lang]}`;
  const user = `Symbol: ${sym}${name ? ` (${name})` : ''}\nComputed data (daily candles, percentages already in %): ${facts}\nRecent headlines (+ positive / - negative keyword tag, price change since publication):\n${news || '- none'}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(45000),
    });
    const j = await r.json();
    if (!r.ok) { console.error('anthropic', r.status, j && j.error); return res.status(502).json({ error: (j && j.error && j.error.type) || 'ai hatası' }); }
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    return res.status(200).json({ text, model: MODEL, left: quota.left, usage: j.usage });
  } catch (e) {
    return res.status(504).json({ error: 'zaman aşımı' });
  }
};
