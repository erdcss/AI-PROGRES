# M.A.Y.K – ChatGPT komutlarıyla Android APK ve iOS TestFlight

**GitHub:** `erdcss/AI-PROGRES`, varsayılan dal `main`.
**Mobil kaynak:** `mayk-ios/`, **Bundle ID / package:** `com.turmarkt.mayk`.
**İlk sürüm:** `1.2.0`. iOS ve Android **Expo SDK 54** kullanır,
ama derleme için Expo EAS erişimi gerekmez.

## Kullanıcı komutları ve tam etkileri

| ChatGPT komutu | Tetiklenen dosya | Sonuç |
|---|---|---|
| **"MAYK APK al"** | `.github/release-requests/mayk-android-apk.txt` | GitHub Actions bağımsız kurulumlu, release JS paketli **test APK** üretir; Android'in geçici debug imzasını kullanır |
| **"MAYK APK AAB al"** | `.github/release-requests/mayk-android-play.txt` | **Yalnız** dört özel Android imzalama Secret'ı varsa özel anahtarlı APK + Play AAB üretir; Google Play'e yüklemez |
| **"MAYK TestFlight al"** | `.github/release-requests/mayk-ios-testflight.txt` | Codemagic `mayk-ios-testflight` imzalı IPA üretir, App Store Connect'e otomatik yükler |
| **"MAYK build al"** | Test APK ve iOS marker'larının her ikisi | İki platformun derleme isteğini ayrı GitHub commit'leriyle gönderir; sonuçlar ayrı incelenir |

**Çalışkan B2B için** farklı repo ve komutlar kullanılır:
`erdcss/CRM-RMA-PANEL`. M.A.Y.K kodu/sertifikası ile karıştırılmamalıdır.

## Kurulum ve tek seferlik kontroller

### iOS — Codemagic

`codemagic.yaml` root'tadır, workflow `mayk-ios-testflight`.
`Code signing identities` ekranında doğrulanan Apple imzalama referansları:

- `caliskan_b2b_appstore_distribution` — mevcut **production** Apple Distribution sertifikası;
- `mayk_appstore_2026` — **App Store**, Bundle ID `com.turmarkt.mayk`;
- App Store Connect integration: `Codemagic Caliskan B2B`.

Codemagic'de `erdcss/AI-PROGRES` uygulamasının **Webhooks** sekmesinden
GitHub push webhook'unu etkinleştir. Webhook yoksa yalnızca GitHub
marker commit'i yapılır; **iOS build başlamış sayılmaz**.

Codemagic `publishing.app_store_connect.auth: integration` ile `.ipa`
dosyasını mevcut Apple uygulamasına gönderir. Internal Testing grubuna
atama ve Apple'ın TestFlight işlemesi ayrıca kontrol edilir. **Üretim
App Store yayını otomatik açılmaz.** iOS push bildirimleri hâlâ Expo
Push Token ile çalışır; Apple/APNs bağlantısı ayrıca test edilmelidir.

### Android — sohbetten test APK

Android GitHub workflow:
`.github/workflows/mayk-android-chat-build.yml`.
`MAYK APK al` komutunda `mayk-android-apk.txt` değişir. Push, GitHub
Actions'ı otomatik tetikler. iOS / web kodu değişiklikleri bu workflow'u
tetiklemez. `MAYK_ANDROID_VERSION_CODE` her build için
`1000+GITHUB_RUN_NUMBER` olarak verilir. `npm run prepare:icon`
ile canlı logo, sonra `expo prebuild --platform android` ve
`./gradlew :app:assembleRelease` çalışır.

**Test APK imzası:** Android debug key, **Play'e yüklenemez**.
Her temiz CI runner'ında farklı debug key oluşabilir; eski APK ile
üstüne güncelleme imza hatası alırsan önce eskiyi kaldır. Böylece
kalıcı imza Secrets'ı olmadan kullanıcının yükleyebildiği bir
Android APK elde edilir. Çıktı `MAYK-Standalone-Test-APK-NOT-PLAY`
GitHub Actions Artifact içinde tutulur (14 gün).

### Android — kalıcı imzalı APK/AAB (Play için)

Play'e yönelik release imzası için `erdcss/AI-PROGRES` deposunun
GitHub Actions **Secrets and variables** alanına ayrı M.A.Y.K
imzalama bilgileri eklenmelidir:

- `MAYK_ANDROID_KEYSTORE_BASE64`: Kendi M.A.Y.K keystore dosyasının
  Base64 içeriği;
- `MAYK_ANDROID_KEYSTORE_PASSWORD`: keystore parolası;
- `MAYK_ANDROID_KEY_ALIAS`: anahtar alias adı;
- `MAYK_ANDROID_KEY_PASSWORD`: anahtarın parolası.

Şifre/keystore içeriğini **ChatGPT sohbetine ya da GitHub commit'ine yazma**.
Her yeni Play güncellemesinde **aynı keystore kullanılmalıdır**.
İmza eşleşmesi doğrulanır. Komut çıktısı
`MAYK-Signed-APK-AAB-Play` GitHub Artifact'ında tutulur (14 gün).
Google Play dağıtımı **otomatik değildir**.

## ChatGPT iş akışı (otomasyon sözleşmesi)

1. Kullanıcının açık komutunu ilgili uygulama/platform/derleme türüyle eşleştir.
2. İlgili `release-requests` marker dosyasını oku; yeni benzersiz istek no
   ekleyip `main` dalına GitHub `update_file` ile yaz.
3. GitHub Actions çalışmasını ve iş adımlarını kontrol et, başarısızsa loglara
   göre açıkça bildir; başarılıysa gerçek Artifact ID ve indirme bağlantısını
   ver. Codemagic iOS tarafında doğrudan API erişimi yoksa
   otomatik tetiklemenin gerçekleştiğini **varsayma**, Codemagic Builds ekranı
   veya Publishing logu ile doğrula.
4. Kullanıcının istemediği Android Play / App Store üretim dağıtımını yapma.
5. Her istekte yeni commit SHA kullanılmalıdır; eski dosyaları yeni build
   olarak sunma. İmzalama anahtarını asla gizliden kopyalama veya yenileme.
6. Kullanıcı yalnız "build al" derse, proje bağlamı M.A.Y.K ise
   **M.A.Y.K test APK + iOS TestFlight isteği** başlatılır.
   `MAYK APK AAB al` ayrı, daha yüksek güvenlik gerektiren komuttur.

## Sonuç bağlantıları

- [M.A.Y.K Android Actions](https://github.com/erdcss/AI-PROGRES/actions/workflows/mayk-android-chat-build.yml)
- [M.A.Y.K iOS Codemagic yapılandırması](https://github.com/erdcss/AI-PROGRES/blob/main/codemagic.yaml)
- [M.A.Y.K Codemagic uygulamaları](https://codemagic.io/apps)
- [App Store Connect](https://appstoreconnect.apple.com/)
