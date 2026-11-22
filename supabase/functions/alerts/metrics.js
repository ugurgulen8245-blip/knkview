// Sunucu ve tarayıcıda ortak kullanılan ölçümler (günlük ya da herhangi bir zaman dilimi mumları)
export function sma(a, n) { const o = new Array(a.length).fill(NaN); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
export function ema(a, n) { const o = new Array(a.length).fill(NaN); if (a.length < n) return o; let s = 0; for (let i = 0; i < n; i++) s += a[i]; let e = s / n; o[n - 1] = e; const k = 2 / (n + 1); for (let i = n; i < a.length; i++) { e = a[i] * k + e * (1 - k); o[i] = e; } return o; }
export function rsi(a, n = 14) {
  const o = new Array(a.length).fill(NaN); if (a.length <= n) return o; let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = a[i] - a[i - 1]; d > 0 ? (g += d) : (l -= d); } g /= n; l /= n; o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < a.length; i++) { const d = a[i] - a[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  return o;
}
const last = (a) => a[a.length - 1];

// d: [{t,o,h,l,c,v}] eskiden yeniye
export function metrics(d) {
  const n = d.length; if (n < 30) return null;
  const c = d.map((b) => b.c), h = d.map((b) => b.h), l = d.map((b) => b.l), v = d.map((b) => b.v || 0), p = c[n - 1];
  const ch = (k) => (n > k && c[n - 1 - k] ? (p / c[n - 1 - k] - 1) * 100 : NaN);
  const R = rsi(c, 14), e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200), e12 = ema(c, 12), e26 = ema(c, 26);
  const mac = e12.map((x, i) => x - e26[i]), sig = ema(mac.map((x) => (isFinite(x) ? x : 0)).slice(25), 9), macdNow = last(mac), sigNow = last(sig);
  // hacim
  let vs = 0, vc = 0; for (let i = Math.max(0, n - 21); i < n - 1; i++) { vs += v[i]; vc++; }
  const v20 = vc ? vs / vc : 0, volR = v20 > 0 ? v[n - 1] / v20 : NaN;
  let v5 = 0; for (let i = Math.max(0, n - 5); i < n; i++) v5 += v[i]; const volR5 = v20 > 0 ? v5 / 5 / v20 : NaN;
  // Chaikin para akışı (20)
  let mfv = 0, vsum = 0; for (let i = Math.max(0, n - 20); i < n; i++) { const r = h[i] - l[i]; mfv += r > 0 ? (((c[i] - l[i]) - (h[i] - c[i])) / r) * v[i] : 0; vsum += v[i]; }
  const cmf = vsum > 0 ? mfv / vsum : NaN;
  // para akışı endeksi (14)
  let pf = 0, nf = 0; for (let i = Math.max(1, n - 14); i < n; i++) { const tp = (h[i] + l[i] + c[i]) / 3, tp0 = (h[i - 1] + l[i - 1] + c[i - 1]) / 3, raw = tp * v[i]; if (tp > tp0) pf += raw; else if (tp < tp0) nf += raw; }
  const mfi = pf + nf > 0 ? 100 - 100 / (1 + pf / (nf || 1e-9)) : NaN;
  // OBV eğimi (son 20 mum, ortalama hacme göre)
  const obv = [0]; for (let i = 1; i < n; i++) obv.push(obv[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0));
  const k = Math.min(20, n - 1), ob = obv.slice(-k); let sx = 0, sy = 0, sxy = 0, sxx = 0; ob.forEach((y, i) => { sx += i; sy += y; sxy += i * y; sxx += i * i; });
  const obvSlope = v20 > 0 ? (k * sxy - sx * sy) / (k * sxx - sx * sx || 1) / v20 : NaN;
  // 52 hafta
  const w = Math.min(n, 252); let hi = -Infinity, lo = Infinity; for (let i = n - w; i < n; i++) { hi = Math.max(hi, h[i]); lo = Math.min(lo, l[i]); }
  // ATR
  let at = 0; for (let i = Math.max(1, n - 14); i < n; i++) at += Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])); at /= Math.min(14, n - 1);
  // teknik skor (hareketli ortalamalar + osilatörler)
  const sg = []; for (const L of [10, 20, 50, 100, 200]) { if (n <= L) continue; const s = last(sma(c, L)), e = last(ema(c, L)); sg.push(Math.sign(p - s), Math.sign(p - e)); }
  const ma = sg.length ? sg.reduce((a, b) => a + b, 0) / sg.length : 0;
  const r0 = R[n - 1], r1 = R[n - 2], os = [];
  if (isFinite(r0)) os.push(r0 < 30 && r0 > r1 ? 1 : r0 > 70 && r0 < r1 ? -1 : 0);
  if (isFinite(macdNow) && isFinite(sigNow)) os.push(macdNow > sigNow ? 1 : -1);
  const mo = ch(10); if (isFinite(mo)) os.push(mo > 0 && ch(1) > 0 ? 1 : mo < 0 && ch(1) < 0 ? -1 : 0);
  const osc = os.length ? os.reduce((a, b) => a + b, 0) / os.length : 0;
  return {
    p, ch1: ch(1), ch5: ch(5), ch21: ch(21), ch63: ch(63), ch252: ch(252), rsi: r0,
    e20: last(e20), e50: last(e50), e200: last(e200), aboveE50: isFinite(last(e50)) ? p > last(e50) : null, aboveE200: isFinite(last(e200)) ? p > last(e200) : null,
    macdUp: isFinite(macdNow) && isFinite(sigNow) ? macdNow > sigNow : null, volR, volR5, cmf, mfi, obvSlope, hi52: hi, lo52: lo, dHi: (p / hi - 1) * 100, dLo: (p / lo - 1) * 100,
    atrPct: (at / p) * 100, score: (ma + osc) / 2, bars: n,
  };
}

