// TrendTakip alarm servisi
// - GET  ?vapid=1                 → web push genel anahtarı (ilk çağrıda üretir)
// - POST {action:"check"} + x-cron-secret  → açık alarmları kontrol eder, tetiklenenlere bildirim yollar (pg_cron her dakika)
// - POST {action:"test"} + kullanıcı JWT   → kullanıcının cihazlarına deneme bildirimi
// - POST {action:"tg_status"|"tg_link"|"tg_unlink"} + kullanıcı JWT → Telegram bağlantısı
// - POST {action:"tg_setup"} + x-cron-secret → Telegram webhook kurulumu
// - POST ?tg=1 + X-Telegram-Bot-Api-Secret-Token → Telegram güncellemeleri (/start KOD, /stop)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function kv(k: string): Promise<string | null> { const { data } = await SB.rpc("kv_get", { p_k: k }); return (data as string) ?? null; }
let VAPID: { pub: string; priv: string } | null = null;
async function vapid() {
  if (VAPID) return VAPID;
  let pub = await kv("vapid_public"), priv = await kv("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await SB.rpc("kv_set", { p_k: "vapid_public", p_v: k.publicKey });
    await SB.rpc("kv_set", { p_k: "vapid_private", p_v: k.privateKey });
    pub = await kv("vapid_public"); priv = await kv("vapid_private");
  }
  VAPID = { pub: pub!, priv: priv! };
  webpush.setVapidDetails("https://knkview.vercel.app", VAPID.pub, VAPID.priv);
  return VAPID;
}

const fmt = (p: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: p >= 10 ? 2 : p >= 1 ? 3 : 6 }).format(p);

async function sendToUser(userId: string, payload: Record<string, unknown>) {
  await vapid();
  const { data: subs } = await SB.from("push_subs").select("id,endpoint,p256dh,auth").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await SB.from("push_subs").delete().eq("id", s.id);
      else console.error("push hata", code, String(e));
    }
  }
  return sent;
}

