// Strateji testi: geçmiş mumlarda kural tabanlı al/sat simülasyonu (sadece long)
import { $, $$, fP, fPct, fUSD, esc, toast, TFL } from './util.js';
import * as IND from './ind.js';

export const STRATS = {
  rsi: { t: 'RSI dönüşü', d: 'RSI alt seviyenin altından yukarı dönünce al, üst seviyeyi aşıp geri dönünce sat.', p: { n: 14, lo: 30, hi: 70 }, l: { n: 'RSI periyodu', lo: 'Al seviyesi', hi: 'Sat seviyesi' } },
  ma: { t: 'Ortalama kesişimi', d: 'Hızlı ortalama yavaşı yukarı kesince al, aşağı kesince sat.', p: { f: 20, s: 50 }, l: { f: 'Hızlı EMA', s: 'Yavaş EMA' } },
  macd: { t: 'MACD kesişimi', d: 'MACD sinyal çizgisini yukarı kesince al, aşağı kesince sat.', p: {}, l: {} },
  bb: { t: 'Bollinger dönüşü', d: 'Fiyat alt bandın altına inince al, orta banda dönünce sat.', p: { n: 20, k: 2 }, l: { n: 'Periyot', k: 'Std. sapma' } },
  brk: { t: 'Kırılım (Turtle)', d: 'Fiyat son N mumun zirvesini kırınca al, son N/2 mumun dibini kırınca sat.', p: { n: 20 }, l: { n: 'Kırılım periyodu' } },
};

export function backtest(d, key, P, opt) {
  const n = d.length, cl = d.map((b) => b.c), en = new Array(n).fill(false), ex = new Array(n).fill(false);
  let warm = 2;
  if (key === 'rsi') { const r = IND.rsi(cl, P.n); warm = P.n + 1; for (let i = 1; i < n; i++) { en[i] = r[i - 1] < P.lo && r[i] >= P.lo; ex[i] = r[i - 1] > P.hi && r[i] <= P.hi; } }
  if (key === 'ma') { const f = IND.ema(cl, P.f), s = IND.ema(cl, P.s); warm = P.s; for (let i = 1; i < n; i++) { en[i] = f[i - 1] <= s[i - 1] && f[i] > s[i]; ex[i] = f[i - 1] >= s[i - 1] && f[i] < s[i]; } }
  if (key === 'macd') { const M = IND.macd(cl); warm = 35; for (let i = 1; i < n; i++) { en[i] = M.m[i - 1] <= M.s[i - 1] && M.m[i] > M.s[i]; ex[i] = M.m[i - 1] >= M.s[i - 1] && M.m[i] < M.s[i]; } }
  if (key === 'bb') { const B = IND.bb(cl, P.n, P.k); warm = P.n; for (let i = 0; i < n; i++) { en[i] = cl[i] < B.lo[i]; ex[i] = cl[i] > B.mid[i]; } }
  if (key === 'brk') {
    const N = Math.max(2, P.n | 0), M = Math.max(2, (N / 2) | 0); warm = N + 1;
    for (let i = N; i < n; i++) { let hh = -Infinity, ll = Infinity; for (let j = i - N; j < i; j++) hh = Math.max(hh, d[j].h); for (let j = i - M; j < i; j++) ll = Math.min(ll, d[j].l); en[i] = cl[i] > hh; ex[i] = cl[i] < ll; }
  }
  const fee = (opt.fee || 0) / 100, sl = (opt.sl || 0) / 100, tp = (opt.tp || 0) / 100;
  const trades = [], eq = new Array(n).fill(1); let cash = 1, pos = null;
  for (let i = warm; i < n; i++) {
    const b = d[i];
    if (pos) { // aynı mum içinde stop / hedef
      let out = null;
      if (sl && b.l <= pos.p * (1 - sl)) out = Math.min(b.o, pos.p * (1 - sl)), pos.why = 'stop';
      else if (tp && b.h >= pos.p * (1 + tp)) out = Math.max(b.o, pos.p * (1 + tp)), pos.why = 'hedef';
      if (out != null) { cash = pos.units * out * (1 - fee); trades.push({ i0: pos.i, i1: i, p0: pos.p, p1: out, r: cash / pos.cash0 - 1, why: pos.why }); pos = null; }
    }
    if (i < n - 1) {
      if (!pos && en[i]) { const p = d[i + 1].o; pos = { i: i + 1, p, units: (cash * (1 - fee)) / p, cash0: cash }; }
      else if (pos && ex[i] && i + 1 > pos.i) { const p = d[i + 1].o; cash = pos.units * p * (1 - fee); trades.push({ i0: pos.i, i1: i + 1, p0: pos.p, p1: p, r: cash / pos.cash0 - 1, why: 'sinyal' }); pos = null; }
    }
    eq[i] = pos ? pos.units * b.c : cash;
  }
  for (let i = 0; i < warm && i < n; i++) eq[i] = 1;
  let open = null; if (pos) open = { i0: pos.i, p0: pos.p, r: (pos.units * cl[n - 1] * (1 - fee)) / pos.cash0 - 1 };
  const fin = eq[n - 1], bh = cl[n - 1] / cl[Math.min(warm, n - 1)];
  let peak = 1, mdd = 0; for (let i = warm; i < n; i++) { peak = Math.max(peak, eq[i]); mdd = Math.min(mdd, eq[i] / peak - 1); }
  let bpk = cl[warm] || cl[0], bmdd = 0; for (let i = warm; i < n; i++) { bpk = Math.max(bpk, cl[i]); bmdd = Math.min(bmdd, cl[i] / bpk - 1); }
  const wins = trades.filter((t) => t.r > 0), losses = trades.filter((t) => t.r <= 0);
  const gw = wins.reduce((a, t) => a + t.r, 0), gl = -losses.reduce((a, t) => a + t.r, 0);
  let inPos = 0; for (const t of trades) inPos += t.i1 - t.i0; if (open) inPos += n - 1 - open.i0;
  return { trades, open, eq, warm, ret: fin - 1, bh: bh - 1, mdd, bmdd, n: trades.length, win: trades.length ? wins.length / trades.length : NaN,
    avgW: wins.length ? gw / wins.length : NaN, avgL: losses.length ? -gl / losses.length : NaN, pf: gl > 0 ? gw / gl : wins.length ? Infinity : NaN, exposure: inPos / Math.max(1, n - warm) };
}

