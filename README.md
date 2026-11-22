# KnkView 📈

Kendi grafik ve analiz platformumuz: TradingView tarzı, sıfırdan yazılmış grafik motoru.

## Özellikler
- **Canlı kripto**: Binance'ten gerçek zamanlı fiyat (WebSocket). Aramaya herhangi bir coin yaz → `＋ XXXUSDT` ile ekle.
- **Borsa İstanbul, altın, döviz, ABD hisseleri**: Yahoo Finance üzerinden (borsa verisi ~15 dk gecikmeli olabilir). Aramaya hisse kodu yaz → `＋ XXXX Borsa İstanbul`.
- Mum / Heikin Ashi / çizgi / alan grafik, 1dk–1 hafta zaman dilimleri
- SMA 20, EMA 50, EMA 200, Bollinger, hacim, RSI, MACD
- Trend çizgisi, yatay seviye, Fibonacci (mıknatıslı)
- Fiyat alarmları, 100.000$'lık demo işlem hesabı
- CSV yükleme (kendi verin)
- Mobil uyumlu

## Yayına alma (Vercel, ücretsiz)
1. Bu klasörü GitHub'da bir repoya yükle.
2. https://vercel.com/new adresine git → GitHub ile giriş yap → repoyu seç → **Deploy**.
3. Bitti. `api/` klasöründeki fonksiyonlar otomatik çalışır; BIST/altın/döviz canlı gelir.

Ayar gerekmez: framework "Other", build komutu yok.

## Sadece statik yayın (GitHub Pages / Netlify Drop)
Sadece `index.html` yeterli. Kripto canlı çalışır; BIST/altın/döviz sunucu olmadığı için simülasyona düşer (ekranda **SİMÜLASYON** yazar).

## Dosyalar
- `index.html` — uygulamanın tamamı
- `api/yahoo.js` — mum verisi (Yahoo Finance aracı)
- `api/quotes.js` — izleme listesi fiyatları
- `api/_yahoo.js` — ortak yardımcılar

> Not: Veriler bilgi amaçlıdır, yatırım tavsiyesi değildir.
