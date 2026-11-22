// Piyasalar: tüm kripto pariteleri, dünya endeksleri, emtia/döviz ve hisse listeleri (Dow, Nasdaq 100, S&P 500, BIST, Şanghay)
import { $, $$, fP, fPct, fV, esc, toast } from './util.js';
import { getJSON, BREST, symDef, SYMS, net } from './data.js';

const GROUPS = [
  { k: 'crypto', t: 'Kripto', g: 'KRİPTO' },
  { k: 'indices', t: 'Endeks · Emtia · Döviz', g: 'ENDEKSLER & EMTİA' },
  { k: 'dji', t: 'Dow Jones 30', g: 'ABD HİSSELERİ' },
  { k: 'ndx', t: 'Nasdaq 100', g: 'ABD HİSSELERİ' },
  { k: 'spx', t: 'S&P 500', g: 'ABD HİSSELERİ' },
  { k: 'bist', t: 'Borsa İstanbul', g: 'BORSA İSTANBUL' },
  { k: 'sse', t: 'Şanghay SSE 50', g: 'ÇİN (ŞANGAY)' },
];
const STABLE = /^(USDC|FDUSD|TUSD|BUSD|USDP|DAI|EUR|AEUR|EURI|USDE|XUSD|PAXG|WBTC|WBETH|BFUSD|USD1|RLUSD)USDT$|(UP|DOWN|BULL|BEAR)USDT$/;
const st = { g: 'crypto', q: '', lists: null, rows: {}, quotes: {}, busy: {}, shown: 120 };
let app;

export function groupLabel(k) { return (GROUPS.find((x) => x.k === k) || {}).g || 'GLOBAL'; }
// Yahoo sembolünden uygulama içi kısa ad
export function internalSym(y) { return y.endsWith('.IS') ? y.slice(0, -3) : y.replace(/^\^/, ''); }

export async function openMarkets(a, g) {
  app = a; if (g) st.g = g;
  $('#mktModal').classList.add('show');
  if (!st.bound) bind();
  renderTabs(); render(); loadGroup(st.g);
}
function bind() {
  st.bound = true;
  $('#mktTabs').onclick = (e) => { const b = e.target.closest('[data-g]'); if (!b) return; st.g = b.dataset.g; st.shown = 120; $('#mktQ').value = ''; st.q = ''; renderTabs(); render(); loadGroup(st.g); };
  $('#mktQ').oninput = () => { st.q = $('#mktQ').value.trim().toLowerCase(); st.shown = 120; render(); };
  $('#mktBody').onclick = async (e) => {
    const more = e.target.closest('[data-more]'); if (more) { st.shown += 200; render(); return; }
    const tr = e.target.closest('tr[data-y]'); if (!tr) return;
    const star = e.target.closest('[data-star]');
    const g = tr.dataset.g, y = tr.dataset.y, s = tr.dataset.s, n = tr.dataset.n;
    try {
      let sd = symDef(s);
      if (!sd) sd = g === 'crypto' ? await app.addSymbol('binance', y) : await app.addSymbol('yahoo', y, s, { n, g: groupLabel(g) });
      if (star) { toast(`★ ${sd.s} izleme listene eklendi`, 'ok'); render(); return; }
      app.setSym(sd.s); $('#mktModal').classList.remove('show'); app.closeSheet();
    } catch (err) { toast(err.message || 'Eklenemedi', 'bad'); }
  };
}
function renderTabs() { $('#mktTabs').innerHTML = GROUPS.map((x) => `<button data-g="${x.k}" class="${x.k === st.g ? 'on' : ''}">${x.t}</button>`).join(''); }

async function lists() {
  if (!st.lists) st.lists = await getJSON(['/data/markets.json'], 15000);
  return st.lists;
}
async function loadGroup(g) {
  if (st.busy[g]) return;
  if (st.rows[g] && Date.now() - (st.rows[g].ts || 0) < 60000) return;
  st.busy[g] = true;
  try {
    if (g === 'crypto') {
      const all = await getJSON(BREST.map((b) => `${b}/api/v3/ticker/24hr`), 20000);
      const rows = all.filter((t) => t.symbol.endsWith('USDT') && !STABLE.test(t.symbol) && +t.count > 0 && +t.lastPrice > 0)
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .map((t) => ({ s: t.symbol, y: t.symbol, n: t.symbol.replace(/USDT$/, ''), p: +t.lastPrice, ch: +t.priceChangePercent, qv: +t.quoteVolume }));
      rows.ts = Date.now(); st.rows.crypto = rows; render();
    } else {
      const L = await lists(); const items = L[g] || [];
      const rows = items.map((x) => ({ ...x, p: NaN, ch: NaN })); rows.ts = Date.now(); st.rows[g] = rows; render();
      if (net.API_OK === false) return;
      const chunks = []; for (let i = 0; i < rows.length; i += 60) chunks.push(rows.slice(i, i + 60));
      let idx = 0;
      await Promise.all([0, 1].map(async () => {
        while (idx < chunks.length) {
          const c = chunks[idx++];
          try {
            const q = await getJSON([`/api/quotes?s=${encodeURIComponent(c.map((r) => r.y).join(','))}`], 30000);
            for (const r of q) { const row = c.find((x) => x.y === r.s); if (row && r.price) { row.p = r.price; row.ch = r.prev ? ((r.price - r.prev) / r.prev) * 100 : NaN; } else if (row) row.bad = true; }
          } catch (e) {}
          if (st.g === g) render();
        }
      }));
    }
  } catch (e) {
    $('#mktNote').textContent = 'Liste yüklenemedi, biraz sonra tekrar dene.';
  } finally { st.busy[g] = false; if (st.g === g) render(); }
}

