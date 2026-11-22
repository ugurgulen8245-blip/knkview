// Kişisel uyarı asistanı: birden fazla koşul aynı anda gerçekleşince açıklamalı uyarı
import { $, fP, esc, toast, modal, nf, uid, TFL, TF } from './util.js';
import { symDef, binanceKlines, yahooRaw, derivedKlines, live } from './data.js';
import { metrics } from '/lib/metrics.mjs';
import { FIELDS as RF } from './radar.js';

const FIELDS = { p: { t: 'Fiyat', u: '' }, ...RF };
const PRESETS = [
  { n: 'Dipten dönüş', c: [{ f: 'rsi', op: '<', v: 35 }, { f: 'macdUp', op: '=', v: 1 }] },
  { n: 'Hacimli yükseliş', c: [{ f: 'volR', op: '>', v: 2 }, { f: 'ch1', op: '>', v: 2 }] },
  { n: 'Trend teyidi', c: [{ f: 'aboveE50', op: '=', v: 1 }, { f: 'aboveE200', op: '=', v: 1 }, { f: 'macdUp', op: '=', v: 1 }] },
  { n: 'Para girişi + aşırı satım', c: [{ f: 'cmf', op: '>', v: 0.1 }, { f: 'rsi', op: '<', v: 40 }] },
];
let app, body, draft = null, timer = null;
const cache = {};

async function candles(sd, tf) {
  const k = sd.s + tf; if (cache[k] && Date.now() - cache[k].t < 55000) return cache[k].d;
  const d = sd.src === 'binance' ? await binanceKlines(sd.s, tf, 300) : sd.src === 'derived' ? await derivedKlines(sd, tf) : await yahooRaw(sd.y, tf);
  cache[k] = { t: Date.now(), d }; return d;
}
const fmt = (f, v) => FIELDS[f].b ? (v ? 'evet' : 'hayır') : !isFinite(v) ? '—' : FIELDS[f].u === '%' ? nf(2).format(v) + '%' : FIELDS[f].u === 'x' ? nf(2).format(v) + 'x' : f === 'p' ? fP(v) : f === 'cmf' || f === 'score' ? nf(2).format(v) : nf(1).format(v);
function check(m, c) { const x = m[c.f]; const ok = FIELDS[c.f].b ? !!x === !!c.v : isFinite(x) && (c.op === '<' ? x < c.v : x > c.v); return { ok, txt: `${FIELDS[c.f].t} ${FIELDS[c.f].b ? '' : fmt(c.f, x) + ' ' + (c.op === '<' ? '<' : '>') + ' ' + fmt(c.f, c.v)}${FIELDS[c.f].b ? (x ? 'evet' : 'hayır') : ''}` }; }
async function evalAlert(a) {
  const sd = symDef(a.sym); if (!sd) return null;
  const d = await candles(sd, a.tf); const m = metrics(d); if (!m) return null;
  if (live[a.sym] && live[a.sym].p) m.p = live[a.sym].p;
  const res = a.conds.map((c) => check(m, c)); return { all: res.every((r) => r.ok), res, m };
}

