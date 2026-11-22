// Ortak yardımcılar
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const TF = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1G': 864e5, '1H': 6048e5 };
export const TFL = { '1m': '1dk', '5m': '5dk', '15m': '15dk', '1h': '1sa', '4h': '4sa', '1G': '1G', '1H': '1H' };
export const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const nfc = {};
export const nf = (d) => nfc[d] || (nfc[d] = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const dec = (p) => { p = Math.abs(p); return p >= 1000 ? 2 : p >= 10 ? 2 : p >= 1 ? 3 : p >= 0.1 ? 4 : 6; };
export const fP = (p, d) => (isFinite(p) ? nf(d ?? dec(p)).format(p) : '—');
export const fV = (v) => v >= 1e9 ? nf(2).format(v / 1e9) + 'B' : v >= 1e6 ? nf(2).format(v / 1e6) + 'M' : v >= 1e3 ? nf(1).format(v / 1e3) + 'K' : nf(0).format(v || 0);
export const fUSD = (v) => (v < 0 ? '-' : '') + '$' + nf(2).format(Math.abs(v));
export const fPct = (v, d = 2) => (isFinite(v) ? (v >= 0 ? '+' : '') + nf(d).format(v) + '%' : '—');
export const pad = (n) => String(n).padStart(2, '0');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gR = rng(Date.now() & 0xffffffff);
export const gauss = (r = gR) => { const u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export function toast(m, k = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + k; t.textContent = m;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

export function uid() { return (crypto.randomUUID && crypto.randomUUID()) || 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2); }