// ---------- Telegram ----------
const TG = () => Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
async function tg(method: string, body: Record<string, unknown>) {
  if (!TG()) throw new Error("TELEGRAM_BOT_TOKEN tanımlı değil");
  const r = await fetch(`https://api.telegram.org/bot${TG()}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  if (!j.ok) throw new Error("Telegram: " + (j.description || r.status));
  return j.result;
}
let BOT: string | null = null;
async function botName() { if (!BOT) BOT = (await tg("getMe", {})).username as string; return BOT; }
const escH = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function sendTg(userId: string, title: string, body: string, path = "/") {
  if (!TG()) return 0;
  const { data } = await SB.from("tg_links").select("chat_id").eq("user_id", userId).maybeSingle();
  if (!data) return 0;
  try {
    await tg("sendMessage", { chat_id: data.chat_id, parse_mode: "HTML", text: `<b>${escH(title)}</b>\n${escH(body)}`, reply_markup: { inline_keyboard: [[{ text: "📈 Grafiği aç", url: "https://knkview.vercel.app" + path }]] } });
    return 1;
  } catch (e) {
    if (/blocked|chat not found|deactivated/i.test(String(e))) await SB.from("tg_links").delete().eq("user_id", userId);
    else console.error("tg hata", String(e));
    return 0;
  }
}
async function tgUpdate(u: any) {
  const m = u?.message; if (!m?.text || !m.chat?.id) return;
  const chat = m.chat.id, text = String(m.text).trim();
  const st = text.match(/^\/start(?:@\w+)?\s+([a-f0-9]{24})$/i);
  if (st) {
    const { data: uid } = await SB.rpc("tg_use_code", { p_code: st[1].toLowerCase() });
    if (!uid) { await tg("sendMessage", { chat_id: chat, text: "⚠️ Bu bağlantının süresi dolmuş. Sitede Hesabım → Telegram'ı bağla'ya tekrar bas." }); return; }
    await SB.from("tg_links").upsert({ user_id: uid, chat_id: chat, username: m.from?.username ?? null });
    await tg("sendMessage", { chat_id: chat, text: "✅ TrendTakip hesabın bağlandı! Fiyat alarmların tetiklenince buraya mesaj gelecek.\n\nBağlantıyı kesmek için /stop yaz." });
    return;
  }
  if (/^\/stop/i.test(text)) {
    await SB.from("tg_links").delete().eq("chat_id", chat);
    await tg("sendMessage", { chat_id: chat, text: "🔕 Bağlantı kesildi. Artık alarm mesajı gelmeyecek." });
    return;
  }
  await tg("sendMessage", { chat_id: chat, text: "👋 Ben TrendTakip alarm botuyum. Hesabını bağlamak için sitede Hesabım → Telegram'ı bağla'ya bas.\nhttps://knkview.vercel.app" });
}
async function userOf(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await SB.auth.getUser(token);
  return u?.user ?? null;
}

async function getJSON(urls: string[]) {
  for (const u of urls) {
    try { const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (TrendTakip)" }, signal: AbortSignal.timeout(8000) }); if (r.ok) return await r.json(); } catch (_) { /* sıradaki */ }
  }
  return null;
}

async function check() {
  const { data: alerts, error } = await SB.from("alerts").select("*").is("triggered_at", null).limit(2000);
  if (error) throw error;
  if (!alerts?.length) return { open: 0, fired: 0 };
  const price: Record<string, number> = {};
  const bin = [...new Set(alerts.filter((a) => a.src === "binance").map((a) => a.sym))];
  for (let i = 0; i < bin.length; i += 100) {
    const q = encodeURIComponent(JSON.stringify(bin.slice(i, i + 100)));
    const j = await getJSON([`https://data-api.binance.vision/api/v3/ticker/price?symbols=${q}`, `https://api.binance.com/api/v3/ticker/price?symbols=${q}`]);
    for (const t of j ?? []) price["b:" + t.symbol] = +t.price;
  }
  const ys = [...new Set(alerts.filter((a) => a.src === "yahoo" && a.ysym).map((a) => a.ysym as string))];
  await Promise.all(ys.map(async (y) => {
    const e = encodeURIComponent(y);
    const j = await getJSON([`https://query1.finance.yahoo.com/v8/finance/chart/${e}?interval=1d&range=1d`, `https://query2.finance.yahoo.com/v8/finance/chart/${e}?interval=1d&range=1d`]);
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice; if (p) price["y:" + y] = +p;
  }));
  let fired = 0;
  for (const a of alerts) {
    const p = a.src === "binance" ? price["b:" + a.sym] : price["y:" + a.ysym];
    if (!p) continue;
    if (!((a.dir === "up" && p >= a.price) || (a.dir === "down" && p <= a.price))) continue;
    const { data: upd } = await SB.from("alerts").update({ triggered_at: new Date().toISOString() }).eq("id", a.id).is("triggered_at", null).select("id");
    if (!upd?.length) continue; // başka bir çalışma zaten tetikledi
    fired++;
    const title = `🔔 ${a.sym} ${a.dir === "up" ? "↑" : "↓"} ${fmt(a.price)}`, body = `Fiyat alarm seviyene ${a.dir === "up" ? "ulaştı" : "düştü"}. Şu an: ${fmt(p)}`, path = "/?s=" + encodeURIComponent(a.sym);
    await sendToUser(a.user_id, { title, body, tag: "alert-" + a.id, url: path });
    await sendTg(a.user_id, title, body, path);
  }
  return { open: alerts.length, fired };
}

