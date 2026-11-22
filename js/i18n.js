// Çoklu dil: arayüz Türkçe yazılır, seçilen dilde ekrandaki metinler sözlükten çevrilir.
// Sözlük: /i18n/<dil>.json → { "Türkçe metin": "çeviri", "{0} gün önce": "{0} days ago", ... }
// {0},{1}… içeren anahtarlar şablondur; yerlerine gelen değerler de ayrıca çevrilmeye çalışılır.
export const LANGS = { tr: { n: 'Türkçe', f: '🇹🇷' }, en: { n: 'English', f: '🇬🇧' }, fr: { n: 'Français', f: '🇫🇷' }, hi: { n: 'हिन्दी', f: '🇮🇳' }, zh: { n: '中文', f: '🇨🇳' }, ko: { n: '한국어', f: '🇰🇷' } };
const KEY = 'tt_lang';
const ORIG = new WeakMap(), ATTR = ['placeholder', 'title', 'aria-label'];
const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşüâ]{2}/;
let lang = 'tr', dict = null, tpls = [], obs = null, busy = false;

export const getLang = () => lang;
function pickInitial() {
  try { const s = localStorage.getItem(KEY); if (s && LANGS[s]) return s; } catch (_) {}
  const n = (navigator.language || 'tr').slice(0, 2).toLowerCase();
  return LANGS[n] ? n : n === 'tr' ? 'tr' : 'en';
}
function compile(d) {
  const out = [];
  for (const [k, v] of Object.entries(d)) {
    if (!/\{\d+\}/.test(k)) continue;
    const parts = k.split(/(\{\d+\})/), idx = [];
    let re = '^';
    for (const p of parts) { const m = p.match(/^\{(\d+)\}$/); if (m) { idx.push(+m[1]); re += '([\\s\\S]+?)'; } else re += p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    const litS = k.replace(/\{\d+\}/g, ''), lit = litS.length;
    if (lit < 2 || !LETTER.test(litS)) continue; // harf içermeyen şablonlar yalnızca tf() ile kullanılır
    out.push({ re: new RegExp(re + '$'), idx, v, lit });
  }
  return out.sort((a, b) => b.lit - a.lit);
}
const WORDS = /[A-Za-zÇĞİÖŞÜçğıöşüâ\u0900-\u097F]{2,}/g;
function one(core, depth) {
  const hit = dict[core]; if (hit != null) return hit;
  // baştaki simge/emoji öneki (✓, ⚠, 🔥, ★ …) ayrı tutulur
  const pm = core.match(/^([^\p{L}\p{N}(%"«]+)(.+)$/u);
  if (pm) { const h2 = dict[pm[2]]; if (h2 != null) return pm[1] + h2; }
  if (depth < 2) for (const T of tpls) {
    const m = core.match(T.re) || (pm && pm[2].match(T.re)); if (!m) continue;
    let ok = true; for (let i = 1; i < m.length; i++) if ((m[i].match(WORDS) || []).length > 5) { ok = false; break; }
    if (!ok) continue;
    const vals = {}; T.idx.forEach((n, i) => { vals[n] = t(m[i + 1], depth + 1); });
    const out = T.v.replace(/\{(\d+)\}/g, (_, n) => (vals[n] != null ? vals[n] : ''));
    return (pm && m.input === pm[2] ? pm[1] : '') + out;
  }
  return null;
}
// tek bir metni çevir (bulunamazsa olduğu gibi döner)
export function t(s, depth = 0) {
  if (lang === 'tr' || !dict || s == null) return s;
  const str = String(s), lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0], core = str.trim();
  if (!core || !LETTER.test(core)) return s;
  let r = one(core, depth);
  if (r == null && core.includes(' · ')) { // "A · B · C" biçimindeki satırları parça parça çevir
    let any = false; const parts = core.split(' · ').map((x) => { const y = one(x.trim(), depth + 1); if (y != null) { any = true; return y; } return x; });
    if (any) r = parts.join(' · ');
  }
  return r == null ? s : lead + r + trail;
}
// şablonlu metin üret: tf('Son {0} gün', 3) → seçili dilde
export function tf(tpl, ...a) { const s = (lang !== 'tr' && dict && dict[tpl]) || tpl; return s.replace(/\{(\d+)\}/g, (_, i) => (a[i] != null ? a[i] : '')); }
function doText(n) {
  let o = ORIG.get(n);
  const cur = n.nodeValue;
  if (o == null || (cur !== o.tr && cur !== o.out)) { o = { tr: cur }; ORIG.set(n, o); } // uygulama metni değiştirdi
  const out = lang === 'tr' ? o.tr : t(o.tr);
  o.out = out; if (cur !== out) n.nodeValue = out;
}
function doAttrs(el) {
  for (const a of ATTR) {
    if (!el.hasAttribute || !el.hasAttribute(a)) continue;
    const k = 'i18n' + a, cur = el.getAttribute(a);
    let base = el[k];
    if (base == null || (cur !== base && cur !== el[k + 'o'])) base = el[k] = cur;
    const out = lang === 'tr' ? base : t(base); el[k + 'o'] = out;
    if (cur !== out) el.setAttribute(a, out);
  }
}
function walk(root) {
  if (root.nodeType === 3) { if (root.parentNode && !/^(SCRIPT|STYLE|TEXTAREA)$/.test(root.parentNode.nodeName)) doText(root); return; }
  if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|CANVAS|SVG)$/i.test(root.nodeName)) return;
  if (root.isContentEditable || root.closest?.('[data-noi18n]')) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && /^(SCRIPT|STYLE|TEXTAREA|CANVAS)$/i.test(n.nodeName)) || n.parentElement?.closest('[data-noi18n]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n; while ((n = w.nextNode())) n.nodeType === 3 ? doText(n) : doAttrs(n);
}
function observe() {
  if (obs) return;
  obs = new MutationObserver((list) => {
    if (busy) return; busy = true;
    try {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    } finally { obs.takeRecords(); busy = false; }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
}
async function load(l) {
  if (l === 'tr') { dict = null; tpls = []; return; }
  const r = await fetch(`/i18n/${l}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('dil dosyası yüklenemedi');
  dict = await r.json(); tpls = compile(dict);
}
export async function setLang(l, save = true) {
  if (!LANGS[l]) l = 'tr';
  try { await load(l); } catch (e) { console.warn(e); l = 'tr'; dict = null; tpls = []; }
  lang = l; if (save) try { localStorage.setItem(KEY, l); } catch (_) {}
  document.documentElement.lang = l;
  document.title = l === 'tr' ? 'TrendTakip — Grafik, Analiz ve Tahmin' : t('TrendTakip — Grafik, Analiz ve Tahmin');
  busy = true; try { walk(document.body); } finally { obs && obs.takeRecords(); busy = false; }
  window.dispatchEvent(new CustomEvent('langchange', { detail: l }));
}
export async function initI18n() {
  const l = pickInitial();
  observe();
  if (l !== 'tr') await setLang(l, false); else document.documentElement.lang = 'tr';
}
// sayı/tarih biçimi için yerel ayar
export const locale = () => ({ tr: 'tr-TR', en: 'en-GB', fr: 'fr-FR', hi: 'hi-IN', zh: 'zh-CN', ko: 'ko-KR' })[lang] || 'tr-TR';
export function _use(l, d) { lang = l; dict = d; tpls = compile(d); } // test/araç
