// TrendTakip alarm servisi
// - GET  ?vapid=1                 → web push genel anahtarı (ilk çağrıda üretir)
// - POST {action:"check"} + x-cron-secret  → açık alarmları kontrol eder, tetiklenenlere bildirim yollar (pg_cron her dakika)
// - POST {action:"test"} + kullanıcı JWT   → kullanıcının cihazlarına deneme bildirimi
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
    await sendToUser(a.user_id, {
      title: `🔔 ${a.sym} ${a.dir === "up" ? "↑" : "↓"} ${fmt(a.price)}`,
      body: `Fiyat alarm seviyene ${a.dir === "up" ? "ulaştı" : "düştü"}. Şu an: ${fmt(p)}`,
      tag: "alert-" + a.id, url: "/?s=" + encodeURIComponent(a.sym),
    });
  }
  return { open: alerts.length, fired };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.has("vapid")) return json({ publicKey: (await vapid()).pub });
    if (req.method !== "POST") return json({ error: "yöntem desteklenmiyor" }, 405);
    const body = await req.json().catch(() => ({}));
    if (body.action === "check") {
      const secret = await kv("cron_secret");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "yetkisiz" }, 401);
      return json(await check());
    }
    if (body.action === "test") {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await SB.auth.getUser(token);
      if (!u?.user) return json({ error: "giriş gerekli" }, 401);
      const sent = await sendToUser(u.user.id, { title: "✅ TrendTakip bildirimleri açık", body: "Fiyat alarmların tetiklenince buraya bildirim gelecek.", tag: "test", url: "/" });
      return json({ sent });
    }
    return json({ error: "bilinmeyen işlem" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
