// GET /api/calendar → bu haftanın ekonomik takvimi (ForexFactory/Fair Economy akışı) + Türkiye'nin sabit önemli verileri
const CUR = { USD: 'ABD', EUR: 'Euro Bölgesi', GBP: 'İngiltere', JPY: 'Japonya', CNY: 'Çin', CHF: 'İsviçre', CAD: 'Kanada', AUD: 'Avustralya', NZD: 'Yeni Zelanda', ALL: 'Tümü' };
async function ff(which) {
  const r = await fetch(`https://nfs.faireconomy.media/ff_calendar_${which}.json`, { headers: { 'User-Agent': 'Mozilla/5.0 (TrendTakip)' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('takvim ' + r.status);
  return r.json();
}
module.exports = async (req, res) => {
  let rows = [];
  try { rows = await ff('thisweek'); } catch (e) { return res.status(502).json({ error: String(e.message || e) }); }
  try { const nx = await ff('nextweek'); if (Array.isArray(nx)) rows = rows.concat(nx); } catch (_) { /* gelecek hafta yoksa geç */ }
  const out = rows.map((r) => ({
    t: Date.parse(r.date) || 0, cur: r.country, ulke: CUR[r.country] || r.country, title: r.title,
    imp: r.impact === 'High' ? 3 : r.impact === 'Medium' ? 2 : r.impact === 'Low' ? 1 : 0, hol: r.impact === 'Holiday',
    fc: r.forecast || '', prev: r.previous || '', act: r.actual || '',
  })).filter((r) => r.t && r.title);
  out.sort((a, b) => a.t - b.t);
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json({ items: out });
};