// "Büyük oyuncu" izleri: fiyat-hacim verisinden tahmini sinyaller (gerçek kurum verisi değildir)
const tr = (x, d = 1) => x.toFixed(d).replace('.', ',');
export function flowFlags(m) {
  const f = [];
  if (!m) return f;
  if (m.volR >= 3) f.push({ k: 'vol3', t: `Hacim ortalamanın ${tr(m.volR, 1)} katı`, w: 3 });
  else if (m.volR >= 2) f.push({ k: 'vol2', t: `Hacim ortalamanın ${tr(m.volR, 1)} katı`, w: 2 });
  if (m.volR5 >= 1.8) f.push({ k: 'vol5', t: `Son 5 gün hacmi ortalamanın ${tr(m.volR5, 1)} katı`, w: 1 });
  if (m.cmf >= 0.15) f.push({ k: 'in', t: `Güçlü para girişi (CMF ${tr(m.cmf, 2)})`, w: 2 });
  else if (m.cmf <= -0.15) f.push({ k: 'out', t: `Güçlü para çıkışı (CMF ${tr(m.cmf, 2)})`, w: -2 });
  if (m.obvSlope > 0.15 && m.ch5 < 1) f.push({ k: 'accum', t: 'Fiyat yatayken hacim alım yönlü birikiyor (OBV yükseliyor)', w: 2 });
  if (m.obvSlope < -0.15 && m.ch5 > -1) f.push({ k: 'distr', t: 'Fiyat yatayken hacim satış yönlü (OBV düşüyor)', w: -2 });
  if (m.mfi >= 80) f.push({ k: 'mfiH', t: `Para akışı aşırı alımda (MFI ${tr(m.mfi, 0)})`, w: 0 });
  if (m.mfi <= 20) f.push({ k: 'mfiL', t: `Para akışı aşırı satımda (MFI ${tr(m.mfi, 0)})`, w: 0 });
  return f;
}
