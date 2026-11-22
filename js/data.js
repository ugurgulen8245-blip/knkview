// Veri katmanı: semboller, canlı fiyatlar, Binance (doğrudan), Yahoo (sunucu üzerinden), simülasyon
import { TF, hash, rng, gauss, clamp } from './util.js';

export const BASE = [
  { s: 'BTCUSDT', n: 'Bitcoin', g: 'KRİPTO', src: 'binance', p: 96420, v: 0.011 },
  { s: 'ETHUSDT', n: 'Ethereum', g: 'KRİPTO', src: 'binance', p: 3385, v: 0.015 },
  { s: 'SOLUSDT', n: 'Solana', g: 'KRİPTO', src: 'binance', p: 184.6, v: 0.021 },
  { s: 'BNBUSDT', n: 'BNB', g: 'KRİPTO', src: 'binance', p: 648.2, v: 0.012 },
  { s: 'XRPUSDT', n: 'XRP', g: 'KRİPTO', src: 'binance', p: 2.214, v: 0.019 },
  { s: 'DOGEUSDT', n: 'Dogecoin', g: 'KRİPTO', src: 'binance', p: 0.38, v: 0.024 },
  { s: 'AVAXUSDT', n: 'Avalanche', g: 'KRİPTO', src: 'binance', p: 36.42, v: 0.024 },
  { s: 'XU100', n: 'BIST 100', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'XU100.IS', p: 10482, v: 0.0075 },
  { s: 'THYAO', n: 'Türk Hava Yolları', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'THYAO.IS', p: 312.5, v: 0.011 },
  { s: 'ASELS', n: 'Aselsan', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'ASELS.IS', p: 148.9, v: 0.012 },
  { s: 'BIMAS', n: 'BİM Mağazalar', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'BIMAS.IS', p: 542, v: 0.009 },
  { s: 'GARAN', n: 'Garanti BBVA', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'GARAN.IS', p: 130, v: 0.012 },
  { s: 'XAUUSD', n: 'Ons Altın', g: 'EMTİA & DÖVİZ', src: 'yahoo', y: 'GC=F', p: 2684, v: 0.0055 },
  { s: 'USDTRY', n: 'Dolar / TL', g: 'EMTİA & DÖVİZ', src: 'yahoo', y: 'USDTRY=X', p: 41.92, v: 0.0018 },
  { s: 'EURTRY', n: 'Euro / TL', g: 'EMTİA & DÖVİZ', src: 'yahoo', y: 'EURTRY=X', p: 48.5, v: 0.002 },
  { s: 'EURUSD', n: 'Euro / Dolar', g: 'EMTİA & DÖVİZ', src: 'yahoo', y: 'EURUSD=X', p: 1.0842, v: 0.0025 },
];

export const SYMS = [];
export const live = {};
export const net = { API_OK: null };
export const hooks = { customBase: () => null, onLive: () => {} };
export const symDef = (s) => SYMS.find((x) => x.s === s);

export function initLive() {
  for (const sd of SYMS) {
    if (live[sd.s]) continue;
    if (sd.custom) {
      const b = hooks.customBase(sd.s); if (!b || !b.d.length) continue;
      const last = b.d[b.d.length - 1]; let o24 = b.d[0].c;
      for (let i = b.d.length - 1; i >= 0; i--) if (b.d[i].t <= last.t - 864e5) { o24 = b.d[i].c; break; }
      live[sd.s] = { p: last.c, o24, prev: last.c, mode: 'csv' };
    } else {
      const p = sd.p || 100; live[sd.s] = { p, o24: p, prev: p, mode: 'wait' };
    }
  }
}

// ---------- simülasyon (yedek) ----------
export function gen(sd, tf, n = 900) {
  const ms = TF[tf], r = rng(hash(sd.s + tf)), g = () => gauss(r);
  const sig = (sd.v || 0.015) * Math.sqrt(ms / 36e5); let x = 1, vm = 1, drift = 0; const out = [];
  const end = Math.floor(Date.now() / ms) * ms;
  for (let i = 0; i < n; i++) {
    if (i % 70 === 0) drift = (r() - 0.5) * 0.32 * sig;
    vm = clamp(Math.exp(0.93 * Math.log(vm) + 0.2 * g()), 0.35, 3.2);
    const o = x; let h = o, l = o; const st = (sig * vm) / Math.sqrt(8);
    for (let k = 0; k < 8; k++) { x *= Math.exp(g() * st + drift / 8); if (x > h) h = x; if (x < l) l = x; }
    const ret = Math.abs(Math.log(x / o)) / sig;
    out.push({ t: end - (n - 1 - i) * ms, o, h, l, c: x, v: (0.35 + r()) * (1 + 1.4 * ret) * vm * (ms / 36e5) * (1e6 / (sd.p || 100)) });
  }
  const f = live[sd.s].p / x;
  for (const b of out) { b.o *= f; b.h *= f; b.l *= f; b.c *= f; }
  return out;
}
export function simify(s) {
  const sd = symDef(s), l = live[s]; if (!sd || !l || l.mode === 'sim') return;
  l.mode = 'sim'; if (!sd.p) sd.p = l.p;
  const d = gen(sd, '1h', 60); l.o24 = d[d.length - 25].c;
}
export function resample(base, ms) {
  if (!base.length) return [];
  const out = []; let cur = null;
  for (const b of base) {
    const t = Math.floor(b.t / ms) * ms;
    if (!cur || cur.t !== t) { cur = { t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; out.push(cur); }
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0; }
  }
  return out;
}

