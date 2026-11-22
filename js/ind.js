// İndikatörler, teknik skor ve istatistiksel fiyat tahmini
export function sma(src, n) {
  const o = new Array(src.length).fill(NaN); let s = 0, c = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isFinite(v)) { s = 0; c = 0; continue; }
    s += v; c++;
    if (c > n) { s -= src[i - n]; c = n; }
    if (c === n) o[i] = s / n;
  }
  return o;
}
export function ema(src, n) {
  const o = new Array(src.length).fill(NaN);
  const st = src.findIndex((v) => isFinite(v));
  if (st < 0 || src.length - st < n) return o;
  let s = 0; for (let i = st; i < st + n; i++) s += src[i];
  let e = s / n; o[st + n - 1] = e; const k = 2 / (n + 1);
  for (let i = st + n; i < src.length; i++) { if (isFinite(src[i])) e = src[i] * k + e * (1 - k); o[i] = e; }
  return o;
}
export function bb(src, n = 20, m = 2) {
  const mid = sma(src, n), up = [], lo = [];
  for (let i = 0; i < src.length; i++) {
    if (!isFinite(mid[i])) { up.push(NaN); lo.push(NaN); continue; }
    let q = 0; for (let j = i - n + 1; j <= i; j++) q += (src[j] - mid[i]) ** 2;
    const sd = Math.sqrt(q / n); up.push(mid[i] + m * sd); lo.push(mid[i] - m * sd);
  }
  return { mid, up, lo };
}
export function rsi(src, n = 14) {
  const o = new Array(src.length).fill(NaN); if (src.length <= n) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = src[i] - src[i - 1]; d > 0 ? (g += d) : (l -= d); }
  g /= n; l /= n; o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < src.length; i++) {
    const d = src[i] - src[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
    o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
}
export function macd(src) {
  const a = ema(src, 12), b = ema(src, 26), m = a.map((v, i) => v - b[i]), s = ema(m, 9), h = m.map((v, i) => v - s[i]);
  return { m, s, h };
}
function hh(d, i, n) { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, d[j].h); return m; }
function ll(d, i, n) { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, d[j].l); return m; }
export function stoch(d, n = 14, ks = 3, ds = 3) {
  const raw = d.map((b, i) => { if (i < n - 1) return NaN; const H = hh(d, i, n), L = ll(d, i, n); return H === L ? 50 : ((b.c - L) / (H - L)) * 100; });
  const k = sma(raw, ks), dd = sma(k, ds);
  return { k, d: dd };
}
export function ichimoku(d) {
  const n = d.length, S = 26;
  const ten = new Array(n).fill(NaN), kij = new Array(n).fill(NaN), sa = new Array(n + S).fill(NaN), sb = new Array(n + S).fill(NaN), chi = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i >= 8) ten[i] = (hh(d, i, 9) + ll(d, i, 9)) / 2;
    if (i >= 25) kij[i] = (hh(d, i, 26) + ll(d, i, 26)) / 2;
    if (i >= 25) sa[i + S] = (ten[i] + kij[i]) / 2;
    if (i >= 51) sb[i + S] = (hh(d, i, 52) + ll(d, i, 52)) / 2;
    if (i - S >= 0) chi[i - S] = d[i].c;
  }
  return { ten, kij, sa, sb, chi };
}
export function cci(d, n = 20) {
  const tp = d.map((b) => (b.h + b.l + b.c) / 3), m = sma(tp, n);
  return tp.map((v, i) => { if (!isFinite(m[i])) return NaN; let md = 0; for (let j = i - n + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]); md /= n; return md ? (v - m[i]) / (0.015 * md) : 0; });
}
export function willr(d, n = 14) { return d.map((b, i) => { if (i < n - 1) return NaN; const H = hh(d, i, n), L = ll(d, i, n); return H === L ? -50 : ((H - b.c) / (H - L)) * -100; }); }
export function mom(src, n = 10) { return src.map((v, i) => (i >= n ? v - src[i - n] : NaN)); }
export function heikin(d) {
  const o = [];
  for (let i = 0; i < d.length; i++) {
    const b = d[i], c = (b.o + b.h + b.l + b.c) / 4, op = i ? (o[i - 1].o + o[i - 1].c) / 2 : (b.o + b.c) / 2;
    o.push({ t: b.t, o: op, c, h: Math.max(b.h, op, c), l: Math.min(b.l, op, c), v: b.v });
  }
  return o;
}
// Hacim profili: görünen aralıktaki hacmi fiyat seviyelerine dağıtır
export function volProfile(d, i0, i1, lo, hi, bins = 28) {
  const out = new Array(bins).fill(0); if (!(hi > lo)) return { bins: out, max: 0, poc: -1 };
  const bw = (hi - lo) / bins;
  for (let i = i0; i <= i1; i++) {
    const b = d[i]; if (!b) continue;
    const a = Math.max(0, Math.floor((b.l - lo) / bw)), z = Math.min(bins - 1, Math.floor((b.h - lo) / bw));
    if (z < a) continue; const share = (b.v || 0) / (z - a + 1);
    for (let k = a; k <= z; k++) out[k] += share;
  }
  let max = 0, poc = -1; out.forEach((v, k) => { if (v > max) { max = v; poc = k; } });
  return { bins: out, max, poc, bw };
}

