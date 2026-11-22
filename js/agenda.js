// Ekonomik takvim + KAP bildirimleri
import { $, esc, toast, modal, ago } from './util.js';
import { SYMS, getJSON, net } from './data.js';

const FLAG = { TRY: '🇹🇷', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CNY: '🇨🇳', CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿', ALL: '🌐' };
const KAPCLS = { ODA: 'Özel durum', FR: 'Finansal rapor', DG: 'Diğer', DUY: 'Duyuru' };
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const st = { tab: 'cal', imp: 2, cur: 'core', kapMode: 'mine', q: '', cal: null, kap: null, busy: {}, err: {} };
let app, body;

const hm = (t) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const dayKey = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const dayLabel = (t) => {
  const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })), k = dayKey(t), today = dayKey(Date.now()), tom = dayKey(Date.now() + 864e5);
  return (k === today ? 'Bugün · ' : k === tom ? 'Yarın · ' : '') + `${d.getDate()} ${AY[d.getMonth()]} ${GUN[d.getDay()]}`;
};
export function myBist(a) {
  const s = new Set();
  for (const sd of SYMS) if (sd.y && /\.IS$/.test(sd.y) && !/^XU|^X[A-Z]{3,4}\.IS$/.test(sd.y)) s.add(sd.y.replace(/\.IS$/, ''));
  for (const p of a.S.portfolio || []) { const sd = SYMS.find((x) => x.s === p.sym); if (sd && sd.y && /\.IS$/.test(sd.y)) s.add(sd.y.replace(/\.IS$/, '')); }
  return [...s];
}

