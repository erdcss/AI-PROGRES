# M.A.Y.K — AI PROGRES iOS

**GitHub'dan tek tıkla TestFlight:** [GITHUB-TESTFLIGHT.md](./GITHUB-TESTFLIGHT.md) dosyasındaki Türkçe kurulum adımlarını kullanın.
M.A.Y.K, mevcut `https://progres.turmarkt.com` web uygulamasını iOS içinde açar. Başka bir ürün veritabanı, kullanıcı hesabı veya MarktGO API entegrasyonu oluşturmaz. Mevcut webdeki güncel modüller uygulama içinde de açılır.

> Bu proje, `mobile/` dizinindeki ORVIAN Monitor (Android) uygulamasından bağımsızdır.

## Yerel geliştirme
```bash
cd mayk-ios
npm install
npm start
```
iOS Simulator için macOS/Xcode gerekir. Gerçek iPhone'a Expo Go ile yerel geliştirme sunucusundan erişilebilir.

## Webden uygulama simgesi
Webde `Sistem Durumu → M.A.Y.K — iOS Uygulaması` bölümünden **1024 × 1024 PNG, en fazla 4 MB** logo yükleyin. Yükleme yalnızca `systemRole=admin` oturumlarında açıktır. Görsel Railway PostgreSQL `mayk_branding_assets` tablosunda saklanır. Web önizlemesi hemen yenilenir; iOS ana ekran simgesi yeni build ister.

Derleme öncesi `npm run prepare:icon` `/api/mayk/branding/icon.png` endpoint'inden logoyu alır ve alfa kanalını kaldırarak Apple uyumlu 1024×1024 RGB PNG haline getirir. Logo henüz yüklenmemişse varsayılan M.A.Y.K simgesi kullanılır. Özel simge zorunluysa `MAYK_REQUIRE_REMOTE_ICON=1` verin.

## TestFlight ön koşulları
1. Expo projesi **oluşturuldu:** `@erdcls/mayk-ios`, UUID `904c797e-7ddc-46a6-b5ed-e081f1c39bd3`. Bu kimlik `app.config.js` içinde tanımlı; `MAYK_EAS_PROJECT_ID` secret olarak gerekmiyor.
2. Apple Developer üyeliği ve `com.turmarkt.mayk` Bundle ID için App Store Connect uygulama kaydı oluşturun.
3. Expo EAS'te iOS dağıtım sertifikaları/provisioning ve App Store Connect API Key bağlantısını kurun.
4. Repo Actions secrets: `EXPO_TOKEN`, `MAYK_ASC_APP_ID` (App Store Connect sayısal Apple ID). Bunları hiçbir zaman kaynak koda eklemeyin.
5. Repo GitHub Actions üzerinden **M.A.Y.K TestFlight** workflow'unu manuel çalıştırın. Workflow sunucudan en güncel logoyu çeker, iOS binary'sini build eder ve `--auto-submit` ile TestFlight'a gönderir.

> GitHub Secrets ve Apple imzalama erişimi mevcut değilse yalnızca kod hazırlanmış olur; TestFlight yüklemesi tamamlanmış sayılmaz. Expo kaynaklı App Store inceleme veya Apple TestFlight işlemleri ayrıca izlenmelidir.

## Hızlı komut
```bash
cd mayk-ios
npm install
npm run prepare:icon
npx eas-cli@latest project:info
npx eas-cli@latest build --platform ios --profile production --auto-submit
```
Bu yöntem web sitesine yüklenen yeni uygulama simgesini **derleme anında** içeri alır.

## iOS test kontrolü
- Web hesabıyla giriş yap / çıkış yap; oturum kapandığında tekrar giriş yap.
- Trendyol kategori URL'si, toplu ürün çekme, ürün takip, değişiklikler, MarktGO düzeltme ve ürün görsellerini kontrol et.
- iPhone'dan fotoğraf dosyası seçimi, kamera erişimi, CSV indirme, dış bağlantılar ve sayfa geri/yenile işlevlerini test et.
- Sistemin canlı çalışma/işlem sorunları mobil kabuk tarafından çözülmez; ilgili backend servisinde düzeltilmelidir.
