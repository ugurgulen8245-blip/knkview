// Kural tabanlı analist: teknik + performans/temel + haberler ve haber sonrası gerçek fiyat tepkisi
import { $, fP, fPct, esc, toast, modal, ago, nf } from './util.js';
import { symDef, getJSON, net } from './data.js';
import { series } from './tools.js';
import { metrics, flowFlags } from '/lib/metrics.mjs';
import * as IND from './ind.js';
import { tf } from './i18n.js';

const POS = ['yüksel', 'rekor', 'kâr art', 'kar art', 'net kâr', 'büyüme', 'büyüdü', 'temettü', 'anlaşma', 'ihale', 'kazandı', 'sözleşme', 'onay', 'artış', 'güçlü', 'hedef fiyat', 'al tavsiye', 'pozitif', 'toparlan', 'zirve', 'ihracat', 'ortaklık', 'bedelsiz', 'geri alım', 'iyileş', 'teşvik', 'sipariş', 'yatırım yap', 'rally', 'surge', 'soar', 'jump', 'gain', 'rise', 'rises', 'beat', 'record', 'upgrade', 'profit', 'growth', 'buyback', 'dividend', 'approv', 'deal', 'partnership', 'bullish', 'strong', 'outperform', 'inflow', 'etf approval'];
const NEG = ['düş', 'zarar', 'kayıp', 'ceza', 'soruşturma', 'dava', 'iflas', 'konkordato', 'satış baskı', 'geriled', 'negatif', 'uyarı', 'sat tavsiye', 'çöküş', 'çakıl', 'borç', 'temerrüt', 'yaptırım', 'grev', 'iptal', 'gözaltı', 'hack', 'erişim engel', 'fall', 'drop', 'plunge', 'slump', 'miss', 'loss', 'downgrade', 'lawsuit', 'probe', 'fine', 'bearish', 'weak', 'sell-off', 'selloff', 'recall', 'ban', 'bankrupt', 'layoff', 'crash', 'outflow', 'hack', 'investigation', 'decline', 'tumble'];
export function sentiment(title) {
  const t = title.toLocaleLowerCase('tr-TR'); let p = 0, n = 0;
  for (const w of POS) if (t.includes(w)) p++;
  for (const w of NEG) if (t.includes(w)) n++;
  // "düşük faiz", "düşüş beklentisi kırıldı" gibi istisnalar için kaba düzeltme
  if (/düşük faiz|faiz indirim|rate cut/.test(t)) { n = Math.max(0, n - 1); p++; }
  return p > n ? 1 : n > p ? -1 : 0;
}
function bench(sd) {
  if (!sd) return null;
  if (sd.src === 'binance') return sd.s === 'BTCUSDT' ? null : symDef('BTCUSDT');
  const y = sd.y || '';
  if (y.endsWith('.IS') && y !== 'XU100.IS') return symDef('XU100');
  if (/\.(SS|SZ)$/.test(y) && y !== '000001.SS') return symDef('SSEC');
  if (sd.src === 'yahoo' && !y.startsWith('^') && !y.includes('=') && !y.includes('.')) return symDef('SPX');
  return null;
}
function newsQuery(sd) {
  const y = sd.y || '';
  if (sd.src === 'binance') return { q: (sd.n && sd.n !== sd.s.replace(/USDT$/, '') ? sd.n : sd.s.replace(/USDT$/, '')) + ' kripto', lang: 'tr' };
  if (sd.src === 'derived') return { q: sd.s.includes('GUMUS') ? 'gümüş fiyatı' : 'altın fiyatları', lang: 'tr' };
  if (y.endsWith('.IS')) return { q: `${sd.s} hisse`, lang: 'tr', y };
  if (y.startsWith('^') || y.includes('=')) return { q: sd.n || sd.s, lang: 'tr', y };
  return { q: (sd.n || sd.s).replace(/,? (Inc\.?|Corp\.?|Corporation|plc|Ltd\.?|Holdings?)$/i, ''), lang: 'en', y };
}
function levels(d) {
  const n = d.length, H = [], L = [], k = 3;
  for (let i = Math.max(k, n - 160); i < n - k; i++) {
    let hi = true, lo = true;
    for (let j = i - k; j <= i + k; j++) { if (d[j].h > d[i].h) hi = false; if (d[j].l < d[i].l) lo = false; }
    if (hi) H.push(d[i].h); if (lo) L.push(d[i].l);
  }
  const p = d[n - 1].c, cl = (arr) => { const s = arr.sort((a, b) => a - b), g = []; for (const x of s) { const last = g[g.length - 1]; if (last && Math.abs(x / last.v - 1) < 0.015) { last.v = (last.v * last.n + x) / (last.n + 1); last.n++; } else g.push({ v: x, n: 1 }); } return g; };
  const all = cl([...H, ...L]);
  const sup = all.filter((x) => x.v < p * 0.995).sort((a, b) => b.v - a.v).slice(0, 2);
  const res = all.filter((x) => x.v > p * 1.005).sort((a, b) => a.v - b.v).slice(0, 2);
  return { sup, res };
}
function reaction(d, t) { // haberden önceki kapanış → sonraki gün kapanışı ve bugüne
  let i = -1; for (let k = d.length - 1; k >= 0; k--) if (d[k].t <= t) { i = k; break; }
  if (i < 0) return null; const p0 = d[i].c, nxt = d[i + 1], now = d[d.length - 1].c;
  return { r1: nxt ? (nxt.c / p0 - 1) * 100 : NaN, rNow: (now / p0 - 1) * 100 };
}

