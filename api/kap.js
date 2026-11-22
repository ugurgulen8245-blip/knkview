// GET /api/kap?days=2&s=THYAO  → KAP şirket bildirimleri (son N gün, isteğe bağlı hisse filtresi)
const H = {
  Origin: 'https://www.kap.org.tr', Referer: 'https://www.kap.org.tr/tr/bildirim-sorgu',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*', 'Accept-Language': 'tr-TR,tr;q=0.9', 'Content-Type': 'application/json',
};
const d10 = (d) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
function parseT(s) {
  const m = String(s || '').match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 3, +m[5], +(m[6] || 0));
  const t = Date.parse(s); return isFinite(t) ? t : 0;
}
module.exports = async (req, res) => {
  const days = Math.min(7, Math.max(1, parseInt(req.query.days, 10) || 2));
  const s = String(req.query.s || '').toUpperCase().replace(/[^A-Z0-9,]/g, '').slice(0, 200);
  const want = s ? new Set(s.split(',').filter(Boolean)) : null;
  const to = new Date(), from = new Date(Date.now() - (days - 1) * 864e5);
  const body = { fromDate: d10(from), toDate: d10(to), memberType: 'IGS', mkkMemberOidList: [], inactiveMkkMemberOidList: [], disclosureClass: '', subjectList: [], isLate: '', mainSector: '', sector: '', subSector: '', marketOid: '', index: '', bdkReview: '', bdkMemberOidList: [], year: '', term: '', ruleType: '', period: '', fromSrc: false, srcCategory: '', disclosureIndexList: [] };
  let rows = null, err = '';
  for (let i = 0; i < 2 && !rows; i++) {
    try {
      const r = await fetch('https://www.kap.org.tr/tr/api/disclosure/members/byCriteria', { method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      if (!r.ok) { err = 'KAP ' + r.status; await new Promise((z) => setTimeout(z, 600)); continue; }
      const j = await r.json(); rows = Array.isArray(j) ? j : j.data || j.content || [];
    } catch (e) { err = String(e.message || e); }
  }
  if (!rows) return res.status(502).json({ error: err || 'KAP yanıt vermedi' });
  let out = rows.map((r) => ({
    id: +r.disclosureIndex, t: parseT(r.publishDate), co: r.kapTitle || r.memberTitle || '',
    codes: String(r.stockCodes || '').split(',').map((x) => x.trim()).filter(Boolean),
    subj: r.subject || '', sum: r.summary || '', cls: r.disclosureClass || '', type: r.disclosureType || '', cat: r.disclosureCategory || '',
    late: r.isLate === true || r.isLate === 'true', fix: r.isCorrective === true || r.isCorrective === 'true',
    url: 'https://www.kap.org.tr/tr/Bildirim/' + r.disclosureIndex,
  })).filter((r) => r.id && r.codes.length);
  if (want) out = out.filter((r) => r.codes.some((c) => want.has(c)));
  out.sort((a, b) => b.t - a.t);
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.status(200).json({ n: out.length, items: out.slice(0, 300) });
};
