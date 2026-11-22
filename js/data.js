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
  { s: 'NASDAQ', n: 'Nasdaq Composite', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: '^IXIC', p: 20000, v: 0.006 },
  { s: 'SPX', n: 'S&P 500', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: '^GSPC', p: 6500, v: 0.005 },
  { s: 'DJI', n: 'Dow Jones Sanayi', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: '^DJI', p: 45000, v: 0.005 },
  { s: 'XU100', n: 'BIST 100', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: 'XU100.IS', p: 10482, v: 0.0075 },
  { s: 'SSEC', n: 'Şanghay Bileşik', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: '000001.SS', p: 3400, v: 0.006 },
  { s: 'THYAO', n: 'Türk Hava Yolları', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'THYAO.IS', p: 312.5, v: 0.011 },
  { s: 'ASELS', n: 'Aselsan', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'ASELS.IS', p: 148.9, v: 0.012 },
  { s: 'BIMAS', n: 'BİM Mağazalar', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'BIMAS.IS', p: 542, v: 0.009 },
  { s: 'GARAN', n: 'Garanti BBVA', g: 'BORSA İSTANBUL', src: 'yahoo', y: 'GARAN.IS', p: 130, v: 0.012 },
  // Türkiye altın fiyatları: has (saf) altın değeri, ons fiyatı ve kurdan hesaplanır. Kuyumcu işçilik/makas farkı dahil değildir.
  { s: 'GRAMALTIN', n: 'Gram Altın (24 ayar, has)', g: 'ALTIN & GÜMÜŞ (TL)', src: 'derived', legs: [{ src: 'binance', s: 'PAXGUSDT' }, { src: 'binance', s: 'USDTTRY' }], k: 1 / 31.1035, p: 5700, v: 0.005 },
  { s: 'GRAM22', n: '22 Ayar Bilezik (gram, has değeri)', g: 'ALTIN & GÜMÜŞ (TL)', src: 'derived', legs: [{ src: 'binance', s: 'PAXGUSDT' }, { src: 'binance', s: 'USDTTRY' }], k: 0.9166 / 31.1035, p: 5200, v: 0.005 },
  { s: 'CEYREK', n: 'Çeyrek Altın (has değeri)', g: 'ALTIN & GÜMÜŞ (TL)', src: 'derived', legs: [{ src: 'binance', s: 'PAXGUSDT' }, { src: 'binance', s: 'USDTTRY' }], k: 1.6075 / 31.1035, p: 9200, v: 0.005 },
  { s: 'YARIM', n: 'Yarım Altın (has değeri)', g: 'ALTIN & GÜMÜŞ (TL)', src: 'derived', legs: [{ src: 'binance', s: 'PAXGUSDT' }, { src: 'binance', s: 'USDTTRY' }], k: 3.215 / 31.1035, p: 18400, v: 0.005 },
  { s: 'TAM', n: 'Tam Altın (has değeri)', g: 'ALTIN & GÜMÜŞ (TL)', src: 'derived', legs: [{ src: 'binance', s: 'PAXGUSDT' }, { src: 'binance', s: 'USDTTRY' }], k: 6.43 / 31.1035, p: 36800, v: 0.005 },
  { s: 'CUMHURIYET', n: 'Cumhuriyet Altını (has değeri)', g: 'ALTIN & GÜMÜŞ (TL)', src: 'derived', legs: [{ src: 'binance', s: 'PAXGUSDT' }, { src: 'binance', s: 'USDTTRY' }], k: 6.615 / 31.1035, p: 37800, v: 0.005 },
  { s: 'GRAMGUMUS', n: 'Gram Gümüş (has)', g: 'ALTIN & GÜMÜŞ (TL)', src: 'derived', legs: [{ src: 'yahoo', s: 'SI=F' }, { src: 'yahoo', s: 'USDTRY=X' }], k: 1 / 31.1035, p: 65, v: 0.01 },
  { s: 'XAUUSD', n: 'Ons Altın', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: 'GC=F', p: 2684, v: 0.0055 },
  { s: 'USDTRY', n: 'Dolar / TL', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: 'USDTRY=X', p: 41.92, v: 0.0018 },
  { s: 'EURTRY', n: 'Euro / TL', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: 'EURTRY=X', p: 48.5, v: 0.002 },
  { s: 'EURUSD', n: 'Euro / Dolar', g: 'ENDEKSLER & EMTİA', src: 'yahoo', y: 'EURUSD=X', p: 1.0842, v: 0.0025 },
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