// ---------- çoklu strateji motoru: parametre ızgarası + örneklem dışı test ----------
const GRID = {
  rsi: () => { const o = []; for (const n of [7, 14, 21]) for (const lo of [25, 30, 35]) for (const hi of [65, 70, 75]) o.push({ n, lo, hi }); return o; },
  ma: () => { const o = []; for (const f of [10, 20, 50]) for (const s of [50, 100, 200]) if (f < s) o.push({ f, s }); return o; },
  macd: () => [{}],
  bb: () => [1.5, 2, 2.5].flatMap((k) => [10, 20].map((n) => ({ n, k }))),
  brk: () => [10, 20, 55].map((n) => ({ n })),
};
export function compareAll(d, opt) {
  const n = d.length, cut = Math.floor(n * 0.7), out = [];
  const seg = (R, a, b) => (R.eq[b] && R.eq[a] ? R.eq[b] / R.eq[a] - 1 : NaN);
  for (const k of Object.keys(STRATS)) {
    let best = null;
    for (const P of GRID[k]()) {
      const R = backtest(d, k, P, opt); const a = Math.max(R.warm, 1), is = seg(R, a, cut - 1), oos = seg(R, cut - 1, n - 1);
      const tradesOOS = R.trades.filter((t) => t.i0 >= cut).length;
      if (!best || is > best.is) best = { k, P, is, oos, tradesOOS, n: R.n, mdd: R.mdd };
    }
    const D = backtest(d, k, STRATS[k].p, opt); best.defOOS = seg(D, cut - 1, n - 1);
    out.push(best);
  }
  const bhOOS = d[n - 1].c / d[cut - 1].c - 1, bhIS = d[cut - 1].c / d[Math.min(60, cut - 1)].c - 1;
  out.sort((a, b) => b.oos - a.oos);
  return { rows: out, bhOOS, bhIS, cut, t0: d[0].t, tc: d[cut].t, t1: d[n - 1].t };
}