let app;
export async function openAnalyst(a) {
  app = a; const sym = app.act.sym, sd = symDef(sym);
  const body = modal('anModal', `🧠 Analist · ${esc(sym)}`);
  body.innerHTML = '<div class="empty" style="padding:30px">Analiz hazırlanıyor: günlük veriler, göstergeler ve haberler…</div>';
  try {
    const b = bench(sd), nq = newsQuery(sd);
    const [d, bd, news] = await Promise.all([
      series(sd), b ? series(b).catch(() => null) : null,
      net.API_OK === false ? [] : getJSON([`/api/news?q=${encodeURIComponent(nq.q)}&lang=${nq.lang}${nq.y ? '&y=' + encodeURIComponent(nq.y) : ''}`], 12000).catch(() => []),
    ]);
    if (!d || d.length < 60) throw new Error(tf('Analiz için yeterli günlük veri yok'));
    render(body, sd, d, b, bd, news);
  } catch (e) { body.innerHTML = `<div class="empty" style="padding:30px">${esc(e.message || 'Analiz yapılamadı')}</div>`; }
}

function render(body, sd, d, b, bd, news) {
  const m = metrics(d), R = IND.rating(d), F = IND.forecast(d, 20), Lv = levels(d), fl = flowFlags(m), p = m.p;
  const bm = bd && bd.length > 60 ? metrics(bd) : null;
  const plus = [], minus = [];
  // trend
  let trend;
  if (m.aboveE50 && m.aboveE200 && m.e50 > m.e200) { trend = tf('güçlü bir **yükseliş trendinde**: fiyat 50 ve 200 günlük ortalamaların üstünde, kısa vadeli ortalama da uzun vadelinin üstünde'); plus.push(tf('Ana trend yukarı (fiyat 50 ve 200 günlük ortalamanın üstünde)')); }
  else if (!m.aboveE50 && m.aboveE200 === false && m.e50 < m.e200) { trend = tf('**düşüş trendinde**: fiyat 50 ve 200 günlük ortalamaların altında'); minus.push(tf('Ana trend aşağı (fiyat 50 ve 200 günlük ortalamanın altında)')); }
  else if (m.aboveE200 && !m.aboveE50) { trend = tf('uzun vadede yükseliş trendinde ama kısa vadede **düzeltmede** (50 günlük ortalamanın altına inmiş)'); minus.push(tf('Kısa vadeli düzeltme sürüyor')); }
  else if (m.aboveE200 === false && m.aboveE50) { trend = tf('uzun vadede zayıf, kısa vadede **toparlanma** çabasında (50 günlük ortalamanın üstüne çıkmış, 200 günlüğün altında)'); plus.push(tf('Kısa vadeli toparlanma var')); }
  else if (m.aboveE50 && m.aboveE200) { trend = tf('**yükselişe dönüyor**: fiyat 50 ve 200 günlük ortalamaların üstüne çıkmış, 50 günlük ortalama henüz 200 günlüğü yukarı kesmedi'); plus.push(tf('Fiyat iki ana ortalamanın da üstünde')); }
  else if (m.aboveE50 === false && m.aboveE200 === false) { trend = tf('**zayıflıyor**: fiyat 50 ve 200 günlük ortalamaların altına inmiş, 50 günlük henüz 200 günlüğün altına geçmedi'); minus.push(tf('Fiyat iki ana ortalamanın da altında')); }
  else trend = tf('belirgin bir trend göstermiyor');
  // momentum
  const r = m.rsi; let mom;
  if (r >= 70) { mom = tf('RSI {0} ile **aşırı alım** bölgesinde; yükseliş güçlü ama kısa vadede dinlenme/geri çekilme riski arttı', nf(0).format(r)); minus.push(tf('RSI {0} (aşırı alım)', nf(0).format(r))); }
  else if (r <= 30) { mom = tf('RSI {0} ile **aşırı satım** bölgesinde; satış baskısı yoğun, tepki alımı ihtimali arttı ama dip garantisi değil', nf(0).format(r)); plus.push(tf('RSI {0} (aşırı satım, tepki potansiyeli)', nf(0).format(r))); }
  else mom = r >= 55 ? tf('RSI {0} ile alıcıların hafif önde olduğu bir bölgede', nf(0).format(r)) : r <= 45 ? tf('RSI {0} ile satıcıların hafif önde olduğu bir bölgede', nf(0).format(r)) : tf('RSI {0} ile dengeli bir bölgede', nf(0).format(r));
  mom += m.macdUp ? tf('; MACD sinyal çizgisinin üstünde (pozitif ivme).') : tf('; MACD sinyal çizgisinin altında (negatif ivme).');
  (m.macdUp ? plus : minus).push(tf(m.macdUp ? 'MACD pozitif' : 'MACD negatif'));
  // oynaklık
  const vol = m.atrPct, volT = tf('Günlük ortalama hareket aralığı yaklaşık **%{0}**{1}.', nf(1).format(vol), vol > 5 ? tf(' — çok oynak, pozisyon büyüklüğüne dikkat') : vol > 2.5 ? tf(' — orta-yüksek oynaklık') : tf(' — görece sakin'));
  if (vol > 5) minus.push(tf('Yüksek oynaklık'));
  // hacim/para akışı
  for (const f of fl) { if (f.w > 0) plus.push(f.t); else if (f.w < 0) minus.push(f.t); } // f.t: arayüz çevirisi şablonla yapılır
  // 52 hafta
  const w52 = m.dHi >= -0.5 ? tf('52 haftalık aralık: {0} – {1}. Fiyat zirvede, dibin %{2} üstünde.', fP(m.lo52), fP(m.hi52), nf(1).format(m.dLo)) : tf('52 haftalık aralık: {0} – {1}. Fiyat zirvenin %{2} altında, dibin %{3} üstünde.', fP(m.lo52), fP(m.hi52), nf(1).format(Math.abs(m.dHi)), nf(1).format(m.dLo));
  if (m.dHi > -3) plus.push(tf('52 haftalık zirveye çok yakın (güç göstergesi)')); if (m.dLo < 5) minus.push(tf('52 haftalık dibe çok yakın'));
  // performans ve kıyas
  const perf = [[tf('1 hafta'), m.ch5, bm && bm.ch5], [tf('1 ay'), m.ch21, bm && bm.ch21], [tf('3 ay'), m.ch63, bm && bm.ch63], [tf('1 yıl'), m.ch252, bm && bm.ch252]];
  const rel = bm && Number.isFinite(m.ch63) && Number.isFinite(bm.ch63) ? m.ch63 - bm.ch63 : NaN;
  if (Number.isFinite(rel)) (rel > 0 ? plus : minus).push(rel > 0 ? tf('Son 3 ayda {0} karşısında daha iyi (fark %{1})', b.s, nf(1).format(Math.abs(rel))) : tf('Son 3 ayda {0} karşısında daha kötü (fark %{1})', b.s, nf(1).format(Math.abs(rel))));
  // seviyeler
  const lv = `${Lv.res.length ? tf('Yakın dirençler:') + ' ' + Lv.res.map((x) => `**${fP(x.v)}** (+${nf(1).format((x.v / p - 1) * 100)}%)`).join(', ') : tf('Yakında belirgin bir direnç yok (zirve bölgesinde)')}. ${Lv.sup.length ? tf('Yakın destekler:') + ' ' + Lv.sup.map((x) => `**${fP(x.v)}** (-${nf(1).format((1 - x.v / p) * 100)}%)`).join(', ') : tf('Yakında belirgin bir destek yok')}.`;
  if (Lv.res[0] && Lv.res[0].v / p - 1 < 0.02) minus.push(tf('Dirence çok yakın ({0})', fP(Lv.res[0].v)));
  if (Lv.sup[0] && 1 - Lv.sup[0].v / p < 0.02) plus.push(tf('Desteğe yakın ({0})', fP(Lv.sup[0].v)));
  // haberler
  const N = (news || []).filter((x) => x.t > Date.now() - 30 * 864e5).slice(0, 15).map((x) => ({ ...x, s: sentiment(x.title), re: reaction(d, x.t) }));
  const pos = N.filter((x) => x.s > 0), neg = N.filter((x) => x.s < 0), recent = N.filter((x) => x.t > Date.now() - 7 * 864e5);
  const avg = (arr) => { const v = arr.map((x) => x.re && x.re.r1).filter(isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  let newsT = N.length ? tf('Son 30 günde {0} haber bulundu ({1} olumlu, {2} olumsuz, {3} nötr başlık); son 7 günde {4} haber.', N.length, pos.length, neg.length, N.length - pos.length - neg.length, recent.length) : tf('Son 30 günde bu sembolle ilgili haber bulunamadı.');
  if (pos.length && isFinite(avg(pos))) newsT += ' ' + tf('Olumlu başlıklardan sonraki gün fiyat ortalama **{0}** hareket etti.', fPct(avg(pos)));
  if (neg.length && isFinite(avg(neg))) newsT += ' ' + tf('Olumsuz başlıklardan sonraki gün ortalama **{0}**.', fPct(avg(neg)));
  if (recent.length && neg.filter((x) => x.t > Date.now() - 7 * 864e5).length >= 2) minus.push(tf('Son 7 günde birden fazla olumsuz haber'));
  if (recent.length && pos.filter((x) => x.t > Date.now() - 7 * 864e5).length >= 2) plus.push(tf('Son 7 günde birden fazla olumlu haber'));
  // genel karar
  const sc = R ? R.score : m.score, net0 = plus.length - minus.length;
  const verdict = sc >= 0.4 && net0 > 0 ? ['Olumlu', 'b'] : sc <= -0.4 && net0 < 0 ? ['Olumsuz', 's'] : sc >= 0.15 ? ['Hafif olumlu', 'b'] : sc <= -0.15 ? ['Hafif olumsuz', 's'] : ['Nötr', 'n'];
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const fc = F ? tf('Önümüzdeki ~20 işlem gününde istatistiksel olarak beklenen orta değer **{0}** ({1}); %80 olasılık aralığı **{2} – {3}**.', fP(F.med[F.h]), fPct((F.med[F.h] / p - 1) * 100), fP(F.lo80[F.h]), fP(F.hi80[F.h])) : '';
  body.innerHTML = `
    <div class="anhead"><div><span class="pill ${verdict[1]}" style="font-size:13px;padding:5px 10px">${verdict[0]}</span>
      <span class="dim" style="margin-left:8px">Teknik skor: ${R ? R.label : IND.label(m.score)} · ${fP(p)} · ${fPct(m.ch1)} bugün</span></div></div>
    <p class="anp">${md(tf('{0} {1}.', sd.n || sd.s, trend) + ' ' + mom)}</p>
    <div class="ancols"><div class="anbox g"><h5>Olumlu noktalar</h5>${plus.length ? plus.map((x) => `<div>✓ ${esc(x)}</div>`).join('') : '<div class="dim">Belirgin olumlu sinyal yok</div>'}</div>
      <div class="anbox r"><h5>Dikkat edilmesi gerekenler</h5>${minus.length ? minus.map((x) => `<div>⚠ ${esc(x)}</div>`).join('') : '<div class="dim">Belirgin risk sinyali yok</div>'}</div></div>
    <h5 class="anh">📊 Teknik görünüm</h5><p class="anp">${md(volT)} ${md(lv)}</p>${fc ? `<p class="anp">${md(fc)}</p>` : ''}
    <h5 class="anh">📈 Performans${b ? ` · ${esc(b.s)} ile kıyas` : ''}</h5>
    <div class="perfg">${perf.map(([k, v, bv]) => `<div><span>${k}</span><b class="${v >= 0 ? 'up' : 'dn'}">${fPct(v, 1)}</b>${b && Number.isFinite(bv) ? `<i>${esc(b.s)}: ${fPct(bv, 1)}</i>` : ''}</div>`).join('')}</div>
    <p class="anp">${md(w52)}</p>
    <p class="anp dim small">Temel veriler (F/K, PD/DD, bilanço) ücretsiz kaynaklarda güvenilir şekilde bulunamadığı için bu analize dahil edilmedi; performans ve 52 haftalık konum kullanıldı.</p>
    <h5 class="anh">📰 Haberler ve etkisi</h5><p class="anp">${md(newsT)}</p>
    <div class="newsl">${N.map((x) => `<a href="${esc(x.link)}" target="_blank" rel="noopener"><span class="pill ${x.s > 0 ? 'b' : x.s < 0 ? 's' : 'n'}">${x.s > 0 ? 'Olumlu' : x.s < 0 ? 'Olumsuz' : 'Nötr'}</span><span class="nt">${esc(x.title)}<small>${esc(x.src || '')} · ${ago(x.t)}</small></span>${x.re ? `<span class="nr ${x.re.rNow >= 0 ? 'up' : 'dn'}" title="Haberden bu yana fiyat değişimi">${fPct(x.re.rNow, 1)}</span>` : ''}</a>`).join('') || '<div class="empty">Haber yok</div>'}</div>
    <div class="disc">Bu yorum, göstergelerden ve haber başlıklarındaki kelimelerden kurallarla otomatik üretilir; yapay zekâ değildir. Haberlerin olumlu/olumsuz etiketi başlık kelimelerine dayanır ve yanılabilir. Haberin yanındaki yüzde, haberden bu yana gerçekleşen fiyat değişimidir; değişimin nedeni o haber olmayabilir. Yatırım tavsiyesi değildir.</div>`;
}