// ---------- ağ ----------
export const BINT = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1G': '1d', '1H': '1w' };
export const BREST = ['https://data-api.binance.vision', 'https://api.binance.com'];
export const BWS = ['wss://stream.binance.com:9443', 'wss://data-stream.binance.vision'];
export async function getJSON(urls, timeout = 9000) {
  let last;
  for (const u of urls) {
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), timeout);
      const r = await fetch(u, { signal: c.signal, cache: 'no-store' }); clearTimeout(t);
      if (r.ok) return await r.json(); last = new Error('HTTP ' + r.status);
    } catch (e) { last = e; }
  }
  throw last || new Error('ağ hatası');
}
export async function binanceKlines(sym, tf, limit = 1000) {
  const j = await getJSON(BREST.map((b) => `${b}/api/v3/klines?symbol=${sym}&interval=${BINT[tf]}&limit=${limit}`));
  return j.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
}
export async function binanceTickers() {
  const bs = SYMS.filter((x) => x.src === 'binance'); if (!bs.length) return;
  try {
    const j = await getJSON(BREST.map((b) => `${b}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(bs.map((x) => x.s)))}`));
    for (const t of j) { const l = live[t.symbol]; if (!l) continue; l.prev = l.p; l.p = +t.lastPrice; l.o24 = +t.openPrice; l.mode = 'live'; }
  } catch (e) { bs.forEach((x) => simify(x.s)); }
  openTickerWS();
}
let tws = null, twsHost = 0, twsKey = '';
export function openTickerWS() {
  const bs = SYMS.filter((x) => x.src === 'binance' && live[x.s] && live[x.s].mode === 'live');
  const key = bs.map((x) => x.s).join(',');
  if (tws && key === twsKey && tws.readyState <= 1) return;
  try { tws && ((tws.onclose = null), tws.close()); } catch (e) {}
  twsKey = key; if (!bs.length) return;
  const url = `${BWS[twsHost % BWS.length]}/stream?streams=${bs.map((x) => x.s.toLowerCase() + '@miniTicker').join('/')}`;
  try { tws = new WebSocket(url); } catch (e) { return; }
  tws.onmessage = (ev) => {
    const m = JSON.parse(ev.data).data; if (!m) return; const l = live[m.s]; if (!l) return;
    l.prev = l.p; l.p = +m.c; l.o24 = +m.o; hooks.onLive(m.s);
  };
  tws.onclose = () => { twsHost++; twsKey = ''; setTimeout(openTickerWS, 3000); };
}

export const YINT = { '1m': ['1m', '5d'], '5m': ['5m', '1mo'], '15m': ['15m', '1mo'], '1h': ['60m', '1y'], '4h': ['60m', '2y'], '1G': ['1d', '10y'], '1H': ['1wk', 'max'] };
export async function yahooKlines(sd, tf) {
  const [i, r] = YINT[tf];
  const j = await getJSON([`/api/yahoo?s=${encodeURIComponent(sd.y)}&i=${i}&r=${r}`], 15000);
  const d = [];
  for (let k = 0; k < j.t.length; k++) {
    const c = j.c[k]; if (c == null) continue;
    const o = j.o[k] ?? c, h = j.h[k] ?? Math.max(o, c), l = j.l[k] ?? Math.min(o, c);
    d.push({ t: j.t[k], o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: j.v[k] || 0 });
  }
  if (j.price) { const l = live[sd.s]; l.prev = l.p; l.p = j.price; if (j.prev) l.o24 = j.prev; }
  return tf === '4h' ? resample(d, TF['4h']) : d;
}
export async function yahooQuotes(onFail) {
  const ys = SYMS.filter((x) => x.src === 'yahoo'); if (!ys.length || net.API_OK === false) return;
  try {
    const j = await getJSON([`/api/quotes?s=${encodeURIComponent(ys.map((x) => x.y).join(','))}`], 15000);
    net.API_OK = true;
    for (const q of j) {
      const sd = ys.find((x) => x.y === q.s); if (!sd || !q.price) continue;
      const l = live[sd.s]; l.prev = l.p; l.p = q.price; l.o24 = q.prev || q.price; l.mode = 'delayed';
    }
  } catch (e) {
    if (net.API_OK === null) { net.API_OK = false; ys.forEach((x) => simify(x.s)); onFail && onFail(); }
  }
}
