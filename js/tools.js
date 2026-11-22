// Portföy, karşılaştırma grafiği, ısı haritası, grafik paylaşma, Araçlar menüsü
import { $, $$, fP, fPct, fUSD, fV, esc, toast, nf, uid } from './util.js';
import { SYMS, live, symDef, getJSON, BREST, binanceKlines, yahooRaw, derivedKlines, net } from './data.js';

let app;
export function initTools(a) { app = a; bindMenu(); bindPortfolio(); bindCompare(); bindHeat(); }

// ================= Araçlar menüsü =================
function bindMenu() {
  $('#toolsModal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tool]'); if (!b) return; $('#toolsModal').classList.remove('show'); app.closeSheet();
    const k = b.dataset.tool;
    if (k === 'mkt') (await import('./markets.js')).openMarkets(app);
    if (k === 'scr') (await import('./screener.js')).openScreener(app);
    if (k === 'bt') (await import('./backtest.js')).openBacktest(app);
    if (k === 'pf') openPortfolio();
    if (k === 'cmp') openCompare();
    if (k === 'heat') openHeat();
    if (k === 'share') shareChart();
    if (k === 'csv') $('#csvModal').classList.add('show');
    if (['an', 'radar', 'flow', 'sector', 'risk', 'jr', 'smart'].includes(k)) app.openTool(k);
  });
}
export function openTools() { $('#toolsModal').classList.add('show'); }

// ================= Para birimi =================
export function curOf(sd) {
  if (!sd) return 'USD';
  if (sd.src === 'binance') return 'USD';
  if (sd.src === 'derived') return 'TRY';
  if (sd.custom) return 'TRY';
  const y = sd.y || '';
  if (y.endsWith('.IS')) return 'TRY';
  if (/\.(SS|SZ)$/.test(y)) return 'CNY';
  if (y === 'JPY=X') return 'JPY';
  if (/^[A-Z]{6}=X$/.test(y)) return y.slice(3, 6);
  return 'USD';
}
const fx = { TRY: 1 };
async function loadFX(need) {
  const want = { USD: 'USDTRY=X', EUR: 'EURTRY=X', CNY: 'CNY=X', JPY: 'JPY=X', GBP: 'GBPTRY=X' };
  const usdLive = live.USDTTRY && live.USDTTRY.p ? live.USDTTRY.p : live.USDTRY && live.USDTRY.p;
  if (usdLive) fx.USD = usdLive;
  const miss = [...need].filter((c) => c !== 'TRY' && want[c] && !(c === 'USD' && fx.USD));
  if (c('CNY') || c('JPY')) if (!fx.USD) miss.push('USD');
  function c(x) { return need.has(x); }
  if (!miss.length || net.API_OK === false) return;
  try {
    const q = await getJSON([`/api/quotes?s=${encodeURIComponent([...new Set(miss.map((m) => want[m]))].join(','))}`]);
    for (const r of q) { if (!r.price) continue; const k = Object.keys(want).find((x) => want[x] === r.s); fx['_' + k] = r.price; }
    if (fx._USD) fx.USD = fx.USD || fx._USD;
    if (fx._EUR) fx.EUR = fx._EUR; if (fx._GBP) fx.GBP = fx._GBP;
    if (fx._CNY && fx.USD) fx.CNY = fx.USD / fx._CNY; if (fx._JPY && fx.USD) fx.JPY = fx.USD / fx._JPY;
  } catch (e) {}
}
const toTRY = (v, c) => (fx[c] ? v * fx[c] : NaN);
const SYMB = { TRY: '₺', USD: '$', EUR: '€', CNY: '¥', JPY: '¥', GBP: '£' };
const money = (v, c) => (isFinite(v) ? (v < 0 ? '-' : '') + (SYMB[c] || '') + nf(Math.abs(v) >= 1000 ? 0 : 2).format(Math.abs(v)) : '—');

