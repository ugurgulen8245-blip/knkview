// TrendTakip — ana uygulama
import { $, $$, TF, TFL, fP, fUSD, fPct, pad, clamp, toast, esc, uid } from './util.js';
import { BASE, SYMS, live, net, hooks, symDef, initLive, computeDerived, binanceTickers, openTickerWS, yahooQuotes, binanceKlines, getJSON } from './data.js';
import { Chart } from './chart.js';
import * as IND from './ind.js';
import { Cloud } from './cloud.js';
import { openScreener } from './screener.js';
import { openMarkets, globalSearch, internalSym, exGroup } from './markets.js';
const GORDER = ['KRİPTO', 'ALTIN & GÜMÜŞ (TL)', 'ENDEKSLER & EMTİA', 'BORSA İSTANBUL', 'ABD HİSSELERİ', 'ÇİN (ŞANGAY)', 'GLOBAL', 'YÜKLENEN VERİLER'];

const TYPES = { candle: 'Mum', heikin: 'Heikin', line: 'Çizgi', area: 'Alan' };
const INDS = [
  ['sma20', 'SMA 20', '#ffb547'], ['ema50', 'EMA 50', '#4fc3ff'], ['ema200', 'EMA 200', '#ff6bd5'], ['bb', 'Bollinger (20, 2)', '#8b6cff'],
  ['ichi', 'Ichimoku Bulutu', '#19c37d'], ['vp', 'Hacim Profili', '#4fc3ff', 'görünen aralık'], ['vol', 'Hacim', '#5c6780'], ['fc', 'Fiyat Tahmini Konisi', '#ffb547', 'istatistiksel'],
];
const DEF = {
  v: 2, layout: 1, active: 0,
  charts: [{ sym: 'BTCUSDT', tf: '1h' }, { sym: 'ETHUSDT', tf: '1h' }, { sym: 'THYAO', tf: '1h' }, { sym: 'XAUUSD', tf: '1h' }],
  type: 'candle', ind: { sma20: true, ema50: true, ema200: false, bb: false, ichi: false, vp: false, vol: true, fc: false }, lower: 'rsi', fcH: 24,
  drawings: {}, alerts: [], acct: { cash: 100000, pos: {}, hist: [] }, customs: {}, extra: [],
  calc: { cap: 10000, risk: 1, lev: 1, fee: 0.1 },
};