// ---------- KAP: izlenen hisselerin yeni bildirimleri (2 dakikada bir) ----------
async function kapCheck() {
  if (new Date().getUTCMinutes() % 2) return { skip: true };
  const j = await getJSON(["https://knkview.vercel.app/api/kap?days=1"]);
  const items: any[] = j?.items ?? [];
  if (!items.length) return { n: 0 };
  const maxId = Math.max(...items.map((x) => x.id));
  const last = Number(await kv("kap_last") || 0);
  if (!last) { await SB.rpc("kv_set", { p_k: "kap_last", p_v: String(maxId) }); return { init: maxId }; }
  const fresh = items.filter((x) => x.id > last).sort((a, b) => a.id - b.id);
  if (!fresh.length) return { n: 0 };
  await SB.rpc("kv_set", { p_k: "kap_last", p_v: String(Math.max(last, maxId)) });
  const codes = [...new Set(fresh.flatMap((x) => x.codes as string[]))];
  const { data: subs } = await SB.from("kap_watch").select("user_id,codes").eq("enabled", true).overlaps("codes", codes);
  let sent = 0;
  for (const u of subs ?? []) {
    const mine = new Set(u.codes as string[]);
    const hit = fresh.filter((x) => (x.codes as string[]).some((c) => mine.has(c)));
    if (!hit.length) continue;
    const list = hit.length > 4 ? [...hit.slice(0, 3), null] : hit;
    for (const x of list) {
      if (!x) { await sendToUser(u.user_id, { title: `📢 KAP: ${hit.length - 3} bildirim daha`, body: "Takvim & KAP bölümünde hepsini gör.", tag: "kap-more", url: "/" }); await sendTg(u.user_id, `📢 KAP: ${hit.length - 3} bildirim daha`, "Takvim & KAP bölümünde hepsini gör."); continue; }
      const code = (x.codes as string[]).find((c) => mine.has(c)) || x.codes[0];
      const title = `📢 ${code} · KAP`, body = `${x.subj}${x.sum ? " — " + String(x.sum).slice(0, 160) : ""}`;
      await sendToUser(u.user_id, { title, body, tag: "kap-" + x.id, url: x.url });
      await sendTg(u.user_id, title, body + `\n${x.url}`, "/?s=" + encodeURIComponent(code));
      sent++;
    }
  }
  return { fresh: fresh.length, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.has("vapid")) return json({ publicKey: (await vapid()).pub });
    if (req.method !== "POST") return json({ error: "yöntem desteklenmiyor" }, 405);
    if (url.searchParams.has("tg")) {
      const sec = await kv("tg_secret");
      if (!sec || req.headers.get("x-telegram-bot-api-secret-token") !== sec) return json({ error: "yetkisiz" }, 401);
      try { await tgUpdate(await req.json()); } catch (e) { console.error("tg update", String(e)); }
      return json({ ok: true });
    }
    const body = await req.json().catch(() => ({}));
    if (body.action === "check") {
      const secret = await kv("cron_secret");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "yetkisiz" }, 401);
      const out: Record<string, unknown> = await check();
      try { out.kap = await kapCheck(); } catch (e) { out.kap = String(e); }
      return json(out);
    }
    if (body.action === "tg_setup") {
      const secret = await kv("cron_secret");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "yetkisiz" }, 401);
      let ts = await kv("tg_secret");
      if (!ts) { ts = crypto.randomUUID().replace(/-/g, ""); await SB.rpc("kv_set", { p_k: "tg_secret", p_v: ts }); }
      await tg("setWebhook", { url: Deno.env.get("SUPABASE_URL") + "/functions/v1/alerts?tg=1", secret_token: ts, allowed_updates: ["message"], drop_pending_updates: true });
      return json({ ok: true, bot: await botName() });
    }
    if (body.action === "test" || String(body.action || "").startsWith("tg_")) {
      const user = await userOf(req);
      if (!user) return json({ error: "giriş gerekli" }, 401);
      if (body.action === "test") {
        const sent = await sendToUser(user.id, { title: "✅ TrendTakip bildirimleri açık", body: "Fiyat alarmların tetiklenince buraya bildirim gelecek.", tag: "test", url: "/" });
        return json({ sent });
      }
      if (!TG()) return json({ error: "Telegram botu henüz kurulmadı" }, 503);
      if (body.action === "tg_status") {
        const { data } = await SB.from("tg_links").select("username").eq("user_id", user.id).maybeSingle();
        return json({ linked: !!data, username: data?.username ?? null, bot: await botName() });
      }
      if (body.action === "tg_link") {
        const { data: code, error } = await SB.rpc("tg_new_code", { p_user: user.id });
        if (error) throw error;
        const bot = await botName();
        return json({ bot, url: `https://t.me/${bot}?start=${code}` });
      }
      if (body.action === "tg_unlink") { await SB.from("tg_links").delete().eq("user_id", user.id); return json({ ok: true }); }
      if (body.action === "tg_test") {
        const n = await sendTg(user.id, "✅ TrendTakip Telegram testi", "Alarmların buraya da gelecek.");
        return json({ sent: n });
      }
    }
    return json({ error: "bilinmeyen işlem" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
