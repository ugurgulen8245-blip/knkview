// Risk kontrol merkezi: portföy oynaklığı, riske maruz değer (VaR), korelasyon, yoğunlaşma, zarar limitleri
import { $, fP, fPct, esc, toast, modal, nf } from './util.js';
import { symDef, live, yahooRaw } from './data.js';
import { series, curOf } from './tools.js';

const Z95 = 1.645;
let app, body;
const money = (v) => (isFinite(v) ? (v < 0 ? '-' : '') + '₺' + nf(Math.abs(v) >= 1000 ? 0 : 2).format(Math.abs(v)) : '—');

export async function openRisk(a) {
  app = a; if (!app.S.limits) app.S.limits = { day: 3, week: 7, pos: 25 };
  body = modal('riskModal', '🛡️ Risk Kontrol Merkezi');
  if (!body.dataset.bound) { body.dataset.bound = 1; body.addEventListener('input', onInput); }
  body.innerHTML = '<div class="empty" style="padding:30px">Portföy riskleri hesaplanıyor…</div>';
  const P = app.S.portfolio || [];
  let html = demoBlock();
  if (!P.length) { body.innerHTML = html + '<div class="acard" style="margin:12px 0"><h4>PORTFÖY RİSKİ</h4><div class="empty">Portföy riskini görmek için önce Araçlar → Portföyüm\'e varlıklarını ekle.</div></div>' + limitsBlock(); return; }
  try {
    const items = P.map((p) => ({ p, sd: symDef(p.sym) })).filter((x) => x.sd);
    const [fxd, ...ds] = await Promise.all([yahooRaw('USDTRY=X', '1G').catch(() => []), ...items.map((x) => series(x.sd).catch(() => []))]);
    const fxAt = mkAt(fxd);
    const usdNow = (live.USDTTRY && live.USDTTRY.p) || (live.USDTRY && live.USDTRY.p) || (fxd.length ? fxd[fxd.length - 1].c : NaN);
    // TL bazında günlük kapanış serileri, ortak günlere hizala
    const ser = items.map((x, k) => {
      const c = curOf(x.sd), d = ds[k] || [], m = new Map();
      for (const b of d) { const day = Math.floor(b.t / 864e5); const v = c === 'USD' ? b.c * fxAt(b.t) : c === 'TRY' ? b.c : NaN; if (isFinite(v)) m.set(day, v); }
      return m;
    });
    const valid = items.map((x, k) => ser[k].size > 60);
    const days = [...new Set(ser.flatMap((m, k) => (valid[k] ? [...m.keys()] : [])))].sort((a, b) => a - b).filter((dd) => dd > Date.now() / 864e5 - 400);
    // her gün için son bilinen değer (hafta sonu boşlukları ileri taşı)
    const filled = ser.map((m) => { let lastV = NaN; return days.map((dd) => { if (m.has(dd)) lastV = m.get(dd); return lastV; }); });
    const val = items.map((x, k) => { const pr = live[x.p.sym] ? live[x.p.sym].p : NaN, c = curOf(x.sd); return x.p.q * pr * (c === 'USD' ? usdNow : c === 'TRY' ? 1 : NaN); });
    const tot = val.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);
    const w = val.map((v) => (isFinite(v) && tot ? v / tot : 0));
    const rets = filled.map((arr) => arr.map((v, i) => (i && isFinite(v) && isFinite(arr[i - 1]) && arr[i - 1] ? v / arr[i - 1] - 1 : NaN)));
    const idx = days.map((_, i) => i).filter((i) => i > 0 && items.every((x, k) => !valid[k] || !w[k] || isFinite(rets[k][i])));
    const port = idx.map((i) => items.reduce((a, x, k) => a + (valid[k] && w[k] ? w[k] * rets[k][i] : 0), 0));
    const sd = std(port), annV = sd * Math.sqrt(365), varP = Z95 * sd * tot;
    const sorted = [...port].sort((a, b) => a - b), hVaR = sorted.length > 50 ? -sorted[Math.floor(sorted.length * 0.05)] * tot : NaN;
    let eq = 1, pk = 1, mdd = 0; for (const r of port) { eq *= 1 + r; pk = Math.max(pk, eq); mdd = Math.min(mdd, eq / pk - 1); }
    const worst = sorted[0];
    // varlık bazında
    const per = items.map((x, k) => { const r = idx.map((i) => rets[k][i]).filter(isFinite), s = std(r); return { sym: x.p.sym, w: w[k], vol: s * Math.sqrt(365), var1: Z95 * s * val[k], val: val[k], ok: valid[k] }; });
    // risk katkısı (marjinal)
    const cov = (a, b) => { const A = idx.map((i) => rets[a][i]), B = idx.map((i) => rets[b][i]), ma = mean(A), mb = mean(B); return mean(A.map((v, j) => (v - ma) * (B[j] - mb))); };
    const n = items.length, C = [...Array(n)].map((_, a) => [...Array(n)].map((_, b) => (valid[a] && valid[b] ? cov(a, b) : 0)));
    const pv = sd * sd || 1e-12; per.forEach((x, a) => { let m = 0; for (let b = 0; b < n; b++) m += C[a][b] * w[b]; x.contrib = (w[a] * m) / pv; });
    const corr = (a, b) => C[a][b] / Math.sqrt(C[a][a] * C[b][b] || 1);
    if (idx.length < 30) throw new Error('Varlıkların yeterli ortak geçmiş verisi yok (en az 30 gün gerekli)');
    const warns = [];
    const lim = app.S.limits;
    per.filter((x) => x.w * 100 > lim.pos).forEach((x) => warns.push(`${x.sym} ağırlığı %${nf(0).format(x.w * 100)} — tek varlık limiti %${lim.pos}`));
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (valid[a] && valid[b] && corr(a, b) > 0.8 && w[a] > 0.1 && w[b] > 0.1) warns.push(`${items[a].p.sym} ve ${items[b].p.sym} çok benzer hareket ediyor (korelasyon ${nf(2).format(corr(a, b))}) — çeşitlendirme etkisi düşük`);
    per.filter((x) => x.contrib > 0.5 && x.w < 0.5).forEach((x) => warns.push(`${x.sym} ağırlığına göre orantısız risk taşıyor (toplam riske katkısı %${nf(0).format(x.contrib * 100)})`));
    if (annV > 0.6) warns.push(`Yıllık oynaklık %${nf(0).format(annV * 100)} — portföy çok dalgalı`);
    const skipped = per.filter((x) => !x.ok).map((x) => x.sym);
    html += `<div class="acard" style="margin:12px 0"><h4>PORTFÖY RİSKİ · TL BAZINDA</h4>
      <div class="cres"><div class="r"><span>1 günde %95 ihtimalle en fazla kayıp</span><b>-${money(varP)}</b><i>toplam değere oranı %${nf(1).format((varP / tot) * 100)} (parametrik VaR)</i></div>
      <div class="r"><span>Son 1 yılın en kötü günü</span><b>${fPct(worst * 100, 1)}</b><i>bugünkü portföyle ${money(worst * tot)}</i></div></div>
      <div class="irow"><span>Toplam değer</span><span>${money(tot)}</span></div>
      <div class="irow"><span>Yıllık oynaklık</span><span>%${nf(1).format(annV * 100)}</span></div>
      <div class="irow"><span>Tarihsel VaR (%95, 1 gün)</span><span>${isFinite(hVaR) ? '-' + money(hVaR) : '—'}</span></div>
      <div class="irow"><span>Son 1 yılda en büyük düşüş</span><span class="sigS">${fPct(mdd * 100, 1)}</span></div>
      ${warns.length ? `<div class="cwarn">${warns.map((x) => '⚠️ ' + esc(x)).join('<br>')}</div>` : '<div class="cwarn" style="color:var(--up);border-color:#19c37d55;background:#19c37d12">✓ Belirgin bir yoğunlaşma veya korelasyon riski yok</div>'}
      <div class="msub">VARLIK BAZINDA</div>
      <table class="scrt"><thead><tr><th>Varlık</th><th>Ağırlık</th><th>Yıllık oynaklık</th><th>Riske katkı</th><th>1g VaR</th></tr></thead><tbody>
      ${per.sort((a, b) => b.w - a.w).map((x) => `<tr><td>${esc(x.sym)}</td><td>%${nf(1).format(x.w * 100)}</td><td>${x.ok ? '%' + nf(0).format(x.vol * 100) : '—'}</td><td>${x.ok ? '%' + nf(0).format(x.contrib * 100) : '—'}</td><td>${x.ok ? '-' + money(x.var1) : '—'}</td></tr>`).join('')}</tbody></table>
      ${n > 1 ? `<div class="msub">KORELASYON (1 = aynı yönde hareket)</div><div class="corr" style="grid-template-columns:70px repeat(${n},1fr)"><span></span>${items.map((x) => `<b>${esc(x.p.sym.slice(0, 7))}</b>`).join('')}${items.map((x, a) => `<b>${esc(x.p.sym.slice(0, 7))}</b>${items.map((y, b) => { const c = valid[a] && valid[b] ? corr(a, b) : NaN; return `<i style="background:${isFinite(c) ? (c >= 0 ? `rgba(240,67,90,${Math.abs(c) * 0.7})` : `rgba(79,195,255,${Math.abs(c) * 0.7})`) : 'transparent'}">${isFinite(c) ? nf(2).format(c) : '—'}</i>`; }).join('')}`).join('')}</div>` : ''}
      ${skipped.length ? `<div class="note small">Yeterli geçmiş verisi olmayan ya da TL/$ dışında para birimli varlıklar hesaba katılmadı: ${skipped.map(esc).join(', ')}</div>` : ''}
      <div class="disc">VaR (riske maruz değer): normal bir günde kaybın %95 ihtimalle bu tutarı aşmaması beklenir; kriz günlerinde aşılabilir. Hesaplar son 1 yılın günlük fiyatlarından, dövizli varlıklar günlük kurla TL'ye çevrilerek yapılır.</div></div>`;
  } catch (e) { html += `<div class="acard" style="margin:12px 0"><h4>PORTFÖY RİSKİ</h4><div class="empty">Hesaplanamadı: ${esc(e.message || e)}</div></div>`; }
  body.innerHTML = html + limitsBlock();
}
function demoBlock() {
  const A = app.S.acct, eq = app.equity(), d = A.dayStart, wk = A.weekStart, L = app.S.limits;
  const dp = d ? (eq / d.eq - 1) * 100 : 0, wp = wk ? (eq / wk.eq - 1) * 100 : 0;
  const bar = (v, lim) => `<div class="bar2" style="background:var(--line)"><i style="width:${Math.min(100, (Math.max(0, -v) / lim) * 100)}%;background:${-v >= lim ? 'var(--dn)' : -v >= lim * 0.7 ? 'var(--ac2)' : 'var(--up)'}"></i></div>`;
  return `<div class="acard" style="margin:0"><h4>DEMO HESAP · ZARAR LİMİTLERİ</h4>
    <div class="irow" style="border:0"><span>Bugün</span><span class="${dp >= 0 ? 'sigB' : 'sigS'}">${fPct(dp)} · limit -%${L.day}</span></div>${bar(dp, L.day)}
    <div class="irow" style="border:0"><span>Bu hafta</span><span class="${wp >= 0 ? 'sigB' : 'sigS'}">${fPct(wp)} · limit -%${L.week}</span></div>${bar(wp, L.week)}
    ${app.lossLocked() ? '<div class="cwarn">⛔ Zarar limitine ulaşıldı: limit dönemi bitene kadar demo hesapta yeni pozisyon açılamaz (kapatma serbest).</div>' : ''}</div>`;
}
function limitsBlock() {
  const L = app.S.limits;
  return `<div class="acard" style="margin:12px 0 0"><h4>LİMİT AYARLARI</h4><div class="cgrid">
    <label>Günlük zarar limiti %<input data-lim="day" value="${L.day}" inputmode="decimal"></label>
    <label>Haftalık zarar limiti %<input data-lim="week" value="${L.week}" inputmode="decimal"></label>
    <label>Tek varlık en fazla %<input data-lim="pos" value="${L.pos}" inputmode="decimal"></label></div>
    <div class="note small" style="margin-top:8px">Günlük ya da haftalık limit aşılınca demo hesap yeni işlem açmayı durdurur; bu, kayıp sonrası "intikam işlemi" yapmayı engellemek için. Pozisyon büyüklüğü için İşlem sekmesindeki kâr/zarar hesaplayıcısını kullan.</div></div>`;
}
function onInput(e) { const k = e.target.dataset.lim; if (!k) return; const v = parseFloat(String(e.target.value).replace(',', '.')); if (v > 0 && v <= 100) { app.S.limits[k] = v; app.save(); } }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function std(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }
function mkAt(arr) { return (t) => { if (!arr.length) return NaN; let lo = 0, hi = arr.length - 1; if (t <= arr[0].t) return arr[0].c; while (hi - lo > 1) { const m = (lo + hi) >> 1; arr[m].t <= t ? (lo = m) : (hi = m); } return arr[hi].t <= t ? arr[hi].c : arr[lo].c; }; }