// ================= Portföy =================
function bindPortfolio() {
  const m = $('#pfModal');
  m.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-pfrm]'); if (rm) { app.S.portfolio = app.S.portfolio.filter((x) => x.id !== rm.dataset.pfrm); app.save(); renderPF(); return; }
    const op = e.target.closest('[data-pfopen]'); if (op) { app.setSym(op.dataset.pfopen); m.classList.remove('show'); return; }
    if (e.target.closest('#pfAdd')) addPF();
    const cu = e.target.closest('[data-pfcur]'); if (cu) { app.S.pfCur = cu.dataset.pfcur; app.save(); renderPF(); }
  });
  m.addEventListener('input', (e) => { if (e.target.id === 'pfSym') { const sd = symDef(e.target.value.trim().toUpperCase()); if (sd && live[sd.s]) { $('#pfCost').placeholder = 'Şu an: ' + fP(live[sd.s].p); $('#pfCurL').textContent = curOf(sd); } } });
}
export async function openPortfolio() {
  if (!app.S.portfolio) app.S.portfolio = [];
  $('#pfModal').classList.add('show');
  $('#pfList').innerHTML = SYMS.map((s) => `<option value="${esc(s.s)}">${esc(s.n || '')}</option>`).join('');
  renderPF(); await loadFX(new Set(['USD', ...app.S.portfolio.map((p) => curOf(symDef(p.sym)))])); renderPF();
  clearInterval(app.pfT); app.pfT = setInterval(() => { if ($('#pfModal').classList.contains('show')) renderPF(); else clearInterval(app.pfT); }, 2000);
}
function addPF() {
  const s = $('#pfSym').value.trim().toUpperCase(), q = parseFloat($('#pfQty').value.replace(',', '.')), sd = symDef(s);
  if (!sd) return toast('Önce sembolü izleme listesine ekle (arama ya da Piyasalar)', 'bad');
  if (!(q > 0)) return toast('Geçerli bir miktar yaz', 'bad');
  let cost = parseFloat(($('#pfCost').value || '').replace(',', '.')); if (!(cost > 0)) cost = live[sd.s] ? live[sd.s].p : NaN;
  if (!(cost > 0)) return toast('Maliyet fiyatı gir', 'bad');
  const P = app.S.portfolio, ex = P.find((x) => x.sym === sd.s);
  if (ex) { ex.cost = (ex.cost * ex.q + cost * q) / (ex.q + q); ex.q += q; } else P.push({ id: uid(), sym: sd.s, q, cost });
  $('#pfSym').value = ''; $('#pfQty').value = ''; $('#pfCost').value = ''; app.save();
  loadFX(new Set([curOf(sd)])).then(renderPF); renderPF(); toast(`${sd.s} portföye eklendi`, 'ok');
}
function renderPF() {
  const P = app.S.portfolio || [], base = app.S.pfCur || 'TRY', box = $('#pfBody');
  $$('#pfCurSeg button').forEach((b) => b.classList.toggle('on', b.dataset.pfcur === base));
  if (!P.length) { box.innerHTML = '<div class="empty" style="padding:18px">Henüz varlık yok. Aşağıdan ekle: örneğin BTCUSDT 0,05 adet, GRAMALTIN 10 gram, THYAO 100 lot.</div>'; $('#pfSum').innerHTML = ''; return; }
  const conv = (vTRY) => (base === 'TRY' ? vTRY : fx.USD ? vTRY / fx.USD : NaN);
  let tot = 0, totCost = 0; const rows = [];
  for (const p of P) {
    const sd = symDef(p.sym), c = curOf(sd), price = live[p.sym] ? live[p.sym].p : NaN, l = live[p.sym];
    const val = p.q * price, cost = p.q * p.cost, valT = toTRY(val, c), costT = toTRY(cost, c), d24 = l ? ((l.p - l.o24) / l.o24) * 100 : NaN;
    if (isFinite(valT)) { tot += valT; totCost += costT; }
    rows.push({ p, sd, c, price, val, cost, valT, costT, d24 });
  }
  const colors = ['#8b6cff', '#ffb547', '#19c37d', '#4fc3ff', '#ff6bd5', '#f0435a', '#a3e635', '#22d3ee', '#fb923c', '#94a3b8'];
  rows.sort((a, b) => (b.valT || 0) - (a.valT || 0));
  const pnl = tot - totCost, pnlPct = totCost ? (pnl / totCost) * 100 : NaN;
  $('#pfSum').innerHTML = `<div class="pfsum"><div><span>Toplam değer</span><b>${money(conv(tot), base)}</b></div><div><span>Toplam kâr/zarar</span><b class="${pnl >= 0 ? 'up' : 'dn'}">${money(conv(pnl), base)} <small>${fPct(pnlPct)}</small></b></div></div>
    <div class="pfbar">${rows.map((r, i) => (r.valT > 0 ? `<i style="width:${(r.valT / tot) * 100}%;background:${colors[i % colors.length]}" title="${esc(r.p.sym)} %${nf(1).format((r.valT / tot) * 100)}"></i>` : '')).join('')}</div>
    <div class="pflegend">${rows.map((r, i) => (r.valT > 0 ? `<span><i style="background:${colors[i % colors.length]}"></i>${esc(r.p.sym)} %${nf(1).format((r.valT / tot) * 100)}</span>` : '')).join('')}</div>`;
  box.innerHTML = `<table class="scrt pft"><thead><tr><th>Varlık</th><th>Fiyat</th><th>Değer</th><th>K/Z</th><th></th></tr></thead><tbody>${rows.map((r) => {
    const pl = r.val - r.cost, plp = r.cost ? (pl / r.cost) * 100 : NaN;
    return `<tr><td data-pfopen="${esc(r.p.sym)}" style="cursor:pointer"><div>${esc(r.p.sym)}</div><div class="sub">${nf(r.p.q >= 100 ? 0 : 4).format(r.p.q)} × ${fP(r.p.cost)} ${r.c}</div></td>
      <td>${fP(r.price)}<div class="sub ${r.d24 >= 0 ? 'up' : 'dn'}">${fPct(r.d24)}</div></td>
      <td>${money(conv(r.valT), base)}${r.c !== base ? `<div class="sub">${money(r.val, r.c)}</div>` : ''}</td>
      <td class="${pl >= 0 ? 'up' : 'dn'}">${fPct(plp)}<div class="sub">${money(conv(r.valT - r.costT), base)}</div></td>
      <td><button class="star" data-pfrm="${r.p.id}" title="Sil">✕</button></td></tr>`;
  }).join('')}</tbody></table>`;
}

