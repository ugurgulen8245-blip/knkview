// Supabase: e-posta ile giriş, durum senkronu, sunucu tarafı alarmlar, web push
import { toast } from './util.js';

const SB_URL = 'https://inaizgsiavqiadggeszx.supabase.co';
const SB_KEY = 'sb_publishable_28t9XpY5ksn1B48kmjOsxg_EGWDeQoD';
const FN = SB_URL + '/functions/v1/alerts';

export class Cloud {
  constructor(app) {
    this.app = app; this.user = null; this.ready = false; this.pushT = null; this.applying = false;
    this.sb = null;
    import('https://esm.sh/@supabase/supabase-js@2.49.1').then(({ createClient }) => {
      this.sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
      this.bindAuth(); this.app.renderAccount();
    }).catch((e) => { console.warn('Hesap servisi yüklenemedi', e); });
    setInterval(() => { if (this.user && !document.hidden) this.refreshAlerts(); }, 60000);
  }
  bindAuth() {
    this.sb.auth.onAuthStateChange((ev, session) => {
      const u = session ? session.user : null, changed = (u && u.id) !== (this.user && this.user.id);
      this.user = u; this.app.renderAccount();
      if (changed && u) setTimeout(() => this.pull(), 0);
    });
  }
  get on() { return !!(this.sb && this.user); }

  async login(email) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/' } });
    if (error) throw error;
  }
  async loginPassword(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async signUp(email, password) {
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + '/' } });
    if (error) throw error;
    if (!data.session) throw new Error(data.user && data.user.identities && !data.user.identities.length ? 'Bu e-posta zaten kayıtlı. "Giriş yap"ı kullan; şifren yoksa giriş yaptığın cihazdan Hesabım → Şifre belirle.' : 'Kayıt alındı, e-postanı onaylaman gerekiyor.');
  }
  async fn(action) {
    const { data: s } = await this.sb.auth.getSession();
    if (!s.session) throw new Error('Giriş gerekli');
    const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.session.access_token }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Sunucu hatası ' + r.status);
    return j;
  }
  async setPassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw error;
  }
  async logout() { await this.sb.auth.signOut(); this.user = null; this.app.renderAccount(); toast('Çıkış yapıldı'); }

  // ---- durum senkronu ----
  async pull() {
    if (!this.on) return;
    const { data, error } = await this.sb.from('user_state').select('state').maybeSingle();
    if (error) { console.warn(error); return; }
    this.applying = true;
    try {
      if (data && data.state && Object.keys(data.state).length) { this.app.applyCloudState(data.state); toast('☁️ Verilerin hesabından yüklendi', 'ok'); }
      else { await this.pushNow(); toast('☁️ Bu cihazdaki verilerin hesabına kaydedildi', 'ok'); }
    } finally { this.applying = false; }
    await this.syncAlerts();
  }
  pushSoon() { if (!this.on || this.applying) return; clearTimeout(this.pushT); this.pushT = setTimeout(() => this.pushNow(), 1500); }
  async pushNow() {
    if (!this.on) return;
    const { error } = await this.sb.from('user_state').upsert({ user_id: this.user.id, state: this.app.cloudState(), updated_at: new Date().toISOString() });
    if (error) console.warn('senkron hatası', error);
  }

  // ---- alarmlar ----
  async syncAlerts() {
    if (!this.on) return;
    const S = this.app.S;
    for (const a of S.alerts) if (!a.cid) await this.addAlert(a);
    await this.refreshAlerts();
  }
  async refreshAlerts() {
    const { data, error } = await this.sb.from('alerts').select('id,sym,price,dir').is('triggered_at', null).order('created_at');
    if (error || !data) return;
    const S = this.app.S;
    S.alerts = data.map((r) => ({ id: r.id, cid: r.id, sym: r.sym, p: r.price, dir: r.dir }));
    this.app.alertsChanged(false);
  }
  async addAlert(a) {
    if (!this.on) return;
    const sd = this.app.symInfo(a.sym);
    if (!sd || (sd.src !== 'binance' && sd.src !== 'yahoo')) return; // CSV sembolleri sunucuda izlenemez
    const { data, error } = await this.sb.from('alerts').insert({ sym: a.sym, src: sd.src, ysym: sd.y || null, price: a.p, dir: a.dir }).select('id').single();
    if (!error && data) a.cid = data.id;
  }
  async delAlert(a) { if (this.on && a.cid) await this.sb.from('alerts').delete().eq('id', a.cid); }
  async markTriggered(a) { if (this.on && a.cid) await this.sb.from('alerts').update({ triggered_at: new Date().toISOString() }).eq('id', a.cid).is('triggered_at', null); }

  // ---- web push ----
  pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  async enablePush() {
    if (!this.pushSupported()) {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      throw new Error(ios ? 'iPhone\'da bildirim için önce Paylaş → "Ana Ekrana Ekle" ile siteyi uygulama olarak kur, oradan aç.' : 'Bu tarayıcı bildirimleri desteklemiyor.');
    }
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Bildirim izni verilmedi. Tarayıcı ayarlarından bu site için bildirimlere izin ver.');
    if (!this.on) return 'local';
    const { publicKey } = await (await fetch(FN + '?vapid=1')).json();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(publicKey) });
    const j = sub.toJSON();
    const { error } = await this.sb.from('push_subs').upsert({ user_id: this.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
    if (error) throw error;
    const { data: s } = await this.sb.auth.getSession();
    const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.session.access_token }, body: JSON.stringify({ action: 'test' }) });
    const out = await r.json().catch(() => ({}));
    return out.sent ? 'push' : 'local';
  }
}

function b64u(s) {
  const p = '='.repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