// --- Teknik skor (hareketli ortalamalar + osilatörler) ---
export function rating(d) {
  const n = d.length; if (n < 60) return null;
  const cl = d.map((b) => b.c), last = n - 1, p = cl[last];
  const items = [];
  const add = (grp, name, val, sig) => items.push({ grp, name, val, sig });
  for (const L of [10, 20, 30, 50, 100, 200]) {
    if (n <= L) continue;
    const s = sma(cl, L)[last], e = ema(cl, L)[last];
    if (isFinite(s)) add('ma', `SMA ${L}`, s, p > s ? 1 : p < s ? -1 : 0);
    if (isFinite(e)) add('ma', `EMA ${L}`, e, p > e ? 1 : p < e ? -1 : 0);
  }
  const ic = ichimoku(d); const kj = ic.kij[last];
  if (isFinite(kj)) add('ma', 'Ichimoku Kijun', kj, p > kj ? 1 : p < kj ? -1 : 0);
  const R = rsi(cl), r = R[last], r1 = R[last - 1];
  if (isFinite(r)) add('osc', 'RSI (14)', r, r < 30 && r > r1 ? 1 : r > 70 && r < r1 ? -1 : 0);
  const st = stoch(d), k = st.k[last], dd = st.d[last];
  if (isFinite(k) && isFinite(dd)) add('osc', 'Stokastik %K', k, k < 20 && k > dd ? 1 : k > 80 && k < dd ? -1 : 0);
  const M = macd(cl);
  if (isFinite(M.m[last]) && isFinite(M.s[last])) add('osc', 'MACD (12,26)', M.m[last], M.m[last] > M.s[last] ? 1 : -1);
  const C = cci(d), c0 = C[last], c1 = C[last - 1];
  if (isFinite(c0)) add('osc', 'CCI (20)', c0, c0 < -100 && c0 > c1 ? 1 : c0 > 100 && c0 < c1 ? -1 : 0);
  const Mo = mom(cl), m0 = Mo[last], m1 = Mo[last - 1];
  if (isFinite(m0)) add('osc', 'Momentum (10)', m0, m0 > 0 && m0 > m1 ? 1 : m0 < 0 && m0 < m1 ? -1 : 0);
  const W = willr(d), w0 = W[last], w1 = W[last - 1];
  if (isFinite(w0)) add('osc', 'Williams %R', w0, w0 < -80 && w0 > w1 ? 1 : w0 > -20 && w0 < w1 ? -1 : 0);
  const grp = (g) => { const it = items.filter((x) => x.grp === g); const s = it.reduce((a, x) => a + x.sig, 0) / (it.length || 1);
    return { score: s, buy: it.filter((x) => x.sig > 0).length, sell: it.filter((x) => x.sig < 0).length, neu: it.filter((x) => !x.sig).length }; };
  const ma = grp('ma'), osc = grp('osc'), score = (ma.score + osc.score) / 2;
  return { score, label: label(score), ma: { ...ma, label: label(ma.score) }, osc: { ...osc, label: label(osc.score) }, items };
}
export function label(s) { return s >= 0.5 ? 'Güçlü Al' : s >= 0.1 ? 'Al' : s > -0.1 ? 'Nötr' : s > -0.5 ? 'Sat' : 'Güçlü Sat'; }

