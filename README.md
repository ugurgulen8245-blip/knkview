# TrendTakip 📈

Kripto, Borsa İstanbul, altın ve döviz için canlı grafik, teknik analiz, istatistiksel fiyat tahmini ve alarm platformu.
Grafik motoru sıfırdan yazılmıştır (canvas, harici grafik kütüphanesi yok).

## Özellikler
- **Canlı veri**: Binance (kripto, WebSocket) · Yahoo Finance (BIST ~15 dk gecikmeli, altın, döviz, ABD hisseleri)
- **Çoklu grafik**: 1 / 2 / 4 grafik yan yana, her biri kendi sembol ve zaman dilimiyle
- **İndikatörler**: SMA, EMA, Bollinger, Ichimoku, Hacim Profili, Hacim · alt panel RSI / MACD / Stokastik
- **Çizim**: trend, yatay seviye, Fibonacci düzeltme, Fibonacci uzantı (3 nokta), alarm
- **Teknik skor**: 19 göstergeden Güçlü Al → Güçlü Sat özeti
- **Fiyat tahmini**: oynaklık + trend eğiminden %50/%80 olasılık konisi, geçmiş isabet testiyle
- **Piyasa tarayıcı**: RSI, değişim, hacim ve teknik skora göre kripto ve BIST taraması
- **Hesap (Supabase)**: e-posta bağlantısıyla giriş, cihazlar arası senkron
- **Bildirim**: alarmlar sunucuda her dakika kontrol edilir, site kapalıyken web push gönderilir
- Demo işlem hesabı, CSV yükleme, PWA (ana ekrana eklenebilir)

## Yapı
- `index.html`, `css/app.css`, `js/*.js` — istemci (ES modülleri)
- `api/` — Vercel fonksiyonları (Yahoo Finance aracısı, BIST tarayıcı)
- `supabase/functions/alerts` — alarm kontrolü + web push (pg_cron ile dakikada bir)
- `sw.js`, `manifest.webmanifest` — bildirimler ve uygulama kurulumu

> Veriler bilgi amaçlıdır, yatırım tavsiyesi değildir.