export function startSmart(a) {
  app = a; if (!app.S.smart) app.S.smart = [];
  clearInterval(timer); timer = setInterval(runAll, 60000); setTimeout(runAll, 8000);
}
async function runAll() {
  for (const a of app.S.smart || []) {
    if (!a.on) continue;
    try {
      const r = await evalAlert(a); if (!r) continue; a.state = r.res.map((x) => x.ok);
      const cool = Math.max(36e5, TF[a.tf]);
      if (r.all && Date.now() - (a.last || 0) > cool) {
        a.last = Date.now(); if (!a.repeat) a.on = false;
        const why = r.res.map((x) => '✓ ' + x.txt).join(' · ');
        toast(`🧠 ${a.sym} (${TFL[a.tf]}): ${a.name || 'koşullar gerçekleşti'}`, 'al');
        app.notify(`🧠 ${a.sym} · ${a.name || 'Akıllı uyarı'}`, why, 'smart-' + a.id);
        app.S.smartLog = [{ t: Date.now(), sym: a.sym, name: a.name, why }, ...(app.S.smartLog || [])].slice(0, 30); app.save();
        if (document.getElementById('smModal')?.classList.contains('show')) render();
      }
    } catch (e) {}
  }
}
export function openSmart(a) {
  app = a; if (!app.S.smart) app.S.smart = [];
  draft = draft || { sym: app.act.sym, tf: '1h', conds: PRESETS[0].c.map((x) => ({ ...x })), repeat: false, name: PRESETS[0].n };
  draft.sym = app.act.sym;
  const dl = document.getElementById('pfList'); if (dl && !dl.options.length) import('./data.js').then(({ SYMS }) => { dl.innerHTML = SYMS.map((x) => `<option value="${esc(x.s)}">${esc(x.n || '')}</option>`).join(''); });
  body = modal('smModal', '🧠 Akıllı Uyarılar');
  if (!body.dataset.bound) { body.dataset.bound = 1; body.addEventListener('click', onClick); body.addEventListener('input', onInput); }
  render(); preview();
}
function onClick(e) {
  const pr = e.target.closest('[data-spre]'); if (pr) { const P = PRESETS[+pr.dataset.spre]; draft.conds = P.c.map((x) => ({ ...x })); draft.name = P.n; render(); preview(); return; }
  const dl = e.target.closest('[data-sdel]'); if (dl) { draft.conds.splice(+dl.dataset.sdel, 1); render(); preview(); return; }
  if (e.target.closest('[data-sadd]')) { draft.conds.push({ f: 'p', op: '>', v: live[draft.sym] ? +live[draft.sym].p.toPrecision(5) : 100 }); render(); preview(); return; }
  const tf = e.target.closest('[data-stf]'); if (tf) { draft.tf = tf.dataset.stf; render(); preview(); return; }
  if (e.target.closest('[data-srep]')) { draft.repeat = !draft.repeat; render(); return; }
  if (e.target.closest('[data-ssave]')) {
    if (!draft.conds.length) return toast('En az bir koşul ekle', 'bad');
    app.S.smart.push({ id: uid(), ...draft, conds: draft.conds.map((x) => ({ ...x })), on: true, last: 0 }); app.save(); render(); toast('🧠 Akıllı uyarı kuruldu', 'ok'); runAll();
    if (!('Notification' in window) || Notification.permission !== 'granted') setTimeout(() => toast('Bildirim almak için İşlem → "Bildirimleri aç"', ''), 1200);
    return;
  }
  const tg = e.target.closest('[data-stog]'); if (tg) { const a = app.S.smart.find((x) => x.id === tg.dataset.stog); a.on = !a.on; app.save(); render(); return; }
  const rm = e.target.closest('[data-srm]'); if (rm) { app.S.smart = app.S.smart.filter((x) => x.id !== rm.dataset.srm); app.save(); render(); }
}
function onInput(e) {
  const i = e.target.dataset.si, k = e.target.dataset.sk;
  if (e.target.id === 'smName') { draft.name = e.target.value; return; }
  if (e.target.id === 'smSym') { const sd = symDef(e.target.value.trim().toUpperCase()); if (sd) { draft.sym = sd.s; preview(); } return; }
  if (i == null) return; const c = draft.conds[+i];
  if (k === 'v') { const v = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(v)) c.v = v; } else c[k] = e.target.value;
  if (k === 'f') { if (FIELDS[c.f].b) { c.op = '='; c.v = 1; } else if (c.op === '=') c.op = '<'; render(); }
  clearTimeout(onInput.t); onInput.t = setTimeout(preview, 400);
}
async function preview() {
  const box = document.getElementById('smPrev'); if (!box) return; box.innerHTML = '<span class="dim">Şu anki durum hesaplanıyor…</span>';
  try {
    const r = await evalAlert(draft); if (!r) throw 0;
    box.innerHTML = r.res.map((x) => `<div class="${x.ok ? 'sigB' : 'sigN'}">${x.ok ? '✓' : '✗'} ${esc(x.txt)}</div>`).join('') + `<div style="margin-top:6px"><b class="${r.all ? 'sigB' : ''}">${r.all ? 'Şu an tüm koşullar sağlanıyor — kurarsan hemen tetiklenir' : `${r.res.filter((x) => x.ok).length}/${r.res.length} koşul şu an sağlanıyor`}</b></div>`;
  } catch (e) { box.innerHTML = '<span class="dim">Bu sembol için veri alınamadı</span>'; }
}
function render() {
  const S = app.S.smart;
  body.innerHTML = `<div class="note" style="margin-bottom:10px">Birden fazla koşul <b>aynı anda</b> gerçekleşince, hangi koşulun neden sağlandığını açıklayan bir uyarı alırsın. Örnek: "RSI 28 &lt; 35 ✓ · MACD pozitif ✓".</div>
    <div class="msub" style="margin-top:0">YENİ UYARI</div>
    <div class="cgrid" style="grid-template-columns:1fr 1fr"><label>Sembol<input id="smSym" list="pfList" value="${esc(draft.sym)}"></label><label>Uyarı adı<input id="smName" value="${esc(draft.name || '')}"></label></div>
    <div class="fchips" style="margin:8px 0">${PRESETS.map((p, i) => `<button data-spre="${i}">${p.n}</button>`).join('')}</div>
    <div class="mtabs" style="margin-bottom:8px">${['15m', '1h', '4h', '1G'].map((k) => `<button data-stf="${k}" class="${draft.tf === k ? 'on' : ''}">${TFL[k]} mum</button>`).join('')}</div>
    <div class="conds">${draft.conds.map((c, i) => `<div class="cond"><select data-si="${i}" data-sk="f">${Object.entries(FIELDS).map(([k, v]) => `<option value="${k}" ${k === c.f ? 'selected' : ''}>${v.t}</option>`).join('')}</select>
      ${FIELDS[c.f].b ? `<select data-si="${i}" data-sk="v"><option value="1" ${c.v ? 'selected' : ''}>evet</option><option value="0" ${!c.v ? 'selected' : ''}>hayır</option></select>` : `<select data-si="${i}" data-sk="op"><option value="<" ${c.op === '<' ? 'selected' : ''}>küçük</option><option value=">" ${c.op === '>' ? 'selected' : ''}>büyük</option></select><input data-si="${i}" data-sk="v" value="${c.v}" inputmode="decimal">`}
      <button data-sdel="${i}">✕</button></div>`).join('')}</div>
    <div class="smprev" id="smPrev"></div>
    <div class="cbtns" style="grid-template-columns:1fr 1fr 1fr"><button class="closeb" data-sadd>+ Koşul</button><button class="closeb" data-srep>${draft.repeat ? '🔁 Her seferinde' : '1️⃣ Bir kez'}</button><button class="pbtn" data-ssave style="margin:4px 0 0">Uyarıyı kur</button></div>
    <div class="msub">KURULU UYARILAR</div>
    ${S.map((a) => `<div class="smrow ${a.on ? '' : 'off'}"><div><b>${esc(a.sym)}</b> · ${TFL[a.tf]} · ${esc(a.name || '')}<div class="sub">${a.conds.map((c, k) => `<span class="${a.state && a.state[k] ? 'sigB' : 'sigN'}">${a.state ? (a.state[k] ? '✓' : '✗') : '•'} ${esc(FIELDS[c.f].t)}${FIELDS[c.f].b ? '' : ' ' + c.op + ' ' + fmt(c.f, c.v)}</span>`).join(' ')}</div></div>
      <button class="closeb" data-stog="${a.id}" style="width:auto;margin:0;padding:6px 10px">${a.on ? 'Açık' : 'Kapalı'}</button><button class="star" data-srm="${a.id}">✕</button></div>`).join('') || '<div class="empty">Henüz akıllı uyarı yok</div>'}
    ${(app.S.smartLog || []).length ? `<div class="msub">SON TETİKLENENLER</div>${app.S.smartLog.slice(0, 8).map((l) => `<div class="irow"><span><b>${esc(l.sym)}</b> ${esc(l.name || '')}<div class="sub">${esc(l.why)}</div></span><span class="dim">${new Date(l.t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')}` : ''}
    <div class="disc">Akıllı uyarılar şimdilik site (ya da ana ekrana eklenen uygulama) açıkken her dakika kontrol edilir. Basit fiyat alarmları ise giriş yaptıysan sunucuda site kapalıyken de çalışır.</div>`;
}