export function openAgenda(a, tab) {
  app = a; if (tab) st.tab = tab;
  body = modal('agModal', '📅 Takvim & KAP');
  if (!body.dataset.bound) { body.dataset.bound = 1; body.addEventListener('click', onClick); body.addEventListener('input', (e) => { if (e.target.id === 'kapQ') { st.q = e.target.value; renderList(); } }); }
  render(); load();
}
async function load() {
  const k = st.tab;
  if (st[k] && Date.now() - st[k].ts < (k === 'kap' ? 12e4 : 9e5)) return renderList();
  if (st.busy[k]) return; st.busy[k] = true; st.err[k] = ''; renderList();
  try {
    if (net.API_OK === false) throw new Error('Bu bölüm için site Vercel üzerinde çalışmalı');
    const j = await getJSON([k === 'kap' ? '/api/kap?days=3' : '/api/calendar'], 30000);
    st[k] = { items: j.items || [], ts: Date.now() };
  } catch (e) { st.err[k] = String(e.message || e); }
  st.busy[k] = false; renderList();
}
function onClick(e) {
  const t = e.target.closest('[data-agt]'); if (t) { st.tab = t.dataset.agt; render(); load(); return; }
  const i = e.target.closest('[data-imp]'); if (i) { st.imp = +i.dataset.imp; render(); return; }
  const c = e.target.closest('[data-cur]'); if (c) { st.cur = c.dataset.cur; render(); return; }
  const m = e.target.closest('[data-km]'); if (m) { st.kapMode = m.dataset.km; render(); return; }
  const g = e.target.closest('[data-go]'); if (g) { const s = g.dataset.go; if (SYMS.find((x) => x.s === s)) { app.setSym(s); body.closest('.modal').classList.remove('show'); } return; }
  if (e.target.closest('#kapNotif')) toggleKapNotif();
  if (e.target.closest('#agRe')) { st[st.tab] = null; load(); }
}
function render() {
  const tabs = `<div class="mtabs" style="margin-bottom:10px"><button data-agt="cal" class="${st.tab === 'cal' ? 'on' : ''}">📅 Ekonomik takvim</button><button data-agt="kap" class="${st.tab === 'kap' ? 'on' : ''}">📢 KAP bildirimleri</button></div>`;
  let ctl;
  if (st.tab === 'cal') {
    ctl = `<div class="seg" style="grid-template-columns:repeat(3,1fr);margin:0 0 6px">${[[3, '🔴 Yüksek'], [2, '🟠 Orta+'], [0, 'Tümü']].map(([v, l]) => `<button data-imp="${v}" class="${st.imp === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="seg" style="grid-template-columns:repeat(4,1fr);margin:0 0 8px">${[['core', '🇹🇷🇺🇸🇪🇺'], ['TRY', '🇹🇷 TR'], ['USD', '🇺🇸 ABD'], ['all', '🌐 Tümü']].map(([v, l]) => `<button data-cur="${v}" class="${st.cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  } else {
    const on = !!(app.S.kapNotif && app.cloud && app.cloud.user);
    ctl = `<div class="seg two" style="margin:0 0 6px"><button data-km="mine" class="${st.kapMode === 'mine' ? 'on' : ''}">⭐ Hisselerim</button><button data-km="all" class="${st.kapMode === 'all' ? 'on' : ''}">Tüm şirketler</button></div>
      <input class="field" id="kapQ" placeholder="Hisse kodu ya da şirket ara (ör. THYAO)" value="${esc(st.q)}" style="margin:0 0 6px">
      <button class="pbtn ${on ? '' : 'ghost'}" id="kapNotif" style="margin:0 0 8px">${on ? '🔔 Hisselerimin KAP bildirimleri: AÇIK' : '🔕 Hisselerimin yeni KAP bildirimlerini bana gönder'}</button>`;
  }
  body.innerHTML = tabs + ctl + '<div id="agList"></div>';
  renderList();
}
function renderList() {
  const box = $('#agList'); if (!box) return;
  const k = st.tab, D = st[k];
  if (st.err[k]) { box.innerHTML = `<div class="empty" style="padding:20px">Yüklenemedi: ${esc(st.err[k])}<br><button class="closeb" id="agRe" style="margin-top:8px">Tekrar dene</button></div>`; return; }
  if (!D) { box.innerHTML = '<div class="empty" style="padding:24px">Yükleniyor…</div>'; return; }
  if (k === 'cal') {
    const core = new Set(['TRY', 'USD', 'EUR', 'CNY']);
    const items = D.items.filter((x) => (x.hol || x.imp >= st.imp) && (st.cur === 'all' || (st.cur === 'core' ? core.has(x.cur) : x.cur === st.cur)));
    if (!items.length) { box.innerHTML = '<div class="empty" style="padding:20px">Bu filtreye uyan veri yok.</div>'; return; }
    const now = Date.now(); let html = '', last = '', nextDone = false;
    for (const x of items) {
      const dk = dayKey(x.t); if (dk !== last) { last = dk; html += `<div class="msub" style="margin:12px 0 4px">${dayLabel(x.t)}</div>`; }
      const past = x.t < now - 30 * 6e4, isNext = !past && !nextDone && x.t > now; if (isNext) nextDone = true;
      const dot = x.hol ? '⚪' : x.imp === 3 ? '🔴' : x.imp === 2 ? '🟠' : '🟡';
      const nums = [x.act && `Açıklanan <b>${esc(x.act)}</b>`, x.fc && `Beklenti ${esc(x.fc)}`, x.prev && `Önceki ${esc(x.prev)}`].filter(Boolean).join(' · ');
      html += `<div class="agr${past ? ' past' : ''}${isNext ? ' next' : ''}"><div class="agt">${hm(x.t)}</div><div class="agb"><div>${dot} ${FLAG[x.cur] || ''} <b>${esc(x.title)}</b>${x.approx ? ' <span class="tx3">(tahmini gün)</span>' : ''}</div>${x.title !== x.orig ? `<div class="tx3 small">${esc(x.orig)}</div>` : ''}${nums ? `<div class="small">${nums}</div>` : ''}${isNext ? `<div class="small" style="color:var(--ac2)">⏳ ${until(x.t)} sonra</div>` : ''}</div></div>`;
    }
    box.innerHTML = html + '<p class="note small">Saatler Türkiye saatidir. 🔴 yüksek önemli veriler kurlarda, altında ve borsada sert hareket yaratabilir. Küresel veriler ForexFactory akışından; TÜİK günü tahminidir (genelde ayın 3\'ü).</p>';
  } else {
    const mine = new Set(myBist(app)), q = st.q.trim().toLocaleUpperCase('tr-TR');
    let items = D.items;
    if (st.kapMode === 'mine') items = items.filter((x) => x.codes.some((c) => mine.has(c)));
    if (q) items = items.filter((x) => x.codes.some((c) => c.includes(q)) || x.co.toLocaleUpperCase('tr-TR').includes(q) || x.subj.toLocaleUpperCase('tr-TR').includes(q));
    if (!items.length) { box.innerHTML = `<div class="empty" style="padding:20px">${st.kapMode === 'mine' ? `Son 3 günde izleme listendeki ${mine.size} BIST hissesi için bildirim yok. "Tüm şirketler"e bak ya da Piyasalar'dan hisse ekle.` : 'Bildirim bulunamadı.'}</div>`; return; }
    box.innerHTML = items.slice(0, 150).map((x) => `<div class="kapr"><div class="kh"><span>${x.codes.map((c) => `<button class="kc${mine.has(c) ? ' mine' : ''}" data-go="${esc(c)}">${esc(c)}</button>`).join('')}</span><span class="tx3 small">${ago(x.t)} · ${hm(x.t)}</span></div>
      <a href="${esc(x.url)}" target="_blank" rel="noopener" class="kb"><b>${esc(x.subj)}</b>${x.fix ? ' <span class="tag">düzeltme</span>' : ''}${x.late ? ' <span class="tag">gecikmeli</span>' : ''}<span class="tag">${esc(KAPCLS[x.cls] || x.cls)}</span>
      ${x.sum ? `<div class="small">${esc(x.sum)}</div>` : ''}<div class="tx3 small">${esc(x.co)} · KAP'ta aç ↗</div></a></div>`).join('')
      + '<p class="note small">Kaynak: Kamuyu Aydınlatma Platformu (kap.org.tr). Hisse koduna dokununca grafiği açılır.</p>';
  }
}
const until = (t) => { const m = Math.round((t - Date.now()) / 6e4); return m < 60 ? `${m} dk` : m < 1440 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${Math.round(m / 1440)} gün`; };

async function toggleKapNotif() {
  if (!app.cloud || !app.cloud.user) { toast('Önce giriş yap: KAP bildirimleri sunucudan gönderiliyor', 'bad'); $('#accModal').classList.add('show'); app.renderAccount(); return; }
  const on = !app.S.kapNotif, codes = myBist(app);
  if (on && !codes.length) return toast('İzleme listende BIST hissesi yok. Piyasalar → BIST\'ten ekle.', 'bad');
  try {
    const { error } = await app.cloud.sb.from('kap_watch').upsert({ user_id: app.cloud.user.id, codes, enabled: on, updated_at: new Date().toISOString() });
    if (error) throw error;
    app.S.kapNotif = on; app.save();
    toast(on ? `🔔 ${codes.length} hissenin yeni KAP bildirimleri telefonuna${' '}ve Telegram'a gelecek` : 'KAP bildirimleri kapatıldı', on ? 'ok' : '');
    render();
  } catch (e) { toast('Kaydedilemedi: ' + (e.message || e), 'bad'); }
}
// İzleme listesi değişince sunucudaki hisse listesini güncel tut
export async function syncKapWatch(a) {
  if (!a.S.kapNotif || !a.cloud || !a.cloud.user) return;
  try { await a.cloud.sb.from('kap_watch').upsert({ user_id: a.cloud.user.id, codes: myBist(a), enabled: true, updated_at: new Date().toISOString() }); } catch (_) {}
}
