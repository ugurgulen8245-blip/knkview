// Grafik motoru: her hücre bağımsız bir Chart örneğidir
import { TF, TFL, AYLAR, fP, fV, fUSD, fPct, dec, pad, clamp, toast } from './util.js';
import { symDef, live, gen, simify, resample, hooks, net, binanceKlines, yahooKlines, derivedKlines, BINT, BWS } from './data.js';
import * as IND from './ind.js';

const C = { bg: '#0a0d13', grid: '#151b27', axis: '#5c6780', up: '#19c37d', dn: '#f0435a', ac: '#8b6cff', ac2: '#ffb547',
  sma20: '#ffb547', ema50: '#4fc3ff', ema200: '#ff6bd5', bb: '#8b6cff', rsi: '#b49cff', macd: '#4fc3ff', sig: '#ffb547',
  ten: '#ff6b81', kij: '#4fc3ff', chi: '#a3e635', stK: '#4fc3ff', stD: '#ffb547', fc: '#ffb547' };
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIBX = [0, 0.618, 1, 1.272, 1.618, 2, 2.618];
const FIBC = ['#f0435a', '#ffb547', '#19c37d', '#4fc3ff', '#8b6cff', '#ff6bd5', '#8b96ab'];
const PT = 18, PB = 14;

export class Chart {
  constructor(app, idx) {
    this.app = app; this.idx = idx;
    this.el = document.createElement('div'); this.el.className = 'cell';
    this.el.innerHTML = `<canvas></canvas><div class="legend"></div><div class="loading">Veri yükleniyor…</div><button class="golive" title="Son muma git">⇥</button>`;
    this.cv = this.el.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
    this.legendEl = this.el.querySelector('.legend'); this.loadEl = this.el.querySelector('.loading'); this.goEl = this.el.querySelector('.golive');
    this.V = { barW: innerWidth < 600 ? 6 : 9, right: -8, cross: null };
    this.data = []; this.disp = []; this.I = {}; this.L = {}; this.yr = { hi: 1, lo: 0 }; this.fc = null;
    this.W = 0; this.H = 0; this.dpr = 1; this.dirty = true; this.tok = 0; this.ws = null; this.wsKey = ''; this.wsHost = 0; this.poll = null;
    this.draft = null; this.ptrs = new Map(); this.drag = null; this.pinch = null;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.el);
    this.goEl.onclick = () => { this.V.right = this.defRight(); this.dirty = true; };
    this.bind();
  }
  get S() { return this.app.S; }
  get cfg() { return this.S.charts[this.idx]; }
  get sym() { return this.cfg.sym; }
  get tf() { return this.cfg.tf; }
  get ms() { return TF[this.tf]; }
  last() { return this.data.length - 1; }
  defRight() { return this.S.ind.fc ? -(this.S.fcH + 6) : -8; }
  destroy() { this.stop(); this.ro.disconnect(); this.el.remove(); }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2.5);
    const r = this.el.getBoundingClientRect(); this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr); this.dirty = true;
  }

  // ---------- veri ----------
  stop() {
    this.wsKey = ''; try { this.ws && ((this.ws.onclose = null), this.ws.close()); } catch (e) {} this.ws = null;
    clearInterval(this.poll); this.poll = null;
  }
  async load(keep) {
    const tok = ++this.tok, sd = symDef(this.sym); this.stop();
    if (!sd) return;
    const l = live[sd.s];
    if (!keep) { this.V.right = this.defRight(); this.V.cross = null; }
    this.loadEl.classList.add('show');
    let d = null;
    try {
      if (sd.custom) { const b = hooks.customBase(sd.s); d = b ? (this.ms <= b.ms ? b.d.map((x) => ({ ...x })) : resample(b.d, this.ms)) : []; }
      else if (l.mode === 'sim') d = gen(sd, this.tf);
      else if (sd.src === 'binance') { d = await binanceKlines(sd.s, this.tf); if (tok === this.tok) { l.mode = 'live'; this.openWS(); } }
      else if (sd.src === 'yahoo') {
        if (net.API_OK === false) throw new Error('api yok');
        d = await yahooKlines(sd, this.tf); l.mode = 'delayed';
        if (tok === this.tok) this.poll = setInterval(() => this.refreshYahoo(tok), 30000);
      }
      else if (sd.src === 'derived') {
        if (sd.legs[0].src === 'yahoo' && net.API_OK === false) throw new Error('api yok');
        d = await derivedKlines(sd, this.tf);
        if (tok === this.tok) this.poll = setInterval(() => this.refreshYahoo(tok), sd.legs[0].src === 'binance' ? 60000 : 30000);
      }
      if (!d || !d.length) throw new Error('boş veri');
    } catch (e) {
      if (tok !== this.tok) return;
      if (!sd.custom) { simify(sd.s); d = gen(sd, this.tf); toast(`${sd.s}: canlı veri alınamadı, simülasyon gösteriliyor`, 'bad'); } else d = [];
    }
    if (tok !== this.tok) return;
    this.data = d; this.recalc(); this.loadEl.classList.remove('show'); this.dirty = true; this.app.onChartData(this);
  }
  async refreshYahoo(tok) {
    if (tok !== this.tok || document.hidden) return;
    try {
      const sd = symDef(this.sym), d = sd.src === 'derived' ? await derivedKlines(sd, this.tf) : await yahooKlines(sd, this.tf); if (tok !== this.tok || !d.length) return;
      const n0 = this.data.length; this.data = d; if (this.V.right > 0) this.V.right += d.length - n0; this.recalc(); this.dirty = true;
    } catch (e) {}
  }
  openWS() {
    const sym = this.sym, tf = this.tf, key = sym + tf + this.tok; this.wsKey = key;
    const url = `${BWS[this.wsHost % BWS.length]}/ws/${sym.toLowerCase()}@kline_${BINT[tf]}`;
    try { this.ws = new WebSocket(url); } catch (e) { return; }
    this.ws.onmessage = (ev) => {
      if (this.wsKey !== key) return; const k = JSON.parse(ev.data).k; if (!k || !this.data.length) return;
      const b = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }, L0 = this.data[this.last()];
      if (b.t === L0.t) this.data[this.last()] = b;
      else if (b.t > L0.t) { this.data.push(b); if (this.data.length > 1500) this.data.shift(); else if (this.V.right > 0) this.V.right += 1; }
      this.recalcSoon();
    };
    this.ws.onclose = () => { if (this.wsKey !== key) return; this.wsHost++; setTimeout(() => { if (this.wsKey === key) this.openWS(); }, 3000); };
  }
  applyLivePrice(p) {
    if (!this.data.length || !isFinite(p)) return; const b = this.data[this.last()];
    if (b.c === p) return; b.c = p; b.h = Math.max(b.h, p); b.l = Math.min(b.l, p); this.recalcSoon();
  }
  liveStep(p, now) { // türetilmiş canlı semboller: son mumu güncelle, süre dolunca yeni mum aç
    if (!this.data.length || !isFinite(p) || !p) return; let b = this.data[this.last()];
    if (now >= b.t + this.ms) { const nb = { t: Math.floor(now / this.ms) * this.ms, o: b.c, h: Math.max(b.c, p), l: Math.min(b.c, p), c: p, v: 0 }; this.data.push(nb); if (this.data.length > 1500) this.data.shift(); if (this.V.right > 0) this.V.right += 1; b = nb; }
    if (b.c === p) return; b.c = p; b.h = Math.max(b.h, p); b.l = Math.min(b.l, p); this.recalcSoon();
  }
  simStep(now) {
    const l = live[this.sym]; if (!l || l.mode !== 'sim' || !this.data.length) return;
    const sd = symDef(this.sym), p = l.p; let b = this.data[this.last()];
    if (now >= b.t + this.ms) {
      const nb = { t: Math.floor(now / this.ms) * this.ms, o: b.c, h: Math.max(b.c, p), l: Math.min(b.c, p), c: p, v: 0 };
      this.data.push(nb); if (this.data.length > 1500) this.data.shift(); if (this.V.right > 0) this.V.right += 1; b = nb;
    }
    b.c = p; b.h = Math.max(b.h, p); b.l = Math.min(b.l, p); b.v += Math.random() * (this.ms / 36e5) * (1e6 / (sd.p || 100)) * 0.004;
    this.recalcSoon();
  }
  recalcSoon() { if (this.rcT) return; this.rcT = setTimeout(() => { this.rcT = null; this.recalc(); this.dirty = true; }, 250); }
  recalc() {
    const d = this.data, cl = d.map((b) => b.c), I = this.I, ind = this.S.ind;
    I.sma20 = IND.sma(cl, 20); I.ema50 = IND.ema(cl, 50); I.ema200 = IND.ema(cl, 200); I.bb = IND.bb(cl);
    I.rsi = IND.rsi(cl); I.macd = IND.macd(cl); I.stoch = IND.stoch(d);
    I.ichi = ind.ichi ? IND.ichimoku(d) : null;
    this.disp = this.S.type === 'heikin' ? IND.heikin(d) : d;
    this.fc = IND.forecast(d, this.S.fcH);
    this.dirty = true;
  }

  // ---------- koordinatlar ----------
  layout() {
    const L = this.L, W = this.W, H = this.H;
    L.axisW = W < 500 ? 58 : 68; L.timeH = 22; L.plotW = W - L.axisW;
    L.lowerH = this.S.lower === 'none' || H < 260 ? 0 : Math.round((H - L.timeH) * (H < 500 ? 0.22 : 0.24));
    L.mainH = H - L.timeH - L.lowerH;
  }
  rightIdx() { return this.last() - this.V.right; }
  xOf(i) { return this.L.plotW - (this.rightIdx() - i + 1) * this.V.barW + this.V.barW / 2; }
  idxOf(x) { return this.rightIdx() + 1 - (this.L.plotW - x) / this.V.barW - 0.5; }
  yOf(p) { return PT + ((this.yr.hi - p) / (this.yr.hi - this.yr.lo)) * (this.L.mainH - PT - PB); }
  pOf(y) { return this.yr.hi - ((y - PT) / (this.L.mainH - PT - PB)) * (this.yr.hi - this.yr.lo); }
  tOfIdx(i) {
    const d = this.data, n = d.length; if (!n) return 0; const ms = this.ms;
    if (i <= 0) return d[0].t + i * ms; if (i >= n - 1) return d[n - 1].t + (i - n + 1) * ms;
    const a = Math.floor(i), f = i - a; return d[a].t + f * (d[a + 1].t - d[a].t);
  }
  idxOfT(t) {
    const d = this.data, n = d.length; if (!n) return 0; const ms = this.ms;
    if (t <= d[0].t) return (t - d[0].t) / ms; if (t >= d[n - 1].t) return n - 1 + (t - d[n - 1].t) / ms;
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; d[m].t <= t ? (lo = m) : (hi = m); }
    return lo + (t - d[lo].t) / (d[hi].t - d[lo].t);
  }
  clampView() { const cnt = this.L.plotW / this.V.barW; this.V.right = clamp(this.V.right, -cnt * 0.75, Math.max(0, this.last() - 8)); }
  zoomAt(x, nb) { nb = clamp(nb, 2, 60); const i = this.idxOf(x); this.V.barW = nb; const ri = i - 1 + (this.L.plotW - x) / nb + 0.5; this.V.right = this.last() - ri; this.clampView(); this.dirty = true; }
  tLabel(t, full) {
    const d = new Date(t), ms = this.ms;
    if (full) return ms >= 864e5 ? `${pad(d.getDate())} ${AYLAR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${pad(d.getDate())} ${AYLAR[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (ms >= 6048e5) return d.getMonth() === 0 ? String(d.getFullYear()) : AYLAR[d.getMonth()];
    if (ms >= 864e5) return d.getDate() <= 1 ? AYLAR[d.getMonth()] : String(d.getDate());
    if (d.getHours() === 0 && d.getMinutes() === 0) return `${d.getDate()} ${AYLAR[d.getMonth()]}`;
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  countdown() {
    if (!this.data.length) return ''; const r = this.data[this.last()].t + this.ms - Date.now(); if (r <= 0) return '00:00';
    const s = Math.floor(r / 1e3), dd = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return dd ? `${dd}g ${pad(h)}:${pad(m)}` : h ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
  }

  // ---------- çizim yardımcıları ----------
  line(arr, color, w, i0, i1) {
    const ctx = this.ctx; ctx.beginPath(); let st = false;
    for (let i = i0; i <= i1; i++) { const v = arr[i]; if (!isFinite(v)) { st = false; continue; } const x = this.xOf(i), y = this.yOf(v); st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true; }
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  rr(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  axisTag(y, txt, bg, fg = '#fff', sub) {
    const ctx = this.ctx, L = this.L; ctx.font = '600 11px JetBrains Mono'; const h = sub ? 32 : 20; const yy = clamp(y - 10, 0, L.mainH - h);
    ctx.fillStyle = bg; this.rr(L.plotW + 1, yy, L.axisW - 2, h, 4); ctx.fill(); ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, L.plotW + 5, yy + 10); if (sub) { ctx.globalAlpha = 0.85; ctx.fillText(sub, L.plotW + 5, yy + 23); ctx.globalAlpha = 1; }
  }
  dash(y, color, pat = [4, 4], x0 = 0, x1 = this.L.plotW) {
    const ctx = this.ctx; ctx.save(); ctx.setLineDash(pat); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke(); ctx.restore();
  }

  // ---------- render ----------
  render() {
    this.dirty = false; this.layout();
    const ctx = this.ctx, L = this.L, V = this.V, S = this.S, data = this.data, disp = this.disp, I = this.I;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, this.W, this.H);
    if (!data.length) { this.legendEl.innerHTML = `<div class="l1"><span class="nm">${this.sym}</span></div>`; return; }
    const ri = this.rightIdx(), li = ri - L.plotW / V.barW, last = this.last();
    const i0 = Math.max(0, Math.floor(li)), i1 = Math.min(last, Math.ceil(ri));
    const lineMode = S.type === 'line' || S.type === 'area';
    let hi = -Infinity, lo = Infinity;
    for (let i = i0; i <= i1; i++) {
      const b = disp[i];
      if (lineMode) { hi = Math.max(hi, b.c); lo = Math.min(lo, b.c); } else { hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); }
      if (S.ind.bb && isFinite(I.bb.up[i])) { hi = Math.max(hi, I.bb.up[i]); lo = Math.min(lo, I.bb.lo[i]); }
    }
    if (S.ind.fc && this.fc && ri > last) {
      const k = Math.min(this.fc.h, Math.floor(ri - last));
      for (let j = 1; j <= k; j++) { hi = Math.max(hi, this.fc.hi80[j]); lo = Math.min(lo, this.fc.lo80[j]); }
    }
    if (!isFinite(hi)) { hi = data[last].c * 1.01; lo = data[last].c * 0.99; }
    if (hi === lo) { hi *= 1.001; lo *= 0.999; }
    const pd = (hi - lo) * 0.06; this.yr = { hi: hi + pd, lo: lo - pd };

    // ızgara + fiyat ekseni
    const raw = (this.yr.hi - this.yr.lo) / Math.max(3, Math.floor(L.mainH / 55)), mag = 10 ** Math.floor(Math.log10(raw)), kk = raw / mag;
    const step = (kk < 1.5 ? 1 : kk < 3 ? 2 : kk < 7 ? 5 : 10) * mag;
    const sd = Math.max(0, -Math.floor(Math.log10(step)));
    ctx.font = '11px JetBrains Mono'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let p = Math.ceil(this.yr.lo / step) * step; p <= this.yr.hi; p += step) {
      const y = Math.round(this.yOf(p)) + 0.5; if (y < 4 || y > L.mainH - 4) continue;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L.plotW, y); ctx.stroke(); ctx.fillStyle = C.axis; ctx.fillText(fP(p, Math.min(6, Math.max(sd, Math.min(dec(p), 2)))), L.plotW + 5, y);
    }
    const k = Math.max(1, Math.ceil(84 / V.barW)), tY = L.mainH + L.lowerH; ctx.textAlign = 'center';
    for (let i = Math.floor(li); i <= Math.ceil(ri) + 1; i++) {
      if (((i % k) + k) % k !== 0) continue; const x = Math.round(this.xOf(i)) + 0.5; if (x < 0 || x > L.plotW) continue;
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, tY); ctx.stroke();
      ctx.fillStyle = C.axis; ctx.fillText(this.tLabel(this.tOfIdx(i)), x, tY + L.timeH / 2);
    }

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, L.plotW, L.mainH); ctx.clip();
    // hacim profili
    if (S.ind.vp) this.drawVP(i0, i1);
    // hacim
    if (S.ind.vol) {
      let mv = 0; for (let i = i0; i <= i1; i++) mv = Math.max(mv, data[i].v);
      const vh = L.mainH * 0.16, bw = Math.max(1, V.barW * 0.72);
      if (mv > 0) for (let i = i0; i <= i1; i++) { const b = data[i], h = (b.v / mv) * vh; ctx.fillStyle = b.c >= b.o ? '#19c37d30' : '#f0435a30'; ctx.fillRect(this.xOf(i) - bw / 2, L.mainH - h, bw, h); }
    }
    // ichimoku bulutu
    if (S.ind.ichi && I.ichi) this.drawIchi(i0, i1);
    // bollinger
    if (S.ind.bb) {
      ctx.beginPath(); let st = false;
      for (let i = i0; i <= i1; i++) { if (!isFinite(I.bb.up[i])) continue; const x = this.xOf(i), y = this.yOf(I.bb.up[i]); st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true; }
      for (let i = i1; i >= i0; i--) { if (!isFinite(I.bb.lo[i])) continue; ctx.lineTo(this.xOf(i), this.yOf(I.bb.lo[i])); }
      ctx.closePath(); ctx.fillStyle = '#8b6cff12'; ctx.fill();
      this.line(I.bb.up, '#8b6cffaa', 1, i0, i1); this.line(I.bb.lo, '#8b6cffaa', 1, i0, i1); this.line(I.bb.mid, '#8b6cff66', 1, i0, i1);
    }
    // fiyat
    if (lineMode) {
      if (S.type === 'area') {
        const g = ctx.createLinearGradient(0, 0, 0, L.mainH); g.addColorStop(0, '#8b6cff55'); g.addColorStop(1, '#8b6cff00');
        ctx.beginPath(); ctx.moveTo(this.xOf(i0), L.mainH); for (let i = i0; i <= i1; i++) ctx.lineTo(this.xOf(i), this.yOf(data[i].c));
        ctx.lineTo(this.xOf(i1), L.mainH); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      }
      this.line(data.map((b) => b.c), C.ac, 2, i0, i1);
    } else {
      const bw = Math.max(1, Math.round(V.barW * 0.7));
      for (let i = i0; i <= i1; i++) {
        const b = disp[i], up = b.c >= b.o, x = Math.round(this.xOf(i)); ctx.fillStyle = up ? C.up : C.dn;
        const yo = this.yOf(b.o), yc = this.yOf(b.c);
        ctx.fillRect(x, Math.round(this.yOf(b.h)), 1, Math.max(1, Math.round(this.yOf(b.l) - this.yOf(b.h))));
        if (bw > 2) ctx.fillRect(x - Math.floor(bw / 2), Math.round(Math.min(yo, yc)), bw, Math.max(1, Math.round(Math.abs(yc - yo))));
      }
    }
    if (S.ind.sma20) this.line(I.sma20, C.sma20, 1.4, i0, i1);
    if (S.ind.ema50) this.line(I.ema50, C.ema50, 1.4, i0, i1);
    if (S.ind.ema200) this.line(I.ema200, C.ema200, 1.6, i0, i1);
    if (S.ind.fc && this.fc) this.drawFC();
    this.drawDrawings();
    ctx.restore();

    // pozisyon
    const pos = S.acct.pos[this.sym], lp = data[last].c;
    if (pos && pos.q) {
      const y = this.yOf(pos.avg), pnl = pos.q * (lp - pos.avg), col = pos.q > 0 ? C.up : C.dn;
      if (y > 0 && y < L.mainH) {
        this.dash(y, col, [6, 3]); const lab = `${pos.q > 0 ? 'LONG' : 'SHORT'} ${fP(Math.abs(pos.q), 4)}  ${pnl >= 0 ? '+' : ''}${fUSD(pnl)}`;
        ctx.font = '600 11px Inter'; const tw = ctx.measureText(lab).width + 14; ctx.fillStyle = col; this.rr(Math.max(4, L.plotW - tw - 90), y - 10, tw, 20, 5); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(lab, Math.max(4, L.plotW - tw - 90) + 7, y + 1); this.axisTag(y, fP(pos.avg), col);
      }
    }
    // alarmlar
    for (const a of S.alerts) {
      if (a.sym !== this.sym) continue; const y = this.yOf(a.p); if (y < 0 || y > L.mainH) continue;
      this.dash(y, C.ac2, [2, 3]); ctx.font = '12px Inter'; ctx.fillStyle = C.ac2; ctx.textAlign = 'right'; ctx.fillText('🔔', L.plotW - 6, y - 9); this.axisTag(y, fP(a.p), C.ac2, '#1a1200');
    }
    // son fiyat
    { const b = data[last], y = this.yOf(b.c), col = b.c >= b.o ? C.up : C.dn; if (y >= 0 && y <= L.mainH) this.dash(y, col + 'aa', [1, 3]); this.axisTag(clamp(y, 10, L.mainH - 22), fP(b.c), col, '#fff', this.countdown()); }

    if (L.lowerH) this.drawLower(i0, i1);
    ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(L.plotW + 0.5, 0); ctx.lineTo(L.plotW + 0.5, tY); ctx.moveTo(0, tY + 0.5); ctx.lineTo(this.W, tY + 0.5); ctx.stroke();

    // artı imleci
    if (V.cross) {
      const { x, y } = V.cross, i = Math.round(this.idxOf(x)), cx = this.xOf(i);
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = '#8b96ab88'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, 0); ctx.lineTo(Math.round(cx) + 0.5, tY);
      if (y < L.mainH) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(L.plotW, Math.round(y) + 0.5); }
      ctx.stroke(); ctx.restore();
      if (y < L.mainH) this.axisTag(y, fP(this.pOf(y)), '#2a3446');
      const tl = this.tLabel(this.tOfIdx(i), true); ctx.font = '600 11px JetBrains Mono'; const tw = ctx.measureText(tl).width + 14;
      ctx.fillStyle = '#2a3446'; this.rr(clamp(cx - tw / 2, 0, L.plotW - tw), tY + 2, tw, L.timeH - 4, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(tl, clamp(cx, tw / 2, L.plotW - tw / 2), tY + L.timeH / 2);
    }
    this.renderLegend();
    this.goEl.classList.toggle('show', V.right > 4);
  }

  drawVP(i0, i1) {
    const ctx = this.ctx, L = this.L, vp = IND.volProfile(this.data, i0, i1, this.yr.lo, this.yr.hi, 30);
    if (!vp.max) return; const wMax = L.plotW * 0.22;
    for (let k = 0; k < vp.bins.length; k++) {
      const v = vp.bins[k]; if (!v) continue; const pTop = this.yr.lo + (k + 1) * vp.bw, pBot = this.yr.lo + k * vp.bw;
      const y0 = this.yOf(pTop), y1 = this.yOf(pBot), w = (v / vp.max) * wMax;
      ctx.fillStyle = k === vp.poc ? '#ffb54755' : '#4fc3ff22'; ctx.fillRect(L.plotW - w, y0 + 1, w, Math.max(1, y1 - y0 - 2));
    }
    const pp = this.yr.lo + (vp.poc + 0.5) * vp.bw; this.dash(this.yOf(pp), '#ffb54788', [6, 4], L.plotW - wMax, L.plotW);
    ctx.font = '600 9px JetBrains Mono'; ctx.fillStyle = '#ffb547'; ctx.textAlign = 'right'; ctx.fillText('POC', L.plotW - 4, this.yOf(pp) - 6);
  }
  drawIchi(i0, i1) {
    const ctx = this.ctx, ic = this.I.ichi, e = Math.min(ic.sa.length - 1, Math.ceil(this.rightIdx()));
    for (let i = Math.max(i0, 1); i <= e; i++) {
      const a0 = ic.sa[i - 1], b0 = ic.sb[i - 1], a1 = ic.sa[i], b1 = ic.sb[i];
      if (![a0, b0, a1, b1].every(isFinite)) continue;
      const x0 = this.xOf(i - 1), x1 = this.xOf(i);
      ctx.beginPath(); ctx.moveTo(x0, this.yOf(a0)); ctx.lineTo(x1, this.yOf(a1)); ctx.lineTo(x1, this.yOf(b1)); ctx.lineTo(x0, this.yOf(b0)); ctx.closePath();
      ctx.fillStyle = a1 >= b1 ? '#19c37d22' : '#f0435a22'; ctx.fill();
    }
    this.line(ic.sa, '#19c37d88', 1, i0, e); this.line(ic.sb, '#f0435a88', 1, i0, e);
    this.line(ic.ten, C.ten, 1.2, i0, i1); this.line(ic.kij, C.kij, 1.2, i0, i1); this.line(ic.chi, C.chi + 'aa', 1, i0, i1);
  }
  drawFC() {
    const ctx = this.ctx, f = this.fc, last = this.last(), L = this.L;
    const band = (lo, hi, col) => {
      ctx.beginPath(); for (let j = 0; j <= f.h; j++) { const x = this.xOf(last + j), y = this.yOf(hi[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      for (let j = f.h; j >= 0; j--) ctx.lineTo(this.xOf(last + j), this.yOf(lo[j])); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    band(f.lo80, f.hi80, '#ffb54714'); band(f.lo50, f.hi50, '#ffb54722');
    ctx.save(); ctx.setLineDash([5, 4]);
    ctx.beginPath(); for (let j = 0; j <= f.h; j++) { const x = this.xOf(last + j), y = this.yOf(f.med[j]); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = C.fc; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    const xe = this.xOf(last + f.h);
    if (xe < L.plotW - 4) {
      ctx.font = '600 10px JetBrains Mono'; ctx.textAlign = 'left'; ctx.fillStyle = C.fc;
      ctx.fillText(fP(f.med[f.h]), xe + 4, this.yOf(f.med[f.h]) + 3);
      ctx.fillStyle = '#ffb547aa'; ctx.fillText(fP(f.hi80[f.h]), xe + 4, this.yOf(f.hi80[f.h]) + 3); ctx.fillText(fP(f.lo80[f.h]), xe + 4, this.yOf(f.lo80[f.h]) + 3);
    }
    ctx.font = '600 9px Inter'; ctx.fillStyle = '#ffb547aa'; ctx.textAlign = 'left';
    ctx.fillText(`TAHMİN · ${f.h} mum · %80 bant`, this.xOf(last) + 6, Math.max(12, this.yOf(f.hi80[Math.min(f.h, 3)]) - 8));
  }

  drawLower(i0, i1) {
    const ctx = this.ctx, L = this.L, top = L.mainH, h = L.lowerH, S = this.S, I = this.I;
    ctx.strokeStyle = '#1e2635'; ctx.beginPath(); ctx.moveTo(0, top + 0.5); ctx.lineTo(this.W, top + 0.5); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(0, top + 1, L.plotW, h - 1); ctx.clip();
    let hi, lo, yv;
    const pl = (arr, c, w = 1.3) => { ctx.beginPath(); let st = false; for (let i = i0; i <= i1; i++) { const v = arr[i]; if (!isFinite(v)) { st = false; continue; } const x = this.xOf(i), y = yv(v); st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true; } ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
    if (S.lower === 'rsi' || S.lower === 'stoch') {
      hi = 100; lo = 0; yv = (v) => top + 6 + ((hi - v) / (hi - lo)) * (h - 12);
      const [ob, os] = S.lower === 'rsi' ? [70, 30] : [80, 20];
      ctx.fillStyle = '#8b6cff0d'; ctx.fillRect(0, yv(ob), L.plotW, yv(os) - yv(ob)); [ob, os].forEach((v) => this.dash(yv(v), '#5c678066'));
      if (S.lower === 'rsi') pl(I.rsi, C.rsi, 1.4); else { pl(I.stoch.k, C.stK); pl(I.stoch.d, C.stD); }
    } else {
      const M = I.macd; hi = -Infinity; lo = Infinity;
      for (let i = i0; i <= i1; i++) for (const v of [M.m[i], M.s[i], M.h[i]]) if (isFinite(v)) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
      if (!isFinite(hi)) { hi = 1; lo = -1; } const pp = (hi - lo) * 0.1 || 1; hi += pp; lo -= pp; yv = (v) => top + 6 + ((hi - v) / (hi - lo)) * (h - 12);
      const z = yv(0), bw = Math.max(1, this.V.barW * 0.6);
      for (let i = i0; i <= i1; i++) { const v = M.h[i]; if (!isFinite(v)) continue; const pv = M.h[i - 1]; ctx.fillStyle = v >= 0 ? (v >= pv ? '#19c37dcc' : '#19c37d66') : v <= pv ? '#f0435acc' : '#f0435a66'; const y = yv(v); ctx.fillRect(this.xOf(i) - bw / 2, Math.min(y, z), bw, Math.abs(y - z) || 1); }
      pl(M.m, C.macd); pl(M.s, C.sig);
    }
    ctx.restore();
    ctx.font = '10px JetBrains Mono'; ctx.fillStyle = C.axis; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (S.lower === 'rsi') [70, 30].forEach((v) => ctx.fillText(v, L.plotW + 5, yv(v)));
    else if (S.lower === 'stoch') [80, 20].forEach((v) => ctx.fillText(v, L.plotW + 5, yv(v)));
    else { ctx.fillText(fP(hi - (hi - lo) * 0.1, dec(hi)), L.plotW + 5, top + 12); ctx.fillText(fP(lo + (hi - lo) * 0.1, dec(hi)), L.plotW + 5, top + h - 10); }
    const ci = this.V.cross ? clamp(Math.round(this.idxOf(this.V.cross.x)), 0, this.last()) : this.last();
    ctx.font = '600 11px Inter'; ctx.textAlign = 'left'; ctx.fillStyle = C.axis; const x0 = 10;
    if (S.lower === 'rsi') { ctx.fillText('RSI 14', x0, top + 13); ctx.fillStyle = C.rsi; ctx.font = '11px JetBrains Mono'; ctx.fillText(fP(I.rsi[ci], 2), x0 + 48, top + 13); }
    else if (S.lower === 'stoch') { ctx.fillText('Stoch 14 3 3', x0, top + 13); ctx.font = '11px JetBrains Mono'; ctx.fillStyle = C.stK; ctx.fillText(fP(I.stoch.k[ci], 2), x0 + 86, top + 13); ctx.fillStyle = C.stD; ctx.fillText(fP(I.stoch.d[ci], 2), x0 + 136, top + 13); }
    else { ctx.fillText('MACD 12 26 9', x0, top + 13); ctx.font = '11px JetBrains Mono'; const dd = dec(this.data[ci].c) + 1; ctx.fillStyle = C.macd; ctx.fillText(fP(I.macd.m[ci], dd), x0 + 92, top + 13); ctx.fillStyle = C.sig; ctx.fillText(fP(I.macd.s[ci], dd), x0 + 170, top + 13); }
  }

  renderLegend() {
    const I = this.I, S = this.S, i = this.V.cross ? clamp(Math.round(this.idxOf(this.V.cross.x)), 0, this.last()) : this.last();
    const b = this.disp[i], pr = this.data[i - 1] || b, ch = ((this.data[i].c - pr.c) / pr.c) * 100, cl = ch >= 0 ? 'up' : 'dn';
    const l = live[this.sym], mode = l && l.mode === 'sim' ? '<span class="mode sim">SİM</span>' : l && l.mode === 'delayed' ? '<span class="mode dl">GEC</span>' : l && l.mode === 'live' ? '<span class="mode lv">CANLI</span>' : '';
    let h = `<div class="l1"><span class="nm">${this.sym} · ${TFL[this.tf]}${mode}</span><span class="${cl}"><span class="k">A</span> ${fP(b.o)}</span><span class="${cl}"><span class="k">Y</span> ${fP(b.h)}</span><span class="${cl}"><span class="k">D</span> ${fP(b.l)}</span><span class="${cl}"><span class="k">K</span> ${fP(b.c)}</span><span class="${cl}">${fPct(ch)}</span>${S.ind.vol ? `<span class="vv"><span class="k">Hac</span> ${fV(this.data[i].v)}</span>` : ''}</div>`;
    const parts = [];
    if (S.ind.sma20) parts.push(`<span style="color:${C.sma20}">SMA20 ${fP(I.sma20[i])}</span>`);
    if (S.ind.ema50) parts.push(`<span style="color:${C.ema50}">EMA50 ${fP(I.ema50[i])}</span>`);
    if (S.ind.ema200) parts.push(`<span style="color:${C.ema200}">EMA200 ${fP(I.ema200[i])}</span>`);
    if (S.ind.bb) parts.push(`<span style="color:${C.bb}">BB ${fP(I.bb.up[i])} / ${fP(I.bb.lo[i])}</span>`);
    if (S.ind.ichi && I.ichi) parts.push(`<span style="color:${C.ten}">Tenkan ${fP(I.ichi.ten[i])}</span> <span style="color:${C.kij}">Kijun ${fP(I.ichi.kij[i])}</span>`);
    if (S.ind.fc && this.fc) parts.push(`<span style="color:${C.fc}">Tahmin(${this.fc.h}) ${fP(this.fc.med[this.fc.h])} · ↑%${Math.round(this.fc.pUp * 100)}</span>`);
    if (parts.length) h += `<div class="ind">${parts.join('  ')}</div>`;
    this.legendEl.innerHTML = h;
  }

  // ---------- çizimler ----------
  myDrawings() { const D = this.S.drawings; return D[this.sym] || (D[this.sym] = []); }
  atr(n = 14) {
    const d = this.data, e = d.length - 1; let s = 0, c = 0;
    for (let i = Math.max(1, e - n + 1); i <= e; i++) { s += Math.max(d[i].h - d[i].l, Math.abs(d[i].h - d[i - 1].c), Math.abs(d[i].l - d[i - 1].c)); c++; }
    return c ? s / c : d[e].c * 0.01;
  }
  posOutcome(d) { // plan geçmiş mumlarda hedefe mi stopa mı değdi?
    const long = d.k === 'long', i0 = Math.max(0, Math.ceil(this.idxOfT(d.t1))), i1 = Math.min(this.last(), Math.floor(this.idxOfT(d.t2)));
    for (let i = i0 + 1; i <= i1; i++) {
      const b = this.data[i]; if (!b) continue;
      const hitSL = long ? b.l <= d.sl : b.h >= d.sl, hitTP = long ? b.h >= d.tp : b.l <= d.tp;
      if (hitSL) return { r: 'sl', i }; if (hitTP) return { r: 'tp', i };
    }
    return { r: i1 < Math.floor(this.idxOfT(d.t2)) ? 'open' : 'expired' };
  }
  drawPos(d) {
    const ctx = this.ctx, long = d.k === 'long', sel = this.app.selPos === d;
    const x1 = this.xOf(this.idxOfT(d.t1)), x2 = this.xOf(this.idxOfT(d.t2)), w = Math.max(8, x2 - x1);
    const yE = this.yOf(d.p1), yT = this.yOf(d.tp), yS = this.yOf(d.sl);
    ctx.fillStyle = '#19c37d26'; ctx.fillRect(x1, Math.min(yE, yT), w, Math.abs(yT - yE));
    ctx.fillStyle = '#f0435a26'; ctx.fillRect(x1, Math.min(yE, yS), w, Math.abs(yS - yE));
    // gerçekleşen yol: girişten son fiyata
    const o = this.posOutcome(d), last = this.data[this.last()];
    if (o.r === 'open' && last) { const yC = this.yOf(last.c), good = long ? last.c >= d.p1 : last.c <= d.p1; ctx.fillStyle = good ? '#19c37d33' : '#f0435a33'; ctx.fillRect(x1, Math.min(yE, yC), Math.min(w, this.xOf(this.last()) - x1 + 4), Math.abs(yC - yE)); }
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.strokeStyle = '#19c37d'; ctx.beginPath(); ctx.moveTo(x1, yT + 0.5); ctx.lineTo(x1 + w, yT + 0.5); ctx.stroke();
    ctx.strokeStyle = '#f0435a'; ctx.beginPath(); ctx.moveTo(x1, yS + 0.5); ctx.lineTo(x1 + w, yS + 0.5); ctx.stroke();
    ctx.strokeStyle = '#e6ebf5aa'; ctx.beginPath(); ctx.moveTo(x1, yE + 0.5); ctx.lineTo(x1 + w, yE + 0.5); ctx.stroke();
    const pct = (p) => ((p - d.p1) / d.p1) * 100, rr = Math.abs(d.tp - d.p1) / Math.abs(d.p1 - d.sl || 1);
    const tag = (y, txt, bg) => { ctx.font = '600 10px JetBrains Mono'; const tw = ctx.measureText(txt).width + 10, vx2 = Math.min(x1 + w, this.L.plotW - 4), x = Math.max(Math.min(x1, vx2 - tw), (Math.max(0, x1) + vx2) / 2 - tw / 2); ctx.fillStyle = bg; this.rr(x, y - 8, tw, 16, 4); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + 5, y); };
    const tOff = yT < yE ? -10 : 10, sOff = yS > yE ? 10 : -10;
    tag(yT + tOff, `Hedef ${fP(d.tp)} (${fPct(pct(d.tp))})`, '#12a467');
    tag(yS + sOff, `Stop ${fP(d.sl)} (${fPct(pct(d.sl))})`, '#d42c45');
    const res = o.r === 'tp' ? ' · ✓ Hedef' : o.r === 'sl' ? ' · ✗ Stop' : o.r === 'expired' ? ' · süre doldu' : '';
    tag(yE, `${long ? 'LONG' : 'SHORT'} ${fP(d.p1)} · R/R ${fP(rr, 2)}${res}`, sel ? '#8b6cff' : '#2a3446');
    if (sel) for (const [x, y] of [[x1, yT], [x1, yS], [x1, yE], [x1 + w, yE]]) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeStyle = '#8b6cff'; ctx.lineWidth = 2; ctx.strokeRect(x - 4, y - 4, 8, 8); }
  }
  hitPos(p) {
    const ds = this.myDrawings();
    for (let k = ds.length - 1; k >= 0; k--) {
      const d = ds[k]; if (d.k !== 'long' && d.k !== 'short') continue;
      const x1 = this.xOf(this.idxOfT(d.t1)), x2 = Math.max(x1 + 8, this.xOf(this.idxOfT(d.t2))), yE = this.yOf(d.p1), yT = this.yOf(d.tp), yS = this.yOf(d.sl), R = 10;
      const near = (x, y) => Math.abs(p.x - x) <= R && Math.abs(p.y - y) <= R;
      if (near(x2, yE)) return { d, h: 'end' };
      const inX = p.x >= x1 - R && p.x <= x2 + R;
      if (inX && Math.abs(p.y - yT) <= 7) return { d, h: 'tp' };
      if (inX && Math.abs(p.y - yS) <= 7) return { d, h: 'sl' };
      if (inX && p.y >= Math.min(yT, yS) && p.y <= Math.max(yT, yS)) return { d, h: 'move' };
    }
    return null;
  }
  dragPos(p) {
    const g = this.posDrag, d = g.d, o = g.o, dp = this.pOf(p.y) - this.pOf(g.p0.y), db = (p.x - g.p0.x) / this.V.barW, long = d.k === 'long';
    if (g.h === 'tp') { const v = o.tp + dp; if (long ? v > d.p1 : v < d.p1) d.tp = v; }
    else if (g.h === 'sl') { const v = o.sl + dp; if (long ? v < d.p1 : v > d.p1) d.sl = v; }
    else if (g.h === 'end') { const t = this.tOfIdx(this.idxOfT(o.t2) + db); if (t > d.t1) d.t2 = t; }
    else { d.p1 = o.p1 + dp; d.tp = o.tp + dp; d.sl = o.sl + dp; d.t1 = this.tOfIdx(this.idxOfT(o.t1) + db); d.t2 = this.tOfIdx(this.idxOfT(o.t2) + db); }
    this.dirty = true; this.app.planChanged();
  }
  drawOne(d) {
    if (d.k === 'long' || d.k === 'short') return this.drawPos(d);
    const ctx = this.ctx, L = this.L, x1 = this.xOf(this.idxOfT(d.t1)), y1 = this.yOf(d.p1);
    ctx.lineWidth = 1.6; ctx.setLineDash([]);
    if (d.k === 'hline') { ctx.strokeStyle = C.ac; ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(L.plotW, y1); ctx.stroke(); ctx.fillStyle = C.ac; ctx.font = '600 10px JetBrains Mono'; ctx.textAlign = 'left'; ctx.fillText(fP(d.p1), 6, y1 - 7); return; }
    const x2 = this.xOf(this.idxOfT(d.t2)), y2 = this.yOf(d.p2);
    if (d.k === 'trend') {
      ctx.strokeStyle = C.ac; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.ac; ctx.stroke(); }
      const ch = ((d.p2 - d.p1) / d.p1) * 100, bars = Math.round(this.idxOfT(d.t2) - this.idxOfT(d.t1));
      ctx.font = '600 10px JetBrains Mono'; ctx.fillStyle = ch >= 0 ? C.up : C.dn; ctx.textAlign = 'left'; ctx.fillText(`${fPct(ch)}  ${bars} bar`, x2 + 8, y2 + 4);
    }
    if (d.k === 'fib') {
      const xl = Math.min(x1, x2), xr = L.plotW;
      FIB.forEach((f, j) => {
        const p = d.p2 + (d.p1 - d.p2) * f, y = this.yOf(p);
        if (j < FIB.length - 1) { const yn = this.yOf(d.p2 + (d.p1 - d.p2) * FIB[j + 1]); ctx.fillStyle = FIBC[j] + '14'; ctx.fillRect(xl, Math.min(y, yn), xr - xl, Math.abs(yn - y)); }
        ctx.strokeStyle = FIBC[j]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xl, y); ctx.lineTo(xr, y); ctx.stroke();
        ctx.fillStyle = FIBC[j]; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'left'; ctx.fillText(`${f} (${fP(p)})`, xl + 4, y - 5);
      });
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#8b96ab88'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (d.k === 'fibext') {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#8b96ab99'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      if (d.t3 != null) ctx.lineTo(this.xOf(this.idxOfT(d.t3)), this.yOf(d.p3)); ctx.stroke(); ctx.setLineDash([]);
      for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = C.ac; ctx.fill(); }
      if (d.t3 == null) return;
      const x3 = this.xOf(this.idxOfT(d.t3)), mv = d.p2 - d.p1;
      FIBX.forEach((f, j) => {
        const p = d.p3 + mv * f, y = this.yOf(p);
        ctx.strokeStyle = FIBC[j]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x3, y); ctx.lineTo(L.plotW, y); ctx.stroke();
        ctx.fillStyle = FIBC[j]; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'left'; ctx.fillText(`${f} (${fP(p)})`, x3 + 4, y - 5);
      });
    }
  }
  drawDrawings() { for (const d of this.myDrawings()) this.drawOne(d); if (this.draft) this.drawOne(this.draft); }

  // ---------- etkileşim ----------
  pt(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  snapP(x, y) {
    const i = clamp(Math.round(this.idxOf(x)), 0, this.last()), b = this.data[i]; let best = this.pOf(y), bd = 10;
    for (const p of [b.o, b.h, b.l, b.c]) { const dd = Math.abs(this.yOf(p) - y); if (dd < bd) { bd = dd; best = p; } }
    return best;
  }
  bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      this.app.setActive(this.idx);
      if (!this.data.length) return;
      cv.setPointerCapture(e.pointerId); const p = this.pt(e); this.ptrs.set(e.pointerId, p);
      if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, bw: this.V.barW, cx: (a.x + b.x) / 2 }; this.drag = null; this.draft = null; return; }
      const tool = this.app.tool;
      if (tool === 'cursor' && p.x < this.L.plotW && p.y < this.L.mainH) {
        const h = this.hitPos(p);
        if (h) { this.posDrag = { ...h, p0: p, o: { ...h.d } }; this.app.selectPlan(h.d); this.dirty = true; return; }
        if (this.app.selPos) { this.app.selectPlan(null); }
      }
      if ((tool === 'long' || tool === 'short') && p.x < this.L.plotW && p.y < this.L.mainH) {
        const i = Math.round(this.idxOf(p.x)), e = this.snapP(p.x, p.y), a = this.atr(), up = tool === 'long' ? 1 : -1;
        const d = { k: tool, t1: this.tOfIdx(i), t2: this.tOfIdx(i + 24), p1: e, tp: e + up * 3 * a, sl: e - up * 1.5 * a };
        this.myDrawings().push(d); this.app.drawingDone(); this.app.selectPlan(d, true); this.dirty = true; return;
      }
      if (this.draft && this.draft.k === 'fibext' && this.draft.phase === 2) { this.draft.t3 = this.tOfIdx(Math.round(this.idxOf(p.x))); this.draft.p3 = this.snapP(p.x, p.y); delete this.draft.phase; this.myDrawings().push(this.draft); this.draft = null; this.app.drawingDone(); this.dirty = true; return; }
      if (tool !== 'cursor' && p.x < this.L.plotW && p.y < this.L.mainH) {
        const t = this.tOfIdx(Math.round(this.idxOf(p.x))), pr = this.snapP(p.x, p.y);
        if (tool === 'hline') { this.myDrawings().push({ k: 'hline', t1: t, p1: pr }); this.app.drawingDone(); this.dirty = true; return; }
        if (tool === 'alert') { this.app.addAlert(this.sym, pr); this.app.setTool('cursor'); return; }
        this.draft = { k: tool, t1: t, p1: pr, t2: t, p2: pr, phase: 1 }; this.dirty = true; return;
      }
      if (p.x > this.L.plotW && p.y < this.L.mainH) { this.drag = { axis: true }; return; }
      this.drag = { x0: p.x, y0: p.y, r0: this.V.right, moved: false, touch: e.pointerType !== 'mouse', crossMode: e.pointerType !== 'mouse' && !!this.V.cross };
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pt(e); if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, p);
      if (this.pinch && this.ptrs.size >= 2) { const [a, b] = [...this.ptrs.values()]; this.zoomAt(this.pinch.cx, (this.pinch.bw * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.d); return; }
      if (this.draft) {
        const t = this.tOfIdx(Math.round(this.idxOf(p.x))), pr = this.snapP(p.x, p.y);
        if (this.draft.phase === 2) { this.draft.t3 = t; this.draft.p3 = pr; } else if (this.ptrs.size) { this.draft.t2 = t; this.draft.p2 = pr; }
        this.V.cross = p; this.dirty = true; return;
      }
      if (this.posDrag) { this.dragPos(p); return; }
      if (this.drag && this.drag.axis) return;
      if (this.drag) {
        const dx = p.x - this.drag.x0, dy = p.y - this.drag.y0; if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
        if (this.drag.crossMode) { this.V.cross = p; this.dirty = true; return; }
        if (this.drag.moved) { this.V.right = this.drag.r0 + dx / this.V.barW; this.clampView(); if (!this.drag.touch) this.V.cross = p; this.dirty = true; }
        return;
      }
      if (e.pointerType === 'mouse' && this.app.tool === 'cursor') { const h = this.hitPos(p); this.cv.style.cursor = !h ? 'crosshair' : h.h === 'move' ? 'move' : h.h === 'end' ? 'ew-resize' : 'ns-resize'; }
      if (e.pointerType === 'mouse') { this.V.cross = p.x < this.L.plotW && p.y < this.L.mainH + this.L.lowerH ? p : null; this.dirty = true; }
    });
    const end = (e) => {
      const p = this.pt(e); this.ptrs.delete(e.pointerId);
      if (this.posDrag) { this.posDrag = null; this.app.save(); return; }
      if (this.pinch) { if (this.ptrs.size < 2) this.pinch = null; this.drag = null; return; }
      if (this.draft && this.draft.phase === 1) {
        const big = Math.abs(this.xOf(this.idxOfT(this.draft.t2)) - this.xOf(this.idxOfT(this.draft.t1))) + Math.abs(this.yOf(this.draft.p2) - this.yOf(this.draft.p1)) > 6;
        if (!big) { this.draft = null; this.dirty = true; return; }
        if (this.draft.k === 'fibext') { this.draft.phase = 2; this.draft.t3 = this.draft.t2; this.draft.p3 = this.draft.p2; this.app.hint('Üçüncü noktaya (geri çekilme) dokun'); this.dirty = true; return; }
        delete this.draft.phase; this.myDrawings().push(this.draft); this.draft = null; this.app.drawingDone(); this.dirty = true; return;
      }
      if (this.drag && !this.drag.axis && !this.drag.moved && this.drag.touch) { this.V.cross = this.V.cross ? null : p; this.dirty = true; }
      this.drag = null;
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.drag) { this.V.cross = null; this.dirty = true; } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); const p = this.pt(e);
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { this.V.right += e.deltaX / this.V.barW; this.clampView(); this.dirty = true; return; }
      this.zoomAt(p.x < this.L.plotW ? p.x : this.L.plotW, this.V.barW * Math.exp(-e.deltaY * 0.0018));
    }, { passive: false });
    cv.addEventListener('dblclick', () => { this.V.barW = innerWidth < 600 ? 6 : 9; this.V.right = this.defRight(); this.dirty = true; });
  }
  cancelDraft() { this.draft = null; this.dirty = true; }
}
