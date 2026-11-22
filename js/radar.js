// Fırsat radarı (kriterli tarama) · Hacim & para akışı (büyük yatırımcı izleri) · BIST sektör gücü
import { $, $$, fP, fPct, fV, esc, toast, modal, nf, uid } from './util.js';
import { symDef, getJSON, BREST, binanceKlines, net } from './data.js';
import { metrics, flowFlags } from '/lib/metrics.mjs';
import { label } from './ind.js';

export const FIELDS = {
  rsi: { t: 'RSI (14)', u: '' }, ch1: { t: 'Günlük değişim', u: '%' }, ch5: { t: '1 haftalık değişim', u: '%' }, ch21: { t: '1 aylık değişim', u: '%' },
  ch63: { t: '3 aylık değişim', u: '%' }, volR: { t: 'Hacim / 20g ort.', u: 'x' }, cmf: { t: 'Para akışı (CMF)', u: '' }, mfi: { t: 'Para akışı endeksi (MFI)', u: '' },
  dHi: { t: '52h zirveye uzaklık', u: '%' }, atrPct: { t: 'Günlük oynaklık', u: '%' }, score: { t: 'Teknik skor (-1…+1)', u: '' },
  aboveE50: { t: 'Fiyat 50g ortalama üstünde', b: 1 }, aboveE200: { t: 'Fiyat 200g ortalama üstünde', b: 1 }, macdUp: { t: 'MACD pozitif', b: 1 },
};
const PRESETS = [
  { n: 'Trend içinde geri çekilme', c: [{ f: 'aboveE200', op: '=', v: 1 }, { f: 'rsi', op: '<', v: 40 }] },
  { n: 'Hacimli kırılım', c: [{ f: 'volR', op: '>', v: 2 }, { f: 'ch1', op: '>', v: 2 }, { f: 'dHi', op: '>', v: -8 }] },
  { n: '52 hafta zirvesine yakın', c: [{ f: 'dHi', op: '>', v: -3 }] },
  { n: 'Güçlü momentum', c: [{ f: 'ch21', op: '>', v: 10 }, { f: 'rsi', op: '>', v: 50 }, { f: 'rsi', op: '<', v: 72 }] },
  { n: 'Sessiz para girişi', c: [{ f: 'cmf', op: '>', v: 0.1 }, { f: 'ch5', op: '<', v: 3 }] },
  { n: 'Aşırı satım', c: [{ f: 'rsi', op: '<', v: 30 }] },
];
const MKT = { bist: 'Borsa İstanbul', crypto: 'Kripto (ilk 80)', ndx: 'Nasdaq 100', dji: 'Dow 30', spx: 'S&P 500', sse: 'Şanghay' };
const st = { tab: 'radar', m: 'bist', conds: PRESETS[0].c.map((x) => ({ ...x })), data: {}, busy: {}, per: 'ch21' };
let app, body;

