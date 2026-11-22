// İşlem günlüğü: demo işlemleri otomatik kaydeder, elle giriş, etiketler ve alışkanlık analizi
import { $, fP, fPct, fUSD, esc, toast, modal, nf, uid, dstr } from './util.js';

const SETUPS = ['Kırılım', 'Trend takibi', 'Dip alımı', 'Haber', 'Strateji sinyali', 'Tahmin konisi', 'Diğer'];
const EMOS = ['Sakin', 'Emin', 'FOMO', 'Korku', 'İntikam', 'Sıkılmışlık'];
const MISTAKES = ['Stop koymadım', 'Stopu kaydırdım', 'Erken çıktım', 'Geç girdim', 'Plansız işlem', 'Fazla büyük pozisyon', 'Kurala uymadım'];
let app, body;

export function recordTrade(a, e) { // { sym, side, q, entry, exit, t0, t1 }
  if (!a.S.journal) a.S.journal = [];
  const dir = e.side === 'long' ? 1 : -1, pnl = dir * e.q * (e.exit - e.entry);
  a.S.journal.unshift({ id: uid(), ...e, pnl, pnlPct: dir * (e.exit / e.entry - 1) * 100, setup: '', emo: '', mistakes: [], note: '', src: 'demo' });
  a.S.journal = a.S.journal.slice(0, 500);
}
export function openJournal(a) {
  app = a; if (!app.S.journal) app.S.journal = [];
  body = modal('jrModal', '📓 İşlem Günlüğü');
  if (!body.dataset.bound) { body.dataset.bound = 1; body.addEventListener('click', onClick); body.addEventListener('change', onChange); }
  render();
}
function onClick(e) {
  const m = e.target.closest('[data-mis]'); if (m) { const j = find(m.dataset.id), k = m.dataset.mis; j.mistakes = j.mistakes.includes(k) ? j.mistakes.filter((x) => x !== k) : [...j.mistakes, k]; app.save(); render(); return; }
  const d = e.target.closest('[data-jdel]'); if (d) { app.S.journal = app.S.journal.filter((x) => x.id !== d.dataset.jdel); app.save(); render(); return; }
  if (e.target.closest('#jAdd')) {
    const v = (id) => $(id).value.trim(), num = (id) => parseFloat(v(id).replace(',', '.'));
    const e2 = { sym: v('#jSym').toUpperCase(), side: v('#jSide'), q: num('#jQ'), entry: num('#jIn'), exit: num('#jOut'), t0: Date.parse(v('#jT0')) || Date.now(), t1: Date.parse(v('#jT1')) || Date.now() };
    if (!e2.sym || !(e2.q > 0) || !(e2.entry > 0) || !(e2.exit > 0)) return toast('Sembol, miktar, giriş ve çıkış fiyatı gerekli', 'bad');
    recordTrade(app, e2); app.S.journal[0].src = 'manuel'; app.save(); render(); toast('İşlem günlüğe eklendi', 'ok');
  }
}
function onChange(e) {
  const id = e.target.dataset.id, k = e.target.dataset.k; if (!id || !k) return;
  find(id)[k] = e.target.value; app.save(); if (k !== 'note') render();
}
const find = (id) => app.S.journal.find((x) => x.id === id);
const hrs = (ms) => (ms < 36e5 ? `${Math.max(1, Math.round(ms / 6e4))} dk` : ms < 864e5 ? `${nf(1).format(ms / 36e5)} sa` : `${nf(1).format(ms / 864e5)} gün`);