// ---------- arayüz ----------
const st = { k: 'rsi', P: {}, opt: { fee: 0.1, sl: 0, tp: 0 } };
let app, last = null;
export function openBacktest(a) {
  app = a; const c = app.act; if (!c || c.data.length < 60) return toast('Strateji testi için en az 60 mum gerekli', 'bad');
  if (!st.P[st.k]) st.P[st.k] = { ...STRATS[st.k].p };
  $('#btModal').classList.add('show'); if (!st.bound) bind(); form(); run();
}
function bind() {
  st.bound = true; const m = $('#btModal');
  m.addEventListener('click', (e) => {
    const s = e.target.closest('[data-st]'); if (s) { st.k = s.dataset.st; if (!st.P[st.k]) st.P[st.k] = { ...STRATS[st.k].p }; form(); run(); return; }
    const a = e.target.closest('[data-bt]'); if (!a) return;
    if (a.dataset.bt === 'show') { const c = app.act; app.bt = { sym: c.sym, tf: c.tf, label: STRATS[st.k].t, trades: last.trades.map((t) => ({ t0: c.data[t.i0].t, t1: c.data[t.i1].t, p0: t.p0, p1: t.p1, r: t.r })), open: last.open ? { t0: c.data[last.open.i0].t, p0: last.open.p0 } : null }; app.charts.forEach((x) => (x.dirty = true)); m.classList.remove('show'); toast('Al/sat noktaları grafikte · ▲ alış ▼ satış', 'ok'); }
    if (a.dataset.bt === 'clear') { app.bt = null; app.charts.forEach((x) => (x.dirty = true)); toast('Test işaretleri kaldırıldı'); }
    if (a.dataset.bt === 'all') runAll();
    if (a.dataset.bt === 'use') { st.k = a.dataset.k; st.P[st.k] = JSON.parse(a.dataset.p); form(); run(); }
  });
  m.addEventListener('input', (e) => {
    const f = e.target.dataset.p, o = e.target.dataset.o, v = parseFloat(String(e.target.value).replace(',', '.'));
    if (!isFinite(v) || v < 0) return;
    if (f) st.P[st.k][f] = v; if (o) st.opt[o] = v; clearTimeout(st.t); st.t = setTimeout(run, 150);
  });
}
function form() {
  const S = STRATS[st.k], P = st.P[st.k];
  $('#btStrats').innerHTML = Object.entries(STRATS).map(([k, v]) => `<button data-st="${k}" class="${k === st.k ? 'on' : ''}">${v.t}</button>`).join('');
  $('#btDesc').textContent = S.d;
  $('#btParams').innerHTML = Object.keys(P).map((k) => `<label>${S.l[k]}<input data-p="${k}" inputmode="decimal" value="${P[k]}"></label>`).join('')
    + `<label>Komisyon %<input data-o="fee" inputmode="decimal" value="${st.opt.fee}"></label><label>Stop % (0=yok)<input data-o="sl" inputmode="decimal" value="${st.opt.sl}"></label><label>Hedef % (0=yok)<input data-o="tp" inputmode="decimal" value="${st.opt.tp}"></label>`;
}
function run() {
  const c = app.act, d = c.data; last = backtest(d, st.k, st.P[st.k], st.opt); const R = last;
  const days = (d[d.length - 1].t - d[R.warm].t) / 864e5, span = days >= 60 ? `${Math.round(days / 30)} ay` : `${Math.round(days)} gün`;
  const col = (v) => (v >= 0 ? 'sigB' : 'sigS');
  $('#btRes').innerHTML = `<div class="note small" style="margin:0 0 8px">${esc(c.sym)} · ${TFL[c.tf]} · son ${d.length - R.warm} mum (~${span}) · sadece alış (long) yönlü</div>
    <div class="cres"><div class="${R.ret >= 0 ? 'g' : 'r'}"><span>Strateji getirisi</span><b>${fPct(R.ret * 100)}</b><i>${R.n} işlem${R.open ? ' + 1 açık' : ''}</i></div>
    <div class="${R.bh >= 0 ? 'g' : 'r'}" style="border-color:var(--line2)"><span>Al ve tut</span><b class="${col(R.bh)}" style="color:inherit">${fPct(R.bh * 100)}</b><i>aynı dönemde hiç satmasaydın</i></div></div>
    <div class="irow"><span>Kazanan işlem oranı</span><span>${isFinite(R.win) ? '%' + Math.round(R.win * 100) : '—'}</span></div>
    <div class="irow"><span>Ortalama kazanç / kayıp</span><span><span class="sigB">${isFinite(R.avgW) ? fPct(R.avgW * 100) : '—'}</span> / <span class="sigS">${isFinite(R.avgL) ? fPct(R.avgL * 100) : '—'}</span></span></div>
    <div class="irow"><span>Kâr faktörü</span><span>${isFinite(R.pf) ? fP(R.pf, 2) : R.pf === Infinity ? '∞' : '—'}</span></div>
    <div class="irow"><span>En büyük düşüş (strateji / al-tut)</span><span><span class="sigS">${fPct(R.mdd * 100)}</span> / <span class="sigS">${fPct(R.bmdd * 100)}</span></span></div>
    <div class="irow"><span>Piyasada kalma süresi</span><span>%${Math.round(R.exposure * 100)}</span></div>
    <canvas id="btEq" height="140"></canvas>
    <div class="cbtns"><button class="closeb" data-bt="show">📍 Grafikte göster</button><button class="closeb" data-bt="clear">✕ İşaretleri kaldır</button></div>
    <button class="pbtn" data-bt="all" style="margin-top:8px">🏆 Tüm stratejileri karşılaştır (çoklu strateji motoru)</button><div id="btAll"></div>
    <details><summary>İşlem listesi (${R.trades.length})</summary>${R.trades.slice(-30).reverse().map((t) => `<div class="irow"><span>${dt(d[t.i0].t)} → ${dt(d[t.i1].t)} <small class="dim">${t.why}</small></span><span class="${col(t.r)}">${fPct(t.r * 100)}</span></div>`).join('') || '<div class="empty">Bu ayarlarla hiç işlem oluşmadı</div>'}</details>
    <div class="disc">Geçmiş performans geleceği garanti etmez. Test kayma (slippage), likidite ve vergi gibi gerçek hayattaki maliyetleri içermez. Çok fazla ayar deneyip en iyisini seçmek geçmişe aşırı uyum (overfitting) riskidir. Yatırım tavsiyesi değildir.</div>`;
  drawEq(d, R);
}
function runAll() {
  const c = app.act, box = $('#btAll'); box.innerHTML = '<div class="empty">Yaklaşık 60 ayar kombinasyonu test ediliyor…</div>';
  setTimeout(() => {
    const A = compareAll(c.data, st.opt), lab = (k, P) => STRATS[k].t + (Object.keys(P).length ? ' (' + Object.entries(P).map(([x, v]) => `${STRATS[k].l[x].split(' ')[0]} ${v}`).join(', ') + ')' : '');
    box.innerHTML = `<div class="note small" style="margin:10px 0 6px">Veri ikiye bölündü: ilk %70'te (${dt(A.t0)}–${dt(A.tc)}) her stratejinin <b>en iyi ayarı</b> seçildi, sonra bu ayar hiç görmediği son %30'da (${dt(A.tc)}–${dt(A.t1)}) test edildi. Asıl güvenilir sonuç <b>"Test dönemi"</b> sütunudur.</div>
      <div class="scrwrap"><table class="scrt"><thead><tr><th>Strateji · seçilen ayar</th><th>Öğrenme dönemi</th><th>Test dönemi</th><th>Varsayılan ayar (test)</th><th></th></tr></thead><tbody>
      ${A.rows.map((r, i) => `<tr><td>${i === 0 && r.oos > A.bhOOS ? '🏆 ' : ''}${esc(lab(r.k, r.P))}<div class="sub">${r.tradesOOS} işlem test döneminde</div></td><td class="${r.is >= 0 ? 'up' : 'dn'}">${fPct(r.is * 100, 1)}</td><td class="${r.oos >= 0 ? 'up' : 'dn'}"><b>${fPct(r.oos * 100, 1)}</b></td><td class="${r.defOOS >= 0 ? 'up' : 'dn'}">${fPct(r.defOOS * 100, 1)}</td><td><button class="closeb" style="width:auto;margin:0;padding:4px 8px" data-bt="use" data-k="${r.k}" data-p='${esc(JSON.stringify(r.P))}'>Kullan</button></td></tr>`).join('')}
      <tr><td><b>Al ve tut</b></td><td class="${A.bhIS >= 0 ? 'up' : 'dn'}">${fPct(A.bhIS * 100, 1)}</td><td class="${A.bhOOS >= 0 ? 'up' : 'dn'}"><b>${fPct(A.bhOOS * 100, 1)}</b></td><td></td><td></td></tr></tbody></table></div>
      <div class="disc">Öğrenme döneminde çok iyi görünüp test döneminde kötüleşen strateji geçmişe aşırı uydurulmuştur (overfitting). Test döneminde al-tut'u yenemeyen bir strateji için ekstra işlem ve komisyon katlanmaya değmeyebilir.</div>`;
  }, 30);
}
const dt = (t) => { const x = new Date(t); return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getFullYear()).slice(2)}`; };
function drawEq(d, R) {
  const cv = $('#btEq'), dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth || 600, H = 140; cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  const i0 = R.warm, n = d.length, bh = d.map((b) => b.c / d[i0].c), vals = [];
  for (let i = i0; i < n; i++) vals.push(R.eq[i], bh[i]);
  let hi = Math.max(...vals), lo = Math.min(...vals); if (hi === lo) { hi += 0.01; lo -= 0.01; }
  const X = (i) => 6 + ((i - i0) / Math.max(1, n - 1 - i0)) * (W - 12), Y = (v) => 10 + ((hi - v) / (hi - lo)) * (H - 24);
  x.strokeStyle = '#2a3446'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(0, Y(1)); x.lineTo(W, Y(1)); x.stroke(); x.setLineDash([]);
  for (const [arr, c] of [[bh, '#5c6780'], [R.eq, '#8b6cff']]) { x.beginPath(); for (let i = i0; i < n; i++) { const px = X(i), py = Y(arr[i]); i === i0 ? x.moveTo(px, py) : x.lineTo(px, py); } x.strokeStyle = c; x.lineWidth = c === '#8b6cff' ? 2 : 1.3; x.stroke(); }
  x.font = '600 10px Inter'; x.fillStyle = '#8b6cff'; x.fillText('● Strateji', 8, H - 4); x.fillStyle = '#8b96ab'; x.fillText('● Al ve tut', 72, H - 4);
}
