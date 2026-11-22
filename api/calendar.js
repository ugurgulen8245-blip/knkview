// GET /api/calendar → bu ve gelecek haftanın ekonomik takvimi (ForexFactory/Fair Economy akışı) + Türkiye'nin önemli verileri
const CUR = { USD: 'ABD', EUR: 'Euro Bölgesi', GBP: 'İngiltere', JPY: 'Japonya', CNY: 'Çin', CHF: 'İsviçre', CAD: 'Kanada', AUD: 'Avustralya', NZD: 'Yeni Zelanda', ALL: 'Küresel', TRY: 'Türkiye' };
// Sık geçen başlıkların Türkçesi (eşleşmezse orijinal başlık kalır)
const TR = [
  [/^Federal Funds Rate$/i, 'Fed faiz kararı'], [/^FOMC Statement$/i, 'Fed (FOMC) karar metni'], [/^FOMC Press Conference$/i, 'Fed basın toplantısı'], [/^FOMC Meeting Minutes$/i, 'Fed toplantı tutanakları'],
  [/^Main Refinancing Rate$/i, 'ECB faiz kararı'], [/^ECB Press Conference$/i, 'ECB basın toplantısı'], [/^Official Bank Rate$/i, 'İngiltere MB faiz kararı'], [/^BOJ Policy Rate$/i, 'Japonya MB faiz kararı'],
  [/^Non-Farm Employment Change$/i, 'Tarım dışı istihdam (NFP)'], [/^Unemployment Rate$/i, 'İşsizlik oranı'], [/^Unemployment Claims$/i, 'Haftalık işsizlik başvuruları'], [/^ADP Non-Farm Employment Change$/i, 'ADP özel sektör istihdamı'],
  [/^Average Hourly Earnings m\/m$/i, 'Saatlik ortalama kazanç (aylık)'], [/^JOLTS Job Openings$/i, 'JOLTS açık iş sayısı'],
  [/^Core CPI m\/m$/i, 'Çekirdek enflasyon (TÜFE, aylık)'], [/^Core CPI y\/y$/i, 'Çekirdek enflasyon (TÜFE, yıllık)'], [/^CPI m\/m$/i, 'Enflasyon (TÜFE, aylık)'], [/^CPI y\/y$/i, 'Enflasyon (TÜFE, yıllık)'],
  [/^Flash CPI y\/y$/i, 'Öncü enflasyon (yıllık)'], [/^Core Flash CPI y\/y$/i, 'Öncü çekirdek enflasyon (yıllık)'], [/^Core PCE Price Index m\/m$/i, 'Çekirdek PCE fiyat endeksi (aylık)'],
  [/^PPI m\/m$/i, 'Üretici fiyatları (ÜFE, aylık)'], [/^Core PPI m\/m$/i, 'Çekirdek ÜFE (aylık)'],
  [/^Advance GDP q\/q$/i, 'Öncü büyüme (GSYH, çeyreklik)'], [/^Prelim GDP q\/q$/i, 'Büyüme ön verisi (GSYH, çeyreklik)'], [/^Final GDP q\/q$/i, 'Büyüme kesin veri (GSYH, çeyreklik)'], [/^GDP q\/q$/i, 'Büyüme (GSYH, çeyreklik)'],
  [/^Retail Sales m\/m$/i, 'Perakende satışlar (aylık)'], [/^Core Retail Sales m\/m$/i, 'Çekirdek perakende satışlar (aylık)'],
  [/^ISM Manufacturing PMI$/i, 'ISM imalat PMI'], [/^ISM Services PMI$/i, 'ISM hizmet PMI'], [/^Flash Manufacturing PMI$/i, 'İmalat PMI (öncü)'], [/^Flash Services PMI$/i, 'Hizmet PMI (öncü)'], [/^Manufacturing PMI$/i, 'İmalat PMI'], [/^Services PMI$/i, 'Hizmet PMI'],
  [/^CB Consumer Confidence$/i, 'Tüketici güveni (Conference Board)'], [/^Prelim UoM Consumer Sentiment$/i, 'Michigan tüketici güveni (öncü)'], [/^Revised UoM Consumer Sentiment$/i, 'Michigan tüketici güveni (revize)'],
  [/^Durable Goods Orders m\/m$/i, 'Dayanıklı mal siparişleri (aylık)'], [/^Core Durable Goods Orders m\/m$/i, 'Çekirdek dayanıklı mal siparişleri'],
  [/^Pending Home Sales m\/m$/i, 'Bekleyen konut satışları'], [/^New Home Sales$/i, 'Yeni konut satışları'], [/^Existing Home Sales$/i, 'İkinci el konut satışları'], [/^Building Permits$/i, 'İnşaat izinleri'], [/^Housing Starts$/i, 'Konut başlangıçları'],
  [/^Crude Oil Inventories$/i, 'Ham petrol stokları'], [/^Natural Gas Storage$/i, 'Doğal gaz stokları'], [/^Trade Balance$/i, 'Dış ticaret dengesi'],
  [/^German ifo Business Climate$/i, 'Almanya Ifo iş iklimi'], [/^German ZEW Economic Sentiment$/i, 'Almanya ZEW ekonomik güven'], [/^Bank Holiday$/i, 'Resmî tatil (piyasa kapalı)'],
  [/Speaks$/i, (t) => t.replace(/ Speaks$/i, ' konuşması')], [/^Treasury Currency Report$/i, 'ABD Hazine kur raporu'],
];
const PFX = { French: 'Fransa', German: 'Almanya', Spanish: 'İspanya', Italian: 'İtalya', Chinese: 'Çin' };
const trTitle = (t) => {
  const m = t.match(/^(French|German|Spanish|Italian|Chinese) (.+)$/);
  if (m && !/^German (ifo|ZEW)/.test(t)) { const r = trTitle(m[2]); return r !== m[2] ? `${PFX[m[1]]} ${r}` : t; }
  for (const [re, v] of TR) if (re.test(t)) return typeof v === 'function' ? v(t) : v; return t;
};

