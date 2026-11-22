// TrendTakip alarm servisi
// - GET  ?vapid=1                 → web push genel anahtarı (ilk çağrıda üretir)
// - POST {action:"check"} + x-cron-secret  → açık alarmları kontrol eder, tetiklenenlere bildirim yollar (pg_cron her dakika)
// - POST {action:"test"} + kullanıcı JWT   → kullanıcının cihazlarına deneme bildirimi
// - POST {action:"tg_status"|"tg_link"|"tg_unlink"} + kullanıcı JWT → Telegram bağlantısı
// - POST {action:"tg_setup"} + x-cron-secret → Telegram webhook kurulumu
// - POST ?tg=1 + X-Telegram-Bot-Api-Secret-Token → Telegram güncellemeleri (/start KOD, /stop)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { metrics } from "./metrics.js";
import { LOC, lg, msg, field } from "./msgs.ts";

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

const fmt = (p: number, l = "tr") => new Intl.NumberFormat(LOC[lg(l)], { maximumFractionDigits: p >= 10 ? 2 : p >= 1 ? 3 : 6 }).format(p);

type Payload = Record<string, unknown>;
async function sendToUser(userId: string, payload: Payload | ((lang: string) => Payload)) {
  await vapid();
  const { data: subs } = await SB.from("push_subs").select("id,endpoint,p256dh,auth,lang").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      const pl = typeof payload === "function" ? payload(s.lang || "tr") : payload;
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(pl), { TTL: 3600 });
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
type Txt = string | ((lang: string) => string);
const txt = (x: Txt, l: string) => (typeof x === "function" ? x(l) : x);
async function sendTg(userId: string, title: Txt, body: Txt, path = "/") {
  if (!TG()) return 0;
  const { data } = await SB.from("tg_links").select("chat_id,lang").eq("user_id", userId).maybeSingle();
  if (!data) return 0;
  const l = data.lang || "tr";
  try {
    await tg("sendMessage", { chat_id: data.chat_id, parse_mode: "HTML", text: `<b>${escH(txt(title, l))}</b>\n${escH(txt(body, l))}`, reply_markup: { inline_keyboard: [[{ text: msg(l, "open"), url: "https://knkview.vercel.app" + path }]] } });
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
  const { data: ex } = await SB.from("tg_links").select("lang").eq("chat_id", chat).maybeSingle();
  let l = ex?.lang || lg(String(m.from?.language_code || "tr").slice(0, 2));
  const st = text.match(/^\/start(?:@\w+)?\s+([a-f0-9]{24})$/i);
  if (st) {
    const { data: rows } = await SB.rpc("tg_use_code", { p_code: st[1].toLowerCase() });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.user_id) { await tg("sendMessage", { chat_id: chat, text: msg(l, "expired") }); return; }
    l = row.lang || l;
    await SB.from("tg_links").upsert({ user_id: row.user_id, chat_id: chat, username: m.from?.username ?? null, lang: lg(l) });
    await tg("sendMessage", { chat_id: chat, text: msg(l, "linked") });
    return;
  }
  if (/^\/stop/i.test(text)) {
    await SB.from("tg_links").delete().eq("chat_id", chat);
    await tg("sendMessage", { chat_id: chat, text: msg(l, "stopped") });
    return;
  }
  await tg("sendMessage", { chat_id: chat, text: msg(l, "hello") });
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
  const legs = (a: any) => (a.src === "derived" && Array.isArray(a.meta?.legs) ? a.meta.legs : []) as { src: string; s: string }[];
  const bin = [...new Set([...alerts.filter((a) => a.src === "binance").map((a) => a.sym), ...alerts.flatMap((a) => legs(a).filter((L) => L.src === "binance").map((L) => L.s))])];
  for (let i = 0; i < bin.length; i += 100) {
    const q = encodeURIComponent(JSON.stringify(bin.slice(i, i + 100)));
    const j = await getJSON([`https://data-api.binance.vision/api/v3/ticker/price?symbols=${q}`, `https://api.binance.com/api/v3/ticker/price?symbols=${q}`]);
    for (const t of j ?? []) price["b:" + t.symbol] = +t.price;
  }
  const ys = [...new Set([...alerts.filter((a) => a.src === "yahoo" && a.ysym).map((a) => a.ysym as string), ...alerts.flatMap((a) => legs(a).filter((L) => L.src === "yahoo").map((L) => L.s))])];
  await Promise.all(ys.map(async (y) => {
    const e = encodeURIComponent(y);
    const j = await getJSON([`https://query1.finance.yahoo.com/v8/finance/chart/${e}?interval=1d&range=1d`, `https://query2.finance.yahoo.com/v8/finance/chart/${e}?interval=1d&range=1d`]);
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice; if (p) price["y:" + y] = +p;
  }));
  let fired = 0;
  for (const a of alerts) {
    let p = a.src === "binance" ? price["b:" + a.sym] : a.src === "yahoo" ? price["y:" + a.ysym] : 0;
    if (a.src === "derived") { const L = legs(a), k = Number(a.meta?.k); const ps = L.map((x) => price[(x.src === "binance" ? "b:" : "y:") + x.s]); p = L.length && ps.every((x) => x > 0) && k > 0 ? ps.reduce((m, x) => m * x, k) : 0; }
    if (!p) continue;
    if (!((a.dir === "up" && p >= a.price) || (a.dir === "down" && p <= a.price))) continue;
    const { data: upd } = await SB.from("alerts").update({ triggered_at: new Date().toISOString() }).eq("id", a.id).is("triggered_at", null).select("id");
    if (!upd?.length) continue; // başka bir çalışma zaten tetikledi
    fired++;
    const path = "/?s=" + encodeURIComponent(a.sym);
    const title = (l: string) => `🔔 ${a.sym} ${a.dir === "up" ? "↑" : "↓"} ${fmt(a.price, l)}`, body = (l: string) => msg(l, a.dir === "up" ? "up" : "down", fmt(p, l));
    await sendToUser(a.user_id, (l) => ({ title: title(l), body: body(l), tag: "alert-" + a.id, url: path }));
    await sendTg(a.user_id, title, body, path);
  }
  return { open: alerts.length, fired };
}