export function openRadar(a, tab) {
  app = a; if (tab) st.tab = tab; if (!app.S.radars) app.S.radars = [];
  body = modal('radarModal', '🎯 Fırsat Radarı');
  if (!body.dataset.bound) { body.dataset.bound = 1; body.addEventListener('click', onClick); body.addEventListener('input', onInput); }
  render(); load();
}
async function load() {
  const m = st.tab === 'sector' ? 'sectors' : st.m;
  if (st.data[m] && Date.now() - st.data[m].ts < 6e5) return render();
  if (st.busy[m]) return; st.busy[m] = true; render();
  try {
    if (m === 'crypto') {
      const all = await getJSON(BREST.map((b) => `${b}/api/v3/ticker/24hr`), 20000);
      const top = all.filter((t) => t.symbol.endsWith('USDT') && !/^(USDC|FDUSD|TUSD|BUSD|USDP|DAI|EUR|AEUR|EURI|USDE|XUSD|PAXG|WBTC|WBETH|BFUSD|USD1|RLUSD)USDT$|(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol))
        .sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 80);
      const rows = []; let i = 0;
      await Promise.all(Array.from({ length: 8 }, async () => { while (i < top.length) { const t = top[i++]; try { const d = await binanceKlines(t.symbol, '1G', 300); const mt = metrics(d); if (mt) rows.push({ s: t.symbol, y: t.symbol, n: t.symbol.replace(/USDT$/, ''), ...mt, qv: +t.quoteVolume }); } catch (e) {} } }));
      st.data.crypto = { rows, ts: Date.now() };
    } else {
      if (net.API_OK === false) throw new Error('Bu tarama için site Vercel üzerinde çalışmalı');
      const j = await getJSON([`/api/scan?m=${m}`], 120000); st.data[m] = { rows: j.rows, ts: Date.now() };
    }
  } catch (e) { toast('Tarama yapılamadı: ' + (e.message || e), 'bad'); st.data[m] = { rows: [], ts: 0 }; }
  st.busy[m] = false; render();
}
function onClick(e) {
  const t = e.target.closest('[data-rt]'); if (t) { st.tab = t.dataset.rt; render(); load(); return; }
  const mk = e.target.closest('[data-rm]'); if (mk) { st.m = mk.dataset.rm; render(); load(); return; }
  const ur0 = e.target.closest('[data-urdel]'); if (ur0) { app.S.radars.splice(+ur0.dataset.urdel, 1); app.save(); render(); return; }
  const pr = e.target.closest('[data-pre]'); if (pr) { const P = pr.dataset.pre.startsWith('u') ? app.S.radars[+pr.dataset.pre.slice(1)] : PRESETS[+pr.dataset.pre]; st.conds = P.c.map((x) => ({ ...x })); render(); return; }
  const dl = e.target.closest('[data-del]'); if (dl) { st.conds.splice(+dl.dataset.del, 1); render(); return; }
  if (e.target.closest('[data-addc]')) { st.conds.push({ f: 'rsi', op: '<', v: 30 }); render(); return; }
  if (e.target.closest('[data-save]')) { const n = prompt('Radar adı:', 'Radarım'); if (n) { app.S.radars.push({ n: n.slice(0, 30), c: st.conds.map((x) => ({ ...x })) }); app.save(); render(); toast('Radar kaydedildi', 'ok'); } return; }
  const ur = e.target.closest('[data-urdel]'); if (ur) { app.S.radars.splice(+ur.dataset.urdel, 1); app.save(); render(); return; }
  const pe = e.target.closest('[data-per]'); if (pe) { st.per = pe.dataset.per; render(); return; }
  const row = e.target.closest('[data-open]'); if (row) openSym(row.dataset.open, row.dataset.y, row.dataset.n);
}
function onInput(e) {
  const i = e.target.dataset.ci; if (i == null) return; const c = st.conds[+i], k = e.target.dataset.ck;
  if (k === 'v') { const v = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(v)) c.v = v; } else c[k] = e.target.value;
  if (k === 'f') { if (FIELDS[c.f].b) { c.op = '='; c.v = 1; } else if (c.op === '=') c.op = '<'; render(); return; }
  clearTimeout(st.t); st.t = setTimeout(renderResults, 200);
}
async function openSym(s, y, n) {
  try {
    let sd = symDef(s) || (y && Object.values(app.S.extra || []).find((x) => x.y === y));
    if (!sd) {
      if (st.tab === 'sector' && y) sd = await app.addSymbol('yahoo', y, s, { n, g: 'ENDEKSLER & EMTİA' });
      else if (st.m === 'crypto') sd = await app.addSymbol('binance', s);
      else sd = await app.addSymbol('yahoo', y, s, { n, g: { bist: 'BORSA İSTANBUL', sse: 'ÇİN (ŞANGAY)' }[st.m] || 'ABD HİSSELERİ' });
    }
    app.setSym(sd.s); document.getElementById('radarModal').classList.remove('show');
  } catch (e) { toast(e.message || 'Açılamadı', 'bad'); }
}
const test = (r, c) => { const x = r[c.f]; if (FIELDS[c.f].b) return !!x === !!c.v; if (!isFinite(x)) return false; return c.op === '<' ? x < c.v : x > c.v; };
const fmtF = (f, v) => FIELDS[f].b ? (v ? 'evet' : 'hayır') : !isFinite(v) ? '—' : FIELDS[f].u === '%' ? fPct(v, 1) : FIELDS[f].u === 'x' ? nf(1).format(v) + 'x' : f === 'cmf' || f === 'score' ? nf(2).format(v) : nf(0).format(v);
const pill = (s) => `<span class="pill ${s >= 0.1 ? 'b' : s <= -0.1 ? 's' : 'n'}">${label(s)}</span>`;