class App {
  constructor() {
    this.S = this.loadState();
    this.charts = []; this.tool = 'cursor';
    hooks.customBase = (s) => this.S.customs[s];
    hooks.onLive = () => {};
    this.rebuildSyms();
    initLive();
    this.cloud = new Cloud(this);
    this.initUI();
    this.applyLayout();
    const qs = new URLSearchParams(location.search).get('s');
    if (qs && symDef(qs)) { this.S.charts[this.S.active].sym = qs; history.replaceState(null, '', '/'); }
    this.boot();
  }
  // ---------- durum ----------
  loadState() {
    let S;
    try { S = JSON.parse(localStorage.getItem('trendtakip') || localStorage.getItem('knkview') || '{}'); } catch (e) { S = {}; }
    const out = Object.assign(structuredClone(DEF), S);
    out.ind = Object.assign({}, DEF.ind, S.ind || {});
    out.calc = Object.assign({}, DEF.calc, S.calc || {});
    if (!Array.isArray(out.charts) || out.charts.length < 4) {
      const c = structuredClone(DEF.charts); if (S.sym) c[0] = { sym: S.sym, tf: S.tf || '1h' }; out.charts = c;
    }
    out.charts.forEach((c) => { if (!TF[c.tf]) c.tf = '1h'; });
    out.alerts = (out.alerts || []).map((a) => ({ id: a.id || uid(), ...a }));
    out.active = clamp(out.active | 0, 0, 3); if (![1, 2, 4].includes(out.layout)) out.layout = 1;
    delete out.sym; delete out.tf;
    return out;
  }
  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => { try { localStorage.setItem('trendtakip', JSON.stringify(this.S)); } catch (e) {} }, 300);
    this.cloud && this.cloud.pushSoon();
  }
  cloudState() {
    const { customs, alerts, ...rest } = this.S;
    return rest;
  }
  applyCloudState(st) {
    const keep = { customs: this.S.customs, alerts: this.S.alerts };
    const n = Object.assign(structuredClone(DEF), st, keep);
    n.ind = Object.assign({}, DEF.ind, st.ind || {});
    this.S = n; this.rebuildSyms(); initLive(); openTickerWS(); yahooQuotes();
    this.charts.forEach((c) => c.destroy()); this.charts = [];
    this.applyLayout(); this.renderChips(); this.renderWatch(true); this.renderTrade();
    try { localStorage.setItem('trendtakip', JSON.stringify(this.S)); } catch (e) {}
  }
  rebuildSyms() {
    SYMS.length = 0; SYMS.push(...BASE);
    for (const x of this.S.extra || []) if (!SYMS.find((y) => y.s === x.s)) SYMS.push({ ...x, extra: true });
    for (const k of Object.keys(this.S.customs)) if (!SYMS.find((y) => y.s === k)) SYMS.push({ s: k, n: 'Senin verin', g: 'YÜKLENEN VERİLER', custom: true, extra: true });
    for (const c of this.S.charts) if (!symDef(c.sym)) c.sym = 'BTCUSDT';
  }
  symInfo(s) { return symDef(s); }
  get act() { return this.charts[this.S.active] || this.charts[0]; }

  // ---------- başlangıç ----------
  async boot() {
    this.renderChips(); this.renderWatch(true); this.renderTrade();
    await Promise.all([binanceTickers(), yahooQuotes(() => { this.renderWatch(true); this.charts.forEach((c) => symDef(c.sym)?.src === 'yahoo' && c.load()); })]);
    this.renderWatch(true); this.renderTop();
    this.booted = true;
    this.charts.forEach((c) => c.load());
    setInterval(() => this.tick(), 700);
    setInterval(() => { if (!document.hidden) yahooQuotes(); }, 30000);
    const loop = () => { for (const c of this.charts) if (c.dirty && c.W) c.render(); requestAnimationFrame(loop); };
    loop();
    document.fonts && document.fonts.ready.then(() => this.charts.forEach((c) => (c.dirty = true)));
    if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ---------- yerleşim ----------
  applyLayout() {
    const n = this.S.layout, g = $('#grid');
    g.className = 'l' + n;
    while (this.charts.length > n) this.charts.pop().destroy();
    while (this.charts.length < n) { const c = new Chart(this, this.charts.length); g.appendChild(c.el); this.charts.push(c); if (this.booted) c.load(); }
    if (this.S.active >= n) this.S.active = 0;
    this.booted = this.booted || false; this.highlightActive();
    $$('.lay').forEach((b) => b.classList.toggle('on', +b.dataset.l === n));
  }
  setLayout(n) { this.S.layout = n; this.booted = true; this.applyLayout(); this.save(); }
  setActive(i) {
    if (this.S.active === i) return;
    this.S.active = i; this.selPos = null; this.highlightActive(); this.renderChips(); this.renderTop(); this.renderWatch(true); this.renderTrade(); this.renderAna(true); this.renderCalc(true); this.save();
  }
  highlightActive() { this.charts.forEach((c, i) => c.el.classList.toggle('act', i === this.S.active)); }
  onChartData(c) { if (c === this.act) { this.renderTop(); this.renderTrade(); this.renderAna(true); this.renderCalc(true); } }
  setSym(s) {
    const c = this.act; this.S.charts[this.S.active].sym = s; this.selPos = null; this.calcV = null; this.save(); c.load();
    this.renderTop(); this.renderWatch(true); this.renderTrade(); this.renderAna(true);
  }

  // ---------- arayüz ----------
  initUI() {
    $('#tfs').innerHTML = Object.keys(TF).map((k) => `<button class="chip" data-tf="${k}">${TFL[k]}</button>`).join('');
    $('#types').innerHTML = Object.entries(TYPES).map(([k, v]) => `<button class="chip" data-ty="${k}">${v}</button>`).join('');
    $('#tfs').onclick = (e) => { const b = e.target.closest('[data-tf]'); if (!b) return; this.S.charts[this.S.active].tf = b.dataset.tf; this.save(); this.renderChips(); this.act.load(); };
    $('#types').onclick = (e) => { const b = e.target.closest('[data-ty]'); if (!b) return; this.S.type = b.dataset.ty; this.save(); this.renderChips(); this.charts.forEach((c) => c.recalc()); };
    $('#layouts').onclick = (e) => { const b = e.target.closest('[data-l]'); if (b) this.setLayout(+b.dataset.l); };
    $('#fcBtn').onclick = () => this.toggleInd('fc');
    // araçlar
    const ICON = {
      tog: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
      cursor: '<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="2.5"/>',
      trend: '<path d="M5 19L19 5"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
      hline: '<path d="M3 12h18"/><circle cx="12" cy="12" r="2"/>',
      fib: '<path d="M4 5h16M4 10h16M4 14h16M4 19h16"/>',
      fibext: '<path d="M4 19l6-9 4 5"/><path d="M14 4h7M14 8h7M14 12h7"/>',
      alert: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>',
      long: '<rect x="4" y="4" width="16" height="7" rx="1" stroke="#19c37d"/><rect x="4" y="13" width="16" height="7" rx="1" stroke="#f0435a"/><path d="M12 9V6M10 7.5l2-2 2 2" stroke="#19c37d"/>',
      short: '<rect x="4" y="4" width="16" height="7" rx="1" stroke="#f0435a"/><rect x="4" y="13" width="16" height="7" rx="1" stroke="#19c37d"/><path d="M12 15v3M10 16.5l2 2 2-2" stroke="#19c37d"/>',
      undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
      trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    };
    const TIPS = { tog: 'Çizim araçları', cursor: 'İmleç', trend: 'Trend çizgisi', hline: 'Yatay seviye', fib: 'Fibonacci düzeltme', fibext: 'Fibonacci uzantı (3 nokta)', alert: 'Fiyat alarmı', long: 'Long pozisyon (kâr/zarar)', short: 'Short pozisyon (kâr/zarar)', undo: 'Geri al', trash: 'Çizimleri temizle' };
    $('#tools').innerHTML = ['tog', 'cursor', 'long', 'short', 'trend', 'hline', 'fib', 'fibext', 'alert', '|', 'undo', 'trash'].map((k) => (k === '|' ? '<div class="tsep"></div>' : `<button class="tb${k === 'tog' ? ' tog' : ''}" data-k="${k}" title="${TIPS[k]}"><svg viewBox="0 0 24 24">${ICON[k]}</svg></button>`)).join('');
    if (innerWidth <= 860) $('#tools').classList.add('collapsed');
    $('#tools').onclick = (e) => {
      const b = e.target.closest('.tb'); if (!b) return; const k = b.dataset.k;
      if (k === 'tog') return $('#tools').classList.toggle('collapsed');
      if (k === 'undo') return this.undo();
      if (k === 'trash') { this.S.drawings[this.act.sym] = []; this.save(); this.charts.forEach((c) => (c.dirty = true)); toast('Çizimler temizlendi'); return; }
      this.setTool(this.tool === k ? 'cursor' : k);
    };
    this.setTool('cursor');
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return; const c = this.act; if (!c) return;
      if (e.key === 'Escape') { this.setTool('cursor'); this.charts.forEach((x) => x.cancelDraft()); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') this.undo();
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selPos) this.deletePlan();
      if (e.key === 'ArrowLeft') { c.V.right += 5; c.clampView(); c.dirty = true; }
      if (e.key === 'ArrowRight') { c.V.right -= 5; c.clampView(); c.dirty = true; }
      if (e.key === '+' || e.key === '=') c.zoomAt(c.L.plotW, c.V.barW * 1.2);
      if (e.key === '-') c.zoomAt(c.L.plotW, c.V.barW / 1.2);
    });
    // yan panel
    $$('.tab').forEach((b) => (b.onclick = () => this.showTab(b.dataset.t)));
    $('#scrim').onclick = () => this.closeSheet();
    $('#symBtn').onclick = () => this.openSheet('watch');
    $('#mWl').onclick = () => this.openSheet('watch'); $('#mAna').onclick = () => this.openSheet('ana');
    $('#mBuy').onclick = () => this.openSheet('trade'); $('#mSell').onclick = () => this.openSheet('trade');
    { let sy = null; const sd = $('#side');
      sd.addEventListener('touchstart', (e) => { if (sd.querySelector('.pane.on').scrollTop <= 0) sy = e.touches[0].clientY; }, { passive: true });
      sd.addEventListener('touchend', (e) => { if (sy !== null && e.changedTouches[0].clientY - sy > 80) this.closeSheet(); sy = null; }); }
    // izleme listesi
    $('#q').oninput = () => this.renderWatch(true);
    $('#wlist').onclick = (e) => this.onWatchClick(e);
    // işlem
    $('#buyB').onclick = () => this.trade('buy'); $('#sellB').onclick = () => this.trade('sell');
    $$('.pcts button').forEach((b) => (b.onclick = () => { $('#amt').value = Math.floor(Math.max(0, this.S.acct.cash) * parseFloat(b.dataset.p) * 100) / 100; }));
    $('#alList').onclick = (e) => { const b = e.target.closest('button[data-id]'); if (!b) return; this.removeAlert(b.dataset.id); };
    $('#resetAcc').onclick = () => { this.S.acct = structuredClone(DEF.acct); this.save(); this.renderTrade(); this.charts.forEach((c) => (c.dirty = true)); toast('Demo hesap sıfırlandı: $100.000'); };
    $('#notifBtn').onclick = () => this.enableNotifs();
    this.bindCalc();
    // indikatörler
    $('#indBtn').onclick = () => { this.renderInd(); $('#indModal').classList.add('show'); };
    $('#indList').onclick = (e) => { const t = e.target.closest('.tg'); if (t) { this.toggleInd(t.dataset.k); this.renderInd(); } };
    $('#lowerSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; this.S.lower = b.dataset.v; this.save(); this.renderInd(); this.charts.forEach((c) => (c.dirty = true)); };
    $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('show'); }));
    // csv
    $('#csvBtn').onclick = () => $('#csvModal').classList.add('show');
    $('#csvPick').onclick = () => $('#csvIn').click();
    $('#csvIn').onchange = (e) => this.importCSV(e);
    // hesap
    $('#accBtn').onclick = () => { this.renderAccount(); $('#accModal').classList.add('show'); };
    // tarayıcı
    $('#scrBtn').onclick = () => openScreener(this);
    $('#mktBtn').onclick = () => openMarkets(this);
    document.querySelector('.qlinks').onclick = (e) => { const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
      if (a === 'mkt') openMarkets(this); else if (a === 'scr') openScreener(this); else $('#csvModal').classList.add('show'); };
    // analiz paneli olayları
    $('#anaBox').onclick = (e) => {
      const h = e.target.closest('[data-h]'); if (h) { this.S.fcH = +h.dataset.h; this.save(); this.charts.forEach((c) => { c.recalc(); if (this.S.ind.fc) { c.V.right = c.defRight(); } }); this.renderAna(true); return; }
      if (e.target.closest('#anaFc')) this.toggleInd('fc');
    };
  }
  toggleInd(k) {
    this.S.ind[k] = !this.S.ind[k]; this.save();
    this.charts.forEach((c) => { c.recalc(); if (k === 'fc') { c.V.right = c.defRight(); c.clampView(); } });
    this.renderChips(); this.renderAna(true);
    if (k === 'fc' && this.S.ind.fc) toast('◔ Tahmin konisi açık — %50 ve %80 olasılık bantları', 'al');
  }
  setTool(k) {
    this.tool = k; $$('.tb').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    const H = { trend: 'İki nokta arasında sürükle', hline: 'Seviyeye dokun', fib: 'Dipten tepeye sürükle', fibext: 'A→B sürükle, sonra C noktasına dokun', alert: 'Alarm fiyatına dokun', long: 'Giriş fiyatına dokun · kutuyu sürükleyerek düzenle', short: 'Giriş fiyatına dokun · kutuyu sürükleyerek düzenle' };
    if (H[k]) this.hint(H[k]); else $('#hint').classList.remove('show');
  }
  hint(t) { const h = $('#hint'); clearTimeout(this.hintT); h.textContent = t; h.classList.add('show'); this.hintT = setTimeout(() => h.classList.remove('show'), 2800); }
  drawingDone() { this.save(); this.setTool('cursor'); this.charts.forEach((c) => (c.dirty = true)); }
  undo() { const d = this.S.drawings[this.act.sym]; if (d && d.length) { d.pop(); this.save(); this.charts.forEach((c) => (c.dirty = true)); } }

  renderChips() {
    const cfg = this.S.charts[this.S.active];
    $$('[data-tf]').forEach((b) => b.classList.toggle('on', b.dataset.tf === cfg.tf));
    $$('[data-ty]').forEach((b) => b.classList.toggle('on', b.dataset.ty === this.S.type));
    $('#fcBtn').classList.toggle('on', !!this.S.ind.fc);
  }
  renderTop() {
    const sym = this.S.charts[this.S.active].sym, l = live[sym]; if (!l) return;
    $('#symName').textContent = sym; $('#qPrice').textContent = fP(l.p);
    const ch = ((l.p - l.o24) / l.o24) * 100, el = $('#qChg'); el.textContent = fPct(ch); el.className = 'chg ' + (ch >= 0 ? 'up' : 'dn');
    document.title = `${sym} ${fP(l.p)} · TrendTakip`; $('#tSym').textContent = sym;
    const pl = $('#srcPill'), M = { live: ['CANLI', 'live', 'Binance canlı akış'], delayed: ['GECİKMELİ', 'delay', 'Yahoo Finance · borsa verisi ~15 dk gecikmeli olabilir'], sim: ['SİMÜLASYON', '', 'Gerçek veri alınamadı; fiyatlar simülasyondur'], csv: ['CSV', 'delay', 'Senin yüklediğin veri'], wait: ['…', '', 'Bağlanıyor'] }[l.mode] || ['…', ''];
    pl.textContent = M[0]; pl.className = 'demo ' + M[1]; pl.title = M[2] || '';
  }

  // ---------- izleme listesi ----------
  renderWatch(full) {
    const q = ($('#q').value || '').toLowerCase(), box = $('#wlist'), cur = this.S.charts[this.S.active].sym;
    if (full) {
      let g = '', h = '';
      const gi = (x) => { const i = GORDER.indexOf(x.g); return i < 0 ? 99 : i; };
      const ordered = SYMS.map((x, i) => [x, i]).sort((a, b) => gi(a[0]) - gi(b[0]) || a[1] - b[1]).map((x) => x[0]);
      for (const sd of ordered) {
        if (q && !(sd.s.toLowerCase().includes(q) || (sd.n || '').toLowerCase().includes(q))) continue;
        if (sd.g !== g) { g = sd.g; h += `<div class="grp">${esc(g)}</div>`; }
        const l = live[sd.s], md = l && l.mode === 'sim' ? '<span class="mode sim">SİM</span>' : l && l.mode === 'delayed' ? '<span class="mode dl">GEC</span>' : '';
        h += `<div class="wrow${sd.s === cur ? ' on' : ''}" data-s="${esc(sd.s)}"><div class="s">${esc(sd.s)}${md}${sd.extra ? `<span class="x" data-rm="${esc(sd.s)}" title="Listeden çıkar">✕</span>` : ''}</div><div class="p" id="wp-${esc(sd.s)}"></div><div class="n">${esc(sd.n || '')}</div><div class="c" id="wc-${esc(sd.s)}"></div></div>`;
      }
      const Q = q.toUpperCase().replace(/[^A-Z0-9.=^-]/g, '');
      let any = !!h;
      if (Q.length >= 2) {
        h += '<div class="grp">EKLE</div>'; any = true;
        const cs = Q.endsWith('USDT') ? Q : Q + 'USDT', bs = Q.replace(/\.IS$/, '');
        if (!symDef(cs)) h += `<div class="addrow" data-add="binance" data-v="${cs}">＋ ${cs} <small>Binance kripto</small></div>`;
        if (!symDef(bs) && !/USDT$/.test(Q) && /^[A-Z0-9]{3,6}$/.test(bs)) h += `<div class="addrow bguess" data-add="yahoo" data-v="${bs}.IS" data-n="${bs}" data-g="BORSA İSTANBUL">＋ ${bs} <small>Borsa İstanbul</small></div>`;
        h += '<div id="gsr"><div class="empty">Tüm borsalarda aranıyor…</div></div>';
        h += '<div class="addrow" data-mkt="1">🌐 Tüm piyasalara göz at <small>kripto, endeksler, S&P 500, Nasdaq, BIST, Şanghay</small></div>';
        globalSearch(q, (res) => this.renderGlobal(res));
      } else h += '<div class="addrow" data-mkt="1">🌐 Tüm piyasalara göz at <small>kripto, endeksler, S&P 500, Nasdaq, BIST, Şanghay</small></div>';
      box.innerHTML = any || h ? h : '<div class="empty">Sonuç yok</div>';
    }
    for (const sd of SYMS) {
      const l = live[sd.s], pe = document.getElementById('wp-' + sd.s); if (!l || !pe) continue;
      const t = fP(l.p);
      if (pe.textContent !== t) {
        if (pe.textContent) { pe.classList.remove('flashU', 'flashD'); void pe.offsetWidth; pe.classList.add(l.p >= l.prev ? 'flashU' : 'flashD'); setTimeout(() => pe.classList.remove('flashU', 'flashD'), 350); }
        pe.textContent = t;
      }
      const ch = ((l.p - l.o24) / l.o24) * 100, ce = document.getElementById('wc-' + sd.s); ce.textContent = fPct(ch); ce.className = 'c ' + (ch >= 0 ? 'up' : 'dn');
    }
  }
  async addSymbol(src, v, name, meta = {}) {
    const sd = src === 'binance' ? { s: v, n: v.replace(/USDT$/, ''), g: 'KRİPTO', src }
      : { s: name || internalSym(v), n: meta.n || (v.endsWith('.IS') ? 'BIST hissesi' : v), g: meta.g || exGroup(v, meta.t), src, y: v };
    if (symDef(sd.s)) return symDef(sd.s);
    const same = SYMS.find((x) => x.y && x.y === sd.y); if (same) return same;
    if (src === 'binance') { const d = await binanceKlines(v, '1G', 5); if (!d.length) throw new Error(`${v} bulunamadı`); sd.p = d[d.length - 1].c; }
    else {
      if (net.API_OK === false) throw new Error('Borsa verisi için site Vercel\'de çalışmalı');
      const j = await getJSON([`/api/quotes?s=${encodeURIComponent(v)}`]); if (!j[0] || !j[0].price) throw new Error(`${v} bulunamadı`); sd.p = j[0].price;
      if (!meta.n && j[0].n) sd.n = j[0].n;
    }
    SYMS.push({ ...sd, extra: true }); this.S.extra.push(sd); initLive();
    live[sd.s].mode = src === 'binance' ? 'live' : 'delayed';
    if (src === 'binance') binanceTickers(); else yahooQuotes();
    this.save(); return sd;
  }
  renderGlobal(res) {
    const el = document.getElementById('gsr'); if (!el) return;
    const rows = res.filter((x) => !SYMS.find((s) => s.y === x.y) && !symDef(internalSym(x.y)));
    el.innerHTML = rows.length ? rows.map((x) => `<div class="addrow" data-add="yahoo" data-v="${esc(x.y)}" data-n="${esc(internalSym(x.y))}" data-nm="${esc(x.n)}" data-t="${esc(x.t)}">＋ ${esc(x.y)} <small>${esc(x.n)} · ${esc(x.t)}${x.ex ? ' · ' + esc(x.ex) : ''}</small></div>`).join('') : '';
    if (rows.some((x) => x.y.endsWith('.IS'))) $$('.bguess').forEach((b) => b.remove());
  }
  async onWatchClick(e) {
    if (e.target.closest('[data-mkt]')) { openMarkets(this); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      e.stopPropagation(); const s = rm.dataset.rm;
      this.S.extra = this.S.extra.filter((x) => x.s !== s); delete this.S.customs[s];
      const i = SYMS.findIndex((x) => x.s === s); if (i >= 0) SYMS.splice(i, 1); delete live[s];
      this.S.charts.forEach((c, k) => { if (c.sym === s) { c.sym = 'BTCUSDT'; this.charts[k] && this.charts[k].load(); } });
      this.save(); this.renderWatch(true); openTickerWS(); return;
    }
    const ad = e.target.closest('[data-add]');
    if (ad) {
      try { const sd = await this.addSymbol(ad.dataset.add, ad.dataset.v, ad.dataset.n, { n: ad.dataset.nm, t: ad.dataset.t, g: ad.dataset.g }); $('#q').value = ''; this.setSym(sd.s); this.closeSheet(); toast(`＋ ${sd.s} eklendi`, 'ok'); }
      catch (err) { toast(err.message || 'Eklenemedi', 'bad'); }
      return;
    }
    const r = e.target.closest('.wrow'); if (!r) return; this.setSym(r.dataset.s); this.closeSheet();
  }
  mob() { return matchMedia('(max-width:860px)').matches; }
  openSheet(t) { this.showTab(t); if (this.mob()) { $('#side').classList.add('open'); $('#scrim').classList.add('show'); } }
  closeSheet() { $('#side').classList.remove('open'); $('#scrim').classList.remove('show'); }
  showTab(t) {
    $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); $$('.pane').forEach((p) => p.classList.toggle('on', p.id === 'p-' + t));
    if (t === 'ana') this.renderAna(true); if (t === 'trade') { this.renderTrade(); this.renderCalc(true); }
  }

  // ---------- analiz: teknik skor + tahmin ----------
  renderAna(force) {
    if (!$('#p-ana').classList.contains('on')) return;
    const now = Date.now(); if (!force && now - (this.anaT || 0) < 2000) return; this.anaT = now;
    const c = this.act; if (!c || !c.data.length) { $('#anaBox').innerHTML = '<div class="empty">Veri bekleniyor…</div>'; return; }
    const R = IND.rating(c.data), F = c.fc, last = c.data[c.data.length - 1].c;
    const col = (s) => (s >= 0.1 ? 'var(--up)' : s <= -0.1 ? 'var(--dn)' : 'var(--tx2)');
    const gauge = (s) => { const a = Math.PI * (1 - (s + 1) / 2), x = 80 + 58 * Math.cos(a), y = 78 - 58 * Math.sin(a);
      return `<svg class="gauge" width="160" height="92" viewBox="0 0 160 92"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#f0435a"/><stop offset=".5" stop-color="#5c6780"/><stop offset="1" stop-color="#19c37d"/></linearGradient></defs>
      <path d="M14 78a66 66 0 01132 0" stroke="url(#gg)" stroke-width="10" fill="none" stroke-linecap="round"/><line x1="80" y1="78" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e6ebf5" stroke-width="3" stroke-linecap="round"/><circle cx="80" cy="78" r="5" fill="#e6ebf5"/>
      <text x="10" y="91" fill="#5c6780" font-size="9" font-family="Inter">Güçlü Sat</text><text x="150" y="91" fill="#5c6780" font-size="9" font-family="Inter" text-anchor="end">Güçlü Al</text></svg>`; };
    let h = `<div class="acard"><h4>TEKNİK SKOR · ${esc(c.sym)} · ${TFL[c.tf]}</h4>`;
    if (R) {
      h += `${gauge(R.score)}<div class="glabel" style="color:${col(R.score)}">${R.label}</div>
        <div class="gsub"><div>Hareketli ort.<b style="color:${col(R.ma.score)}">${R.ma.label}</b><div class="cnt">Al ${R.ma.buy} · Nötr ${R.ma.neu} · Sat ${R.ma.sell}</div></div>
        <div>Osilatörler<b style="color:${col(R.osc.score)}">${R.osc.label}</b><div class="cnt">Al ${R.osc.buy} · Nötr ${R.osc.neu} · Sat ${R.osc.sell}</div></div></div>
        <details><summary>Gösterge detayları</summary>${R.items.map((it) => `<div class="irow"><span>${it.name}</span><span class="${it.sig > 0 ? 'sigB' : it.sig < 0 ? 'sigS' : 'sigN'}">${fP(it.val, 2)} · ${it.sig > 0 ? 'Al' : it.sig < 0 ? 'Sat' : 'Nötr'}</span></div>`).join('')}</details>`;
    } else h += '<div class="empty">Skor için en az 60 mum gerekli</div>';
    h += `</div><div class="acard"><h4>FİYAT TAHMİNİ <span class="hchips">${[12, 24, 48, 96].map((x) => `<button data-h="${x}" class="${this.S.fcH === x ? 'on' : ''}">${x}</button>`).join('')}</span></h4>`;
    if (F) {
      const ch = ((F.med[F.h] - last) / last) * 100, up = Math.round(F.pUp * 100);
      const span = (TF[c.tf] * F.h) / 36e5, sp = span >= 48 ? `${Math.round(span / 24)} gün` : `${Math.round(span)} saat`;
      h += `<div class="note">${F.h} mum sonra (~${sp}) beklenen orta değer</div>
        <div class="fcbig" style="color:${col(ch / 2)}">${fP(F.med[F.h])} <span style="font-size:13px">${fPct(ch)}</span></div>
        <div class="irow"><span>%80 olasılık aralığı</span><span>${fP(F.lo80[F.h])} – ${fP(F.hi80[F.h])}</span></div>
        <div class="irow"><span>%50 olasılık aralığı</span><span>${fP(F.lo50[F.h])} – ${fP(F.hi50[F.h])}</span></div>
        <div class="irow" style="border:0"><span>Yükselme olasılığı</span><span class="${up >= 50 ? 'sigB' : 'sigS'}">%${up}</span></div>
        <div class="bar2"><i style="width:${up}%"></i></div>
        <div class="irow"><span>Geçmiş testte %80 bant isabeti</span><span>${isFinite(F.cov) ? '%' + Math.round(F.cov * 100) : '—'}</span></div>
        <div class="irow"><span>Geçmiş testte yön isabeti</span><span>${isFinite(F.dirAcc) ? '%' + Math.round(F.dirAcc * 100) : '—'}</span></div>
        <button class="closeb" id="anaFc">${this.S.ind.fc ? '◔ Grafikte tahmin konisini gizle' : '◔ Grafikte tahmin konisini göster'}</button>
        <div class="disc">Bu bir istatistiksel projeksiyondur: son dönem oynaklığı ve kısa vadeli trend eğiminden olasılık bantları üretir. Haberleri, bilançoları ve piyasa şoklarını bilemez. Yön isabeti %50 civarındaysa model yön konusunda yazı-turadan iyi değildir. <b>Yatırım tavsiyesi değildir.</b></div>`;
    } else h += '<div class="empty">Tahmin için en az 80 mum gerekli</div>';
    h += '</div>';
    $('#anaBox').innerHTML = h;
  }

  // ---------- demo işlem ----------
  equity() { let e = this.S.acct.cash; for (const [s, p] of Object.entries(this.S.acct.pos)) if (live[s]) e += p.q * live[s].p; return e; }
  trade(side) {
    const sym = this.act.sym, usd = parseFloat($('#amt').value); if (!(usd > 0)) return toast('Geçerli bir tutar gir', 'bad');
    const c = this.act, pr = c.data.length ? c.data[c.data.length - 1].c : live[sym].p, dq = ((side === 'buy' ? 1 : -1) * usd) / pr;
    const A = this.S.acct, pos = A.pos[sym] || { q: 0, avg: 0 }, nq = pos.q + dq;
    let other = 0; for (const [s, p] of Object.entries(A.pos)) if (s !== sym && live[s]) other += Math.abs(p.q * live[s].p);
    if (Math.abs(nq * pr) > Math.abs(pos.q * pr) && Math.abs(nq * pr) + other > this.equity() * 2) return toast('Yetersiz teminat (maks. 2x kaldıraç)', 'bad');
    if (pos.q === 0 || Math.sign(pos.q) === Math.sign(dq)) pos.avg = (pos.avg * Math.abs(pos.q) + pr * Math.abs(dq)) / (Math.abs(pos.q) + Math.abs(dq));
    else if (Math.sign(nq) !== Math.sign(pos.q) && Math.abs(nq) > 1e-12) pos.avg = pr;
    A.cash -= dq * pr; pos.q = Math.abs(nq) < 1e-12 ? 0 : nq;
    if (pos.q) A.pos[sym] = pos; else delete A.pos[sym];
    A.hist.unshift({ t: Date.now(), s: sym, side, q: Math.abs(dq), p: pr }); A.hist = A.hist.slice(0, 30);
    this.save(); toast(`${side === 'buy' ? 'ALIŞ' : 'SATIŞ'} · ${fP(Math.abs(dq), 4)} ${sym} @ ${fP(pr)}`, 'ok'); this.renderTrade(); this.charts.forEach((x) => (x.dirty = true));
  }
  closePos() {
    const sym = this.act.sym, A = this.S.acct, pos = A.pos[sym]; if (!pos) return; const pr = live[sym].p, pnl = pos.q * (pr - pos.avg);
    A.cash += pos.q * pr; A.hist.unshift({ t: Date.now(), s: sym, side: pos.q > 0 ? 'sell' : 'buy', q: Math.abs(pos.q), p: pr }); delete A.pos[sym];
    this.save(); toast(`Pozisyon kapandı · ${pnl >= 0 ? '+' : ''}${fUSD(pnl)}`, pnl >= 0 ? 'ok' : 'bad'); this.renderTrade(); this.charts.forEach((x) => (x.dirty = true));
  }
  renderTrade() {
    const A = this.S.acct, sym = this.S.charts[this.S.active].sym;
    let up = 0; for (const [s, p] of Object.entries(A.pos)) if (live[s]) up += p.q * (live[s].p - p.avg);
    $('#eq').textContent = fUSD(this.equity()); $('#cash').textContent = fUSD(A.cash);
    const ue = $('#upnl'); ue.textContent = (up >= 0 ? '+' : '') + fUSD(up); ue.className = up >= 0 ? 'up' : 'dn';
    const pos = A.pos[sym], pb = $('#posBox');
    if (pos && live[sym]) {
      const pr = live[sym].p, pnl = pos.q * (pr - pos.avg), pc = ((pr - pos.avg) / pos.avg) * 100 * Math.sign(pos.q);
      pb.innerHTML = `<div class="kv"><span>Pozisyon</span><b class="${pos.q > 0 ? 'up' : 'dn'}">${pos.q > 0 ? 'LONG' : 'SHORT'} ${fP(Math.abs(pos.q), 4)}</b></div>
        <div class="kv"><span>Ort. maliyet</span><b>${fP(pos.avg)}</b></div><div class="kv"><span>K/Z</span><b class="${pnl >= 0 ? 'up' : 'dn'}">${pnl >= 0 ? '+' : ''}${fUSD(pnl)} (${fP(pc, 2)}%)</b></div>
        <button class="closeb" id="closeP">Pozisyonu kapat</button>`;
      $('#closeP').onclick = () => this.closePos();
    } else pb.innerHTML = '';
    const al = this.S.alerts;
    $('#alList').innerHTML = al.length ? al.map((a) => `<div class="alr"><span>🔔 <b>${esc(a.sym)}</b> ${a.dir === 'up' ? '≥' : '≤'} <span class="mono">${fP(a.p)}</span>${a.cid ? ' <span title="Sunucuda izleniyor">☁️</span>' : ''}</span><button data-id="${esc(a.id)}">✕</button></div>`).join('') : '<div class="empty">Grafikte 🔔 aracıyla alarm kur</div>';
    const pushOn = 'Notification' in window && Notification.permission === 'granted';
    $('#notifBtn').textContent = pushOn ? (this.cloud.on ? '✅ Bildirimler açık · tekrar test et' : '✅ Bildirimler açık (site açıkken)') : '🔔 Bildirimleri aç';
    const h = A.hist;
    $('#hist').innerHTML = h.length ? h.slice(0, 12).map((x) => { const d = new Date(x.t); return `<div><span class="${x.side === 'buy' ? 'up' : 'dn'}">${x.side === 'buy' ? 'AL' : 'SAT'} ${esc(x.s)}</span><span>${fP(x.q, 4)} @ ${fP(x.p)}</span><span>${pad(d.getHours())}:${pad(d.getMinutes())}</span></div>`; }).join('') : '<div class="empty">Henüz işlem yok</div>';
  }

  // ---------- kâr / zarar hesaplayıcı + long/short planı ----------
  selectPlan(d, open) {
    this.selPos = d; this.charts.forEach((c) => (c.dirty = true));
    if (d) { this.calcV = null; this.renderCalc(true); if (open) { if (this.mob()) toast('Kâr/zarar detayı: alt menüde AL/SAT → İşlem', 'al'); else this.showTab('trade'); } }
    else this.renderCalc(true);
  }
  planChanged() { clearTimeout(this.pcT); this.pcT = setTimeout(() => this.renderCalc(false), 60); }
  deletePlan() {
    const d = this.selPos; if (!d) return;
    for (const k of Object.keys(this.S.drawings)) this.S.drawings[k] = this.S.drawings[k].filter((x) => x !== d);
    this.selPos = null; this.save(); this.charts.forEach((c) => (c.dirty = true)); this.renderCalc(true);
  }
  calcVals() {
    const c = this.act, d = this.selPos && this.act.myDrawings().includes(this.selPos) ? this.selPos : null;
    if (d) return { d, dir: d.k, e: d.p1, tp: d.tp, sl: d.sl };
    if (!this.calcV || this.calcV.sym !== c.sym) {
      const p = c.data.length ? c.data[c.data.length - 1].c : live[c.sym]?.p || 100, a = c.data.length > 15 ? c.atr() : p * 0.01;
      this.calcV = { sym: c.sym, dir: 'long', e: p, tp: p + 3 * a, sl: p - 1.5 * a };
    }
    return this.calcV;
  }
  bindCalc() {
    const box = $('#calcBox');
    box.addEventListener('input', (e) => {
      const f = e.target.dataset.f; if (!f) return; const v = parseFloat(String(e.target.value).replace(',', '.'));
      if (['cap', 'risk', 'lev', 'fee'].includes(f)) { if (isFinite(v) && v >= 0) { this.S.calc[f] = v; this.save(); } this.renderCalc(false); return; }
      if (!(v > 0)) return; const V = this.calcVals(), key = { e: 'p1', tp: 'tp', sl: 'sl' }[f];
      if (V.d) V.d[key] = v; else V[f] = v;
      this.charts.forEach((c) => (c.dirty = true)); this.renderCalc(false); if (V.d) this.save();
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return; const a = b.dataset.c, V = this.calcVals(), c = this.act;
      if (a === 'long' || a === 'short') {
        if (V.dir !== a) { const dT = V.tp - V.e, dS = V.sl - V.e; if (V.d) { V.d.k = a; V.d.tp = V.e - dT; V.d.sl = V.e - dS; this.save(); } else { V.dir = a; V.tp = V.e - dT; V.sl = V.e - dS; } }
        this.charts.forEach((x) => (x.dirty = true)); this.renderCalc(true);
      }
      if (a === 'now') { const p = c.data[c.data.length - 1].c, dT = V.tp - V.e, dS = V.sl - V.e; if (V.d) { V.d.p1 = p; V.d.tp = p + dT; V.d.sl = p + dS; this.save(); } else { V.e = p; V.tp = p + dT; V.sl = p + dS; } this.charts.forEach((x) => (x.dirty = true)); this.renderCalc(true); }
      if (a === 'draw') {
        const i = c.data.length - 1, d = { k: V.dir, t1: c.data[i].t, t2: c.tOfIdx(i + 24), p1: V.e, tp: V.tp, sl: V.sl };
        c.myDrawings().push(d); this.save(); this.selectPlan(d); if (this.mob()) this.closeSheet(); toast('Plan grafiğe çizildi · kutuyu sürükleyerek düzenleyebilirsin', 'ok');
      }
      if (a === 'del') this.deletePlan();
      if (a === 'alerts') { this.addAlert(c.sym, V.tp); this.addAlert(c.sym, V.sl); }
      if (a === 'trade') { const r = this.calcResult(); $('#amt').value = Math.round(r.notional * 100) / 100; this.trade(V.dir === 'long' ? 'buy' : 'sell'); }
    });
  }
  calcResult() {
    const V = this.calcVals(), C = this.S.calc, long = V.dir === 'long';
    const riskPer = Math.abs(V.e - V.sl), rewardPer = Math.abs(V.tp - V.e), cap = C.cap || 0, lev = Math.max(1, C.lev || 1), fee = (C.fee || 0) / 100;
    let qty = riskPer > 0 ? (cap * (C.risk || 0) / 100) / (riskPer + V.e * fee * 2) : 0;
    const maxQty = (cap * lev) / V.e; const capped = qty > maxQty; if (capped) qty = maxQty;
    const notional = qty * V.e, fees = notional * fee * 2;
    const profit = qty * rewardPer - fees, loss = qty * riskPer + fees;
    const valid = long ? V.tp > V.e && V.sl < V.e : V.tp < V.e && V.sl > V.e;
    const be = long ? V.e * (1 + fee * 2) : V.e * (1 - fee * 2);
    const liq = lev > 1 ? (long ? V.e * (1 - 1 / lev) : V.e * (1 + 1 / lev)) : null;
    const liqBeforeStop = liq != null && (long ? liq >= V.sl : liq <= V.sl);
    return { V, qty, notional, margin: notional / lev, fees, profit, loss, rr: riskPer ? rewardPer / riskPer : 0, valid, be, liq, liqBeforeStop, capped,
      tpPct: ((V.tp - V.e) / V.e) * 100, slPct: ((V.sl - V.e) / V.e) * 100, capPctP: cap ? (profit / cap) * 100 : 0, capPctL: cap ? (loss / cap) * 100 : 0 };
  }
  renderCalc(full) {
    const box = $('#calcBox'); if (!box || !this.act || !this.act.data.length) return;
    const r = this.calcResult(), V = r.V, C = this.S.calc, long = V.dir === 'long', sym = this.act.sym;
    const st = V.d ? (() => { const o = this.act.posOutcome(V.d); return o.r === 'tp' ? '<span class="sigB">✓ Hedefe ulaştı</span>' : o.r === 'sl' ? '<span class="sigS">✗ Stop oldu</span>' : o.r === 'expired' ? 'Süre doldu' : 'Açık'; })() : '';
    if (full || !box.querySelector('[data-f=e]')) {
      const dp = (p) => (+p).toFixed(Math.min(8, Math.max(2, String(fP(p)).split(',')[1]?.length || 2)));
      box.innerHTML = `<div class="lbl" style="display:flex;justify-content:space-between"><span>KÂR / ZARAR HESAPLAYICI · ${esc(sym)}</span>${V.d ? '<span style="color:var(--ac)">● grafikteki plan</span>' : ''}</div>
        <div class="seg two" style="margin:0 0 10px"><button data-c="long" class="${long ? 'on lg' : ''}">▲ Long (Al)</button><button data-c="short" class="${!long ? 'on sh' : ''}">▼ Short (Sat)</button></div>
        <div class="cgrid">
          <label>Giriş<input data-f="e" inputmode="decimal" value="${dp(V.e)}"></label>
          <label class="g">Hedef<input data-f="tp" inputmode="decimal" value="${dp(V.tp)}"></label>
          <label class="r">Stop<input data-f="sl" inputmode="decimal" value="${dp(V.sl)}"></label>
          <label>Sermaye $<input data-f="cap" inputmode="decimal" value="${C.cap}"></label>
          <label>Risk %<input data-f="risk" inputmode="decimal" value="${C.risk}"></label>
          <label>Kaldıraç x<input data-f="lev" inputmode="decimal" value="${C.lev}"></label>
          <label>Komisyon %<input data-f="fee" inputmode="decimal" value="${C.fee}"></label>
          <button data-c="now" class="mini">Giriş = şu anki fiyat</button>
        </div>
        <div id="calcOut"></div>
        <div class="cbtns">${V.d ? '' : '<button data-c="draw" class="closeb">📐 Grafiğe çiz</button>'}<button data-c="alerts" class="closeb">🔔 Hedef + stop alarmı</button><button data-c="trade" class="closeb">▶ Demo işlem aç</button>${V.d ? '<button data-c="del" class="closeb">🗑 Planı sil</button>' : ''}</div>`;
    } else {
      for (const [f, v] of [['e', V.e], ['tp', V.tp], ['sl', V.sl]]) { const el = box.querySelector(`[data-f=${f}]`); if (el !== document.activeElement) el.value = (+v).toFixed(Math.min(8, Math.max(2, String(fP(v)).split(',')[1]?.length || 2))); }
    }
    const warn = !r.valid ? `<div class="cwarn">⚠️ ${long ? 'Long için hedef girişin üstünde, stop altında olmalı' : 'Short için hedef girişin altında, stop üstünde olmalı'}</div>`
      : r.liqBeforeStop ? `<div class="cwarn">⚠️ Tasfiye fiyatı (${fP(r.liq)}) stoptan önce geliyor. Kaldıracı düşür ya da stopu yaklaştır.</div>`
      : r.capped ? '<div class="cwarn">ℹ️ Pozisyon, sermaye × kaldıraç sınırına göre küçültüldü; gerçek risk %' + nfmt(r.capPctL) + '</div>' : '';
    $('#calcOut').innerHTML = `${warn}
      <div class="cres"><div class="g"><span>Hedefte kâr</span><b>+${fUSD(Math.max(0, r.profit))}</b><i>${fPct(r.tpPct)} fiyat · sermayeye göre %${nfmt(r.capPctP)}</i></div>
      <div class="r"><span>Stopta zarar</span><b>-${fUSD(r.loss)}</b><i>${fPct(r.slPct)} fiyat · sermayeye göre %${nfmt(r.capPctL)}</i></div></div>
      <div class="irow"><span>Risk / Ödül</span><span class="${r.rr >= 2 ? 'sigB' : r.rr < 1 ? 'sigS' : ''}">1 : ${fP(r.rr, 2)}</span></div>
      <div class="irow"><span>Pozisyon büyüklüğü</span><span>${fP(r.qty, r.qty >= 100 ? 2 : 4)} adet · ${fUSD(r.notional)}</span></div>
      <div class="irow"><span>Gerekli teminat</span><span>${fUSD(r.margin)}</span></div>
      <div class="irow"><span>Komisyon (giriş+çıkış)</span><span>${fUSD(r.fees)}</span></div>
      <div class="irow"><span>Başabaş fiyatı</span><span>${fP(r.be)}</span></div>
      ${r.liq != null ? `<div class="irow"><span>Tahmini tasfiye fiyatı</span><span class="sigS">${fP(r.liq)}</span></div>` : ''}
      <div class="irow"><span>Kazanmak için gereken isabet</span><span>%${nfmt(100 / (1 + r.rr), 0)}</span></div>
      ${st ? `<div class="irow"><span>Plan durumu</span><span>${st}</span></div>` : ''}
      <div class="disc">Pozisyon büyüklüğü, stop olursan sermayenin yüzde ${nfmt(C.risk)} kadarını kaybedeceğin şekilde hesaplanır. Tasfiye fiyatı yaklaşıktır; borsanın teminat kurallarına göre değişir.</div>`;
  }

  // ---------- alarmlar ----------
  async addAlert(sym, p) {
    const cur = live[sym].p, a = { id: uid(), sym, p, dir: p >= cur ? 'up' : 'down' };
    this.S.alerts.push(a); this.alertsChanged(true);
    toast(`🔔 Alarm kuruldu: ${sym} ${fP(p)}`, 'al');
    if (this.cloud.on) { await this.cloud.addAlert(a); this.alertsChanged(true); }
    else if (!this.alertTipShown) { this.alertTipShown = true; setTimeout(() => toast('İpucu: giriş yaparsan alarmlar site kapalıyken de bildirim gönderir', ''), 1500); }
  }
  removeAlert(id) {
    const a = this.S.alerts.find((x) => x.id === id); if (!a) return;
    this.S.alerts = this.S.alerts.filter((x) => x.id !== id); this.cloud.delAlert(a); this.alertsChanged(true);
  }
  alertsChanged(save) { if (save) { try { localStorage.setItem('trendtakip', JSON.stringify(this.S)); } catch (e) {} } this.renderTrade(); this.charts.forEach((c) => (c.dirty = true)); }
  async notify(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' }); else new Notification(title, { body, tag }); } catch (e) {}
  }
  async enableNotifs() {
    try {
      const r = await this.cloud.enablePush();
      this.renderTrade();
      toast(r === 'push' ? '✅ Bildirimler açık — deneme bildirimi gönderildi' : '✅ Bildirimler açık (site açıkken). Kapalıyken de gelmesi için giriş yap.', 'ok');
    } catch (e) { toast(e.message || 'Bildirim açılamadı', 'bad'); }
  }

  // ---------- indikatör modalı ----------
  renderInd() {
    $('#indList').innerHTML = INDS.map(([k, n, c, sub]) => `<div class="tg${this.S.ind[k] ? ' on' : ''}" data-k="${k}"><span><span class="dot" style="background:${c}"></span>${n}${sub ? `<small>${sub}</small>` : ''}</span><span class="sw"></span></div>`).join('');
    $$('#lowerSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === this.S.lower));
  }

  // ---------- hesap ----------
  renderAccount() {
    const u = this.cloud && this.cloud.user, btn = $('#accBtn');
    btn.classList.toggle('in', !!u); $('#accTxt').textContent = u ? 'Hesabım' : 'Giriş';
    const box = $('#accBox'); if (!box) return;
    if (!this.cloud || !this.cloud.sb) { box.innerHTML = '<h3>Hesap <button data-close>×</button></h3><p class="note">Hesap servisine şu an ulaşılamıyor.</p>'; return; }
    if (u) {
      box.innerHTML = `<h3>Hesabım <button data-close>×</button></h3>
        <p class="note">Giriş yapıldı: <b>${esc(u.email || '')}</b></p>
        <p class="note" style="margin-top:8px">İzleme listen, çizimlerin, grafik düzenin, demo hesabın ve alarmların bu hesapla tüm cihazlarında ortak. Alarmlar sunucuda her dakika kontrol edilir.</p>
        <button class="pbtn" id="accPush">🔔 Bu cihazda bildirimleri aç</button>
        <button class="pbtn ghost" id="accOut">Çıkış yap</button>`;
      $('#accPush').onclick = () => this.enableNotifs();
      $('#accOut').onclick = async () => { await this.cloud.logout(); $('#accModal').classList.remove('show'); };
    } else {
      box.innerHTML = `<h3>Giriş yap / Kayıt ol <button data-close>×</button></h3>
        <p class="note">E-posta adresini yaz, sana bir giriş bağlantısı gönderelim. Şifre yok. Giriş yapınca:</p>
        <p class="note">• Çizimler, izleme listesi ve demo hesap tüm cihazlarında ortak olur<br>• Alarmlar site kapalıyken de telefonuna bildirim gönderir</p>
        <input class="field" id="accEmail" type="email" placeholder="ornek@gmail.com" autocomplete="email">
        <button class="pbtn" id="accSend">Giriş bağlantısı gönder</button>
        <p class="note small" id="accMsg"></p>`;
      $('#accSend').onclick = async () => {
        const em = $('#accEmail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Geçerli bir e-posta yaz', 'bad');
        $('#accSend').disabled = true;
        try { await this.cloud.login(em); $('#accMsg').innerHTML = `✉️ <b>${esc(em)}</b> adresine bağlantı gönderildi. Maildeki bağlantıya tıkla; bu sayfa otomatik giriş yapar. (Gelmezse spam klasörüne bak.)`; }
        catch (e) { $('#accMsg').textContent = 'Gönderilemedi: ' + (e.message || e); $('#accSend').disabled = false; }
      };
    }
  }

  // ---------- CSV ----------
  async importCSV(e) {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    try {
      const d = parseCSV(await f.text()); if (d.length < 5) throw new Error('En az 5 satır veri gerekli');
      const name = f.name.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9ÇĞİÖŞÜ_-]/g, '').slice(0, 14) || 'VERİ';
      const diffs = []; for (let i = 1; i < Math.min(d.length, 200); i++) diffs.push(d[i].t - d[i - 1].t); diffs.sort((a, b) => a - b);
      const ms = diffs[diffs.length >> 1] || 864e5;
      this.S.customs[name] = { ms, d };
      if (!symDef(name)) SYMS.push({ s: name, n: `${d.length} satır · senin verin`, g: 'YÜKLENEN VERİLER', custom: true, extra: true });
      delete live[name]; initLive();
      let best = '1G'; for (const [k, v] of Object.entries(TF)) if (v <= ms * 1.01) best = k;
      this.S.charts[this.S.active].tf = best; this.renderChips(); this.setSym(name);
      $('#csvModal').classList.remove('show'); toast(`✓ ${name} yüklendi (${d.length} mum)`, 'ok');
    } catch (err) { toast('CSV okunamadı: ' + err.message, 'bad'); }
  }

  // ---------- akış ----------
  tick() {
    const now = Date.now();
    computeDerived();
    for (const sd of SYMS) { const l = live[sd.s]; if (!l || l.mode !== 'sim') continue; l.prev = l.p; l.p *= Math.exp(((Math.random() - 0.5) * 2 * 1.7) * (sd.v || 0.015) * Math.sqrt(0.7 / 3600) * 2.2); }
    for (const c of this.charts) {
      const l = live[c.sym]; if (!l) continue;
      const sd = symDef(c.sym);
      if (l.mode === 'sim') c.simStep(now); else if (sd && sd.src === 'derived' && l.mode === 'live') c.liveStep(l.p, now); else if (l.mode === 'delayed') c.applyLivePrice(l.p);
      c.dirty = true; // geri sayım
    }
    for (const a of [...this.S.alerts]) {
      const l = live[a.sym]; if (!l || l.mode === 'wait') continue;
      if ((a.dir === 'up' && l.p >= a.p) || (a.dir === 'down' && l.p <= a.p)) {
        toast(`🔔 ${a.sym} ${fP(a.p)} seviyesine ${a.dir === 'up' ? 'ulaştı ↑' : 'düştü ↓'}`, 'al');
        this.notify(`🔔 ${a.sym} ${a.dir === 'up' ? '↑' : '↓'} ${fP(a.p)}`, `Fiyat alarm seviyene ${a.dir === 'up' ? 'ulaştı' : 'düştü'}. Şu an: ${fP(l.p)}`, 'alert-' + (a.cid || a.id));
        this.S.alerts = this.S.alerts.filter((x) => x.id !== a.id); this.cloud.markTriggered(a); this.alertsChanged(true);
      }
    }
    this.renderTop(); this.renderWatch(false);
    if ($('#p-trade').classList.contains('on')) { this.renderTrade(); if (!this.calcT || Date.now() - this.calcT > 2000) { this.calcT = Date.now(); if (this.selPos) this.renderCalc(false); } }
    this.renderAna(false);
  }
}

