// Piyasa tarayıcı: kripto (Binance) ve Borsa İstanbul (sunucu)
import { $, $$, fP, fPct, fV, esc, toast } from './util.js';
import { getJSON, BREST, binanceKlines, symDef } from './data.js';
import * as IND from './ind.js';

const STABLE = /^(USDC|FDUSD|TUSD|BUSD|USDP|DAI|EUR|AEUR|EURI|USDE|XUSD|PAXG|WBTC|WBETH|BFUSD|USD1|RLUSD)USDT$|(UP|DOWN|BULL|BEAR)USDT$/;
const st = { mkt: 'crypto', f: 'all', sort: 'qv', dir: -1, rows: { crypto: null, bist: null }, busy: {} };
let app;

export function openScreener(a) {
  app = a; $('#scrModal').classList.add('show');
  if (!st.bound) bind();
  render(); load(st.mkt);
}
function bind() {
  st.bound = true;
  $('#scrMkt').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; st.mkt = b.dataset.m; $$('#scrMkt button').forEach((x) => x.classList.toggle('on', x === b)); render(); load(st.mkt); };
  $('#scrF').onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return; st.f = b.dataset.f; $$('#scrF button').forEach((x) => x.classList.toggle('on', x === b));
    if (st.f === 'gain') { st.sort = 'ch'; st.dir = -1; } else if (st.f === 'loss') { st.sort = 'ch'; st.dir = 1; } else if (st.f === 'vol') { st.sort = 'qv'; st.dir = -1; }
    else if (st.f === 'os') { st.sort = 'rsi'; st.dir = 1; } else if (st.f === 'ob') { st.sort = 'rsi'; st.dir = -1; } else if (st.f === 'buy') { st.sort = 'sc'; st.dir = -1; } else if (st.f === 'sell') { st.sort = 'sc'; st.dir = 1; }
    render();
  };
  document.querySelector('.scrt thead').onclick = (e) => { const th = e.target.closest('th'); if (!th) return; const k = th.dataset.k; if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = k === 's' ? 1 : -1; } render(); };
  $('#scrBody').onclick = async (e) => {
    const tr = e.target.closest('tr[data-s]'); if (!tr) return;
    const s = tr.dataset.s, m = tr.dataset.m;
    try {
      let sym = s;
      if (!symDef(s)) { const sd = m === 'crypto' ? await app.addSymbol('binance', s) : await app.addSymbol('yahoo', s + '.IS', s); sym = sd.s; }
      app.setSym(sym); $('#scrModal').classList.remove('show'); app.closeSheet();
    } catch (err) { toast(err.message || 'Açılamadı', 'bad'); }
  };
}
function analyze(d) {
  if (!d || d.length < 30) return { rsi: NaN, sc: NaN };
  const cl = d.map((b) => b.c), r = IND.rsi(cl), R = IND.rating(d);
  return { rsi: r[r.length - 1], sc: R ? R.score : NaN };
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

async function load(m) {
  if (st.rows[m] || st.busy[m]) return; st.busy[m] = true;
  try {
    if (m === 'crypto') {
      const all = await getJSON(BREST.map((b) => `${b}/api/v3/ticker/24hr`), 15000);
      const rows = all.filter((t) => t.symbol.endsWith('USDT') && !STABLE.test(t.symbol) && +t.quoteVolume > 0 && +t.count > 0)
        .sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 60)
        .map((t) => ({ s: t.symbol, p: +t.lastPrice, ch: +t.priceChangePercent, qv: +t.quoteVolume, rsi: NaN, sc: NaN, m: 'crypto' }));
      st.rows.crypto = rows; render();
      let k = 0;
      await pool(rows, 6, async (r) => { try { Object.assign(r, analyze(await binanceKlines(r.s, '1G', 120))); } catch (e) {} if (++k % 6 === 0) render(); });
    } else {
      const j = await getJSON(['/api/screener?m=bist'], 30000);
      st.rows.bist = j.rows.map((x) => {
        const d = x.t.map((t, i) => ({ t, o: x.o[i] ?? x.c[i], h: x.h[i] ?? x.c[i], l: x.l[i] ?? x.c[i], c: x.c[i], v: x.v[i] || 0 })).filter((b) => b.c != null);
        const p = x.price ?? d[d.length - 1]?.c, prev = d[d.length - 2]?.c;
        return { s: x.s, p, ch: prev ? ((p - prev) / prev) * 100 : NaN, qv: d.length ? d[d.length - 1].v * d[d.length - 1].c : 0, m: 'bist', ...analyze(d) };
      });
    }
  } catch (e) {
    st.rows[m] = st.rows[m] || [];
    $('#scrNote').textContent = m === 'bist' ? 'Borsa İstanbul verisi alınamadı (sunucu fonksiyonu gerekli).' : 'Binance verisi alınamadı.';
  } finally { st.busy[m] = false; if (st.mkt === m) render(); }
}

function render() {
  const rows = st.rows[st.mkt], body = $('#scrBody');
  if (!rows) { body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--tx3);padding:24px">Taranıyor…</td></tr>`; return; }
  let r = rows.slice();
  if (st.f === 'os') r = r.filter((x) => x.rsi < 30); if (st.f === 'ob') r = r.filter((x) => x.rsi > 70);
  if (st.f === 'buy') r = r.filter((x) => x.sc >= 0.1); if (st.f === 'sell') r = r.filter((x) => x.sc <= -0.1);
  const k = st.sort, d = st.dir;
  r.sort((a, b) => { const A = a[k], B = b[k]; if (k === 's') return d * String(A).localeCompare(String(B)); const x = isFinite(A) ? A : d > 0 ? Infinity : -Infinity, y = isFinite(B) ? B : d > 0 ? Infinity : -Infinity; return d * (x - y); });
  const pill = (s) => !isFinite(s) ? '<span class="pill n">…</span>' : `<span class="pill ${s >= 0.1 ? 'b' : s <= -0.1 ? 's' : 'n'}">${IND.label(s)}</span>`;
  body.innerHTML = r.length ? r.map((x) => `<tr data-s="${esc(x.s)}" data-m="${x.m}"><td>${esc(x.s.replace(/USDT$/, ''))}${x.m === 'crypto' ? '<span style="color:var(--tx3);font-weight:500">/USDT</span>' : ''}</td><td>${fP(x.p)}</td><td class="${x.ch >= 0 ? 'up' : 'dn'}">${fPct(x.ch)}</td>
    <td class="${x.rsi < 30 ? 'up' : x.rsi > 70 ? 'dn' : ''}">${isFinite(x.rsi) ? fP(x.rsi, 1) : '…'}</td><td>${pill(x.sc)}</td><td>${fV(x.qv)}</td></tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:var(--tx3);padding:24px">${st.busy[st.mkt] ? 'Taranıyor…' : 'Bu filtreye uyan sembol yok'}</td></tr>`;
  $$('.scrt th').forEach((th) => { const n = th.textContent.replace(/[ ▲▼]+$/, ''); th.textContent = n + (th.dataset.k === st.sort ? (st.dir > 0 ? ' ▲' : ' ▼') : ''); });
  $('#scrNote').textContent = st.mkt === 'crypto'
    ? 'Binance\'te hacmi en yüksek 60 USDT paritesi · RSI ve teknik skor günlük mumlardan · satıra tıklayınca grafikte açılır.'
    : 'BIST ana hisseleri · günlük mumlar · veriler ~15 dk gecikmeli olabilir · satıra tıklayınca grafikte açılır.';
}