// --- İstatistiksel fiyat tahmini ---
// Log-getirilerin oynaklığı (EWMA + uzun dönem karışımı) ve kısa vadeli trend eğimiyle
// lognormal güven bantları üretir; geçmişte bu bantların gerçekte ne kadar tuttuğunu da ölçer.
const Z80 = 1.2816, Z50 = 0.6745;
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
export const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function slope(arr) { const n = arr.length; let sx = 0, sy = 0, sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sx += i; sy += arr[i]; sxy += i * arr[i]; sxx += i * i; } return (n * sxy - sx * sy) / (n * sxx - sx * sx || 1); }
function sd(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); }
function params(lc, r, end) { // end: son dahil indeks (lc)
  const rw = r.slice(Math.max(0, end - 300), end);
  if (rw.length < 30) return null;
  let v = sd(rw.slice(0, 30)) ** 2; for (const x of rw) v = 0.94 * v + 0.06 * x * x;
  // 1.1: tahmin parametrelerinin belirsizliği için bant genişletme (rastgele yürüyüşte ~%80 kapsama ile kalibre edildi)
  const sig = 1.1 * Math.sqrt(0.5 * v + 0.5 * sd(rw) ** 2);
  let mu = 0.5 * slope(lc.slice(Math.max(0, end - 50), end + 1));
  mu = Math.max(-0.5 * sig, Math.min(0.5 * sig, mu));
  return { sig, mu };
}
export function forecast(d, h = 24) {
  const n = d.length; if (n < 80) return null;
  const lc = d.map((b) => Math.log(b.c)), r = [];
  for (let i = 1; i < n; i++) r.push(lc[i] - lc[i - 1]);
  const P = params(lc, r, n - 1); if (!P || !(P.sig > 0)) return null;
  const { mu, sig } = P, P0 = d[n - 1].c;
  const med = [], lo80 = [], hi80 = [], lo50 = [], hi50 = [];
  for (let k = 0; k <= h; k++) {
    const m = mu * k, s = sig * Math.sqrt(k);
    med.push(P0 * Math.exp(m)); lo80.push(P0 * Math.exp(m - Z80 * s)); hi80.push(P0 * Math.exp(m + Z80 * s));
    lo50.push(P0 * Math.exp(m - Z50 * s)); hi50.push(P0 * Math.exp(m + Z50 * s));
  }
  const pUp = Phi((mu * h) / (sig * Math.sqrt(h)));
  // Geriye dönük test: aynı yöntem geçmişte uygulansaydı bant ne sıklıkla tutardı?
  let cnt = 0, hit = 0, dirN = 0, dirHit = 0;
  for (let t = n - 1 - h; t >= Math.max(80, n - 1 - h - 300); t -= 3) {
    const q = params(lc, r, t); if (!q) continue;
    const m = q.mu * h, s = q.sig * Math.sqrt(h), real = lc[t + h] - lc[t];
    cnt++; if (real >= m - Z80 * s && real <= m + Z80 * s) hit++;
    if (Math.abs(q.mu) > 1e-9) { dirN++; if (Math.sign(real) === Math.sign(q.mu)) dirHit++; }
  }
  return { h, P0, mu, sig, med, lo80, hi80, lo50, hi50, pUp, cov: cnt ? hit / cnt : NaN, dirAcc: dirN ? dirHit / dirN : NaN, samples: cnt };
}