// ---------- türetilmiş semboller (ör. gram altın = ons × kur / 31,1035) ----------
export const legKey = (L) => (L.src === 'binance' ? L.s : 'y:' + L.s);
export function derivedLegs(src) {
  const out = new Map();
  for (const sd of SYMS) if (sd.src === 'derived') for (const L of sd.legs) if (L.src === src) out.set(L.s, L);
  return [...out.values()];
}
export function computeDerived() {
  for (const sd of SYMS) {
    if (sd.src !== 'derived') continue;
    const a = live[legKey(sd.legs[0])], b = live[legKey(sd.legs[1])], l = live[sd.s];
    if (!l || !a || !b || !a.p || !b.p || a.mode === 'wait' || b.mode === 'wait') continue;
    l.prev = l.p; l.p = a.p * b.p * sd.k; l.o24 = a.o24 * b.o24 * sd.k; l.mode = sd.legs[0].src === 'binance' ? 'live' : 'delayed';
  }
}
function combine(A, B, k) {
  const out = []; let j = 0;
  for (const a of A) {
    while (j + 1 < B.length && B[j + 1].t <= a.t) j++;
    const b = B[j]; if (!b || b.t > a.t + 864e5 * 3) continue;
    const o = a.o * b.o * k, c = a.c * b.c * k;
    out.push({ t: a.t, o, c, h: Math.max(a.h * b.h * k, o, c), l: Math.min(a.l * b.l * k, o, c), v: a.v || 0 });
  }
  return out;
}
export async function derivedKlines(sd, tf) {
  const get = (L) => (L.src === 'binance' ? binanceKlines(L.s, tf) : yahooRaw(L.s, tf));
  const [A, B] = await Promise.all(sd.legs.map(get));
  return combine(A, B, sd.k);
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
function binanceSet() {
  const set = new Set(SYMS.filter((x) => x.src === 'binance').map((x) => x.s));
  for (const L of derivedLegs('binance')) { set.add(L.s); if (!live[L.s]) live[L.s] = { p: 0, o24: 0, prev: 0, mode: 'wait', leg: true }; }
  return [...set];
}
export async function binanceTickers() {
  const all = binanceSet(); if (!all.length) return;
  try {
    const j = await getJSON(BREST.map((b) => `${b}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(all))}`));
    for (const t of j) { const l = live[t.symbol]; if (!l) continue; l.prev = l.p; l.p = +t.lastPrice; l.o24 = +t.openPrice; l.mode = 'live'; }
    computeDerived();
  } catch (e) { SYMS.filter((x) => x.src === 'binance' || (x.src === 'derived' && x.legs[0].src === 'binance')).forEach((x) => simify(x.s)); }
  openTickerWS();
}
let tws = null, twsHost = 0, twsKey = '';
export function openTickerWS() {
  const bs = binanceSet().filter((s) => live[s] && live[s].mode === 'live').map((s) => ({ s }));
  const key = bs.map((x) => x.s).join(',');
  if (tws && key === twsKey && tws.readyState <= 1) return;
  try { tws && ((tws.onclose = null), tws.close()); } catch (e) {}
  twsKey = key; if (!bs.length) return;
  const url = `${BWS[twsHost % BWS.length]}/stream?streams=${bs.map((x) => x.s.toLowerCase() + '@miniTicker').join('/')}`;
  try { tws = new WebSocket(url); } catch (e) { return; }
  tws.onmessage = (ev) => {
    const m = JSON.parse(ev.data).data; if (!m) return; const l = live[m.s]; if (!l) return;
    l.prev = l.p; l.p = +m.c; l.o24 = +m.o; if (l.leg || derivedLegs('binance').some((L) => L.s === m.s)) computeDerived(); hooks.onLive(m.s);
  };
  tws.onclose = () => { twsHost++; twsKey = ''; setTimeout(openTickerWS, 3000); };
}

export const YINT = { '1m': ['1m', '5d'], '5m': ['5m', '1mo'], '15m': ['15m', '1mo'], '1h': ['60m', '1y'], '4h': ['60m', '2y'], '1G': ['1d', '10y'], '1H': ['1wk', 'max'] };
async function hourlyFallback(y, tf) { // günlük geçmişi olmayan semboller için saatlikten üret
  const j = await getJSON([`/api/yahoo?s=${encodeURIComponent(y)}&i=60m&r=2y`], 20000), d = [];
  for (let k = 0; k < j.t.length; k++) { const c = j.c[k]; if (c == null) continue; d.push({ t: j.t[k], o: j.o[k] ?? c, h: j.h[k] ?? c, l: j.l[k] ?? c, c, v: j.v[k] || 0 }); }
  const out = resample(d, TF['1G']);
  return { j, d: tf === '1H' ? resample(out.map((b) => ({ ...b, t: b.t - ((new Date(b.t).getUTCDay() + 6) % 7) * 864e5 })), 6048e5) : out };
}
export async function yahooRaw(y, tf) {
  const [i, r] = YINT[tf];
  const j = await getJSON([`/api/yahoo?s=${encodeURIComponent(y)}&i=${i}&r=${r}`], 15000);
  if ((tf === '1G' || tf === '1H') && j.t.length < 30) return (await hourlyFallback(y, tf)).d;
  const d = [];
  for (let k = 0; k < j.t.length; k++) {
    const c = j.c[k]; if (c == null) continue;
    const o = j.o[k] ?? c, h = j.h[k] ?? Math.max(o, c), l = j.l[k] ?? Math.min(o, c);
    d.push({ t: j.t[k], o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: j.v[k] || 0 });
  }
  return tf === '4h' ? resample(d, TF['4h']) : d;
}
export async function yahooKlines(sd, tf) {
  const [i, r] = YINT[tf];
  const j = await getJSON([`/api/yahoo?s=${encodeURIComponent(sd.y)}&i=${i}&r=${r}`], 15000);
  if ((tf === '1G' || tf === '1H') && j.t.length < 30) { const f = await hourlyFallback(sd.y, tf); if (j.price) { const l = live[sd.s]; l.prev = l.p; l.p = j.price; if (j.prev) l.o24 = j.prev; } return f.d; }
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
  const ys = SYMS.filter((x) => x.src === 'yahoo'), legs = derivedLegs('yahoo');
  if ((!ys.length && !legs.length) || net.API_OK === false) return;
  const all = [...new Set([...ys.map((x) => x.y), ...legs.map((L) => L.s)])];
  try {
    for (let i = 0; i < all.length; i += 60) {
      const j = await getJSON([`/api/quotes?s=${encodeURIComponent(all.slice(i, i + 60).join(','))}`], 20000);
      net.API_OK = true;
      for (const q of j) {
        if (!q.price) continue;
        for (const sd of ys.filter((x) => x.y === q.s)) { const l = live[sd.s]; l.prev = l.p; l.p = q.price; l.o24 = q.prev || q.price; l.mode = 'delayed'; }
        if (legs.some((L) => L.s === q.s)) live['y:' + q.s] = { p: q.price, o24: q.prev || q.price, prev: q.price, mode: 'delayed', leg: true };
      }
    }
    computeDerived();
  } catch (e) {
    if (net.API_OK === null) { net.API_OK = false; ys.forEach((x) => simify(x.s)); SYMS.filter((x) => x.src === 'derived' && x.legs[0].src === 'yahoo').forEach((x) => simify(x.s)); onFail && onFail(); }
  }
}