function nfmt(v, d = 2) { return isFinite(v) ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }).format(v) : '—'; }

// ---------- CSV ayrıştırıcı ----------
function parseCSV(txt) {
  const lines = txt.replace(/\r/g, '').split('\n').filter((l) => l.trim()); if (!lines.length) return [];
  const dl = [';', '\t', ','].map((c) => [c, lines[0].split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const sp = (l) => l.split(dl).map((s) => s.trim().replace(/^"|"$/g, ''));
  const head = sp(lines[0]).map((h) => h.toLowerCase()); let start = 0;
  const num = (s) => { if (s == null || s === '') return NaN; s = s.replace(/\s/g, ''); if (dl === ';' || /^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s); };
  let map = { t: 0, o: 1, h: 2, l: 3, c: 4, v: 5 };
  if (head.some((h) => /[a-zçğıöşü]/.test(h) && isNaN(num(h)))) {
    start = 1; const f = (re) => head.findIndex((h) => re.test(h));
    map = { t: f(/^(time|date|datetime|timestamp|tarih|zaman|open time|gmt)/), o: f(/^(open|açılış|acilis|aof)/), h: f(/^(high|yüksek|yuksek|en yüksek|max)/), l: f(/^(low|düşük|dusuk|en düşük|min)/),
      c: f(/^(close|adj close|kapanış|kapanis|son|price|fiyat|şimdi|value|değer|deger)/), v: f(/^(vol|volume|hacim|miktar|adet)/) };
    if (map.t < 0) map.t = 0; if (map.c < 0) map.c = head.length > 4 ? 4 : 1;
  }
  const pt = (s) => {
    if (/^\d{9,13}(\.\d+)?$/.test(s)) { const n = +s; return n < 1e11 ? n * 1e3 : n; }
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[3], m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
    const t = Date.parse(s.replace(' ', 'T')); return isNaN(t) ? Date.parse(s) : t;
  };
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const r = sp(lines[i]), t = pt(r[map.t]), c = num(r[map.c]); if (!isFinite(t) || !isFinite(c)) continue;
    let o = map.o >= 0 ? num(r[map.o]) : NaN, h = map.h >= 0 ? num(r[map.h]) : NaN, l = map.l >= 0 ? num(r[map.l]) : NaN; const v = map.v >= 0 ? num(r[map.v]) : 0;
    if (!isFinite(o)) o = out.length ? out[out.length - 1].c : c; if (!isFinite(h)) h = Math.max(o, c); if (!isFinite(l)) l = Math.min(o, c);
    out.push({ t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: isFinite(v) ? v : 0 });
  }
  out.sort((a, b) => a.t - b.t); return out;
}

window.TT = new App();
