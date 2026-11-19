# M.A.Y.K – Codemagic ile iOS IPA ve TestFlight (Expo EAS olmadan)

**GitHub:** `erdcss/AI-PROGRES` / `main`, **Expo uygulama klasörü:** `mayk-ios/`.
**Codemagic:** depo kökündeki `codemagic.yaml`, iş akışı `mayk-ios-testflight`.
**iOS Bundle ID:** `com.turmarkt.mayk`, **sürüm:** `1.2.0`.
**Web uygulaması:** `https://progres.turmarkt.com`.

M.A.Y.K, AI PROGRES web ürün takip uygulamasını native iOS WebView içinde sunar.
**Bu kurulum yeni bir uygulama kimliği oluşturmaz;** mevcut App Store Connect M.A.Y.K
kaydı kullanılmalıdır. Codemagic, Expo SDK'yı kullanır fakat `expo.dev`
EAS hesabı veya `EXPO_TOKEN` ile native build yapmak zorunda değildir.

## 1. Codemagic'e ekle

1. [Codemagic Applications](https://codemagic.io/apps) → **Add application**.
2. GitHub deposu **erdcss/AI-PROGRES**, platform **iOS**.
3. Configuration: **codemagic.yaml** (dosya depo kökünde).
4. Branch **main**, workflow **M.A.Y.K - iOS IPA and TestFlight (no Expo EAS)**.

## 2. Apple Developer imzalama kurulumu

Çalışkan B2B için Codemagic'e kaydedilmiş `Codemagic Caliskan B2B` App Store
Connect API entegrasyonu **aynı Apple Developer takımını** kullandığı için
yeni iş akışına bağlanmıştır. API anahtarını kaynak koda veya sohbete yükleme.

**Önemli:** İmzalama dosyaları uygulamaya özgüdür. Çalışkan B2B'nin
`com.caliskangroup.rma` provisioning profili M.A.Y.K için kullanılamaz.

1. Apple Developer → Certificates, Identifiers & Profiles → Identifiers:
   mevcut `com.turmarkt.mayk` App ID'sini bul; M.A.Y.K için yeni Bundle ID oluşturma.
2. Profiles → **+ → App Store Connect** dağıtım türü →
   **com.turmarkt.mayk** → aynı Apple Developer takımı altında geçerli
   **Apple Distribution** sertifikası (Çalışkan B2B için yüklenen
   production sertifika yeniden kullanılabilir).
3. Profil adı örneği: **MAYK Codemagic AppStore** → Generate.
4. Codemagic → Team Settings → **Code signing identities →
   iOS provisioning profiles → Fetch profiles** üzerinden yalnız M.A.Y.K
   profilini içeri al. Profilin altındaki sertifika satırında
   `Not uploaded` değil, eşleşen production sertifikası görünmeli.
5. M.A.Y.K App Store Connect kaydı gerçekten `com.turmarkt.mayk`
   Bundle ID'sine bağlı ve API anahtarı erişimli olmalı.

Codemagic YAML, `ios_signing.distribution_type: app_store` ve
`bundle_identifier: com.turmarkt.mayk` ile yalnız uygun signing
profillerini seçer.

## 3. İlk imzalı IPA ve TestFlight

Codemagic'te M.A.Y.K uygulamasını aç → **Start new build** →
`main` → `mayk-ios-testflight`.

İş akışı:
- `mayk-ios` içinde Node paketlerini kurar.
- Yönetim panelinden `/api/mayk/branding/icon.png` ile **canlı 1024×1024
  PNG** ikonunu alır; ikon erişilemiyorsa yanlış/varsayılan simgeyle
  yayın yapmak yerine build durur.
- `expo prebuild --platform ios`, `pod install` ve
  `xcode-project use-profiles` ile Xcode IPA'sı üretir.
- `1.2.0` sürümünün build numarasını **YYMMDDNNN** biçiminde her
  Codemagic run'ında otomatik artırır.
- İmzalı IPA'yı mevcut App Store Connect uygulamasına yükler; yükleme
  tamamlandıktan sonra TestFlight / Internal Testing'den test grubunu yönet.

`publishing.app_store_connect.submit_to_testflight: false` ile otomatik
**harici beta incelemesi** başlatılmaz. `submit_to_app_store: false`
ile **herkese açık App Store yayını** yapılmaz.

## 4. Sohbetten tek komutla build

**"M.A.Y.K TestFlight al"** veya **"MAYK iOS build al"** komutu:
`.github/release-requests/mayk-ios-testflight.txt` içindeki istek
numarasını yükseltir. Codemagic'e GitHub push webhook'u bağlıysa
yalnız bu dosya değiştiğinde `mayk-ios-testflight` derlemesi tetiklenir.

- Codemagic → **Webhooks** bölümünde GitHub webhook aktif olmalı.
- Kurulum ve diğer normal kod güncellemeleri otomatik iOS derlemesi
  başlatmayacak şekilde changeset filtresi vardır.
- Codemagic doğrudan bağlı bir araç olmadığı için sohbetten gönderilen
  isteğin Codemagic'te gerçekten çalışıp çalışmadığı kullanıcı
  Build ekranı / Publishing loguyla doğrulanmalıdır.
- Eski M.A.Y.K Expo EAS workflow'ları kaldırılmadı; yeni yol ayrıdır.

## 5. Push bildirimleri için kritik not

M.A.Y.K `mayk-ios/push.ts` halen **Expo Push Token** kullanır.
Codemagic ile başarılı IPA üretilmesi **push bildirimi tesliminin**
çalıştığını kanıtlamaz. Eski Expo hesabına bağlı push credentials erişilemiyorsa
APNs/Expo Push Service bağlantısı ayrı doğrulanmalı veya iOS APNs doğrudan
token + sunucu gönderim yoluna geçirilmelidir.

Gizli Apple .p8/.p12, provisioning profili ve şifreler GitHub
deposuna/sohbete eklenmez. Codemagic `Code signing identities` kullanılır.
