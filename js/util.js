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
export const fPct = (v, d = 2) => { if (v == null || !isFinite(v)) return '—'; const r = Math.abs(v) < 0.5 * 10 ** -d ? 0 : v; return (r >= 0 ? '+' : '') + nf(d).format(r) + '%'; };
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

// Dinamik modal: ilk çağrıda oluşturur, gövde öğesini döndürür
export function modal(id, title, wide = true) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div'); m.className = 'modal' + (wide ? ' wide' : ''); m.id = id;
    m.innerHTML = '<div class="mbox"><h3><span class="mt"></span><button data-close>×</button></h3><div class="mb"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('show'); });
  }
  m.querySelector('.mt').innerHTML = title; m.classList.add('show');
  return m.querySelector('.mb');
}
export const dstr = (t) => { const x = new Date(t); return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`; };
export const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 3600 ? `${Math.max(1, Math.round(s / 60))} dk önce` : s < 86400 ? `${Math.round(s / 3600)} sa önce` : `${Math.round(s / 86400)} gün önce`; };