// ================= Karşılaştırma =================
const cmp = { syms: ['BTCUSDT', 'GRAMALTIN', 'XU100', 'SPX', 'USDTRY'], per: 365, tl: false, data: {}, hover: null };
const PER = { 30: '1 Ay', 90: '3 Ay', 180: '6 Ay', 365: '1 Yıl', 1095: '3 Yıl', 1825: '5 Yıl' };
const CC = ['#8b6cff', '#ffb547', '#19c37d', '#4fc3ff', '#ff6bd5', '#f0435a', '#a3e635', '#22d3ee'];
function bindCompare() {
  const m = $('#cmpModal');
  m.addEventListener('click', (e) => {
    const p = e.target.closest('[data-per]'); if (p) { cmp.per = +p.dataset.per; renderCmpUI(); loadCmp(); return; }
    const r = e.target.closest('[data-cmprm]'); if (r) { cmp.syms = cmp.syms.filter((s) => s !== r.dataset.cmprm); renderCmpUI(); drawCmp(); return; }
    if (e.target.closest('#cmpTL')) { cmp.tl = !cmp.tl; renderCmpUI(); loadCmp(); return; }
    if (e.target.closest('#cmpAddB')) addCmp();
  });
  $('#cmpAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCmp(); });
  const cv = $('#cmpCv');
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); cmp.hover = (e.clientX - r.left) / r.width; drawCmp(); });
  cv.addEventListener('pointerleave', () => { cmp.hover = null; drawCmp(); });
  addEventListener('resize', () => { if (m.classList.contains('show')) drawCmp(); });
}
function addCmp() {
  const s = $('#cmpAdd').value.trim().toUpperCase(); const sd = symDef(s);
  if (!sd) return toast('Sembol izleme listende olmalı (arama ya da Piyasalar ile ekle)', 'bad');
  if (cmp.syms.includes(sd.s)) return; if (cmp.syms.length >= 8) return toast('En fazla 8 sembol', 'bad');
  cmp.syms.push(sd.s); $('#cmpAdd').value = ''; renderCmpUI(); loadCmp();
}
export function openCompare() {
  cmp.syms = cmp.syms.filter((s) => symDef(s)); if (app.act && !cmp.syms.includes(app.act.sym) && cmp.syms.length < 8) cmp.syms.unshift(app.act.sym);
  $('#cmpModal').classList.add('show'); $('#cmpList').innerHTML = SYMS.map((s) => `<option value="${esc(s.s)}">${esc(s.n || '')}</option>`).join('');
  renderCmpUI(); loadCmp();
}
function renderCmpUI() {
  $('#cmpPer').innerHTML = Object.entries(PER).map(([k, v]) => `<button data-per="${k}" class="${+k === cmp.per ? 'on' : ''}">${v}</button>`).join('');
  $('#cmpTL').classList.toggle('on', cmp.tl); $('#cmpTL').textContent = cmp.tl ? '₺ TL bazında' : '$ Kendi para biriminde';
  $('#cmpChips').innerHTML = cmp.syms.map((s, i) => `<span class="cchip" style="border-color:${CC[i % CC.length]}"><i style="background:${CC[i % CC.length]}"></i>${esc(s)}<button data-cmprm="${esc(s)}">×</button></span>`).join('');
}
export async function series(sd) {
  if (sd.src === 'binance') return binanceKlines(sd.s, '1G', 1000);
  if (sd.src === 'derived') return derivedKlines(sd, '1G');
  if (sd.custom) { const b = app.S.customs[sd.s]; return b ? b.d : []; }
  return yahooRaw(sd.y, '1G');
}
async function loadCmp() {
  $('#cmpNote').textContent = 'Veriler yükleniyor…';
  const need = cmp.syms.filter((s) => !cmp.data[s] || !cmp.data[s].length || Date.now() - (cmp.data[s].ts || 0) > 6e5);
  await Promise.all(need.map(async (s) => { try { const d = await series(symDef(s)); if (d && d.length) { d.ts = Date.now(); cmp.data[s] = d; } } catch (e) {} }));
  const miss = cmp.syms.filter((s) => !cmp.data[s] || !cmp.data[s].length);
  if (cmp.tl) {
    const curs = new Set(cmp.syms.map((s) => curOf(symDef(s))));
    for (const [c, y] of [['USD', 'USDTRY=X'], ['CNY', 'CNY=X'], ['EUR', 'EURTRY=X']]) if ((curs.has(c) || (c === 'USD' && curs.has('CNY'))) && !(cmp['fx' + c] && cmp['fx' + c].length)) { try { cmp['fx' + c] = await yahooRaw(y, '1G'); } catch (e) {} }
  }
  drawCmp();
  if (miss.length) $('#cmpNote').textContent = `${miss.join(', ')} için veri alınamadı, tekrar denemek için dönemi değiştir.`;
}
function fxAt(arr, t) { if (!arr || !arr.length) return NaN; let lo = 0, hi = arr.length - 1; if (t < arr[0].t) return arr[0].c; while (hi - lo > 1) { const m = (lo + hi) >> 1; arr[m].t <= t ? (lo = m) : (hi = m); } return arr[hi].t <= t ? arr[hi].c : arr[lo].c; }
function drawCmp() {
  const cv = $('#cmpCv'), dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth || 700, H = cv.clientHeight || 340;
  cv.width = W * dpr; cv.height = H * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  const now = Date.now(); let t0 = now - cmp.per * 864e5; const lines = [];
  cmp.syms.forEach((s, i) => {
    const d = (cmp.data[s] || []).filter((b) => b.t >= t0); if (d.length < 2) return;
    const c = curOf(symDef(s)); let conv = (b) => b.c;
    if (cmp.tl && c !== 'TRY') {
      if (c === 'USD') conv = (b) => b.c * fxAt(cmp.fxUSD, b.t);
      else if (c === 'CNY') conv = (b) => (b.c / fxAt(cmp.fxCNY, b.t)) * fxAt(cmp.fxUSD, b.t);
      else if (c === 'EUR') conv = (b) => b.c * fxAt(cmp.fxEUR, b.t);
    }
    const v0 = conv(d[0]); const pts = d.map((b) => ({ t: b.t, v: (conv(b) / v0 - 1) * 100 })).filter((p) => isFinite(p.v));
    if (pts.length > 1) lines.push({ s, col: CC[i % CC.length], pts });
  });
  if (!lines.length) { x.fillStyle = '#5c6780'; x.font = '13px Inter'; x.textAlign = 'center'; x.fillText('Veri yok', W / 2, H / 2); return; }
  t0 = Math.max(t0, Math.min(...lines.map((l) => l.pts[0].t)));
  let hi = 0, lo = 0; for (const l of lines) for (const p of l.pts) { hi = Math.max(hi, p.v); lo = Math.min(lo, p.v); }
  const pad = (hi - lo) * 0.08 || 1; hi += pad; lo -= pad;
  const AX = 52, X = (t) => 6 + ((t - t0) / (now - t0)) * (W - AX - 12), Y = (v) => 10 + ((hi - v) / (hi - lo)) * (H - 34);
  const raw = (hi - lo) / 6, mag = 10 ** Math.floor(Math.log10(raw)), k = raw / mag, step = (k < 1.5 ? 1 : k < 3 ? 2 : k < 7 ? 5 : 10) * mag;
  x.font = '10px JetBrains Mono'; x.textAlign = 'left'; x.textBaseline = 'middle';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { const y = Math.round(Y(v)) + 0.5; x.strokeStyle = Math.abs(v) < 1e-9 ? '#5c6780' : '#151b27'; x.beginPath(); x.moveTo(0, y); x.lineTo(W - AX, y); x.stroke(); x.fillStyle = '#5c6780'; x.fillText((v > 0 ? '+' : '') + nf(step < 1 ? 1 : 0).format(v) + '%', W - AX + 6, y); }
  x.textAlign = 'center'; const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  for (let i = 0; i <= 5; i++) { const t = t0 + ((now - t0) * i) / 5, dd = new Date(t); x.fillStyle = '#5c6780'; x.fillText(cmp.per > 400 ? `${AY[dd.getMonth()]} ${String(dd.getFullYear()).slice(2)}` : `${dd.getDate()} ${AY[dd.getMonth()]}`, X(t), H - 10); }
  for (const l of lines) { x.beginPath(); l.pts.forEach((p, j) => (j ? x.lineTo(X(p.t), Y(p.v)) : x.moveTo(X(p.t), Y(p.v)))); x.strokeStyle = l.col; x.lineWidth = 1.8; x.stroke(); }
  let ht = null; if (cmp.hover != null) { ht = t0 + Math.max(0, Math.min(1, (cmp.hover * W - 6) / (W - AX - 12))) * (now - t0); x.strokeStyle = '#8b96ab88'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(X(ht), 0); x.lineTo(X(ht), H - 22); x.stroke(); x.setLineDash([]); }
  const at = (l) => { if (ht == null) return l.pts[l.pts.length - 1].v; let best = l.pts[0]; for (const p of l.pts) if (p.t <= ht) best = p; return best.v; };
  const sorted = [...lines].sort((a, b) => at(b) - at(a));
  $('#cmpLegend').innerHTML = (ht ? `<span class="dim">${new Date(ht).toLocaleDateString('tr-TR')}</span>` : '') + sorted.map((l) => `<span><i style="background:${l.col}"></i>${esc(l.s)} <b class="${at(l) >= 0 ? 'up' : 'dn'}">${fPct(at(l))}</b></span>`).join('');
  $('#cmpNote').textContent = `${PER[cmp.per]}lık getiri · başlangıç %0 · ${cmp.tl ? 'dolar ve diğer döviz varlıkları günlük kurla TL\'ye çevrildi (enflasyon hariç)' : 'her varlık kendi para biriminde (kripto ve ABD: dolar, BIST ve altın: TL)'}`;
}