function render() {
  const g = st.g, rows = st.rows[g], body = $('#mktBody');
  const crypto = g === 'crypto';
  $('#mktHead').innerHTML = `<tr><th>Sembol</th><th>Fiyat</th><th>Değ. %${crypto ? ' (24s)' : ''}</th>${crypto ? '<th>Hacim (USDT)</th>' : ''}<th></th></tr>`;
  if (!rows) { body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--tx3);padding:24px">Yükleniyor…</td></tr>`; return; }
  const q = st.q;
  let r = rows.filter((x) => !x.bad || isFinite(x.p));
  if (q) r = r.filter((x) => x.s.toLowerCase().includes(q) || (x.n || '').toLowerCase().includes(q) || (x.sec || '').toLowerCase().includes(q));
  const total = r.length; r = r.slice(0, st.shown);
  const inList = (s) => !!symDef(s);
  body.innerHTML = r.map((x) => {
    const s = crypto ? x.s : x.s;
    return `<tr data-y="${esc(x.y)}" data-s="${esc(s)}" data-n="${esc(x.n || '')}" data-g="${g}">
      <td><div>${esc(crypto ? x.n : x.s)}${crypto ? '<span class="dim">/USDT</span>' : ''}</div>${crypto ? '' : `<div class="sub">${esc(x.n || '')}${x.sec ? ' · ' + esc(x.sec) : ''}</div>`}</td>
      <td>${isFinite(x.p) ? fP(x.p) : '<span class="dim">…</span>'}</td>
      <td class="${x.ch >= 0 ? 'up' : 'dn'}">${isFinite(x.ch) ? fPct(x.ch) : ''}</td>
      ${crypto ? `<td>${fV(x.qv)}</td>` : ''}
      <td><button class="star${inList(s) ? ' on' : ''}" data-star title="İzleme listesine ekle">${inList(s) ? '★' : '☆'}</button></td></tr>`;
  }).join('') + (total > r.length ? `<tr><td colspan="5" style="text-align:center;padding:12px"><button class="closeb" data-more style="width:auto;padding:8px 16px">Daha fazla göster (${total - r.length})</button></td></tr>` : '')
    || `<tr><td colspan="5" style="text-align:center;color:var(--tx3);padding:24px">Sonuç yok</td></tr>`;
  const note = {
    crypto: `Binance'teki ${rows.length} USDT paritesi · hacme göre sıralı · canlı`,
    indices: 'Dünya endeksleri, emtia ve döviz · Yahoo Finance',
    dji: 'Dow Jones Sanayi Ortalaması\'ndaki 30 hisse', ndx: 'Nasdaq-100 endeksindeki şirketler', spx: 'S&P 500 endeksindeki tüm şirketler · sektöre göre de arayabilirsin',
    bist: 'Borsa İstanbul\'un büyük şirketleri · ~15 dk gecikmeli · listede olmayanı izleme listesi aramasından ekleyebilirsin', sse: 'Şanghay SSE 50 endeksindeki şirketler · Çin saatiyle işlem görür',
  }[g];
  $('#mktNote').textContent = (note || '') + (st.busy[g] ? ' · fiyatlar yükleniyor…' : '') + ' · Satıra tıkla: grafikte aç · ☆: izleme listesine ekle';
}

// İzleme listesi aramasında kullanılan genel arama
let sT = 0, sQ = '';
export function globalSearch(q, cb) {
  clearTimeout(sT); sQ = q;
  if (!q || q.length < 2 || net.API_OK === false) return cb([]);
  sT = setTimeout(async () => {
    try { const r = await getJSON([`/api/search?q=${encodeURIComponent(q)}`], 8000); if (sQ === q) cb(r); } catch (e) { if (sQ === q) cb([]); }
  }, 350);
}
export function exGroup(y, t) {
  if (y.endsWith('.IS')) return 'BORSA İSTANBUL';
  if (/\.(SS|SZ)$/.test(y)) return 'ÇİN (ŞANGAY)';
  if (t === 'Endeks' || t === 'Vadeli' || t === 'Döviz') return 'ENDEKSLER & EMTİA';
  if (!y.includes('.')) return 'ABD HİSSELERİ';
  return 'GLOBAL';
}
export { SYMS };