function render() {
  const tabs = `<div class="mtabs" style="margin-bottom:10px"><button data-rt="radar" class="${st.tab === 'radar' ? 'on' : ''}">🎯 Fırsat Radarı</button><button data-rt="flow" class="${st.tab === 'flow' ? 'on' : ''}">🐋 Hacim & Para Akışı</button><button data-rt="sector" class="${st.tab === 'sector' ? 'on' : ''}">🏭 BIST Sektör Gücü</button></div>`;
  const mk = st.tab === 'sector' ? '' : `<div class="fchips" style="margin:0 0 10px">${Object.entries(MKT).map(([k, v]) => `<button data-rm="${k}" class="${k === st.m ? 'on' : ''}">${v}</button>`).join('')}</div>`;
  let top = '';
  if (st.tab === 'radar') {
    top = `<div class="msub" style="margin-top:0">HAZIR RADARLAR</div><div class="fchips" style="margin:4px 0 8px">${PRESETS.map((p, i) => `<button data-pre="${i}">${p.n}</button>`).join('')}${app.S.radars.map((p, i) => `<button data-pre="u${i}">★ ${esc(p.n)} <span data-urdel="${i}" title="Sil">×</span></button>`).join('')}</div>
      <div class="msub">KRİTERLER (hepsi sağlanmalı)</div><div class="conds">${st.conds.map((c, i) => `<div class="cond"><select data-ci="${i}" data-ck="f">${Object.entries(FIELDS).map(([k, v]) => `<option value="${k}" ${k === c.f ? 'selected' : ''}>${v.t}</option>`).join('')}</select>
        ${FIELDS[c.f].b ? `<select data-ci="${i}" data-ck="v"><option value="1" ${c.v ? 'selected' : ''}>evet</option><option value="0" ${!c.v ? 'selected' : ''}>hayır</option></select>` : `<select data-ci="${i}" data-ck="op"><option value="<" ${c.op === '<' ? 'selected' : ''}>küçük</option><option value=">" ${c.op === '>' ? 'selected' : ''}>büyük</option></select><input data-ci="${i}" data-ck="v" value="${c.v}" inputmode="decimal">`}
        <button data-del="${i}">✕</button></div>`).join('')}</div>
      <div class="cbtns" style="grid-template-columns:1fr 1fr"><button class="closeb" data-addc>+ Kriter ekle</button><button class="closeb" data-save>★ Bu radarı kaydet</button></div>`;
  }
  body.innerHTML = tabs + mk + top + '<div id="rRes"></div>';
  renderResults();
}
function renderResults() {
  const box = document.getElementById('rRes'); if (!box) return;
  const m = st.tab === 'sector' ? 'sectors' : st.m, D = st.data[m];
  if (!D || st.busy[m]) { box.innerHTML = `<div class="empty" style="padding:24px">Taranıyor… ${m === 'spx' ? '(S&P 500: 500 hisse, ilk seferde 1 dakika sürebilir)' : ''}</div>`; return; }
  const rows = D.rows;
  if (st.tab === 'radar') {
    const hit = rows.filter((r) => st.conds.every((c) => test(r, c))).sort((a, b) => (b.score || 0) - (a.score || 0));
    box.innerHTML = `<div class="note small" style="margin:10px 0 6px">${MKT[st.m]}: ${rows.length} sembol tarandı, <b>${hit.length}</b> tanesi tüm kriterlere uyuyor · günlük verilerle</div>
      <div class="scrwrap"><table class="scrt"><thead><tr><th>Sembol</th><th>Fiyat</th><th>Gün %</th>${st.conds.filter((c) => !['ch1'].includes(c.f)).slice(0, 3).map((c) => `<th>${FIELDS[c.f].t}</th>`).join('')}<th>Teknik</th></tr></thead><tbody>
      ${hit.slice(0, 150).map((r) => `<tr data-open="${esc(r.s)}" data-y="${esc(r.y || '')}" data-n="${esc(r.n || '')}"><td>${esc(r.n && st.m === 'crypto' ? r.n : r.s)}<div class="sub">${esc(st.m === 'crypto' ? '' : r.n || '')}</div></td><td>${fP(r.p)}</td><td class="${r.ch1 >= 0 ? 'up' : 'dn'}">${fPct(r.ch1, 1)}</td>
        ${st.conds.filter((c) => !['ch1'].includes(c.f)).slice(0, 3).map((c) => `<td>${fmtF(c.f, r[c.f])}</td>`).join('')}<td>${pill(r.score)}</td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--tx3)">Bu kriterlere uyan sembol yok. Kriterleri gevşetmeyi dene.</td></tr>'}</tbody></table></div>`;
  } else if (st.tab === 'flow') {
    const sc = rows.map((r) => { const f = flowFlags(r); return { ...r, f, w: f.reduce((a, b) => a + Math.abs(b.w), 0) }; }).filter((r) => r.f.length).sort((a, b) => b.w - a.w || (b.volR || 0) - (a.volR || 0));
    const inn = sc.filter((r) => r.f.some((x) => x.w > 0)).length, out = sc.filter((r) => r.f.some((x) => x.w < 0)).length;
    box.innerHTML = `<div class="note small" style="margin:0 0 8px">${MKT[st.m]}: ${rows.length} sembolde <b>${sc.length}</b> olağan dışı iz · ${inn} para girişi/alım izi, ${out} para çıkışı/satış izi</div>
      <div class="flowl">${sc.slice(0, 80).map((r) => `<div class="flowr" data-open="${esc(r.s)}" data-y="${esc(r.y || '')}" data-n="${esc(r.n || '')}"><div class="fh"><b>${esc(st.m === 'crypto' ? r.n : r.s)}</b><span class="dim">${esc(st.m === 'crypto' ? '' : r.n || '')}</span><span class="${r.ch1 >= 0 ? 'up' : 'dn'} mono">${fPct(r.ch1, 1)}</span></div>
        <div class="ff">${r.f.map((x) => `<span class="fl ${x.w > 0 ? 'b' : x.w < 0 ? 's' : 'n'}">${x.k.startsWith('vol') ? '🔥' : x.w > 0 ? '💰' : x.w < 0 ? '🏃' : '⚖️'} ${esc(x.t)}</span>`).join('')}</div></div>`).join('') || '<div class="empty">Olağan dışı bir hareket yok</div>'}</div>
      <div class="disc">"Büyük yatırımcı izi" doğrudan kurum verisi değildir: Borsa İstanbul'un aracı kurum dağılımı (AKD) gibi veriler ücretlidir. Bu liste fiyat ve hacimden hesaplanan göstergelerle (hacim/ortalama, Chaikin para akışı CMF, para akışı endeksi MFI, OBV) olağan dışı alım-satım izlerini yakalamaya çalışır.</div>`;
  } else {
    const per = st.per, PER = { ch1: '1 gün', ch5: '1 hafta', ch21: '1 ay', ch63: '3 ay', ch252: '1 yıl' };
    const bm = rows.find((r) => r.s === 'XU100'), secs = rows.filter((r) => r.s !== 'XU100' && r.s !== 'XU030' && isFinite(r[per])).sort((a, b) => b[per] - a[per]);
    const mx = Math.max(1, ...secs.map((r) => Math.abs(r[per] - (bm ? bm[per] : 0))));
    box.innerHTML = `<div class="mtabs" style="margin-bottom:8px">${Object.entries(PER).map(([k, v]) => `<button data-per="${k}" class="${k === per ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="note small" style="margin-bottom:8px">BIST 100 ${PER[per]}: <b class="${bm && bm[per] >= 0 ? 'up' : 'dn'}">${bm ? fPct(bm[per], 1) : '—'}</b> · çubuklar sektörün BIST 100'e göre <b>fazla/eksik getirisini</b> gösterir</div>
      <div class="secl">${secs.map((r) => { const rel = r[per] - (bm ? bm[per] : 0), w = (Math.abs(rel) / mx) * 50;
        const q = rows.length ? quad(r, bm) : ''; return `<div class="secr" data-open="${esc(r.s)}" data-y="${esc(r.y)}" data-n="BIST ${esc(r.n)}"><span class="sn">${esc(r.n)}<small>${esc(r.s)} · ${q}</small></span>
        <span class="sb"><i class="${rel >= 0 ? 'p' : 'm'}" style="${rel >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%"></i><em></em></span><span class="sv"><b class="${rel >= 0 ? 'up' : 'dn'}">${fPct(rel, 1)}</b><small>${fPct(r[per], 1)}</small></span></div>`; }).join('')}</div>
      <canvas id="rrg" height="300"></canvas>
      <div class="note small">Grafik: yatay eksen son 3 ayda BIST 100'e göre göreli güç, dikey eksen son 1 aydaki göreli ivme. <b>Lider</b> (sağ üst): güçlü ve güçleniyor · <b>Zayıflayan</b> (sağ alt) · <b>Geride</b> (sol alt) · <b>Toparlanan</b> (sol üst).</div>`;
    drawRRG(secs, bm);
  }
}
function quad(r, bm) { if (!bm) return ''; const x = r.ch63 - bm.ch63, y = r.ch21 - bm.ch21; return x >= 0 && y >= 0 ? '🟢 Lider' : x >= 0 ? '🟡 Zayıflayan' : y >= 0 ? '🔵 Toparlanan' : '🔴 Geride'; }
function drawRRG(secs, bm) {
  const cv = document.getElementById('rrg'); if (!cv || !bm) return; const dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth || 600, H = 300;
  cv.width = W * dpr; cv.height = H * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pts = secs.map((r) => ({ n: r.n, a: r.ch63 - bm.ch63, b: r.ch21 - bm.ch21 })).filter((p) => isFinite(p.a) && isFinite(p.b));
  const ma = Math.max(5, ...pts.map((p) => Math.abs(p.a))) * 1.1, mb = Math.max(3, ...pts.map((p) => Math.abs(p.b))) * 1.15;
  const X = (v) => W / 2 + (v / ma) * (W / 2 - 10), Y = (v) => H / 2 - (v / mb) * (H / 2 - 14);
  const Q = [['#19c37d14', W / 2, 0], ['#ffb54714', W / 2, H / 2], ['#f0435a14', 0, H / 2], ['#4fc3ff14', 0, 0]];
  for (const [c, qx, qy] of Q) { x.fillStyle = c; x.fillRect(qx, qy, W / 2, H / 2); }
  x.strokeStyle = '#2a3446'; x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();
  x.font = '700 10px Inter'; x.fillStyle = '#5c6780'; x.textAlign = 'right'; x.fillText('LİDER', W - 6, 14); x.fillText('ZAYIFLAYAN', W - 6, H - 6); x.textAlign = 'left'; x.fillText('TOPARLANAN', 6, 14); x.fillText('GERİDE', 6, H - 6);
  x.font = '10px Inter';
  for (const p of pts) { const px = X(p.a), py = Y(p.b), col = p.a >= 0 && p.b >= 0 ? '#19c37d' : p.a >= 0 ? '#ffb547' : p.b >= 0 ? '#4fc3ff' : '#f0435a'; x.beginPath(); x.arc(px, py, 4, 0, 7); x.fillStyle = col; x.fill(); x.fillStyle = '#e6ebf5cc'; x.textAlign = px > W - 90 ? 'right' : 'left'; x.fillText(p.n, px + (px > W - 90 ? -7 : 7), py + 3); }
}