// ================= Isı haritası =================
const heat = { g: 'crypto', rows: {} };
const HG = { crypto: 'Kripto', ndx: 'Nasdaq 100', dji: 'Dow 30', spx: 'S&P 500', bist: 'Borsa İstanbul', sse: 'Şanghay' };
function bindHeat() {
  $('#heatModal').addEventListener('click', async (e) => {
    const g = e.target.closest('[data-hg]'); if (g) { heat.g = g.dataset.hg; renderHeatTabs(); drawHeat(); loadHeat(); return; }
    const t = e.target.closest('[data-hs]'); if (!t) return;
    try {
      let sd = symDef(t.dataset.hs);
      if (!sd) sd = heat.g === 'crypto' ? await app.addSymbol('binance', t.dataset.hs) : await app.addSymbol('yahoo', t.dataset.hy, t.dataset.hs, { n: t.dataset.hn, g: { ndx: 'ABD HİSSELERİ', dji: 'ABD HİSSELERİ', spx: 'ABD HİSSELERİ', bist: 'BORSA İSTANBUL', sse: 'ÇİN (ŞANGAY)' }[heat.g] });
      app.setSym(sd.s); $('#heatModal').classList.remove('show');
    } catch (err) { toast(err.message || 'Açılamadı', 'bad'); }
  });
  addEventListener('resize', () => { if ($('#heatModal').classList.contains('show')) drawHeat(); });
}
export function openHeat() { $('#heatModal').classList.add('show'); renderHeatTabs(); drawHeat(); loadHeat(); }
function renderHeatTabs() { $('#heatTabs').innerHTML = Object.entries(HG).map(([k, v]) => `<button data-hg="${k}" class="${k === heat.g ? 'on' : ''}">${v}</button>`).join(''); }
async function loadHeat() {
  const g = heat.g; if (heat.rows[g] && Date.now() - heat.rows[g].ts < 60000) return;
  try {
    if (g === 'crypto') {
      const all = await getJSON(BREST.map((b) => `${b}/api/v3/ticker/24hr`), 20000);
      const rows = all.filter((t) => t.symbol.endsWith('USDT') && !/^(USDC|FDUSD|TUSD|BUSD|USDP|DAI|EUR|AEUR|EURI|USDE|XUSD|PAXG|WBTC|WBETH|BFUSD|USD1|RLUSD)USDT$|(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol) && +t.quoteVolume > 0)
        .sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 60).map((t) => ({ s: t.symbol, n: t.symbol.replace(/USDT$/, ''), ch: +t.priceChangePercent, w: +t.quoteVolume, p: +t.lastPrice }));
      rows.ts = Date.now(); heat.rows[g] = rows;
    } else {
      const L = await getJSON(['/data/markets.json']); const items = L[g] || [];
      const rows = items.map((x) => ({ s: x.s, y: x.y, n: x.n, ch: NaN, w: 1 })); rows.ts = Date.now(); heat.rows[g] = rows; drawHeat();
      for (let i = 0; i < rows.length; i += 60) {
        const c = rows.slice(i, i + 60);
        try { const q = await getJSON([`/api/quotes?s=${encodeURIComponent(c.map((r) => r.y).join(','))}`], 30000); for (const r of q) { const row = c.find((x) => x.y === r.s); if (row && r.price && r.prev) { row.ch = ((r.price - r.prev) / r.prev) * 100; row.p = r.price; } } } catch (e) {}
        if (heat.g === g) drawHeat();
      }
    }
  } catch (e) { $('#heatNote').textContent = 'Veri alınamadı.'; }
  if (heat.g === g) drawHeat();
}
function colorFor(ch) {
  if (!isFinite(ch)) return '#1e2635';
  const a = Math.min(1, Math.abs(ch) / 4);
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  const [r, g, b] = ch >= 0 ? mix([42, 52, 70], [18, 164, 103], a) : mix([42, 52, 70], [212, 44, 69], a);
  return `rgb(${r},${g},${b})`;
}
function squarify(items, x, y, w, h) { // basit dilimleme ağaç haritası
  const out = []; const total = items.reduce((a, b) => a + b.w, 0); if (!total) return out;
  let rest = items.slice();
  while (rest.length) {
    const horiz = w >= h, side = horiz ? h : w; let row = [], best = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const cand = rest.slice(0, i + 1), s = cand.reduce((a, b) => a + b.w, 0), rem = rest.reduce((a, b) => a + b.w, 0), len = (s / rem) * (horiz ? w : h);
      const worst = Math.max(...cand.map((c) => { const l2 = ((c.w / s) * side); return Math.max(len / l2, l2 / len); }));
      if (worst > best) break; best = worst; row = cand;
    }
    const s = row.reduce((a, b) => a + b.w, 0), rem = rest.reduce((a, b) => a + b.w, 0), len = (s / rem) * (horiz ? w : h);
    let off = 0;
    for (const c of row) { const l2 = (c.w / s) * side; out.push(horiz ? { ...c, x, y: y + off, w: len, h: l2 } : { ...c, x: x + off, y, w: l2, h: len }); off += l2; }
    if (horiz) { x += len; w -= len; } else { y += len; h -= len; }
    rest = rest.slice(row.length);
  }
  return out;
}
function drawHeat() {
  const box = $('#heatBox'), rows = heat.rows[heat.g]; const W = box.clientWidth || 700, H = box.clientHeight || 420;
  if (!rows) { box.innerHTML = '<div class="empty" style="padding:40px">Yükleniyor…</div>'; return; }
  let items = rows.slice();
  if (heat.g === 'crypto') { const mx = Math.max(...items.map((r) => r.w)); items.forEach((r) => (r.w = Math.max(r.w, mx * 0.004))); items.sort((a, b) => b.w - a.w); }
  else items.sort((a, b) => (isFinite(b.ch) ? b.ch : -999) - (isFinite(a.ch) ? a.ch : -999));
  const tiles = heat.g === 'crypto' ? squarify(items, 0, 0, W, H) : (() => { const n = items.length, cols = Math.ceil(Math.sqrt((n * W) / H)), rowsN = Math.ceil(n / cols), tw = W / cols, th = H / rowsN; return items.map((r, i) => ({ ...r, x: (i % cols) * tw, y: Math.floor(i / cols) * th, w: tw, h: th })); })();
  box.innerHTML = tiles.map((t) => {
    const big = t.w > 70 && t.h > 38, mid = t.w > 40 && t.h > 24;
    return `<div class="tile" data-hs="${esc(t.s)}" data-hy="${esc(t.y || '')}" data-hn="${esc(t.n || '')}" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px;background:${colorFor(t.ch)}" title="${esc(t.n || t.s)} ${isFinite(t.ch) ? fPct(t.ch) : ''}">
      ${mid ? `<b style="font-size:${big ? Math.min(18, Math.max(11, t.w / 7)) : 10}px">${esc(heat.g === 'crypto' ? t.n : t.s)}</b>${big ? `<span>${isFinite(t.ch) ? fPct(t.ch) : '…'}</span>` : ''}` : ''}</div>`;
  }).join('');
  const up = rows.filter((r) => r.ch > 0).length, dn = rows.filter((r) => r.ch < 0).length;
  $('#heatNote').textContent = `${HG[heat.g]} · ${up} yükselen, ${dn} düşen · ${heat.g === 'crypto' ? 'kutu büyüklüğü = 24 saatlik işlem hacmi' : 'en çok yükselenden en çok düşene sıralı'} · günlük değişim · tıklayınca grafikte açılır`;
}