// ---------- Akıllı (çok koşullu) uyarılar: 2 dakikada bir ----------
const BI: Record<string, string> = { "15m": "15m", "1h": "1h", "4h": "4h", "1G": "1d" };
const YI: Record<string, [string, string]> = { "15m": ["15m", "1mo"], "1h": ["60m", "1y"], "4h": ["60m", "2y"], "1G": ["1d", "2y"] };
const TFMS: Record<string, number> = { "15m": 9e5, "1h": 36e5, "4h": 144e5, "1G": 864e5 };
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
function resample(base: Bar[], ms: number) {
  const out: Bar[] = []; let cur: Bar | null = null;
  for (const b of base) { const t = Math.floor(b.t / ms) * ms; if (!cur || cur.t !== t) { cur = { ...b, t }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; } }
  return out;
}
async function bars(src: string, s: string, tf: string): Promise<Bar[]> {
  if (src === "binance") {
    const j = await getJSON([`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(s)}&interval=${BI[tf]}&limit=300`, `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(s)}&interval=${BI[tf]}&limit=300`]);
    return (j ?? []).map((k: any[]) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
  }
  const [i, r] = YI[tf], e = encodeURIComponent(s);
  let j = await getJSON([`https://query1.finance.yahoo.com/v8/finance/chart/${e}?interval=${i}&range=${r}`, `https://query2.finance.yahoo.com/v8/finance/chart/${e}?interval=${i}&range=${r}`]);
  let R = j?.chart?.result?.[0], hourly = false;
  if (tf === "1G" && (R?.timestamp?.length ?? 0) < 30) { j = await getJSON([`https://query1.finance.yahoo.com/v8/finance/chart/${e}?interval=60m&range=2y`]); R = j?.chart?.result?.[0]; hourly = true; }
  const q = R?.indicators?.quote?.[0]; if (!R?.timestamp || !q) return [];
  const d: Bar[] = [];
  R.timestamp.forEach((t: number, k: number) => { const c = q.close[k]; if (c == null) return; const o = q.open[k] ?? c; d.push({ t: t * 1000, o, h: Math.max(q.high[k] ?? c, o, c), l: Math.min(q.low[k] ?? c, o, c), c, v: q.volume[k] || 0 }); });
  return hourly ? resample(d, 864e5) : tf === "4h" ? resample(d, 144e5) : d;
}
function combine(A: Bar[], B: Bar[], k: number) {
  const out: Bar[] = []; let j = 0;
  for (const a of A) { while (j + 1 < B.length && B[j + 1].t <= a.t) j++; const b = B[j]; if (!b || b.t > a.t + 864e5 * 3) continue; const o = a.o * b.o * k, c = a.c * b.c * k; out.push({ t: a.t, o, c, h: Math.max(a.h * b.h * k, o, c), l: Math.min(a.l * b.l * k, o, c), v: a.v }); }
  return out;
}
const nfx = (v: number, l = "tr", d = 2) => new Intl.NumberFormat(LOC[lg(l)], { maximumFractionDigits: d }).format(v);
function condRes(m: Record<string, number>, c: any) {
  const x = m[c.f], label = (l: string) => field(l, c.f, String(c.t || c.f).slice(0, 60));
  if (c.op === "=") { const ok = !!x === !!c.v; return { ok, txt: (l: string) => `${label(l)}: ${msg(l, x ? "yes" : "no")}` }; }
  const ok = Number.isFinite(x) && (c.op === "<" ? x < c.v : x > c.v), u = c.u === "%" ? "%" : c.u === "x" ? "x" : "";
  return { ok, txt: (l: string) => `${label(l)} ${Number.isFinite(x) ? (c.f === "p" ? fmt(x, l) : nfx(x, l)) + u : "—"} ${c.op} ${c.f === "p" ? fmt(c.v, l) : nfx(c.v, l)}${u}` };
}
async function smartCheck() {
  if (new Date().getUTCMinutes() % 2 === 0) return { skip: true };
  const { data: rows, error } = await SB.from("smart_alerts").select("*").eq("enabled", true).limit(500);
  if (error) throw error;
  if (!rows?.length) return { n: 0 };
  const cache: Record<string, Promise<Bar[]>> = {};
  const get = (src: string, s: string, tf: string) => (cache[src + s + tf] ??= bars(src, s, tf).catch(() => []));
  let fired = 0;
  for (const a of rows) {
    try {
      let d: Bar[];
      if (a.src === "derived") { const L = a.meta?.legs ?? []; if (L.length !== 2) continue; const [A, B] = await Promise.all(L.map((x: any) => get(x.src, x.s, a.tf))); d = combine(A, B, Number(a.meta.k)); }
      else d = await get(a.src, a.src === "yahoo" ? a.ysym : a.sym, a.tf);
      const m = metrics(d); if (!m) continue;
      const res = (a.conds as any[]).map((c) => condRes(m as any, c)), all = res.every((r) => r.ok), state = res.map((r) => r.ok);
      const cool = Math.max(36e5, TFMS[a.tf] || 36e5), last = a.last_fired ? Date.parse(a.last_fired) : 0;
      if (all && Date.now() - last > cool) {
        const why = (l: string) => res.map((r) => "✓ " + r.txt(l)).join(" · ");
        await SB.from("smart_alerts").update({ state, last_fired: new Date().toISOString(), last_why: why("tr"), enabled: !!a.repeat }).eq("id", a.id);
        const tfl = ({ "15m": "15m", "1h": "1h", "4h": "4h", "1G": "1D" } as Record<string, string>)[a.tf];
        const title = (l: string) => `🧠 ${a.sym} (${tfl}) · ${a.name || msg(l, "smart")}`, path = "/?s=" + encodeURIComponent(a.sym);
        await sendToUser(a.user_id, (l) => ({ title: title(l), body: why(l), tag: "smart-" + a.id, url: path }));
        await sendTg(a.user_id, title, (l) => why(l).replace(/ · /g, "\n"), path);
        fired++;
      } else if (JSON.stringify(state) !== JSON.stringify(a.state)) await SB.from("smart_alerts").update({ state }).eq("id", a.id);
    } catch (e) { console.error("smart", a.id, String(e)); }
  }
  return { n: rows.length, fired };
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
      if (!x) { const n = hit.length - 3; await sendToUser(u.user_id, (l) => ({ title: msg(l, "kapMoreT", n), body: msg(l, "kapMoreB"), tag: "kap-more", url: "/" })); await sendTg(u.user_id, (l) => msg(l, "kapMoreT", n), (l) => msg(l, "kapMoreB")); continue; }
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
      try { out.smart = await smartCheck(); } catch (e) { out.smart = String(e); }
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
        const sent = await sendToUser(user.id, (l) => ({ title: msg(l, "testT"), body: msg(l, "testB"), tag: "test", url: "/" }));
        return json({ sent });
      }
      if (!TG()) return json({ error: "Telegram botu henüz kurulmadı" }, 503);
      if (body.action === "tg_status") {
        const { data } = await SB.from("tg_links").select("username").eq("user_id", user.id).maybeSingle();
        return json({ linked: !!data, username: data?.username ?? null, bot: await botName() });
      }
      if (body.action === "tg_link") {
        const { data: code, error } = await SB.rpc("tg_new_code", { p_user: user.id, p_lang: lg(String(body.lang || "tr")) });
        if (error) throw error;
        const bot = await botName();
        return json({ bot, url: `https://t.me/${bot}?start=${code}` });
      }
      if (body.action === "tg_unlink") { await SB.from("tg_links").delete().eq("user_id", user.id); return json({ ok: true }); }
      if (body.action === "tg_test") {
        const n = await sendTg(user.id, (l) => msg(l, "tgTestT"), (l) => msg(l, "tgTestB"));
        return json({ sent: n });
      }
    }
    return json({ error: "bilinmeyen işlem" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