// Türkiye: TCMB PPK (14:00) ve TÜİK TÜFE (ayın 3'ü 10:00; hafta sonuna denk gelirse pazartesi). Kaynak: TCMB 2026–2027 takvimi.
const PPK = ['2026-01-22', '2026-03-12', '2026-04-22', '2026-06-11', '2026-07-23', '2026-09-10', '2026-10-22', '2026-12-10', '2027-01-21'];
const trTime = (ymd, hh) => Date.parse(`${ymd}T${hh}:00+03:00`);
function turkey(from, to) {
  const out = [];
  for (const d of PPK) { const t = trTime(d, '14:00'); if (t >= from && t <= to) out.push({ t, cur: 'TRY', title: 'TCMB faiz kararı (PPK)', imp: 3 }); }
  for (let m = -1; m <= 2; m++) {
    const x = new Date(from); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + m);
    const y = x.getUTCFullYear(), mo = x.getUTCMonth(); let day = 3;
    const wd = new Date(Date.UTC(y, mo, day)).getUTCDay(); if (wd === 6) day = 5; else if (wd === 0) day = 4;
    const ymd = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, t = trTime(ymd, '10:00');
    if (t >= from && t <= to) out.push({ t, cur: 'TRY', title: 'TÜİK enflasyon (TÜFE, aylık ve yıllık)', imp: 3, approx: true });
  }
  return out.map((e) => ({ ...e, ulke: 'Türkiye', orig: e.title, hol: false, fc: '', prev: '', act: '' }));
}
async function ff(which) {
  const r = await fetch(`https://nfs.faireconomy.media/ff_calendar_${which}.json`, { headers: { 'User-Agent': 'Mozilla/5.0 (TrendTakip)' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('takvim ' + r.status);
  return r.json();
}
module.exports = async (req, res) => {
  let rows = [];
  try { rows = await ff('thisweek'); } catch (e) { return res.status(502).json({ error: String(e.message || e) }); }
  try { const nx = await ff('nextweek'); if (Array.isArray(nx)) rows = rows.concat(nx); } catch (_) { /* gelecek hafta yayımlanmadıysa geç */ }
  let out = rows.map((r) => ({
    t: Date.parse(r.date) || 0, cur: r.country, ulke: CUR[r.country] || r.country, title: trTitle(r.title), orig: r.title,
    imp: r.impact === 'High' ? 3 : r.impact === 'Medium' ? 2 : r.impact === 'Low' ? 1 : 0, hol: r.impact === 'Holiday',
    fc: r.forecast || '', prev: r.previous || '', act: r.actual || '',
  })).filter((r) => r.t && r.title);
  if (out.length) { const lo = Math.min(...out.map((r) => r.t)), hi = Math.max(...out.map((r) => r.t)); out = out.concat(turkey(lo - 864e5, hi + 864e5)); }
  out.sort((a, b) => a.t - b.t || b.imp - a.imp);
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json({ items: out });
};