function analyze(J) {
  const W = J.filter((x) => x.pnl > 0), L = J.filter((x) => x.pnl <= 0), sum = (a) => a.reduce((s, x) => s + x.pnl, 0), avg = (a, f) => (a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : NaN);
  const S = { n: J.length, win: J.length ? W.length / J.length : NaN, total: sum(J), avgW: avg(W, (x) => x.pnl), avgL: avg(L, (x) => x.pnl), exp: avg(J, (x) => x.pnl), pf: sum(L) ? sum(W) / -sum(L) : NaN,
    holdW: avg(W, (x) => x.t1 - x.t0), holdL: avg(L, (x) => x.t1 - x.t0), best: J.reduce((b, x) => (!b || x.pnl > b.pnl ? x : b), null), worst: J.reduce((b, x) => (!b || x.pnl < b.pnl ? x : b), null) };
  const ins = [];
  if (J.length < 5) ins.push(['ℹ️', 'Anlamlı alışkanlık analizi için en az 5 işlem gerekli. Demo hesapta işlem yaptıkça günlük otomatik dolar.']);
  else {
    if (isFinite(S.holdL) && isFinite(S.holdW) && S.holdL > S.holdW * 1.5) ins.push(['⚠️', `Kaybeden işlemleri kazananlardan ${nf(1).format(S.holdL / S.holdW)} kat uzun tutuyorsun (${hrs(S.holdL)} / ${hrs(S.holdW)}). Zararı kesmekte geç kalıyor, kârı erken alıyor olabilirsin.`]);
    if (isFinite(S.avgL) && isFinite(S.avgW) && -S.avgL > S.avgW * 1.3) ins.push(['⚠️', `Ortalama kaybın (${fUSD(-S.avgL)}) ortalama kazancından (${fUSD(S.avgW)}) büyük. Bu oranla kâra geçmek için en az %${nf(0).format((-S.avgL / (S.avgW - S.avgL)) * 100)} isabet gerekir; şu anki isabetin %${nf(0).format(S.win * 100)}.`]);
    if (S.exp > 0) ins.push(['✅', `İşlem başına ortalama beklenen kazancın pozitif: ${fUSD(S.exp)}. Yöntemin şimdilik işe yarıyor; pozisyon büyüklüğünü sabit tutmaya devam et.`]);
    // duygu, hata, kurulum, gün analizi
    const group = (key, list) => list.map((k) => { const g = J.filter((x) => (Array.isArray(x[key]) ? x[key].includes(k) : x[key] === k)); return { k, n: g.length, win: g.length ? g.filter((x) => x.pnl > 0).length / g.length : NaN, pnl: sum(g) }; }).filter((x) => x.n >= 2);
    const emo = group('emo', EMOS).sort((a, b) => a.win - b.win)[0];
    if (emo && emo.win < 0.4) ins.push(['🧠', `"${emo.k}" etiketli ${emo.n} işlemde zararla kapanma oranı %${nf(0).format((1 - emo.win) * 100)} (toplam ${fUSD(emo.pnl)}). Bu ruh halindeyken işlem açmamayı kural yap.`]);
    const mis = group('mistakes', MISTAKES).sort((a, b) => a.pnl - b.pnl)[0];
    if (mis && mis.pnl < 0) ins.push(['💸', `En pahalı hatan: "${mis.k}" — ${mis.n} işlemde toplam ${fUSD(mis.pnl)}.`]);
    const st = group('setup', SETUPS).sort((a, b) => b.pnl - a.pnl);
    if (st.length >= 2) ins.push(['🎯', `En kârlı kurulumun "${st[0].k}" (${fUSD(st[0].pnl)}), en zayıfı "${st[st.length - 1].k}" (${fUSD(st[st.length - 1].pnl)}).`]);
    const sorted = [...J].sort((a, b) => a.t0 - b.t0); let rv = 0, rvL = 0;
    for (let i = 1; i < sorted.length; i++) { const prev = sorted.slice(0, i).filter((x) => x.t1 <= sorted[i].t0).sort((a, b) => b.t1 - a.t1)[0]; if (prev && prev.pnl < 0 && sorted[i].t0 - prev.t1 < 36e5) { rv++; if (sorted[i].pnl <= 0) rvL++; } }
    if (rv >= 2) ins.push(['😤', `Bir kayıptan sonraki 1 saat içinde ${rv} işlem açmışsın; bunların ${rvL} tanesi de zararla bitti. Kayıptan sonra mola vermek iyi bir kural olabilir.`]);
    const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const byD = DAYS.map((d, i) => { const g = J.filter((x) => new Date(x.t0).getDay() === i); return { d, n: g.length, pnl: sum(g) }; }).filter((x) => x.n >= 2).sort((a, b) => a.pnl - b.pnl);
    if (byD.length >= 2 && byD[0].pnl < 0) ins.push(['📅', `En kötü günün ${byD[0].d} (${byD[0].n} işlem, ${fUSD(byD[0].pnl)}).`]);
  }
  return { S, ins };
}
function render() {
  const J = app.S.journal, { S, ins } = analyze(J);
  const sel = (id, k, list, v) => `<select data-id="${id}" data-k="${k}"><option value="">${k === 'setup' ? 'Kurulum…' : 'Duygu…'}</option>${list.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  body.innerHTML = `
    <div class="cres" style="grid-template-columns:repeat(4,1fr);margin-top:0">
      <div class="${S.total >= 0 ? 'g' : 'r'}"><span>Toplam K/Z</span><b>${fUSD(S.total)}</b><i>${S.n} işlem</i></div>
      <div><span>Kazanma oranı</span><b>${isFinite(S.win) ? '%' + nf(0).format(S.win * 100) : '—'}</b><i>&nbsp;</i></div>
      <div><span>Ort. kazanç / kayıp</span><b style="font-size:13px"><span class="up">${isFinite(S.avgW) ? fUSD(S.avgW) : '—'}</span> / <span class="dn">${isFinite(S.avgL) ? fUSD(S.avgL) : '—'}</span></b><i>kâr faktörü ${isFinite(S.pf) ? nf(2).format(S.pf) : '—'}</i></div>
      <div><span>İşlem başına beklenti</span><b class="${S.exp >= 0 ? 'up' : 'dn'}">${isFinite(S.exp) ? fUSD(S.exp) : '—'}</b><i>&nbsp;</i></div></div>
    <div class="msub">ALIŞKANLIK ANALİZİ</div><div class="insl">${ins.map(([i, t]) => `<div><span>${i}</span>${esc(t)}</div>`).join('')}</div>
    <div class="msub">İŞLEMLER</div>
    <div class="jl">${J.slice(0, 100).map((x) => `<div class="jr"><div class="jh"><b>${esc(x.sym)}</b><span class="pill ${x.side === 'long' ? 'b' : 's'}">${x.side === 'long' ? 'LONG' : 'SHORT'}</span><span class="dim">${dstr(x.t0)} · ${hrs(x.t1 - x.t0)} · ${x.src}</span><b class="${x.pnl >= 0 ? 'up' : 'dn'} mono" style="margin-left:auto">${fUSD(x.pnl)} (${fPct(x.pnlPct, 1)})</b><button class="star" data-jdel="${x.id}">✕</button></div>
      <div class="jm"><span class="mono dim">${nf(x.q >= 100 ? 0 : 4).format(x.q)} @ ${fP(x.entry)} → ${fP(x.exit)}</span>${sel(x.id, 'setup', SETUPS, x.setup)}${sel(x.id, 'emo', EMOS, x.emo)}</div>
      <div class="jt">${MISTAKES.map((m) => `<button data-id="${x.id}" data-mis="${m}" class="${x.mistakes.includes(m) ? 'on' : ''}">${m}</button>`).join('')}</div>
      <input class="jn" data-id="${x.id}" data-k="note" value="${esc(x.note || '')}" placeholder="Not: neden girdim, ne öğrendim?"></div>`).join('') || '<div class="empty">Henüz işlem yok. Demo hesapta kapattığın her işlem buraya otomatik düşer; gerçek işlemlerini aşağıdan elle ekleyebilirsin.</div>'}</div>
    <div class="msub">GERÇEK İŞLEM EKLE</div>
    <div class="cgrid jadd"><label>Sembol<input id="jSym" placeholder="THYAO"></label><label>Yön<select id="jSide"><option value="long">Long (al-sat)</option><option value="short">Short</option></select></label><label>Miktar<input id="jQ" inputmode="decimal"></label>
      <label>Giriş fiyatı<input id="jIn" inputmode="decimal"></label><label>Çıkış fiyatı<input id="jOut" inputmode="decimal"></label><label>Giriş zamanı<input id="jT0" type="datetime-local" value="${now}"></label><label>Çıkış zamanı<input id="jT1" type="datetime-local" value="${now}"></label><button class="pbtn" id="jAdd" style="margin:0;align-self:end">Ekle</button></div>`;
}