// ================= Paylaşma =================
const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export async function shareChart() {
  const c = app.act, sd = symDef(c.sym); if (!sd) return;
  if (sd.custom) return toast('CSV ile yüklenen veriler paylaşılamaz', 'bad');
  const r = (v) => (typeof v === 'number' ? +v.toPrecision(8) : v);
  const draw = (app.S.drawings[c.sym] || []).map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'phase').map(([k, v]) => [k, r(v)])));
  const P = { v: 1, s: c.sym, f: c.tf, ty: app.S.type, i: app.S.ind, lo: app.S.lower, d: draw };
  if (sd.extra) P.sd = { s: sd.s, n: sd.n, g: sd.g, src: sd.src, y: sd.y };
  const url = `${location.origin}/#p=${b64e(JSON.stringify(P))}`;
  try {
    if (navigator.share && matchMedia('(max-width:860px)').matches) { await navigator.share({ title: `${c.sym} grafiği · TrendTakip`, url }); return; }
    await navigator.clipboard.writeText(url); toast('🔗 Grafik linki kopyalandı · çizimler dahil', 'ok');
  } catch (e) { prompt('Linki kopyala:', url); }
}
export async function applyShared(hash) {
  try {
    const P = JSON.parse(b64d(hash.slice(3)));
    if (P.sd && !symDef(P.sd.s)) await app.addSymbol(P.sd.src, P.sd.y || P.sd.s, P.sd.s, { n: P.sd.n, g: P.sd.g });
    if (!symDef(P.s)) throw new Error('sembol yok');
    const key = (d) => JSON.stringify(Object.keys(d).sort().map((k) => [k, typeof d[k] === 'number' ? +d[k].toPrecision(6) : d[k]]));
    const D = app.S.drawings[P.s] || (app.S.drawings[P.s] = []), have = new Set(D.map(key));
    for (const d of P.d || []) if (!have.has(key(d))) { D.push(d); have.add(key(d)); }
    if (P.i) app.S.ind = Object.assign(app.S.ind, P.i); if (P.ty) app.S.type = P.ty; if (P.lo) app.S.lower = P.lo;
    app.S.charts[app.S.active].tf = P.f || app.S.charts[app.S.active].tf; app.renderChips(); app.setSym(P.s);
    toast(`📈 Paylaşılan ${P.s} grafiği açıldı${(P.d || []).length ? ' · ' + P.d.length + ' çizim' : ''}`, 'ok');
  } catch (e) { toast('Paylaşılan grafik açılamadı', 'bad'); }
  history.replaceState(null, '', '/');
}
