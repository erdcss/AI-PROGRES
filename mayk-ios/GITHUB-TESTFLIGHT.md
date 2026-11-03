# Merkezi Expo bağlantısı (Çalışkan B2B tokenı ile)

**Önerilen yayınlama merkezi:** [Çalışkan Ortak Expo TestFlight Merkezi](https://github.com/erdcss/CRM-RMA-PANEL/actions/workflows/shared-expo-testflight-hub.yml).

M.A.Y.K artık Çalışkan B2B'nin mevcut `erdcss/CRM-RMA-PANEL` GitHub Actions `EXPO_TOKEN` gizli anahtarıyla **bu merkezi depodan** doğrulanabilir ve yayınlanabilir. Merkezi bağlantı M.A.Y.K için gerçek Expo proje erişim testinden başarıyla geçti. `erdcss/AI-PROGRES` deposuna yeni `EXPO_TOKEN` kopyalamaya gerek yok.

- `app = mayk`, `operation = verify`: logo/Expo proje ve robot erişimini kontrol eder.
- `app = mayk`, `operation = testflight`: M.A.Y.K imzalı iOS build + TestFlight teslimini başlatır.
- TestFlight için `mayk_asc_app_id` alanına App Store Connect'te M.A.Y.K uygulamasının **sayısal Apple ID** değerini yazın. Bu bir API anahtarı değildir.
- M.A.Y.K için Apple App Store dağıtım sertifikası, provisioning ve Expo EAS'te App Store Connect API Key kurulumu yine gerekli.

Aşağıdaki bağımsız GitHub Actions yöntemi ayrıca `AI-PROGRES` deposuna ayrı Expo/Apple Secret ekleyenler içindir. Sadece tek bir ortak Expo tokenı kullanmak isteniyorsa **merkezi yöntemi tercih edin**.

---

# M.A.Y.K — GitHub üzerinden tek tıkla TestFlight

M.A.Y.K Expo projesi: https://expo.dev/accounts/erdcls/projects/mayk-ios  
Expo EAS proje kimliği: `904c797e-7ddc-46a6-b5ed-e081f1c39bd3`  
iOS Bundle ID: `com.turmarkt.mayk`  
Kaynak: `https://progres.turmarkt.com`

## 1. Apple tarafını ilk kez hazırla

- Ücretli Apple Developer üyeliğinle [App Store Connect](https://appstoreconnect.apple.com/) hesabına giriş yap.
- Apple Developer [Identifiers](https://developer.apple.com/account/resources/identifiers/list) içinde `com.turmarkt.mayk` Bundle ID'yi kaydet (eğer mevcut değilse).
- App Store Connect → Apps → **+ → New App**. Platform: iOS; Ad: M.A.Y.K; Bundle ID: `com.turmarkt.mayk`. Uygulamayı oluştur.
- App Store Connect → M.A.Y.K → App Information sayfasındaki **sayısal Apple ID** değerini kopyala. Apple Team ID veya Bundle ID bu alanın yerine geçmez.

## 2. Expo'ya Apple imzalama ve teslim anahtarlarını bir defaya mahsus ekle

Windows PowerShell:

```powershell
cd "$HOME\MAYK-IOS\mayk-ios"
git pull origin main
npx eas-cli@latest login
npx eas-cli@latest credentials --platform ios
```

- `production` profilini seç.
- Apple hesabındaki doğru takımı seç.
- **Build Credentials** bölümünden iOS Distribution Certificate ve Provisioning Profile kurulumunu tamamla; Expo'nun imzalama bilgilerini güvenle yönetmesini sağlayabilirsin.
- **App Store Connect: Manage your API Key → Set up your project to use an API Key for Expo Submit** adımlarından Apple'a otomatik yükleme yetkisini bağla.
- App Store Connect API key için gerekli Apple yetkileri (Account Holder/Admin) gerekir. Kimlik doğrulama veya 2FA istenirse yalnızca Expo/Apple'ın kendi oturumunda tamamla.

**Dikkat:** İlk kez kuruluyorsa, Apple sertifikalarının ve App Store Connect API key'in Expo EAS sunucusunda kaydedilmiş olması gerekir. GitHub üzerinde yalnızca Expo erişim token'ını tutmak, Apple imzalamasını tek başına sağlamaz.

## 3. GitHub Secrets oluştur

GitHub → [AI-PROGRES / Settings / Secrets and variables / Actions](https://github.com/erdcss/AI-PROGRES/settings/secrets/actions) → **New repository secret**:

| Name | Value |
|---|---|
| `EXPO_TOKEN` | Expo hesabında `Caliskan-CI-Build` robot kullanıcısından üretilen, M.A.Y.K projesine erişimi olan **yeni** access token |
| `MAYK_ASC_APP_ID` | App Store Connect içindeki M.A.Y.K uygulamasının **sayısal Apple ID** değeri |

Expo EAS projectId zaten kaynak kodda bulunduğundan `MAYK_EAS_PROJECT_ID` adında ayrı Secret gerekmez.

**Tokenları, Apple API key dosyalarını ve parolaları sohbete, .env dosyalarına ya da GitHub kaynak koduna koyma.** Secret değerleri yalnızca GitHub'ın kendi gizli alanına girilir.

## 4. GitHub Actions'tan çalıştır

[GitHub Actions → M.A.Y.K TestFlight](https://github.com/erdcss/AI-PROGRES/actions/workflows/mayk-testflight.yml)

- **Run workflow** → Branch: `main`
- Önce **operation = verify** ile kontrol et. Bu işlem canlı logoyu indirir ve boyutlandırır, TypeScript/Expo yapılandırmasını doğrular; Apple'a gönderim yapmaz.
- Apple/Expo ayarları tamamsa aynı yerde **operation = testflight** seçip **Run workflow** yap.
- Workflow, webde yüklü olan gerçek logoyu build öncesi alır; erişilemiyorsa build başlatılmaz.
- EAS production iOS build'i oluşturup `--auto-submit` ile App Store Connect / TestFlight'a gönderir. GitHub'da, Expo Build'de ve Expo Submit'de sonuçları doğrula.
- Apple, yüklenen binary'yi işledikten sonra TestFlight → Internal Testing kısmında ekibinle paylaş.

## Sorun giderme

- `EXPO_TOKEN gerekli`: GitHub Secrets altında erişim anahtarı tanımlı değil veya isim farklı.
- `MAYK_ASC_APP_ID gerekli`: App Store Connect'teki sayısal Apple ID gizli ayara girilmemiş.
- Apple signing / provisioning error: `eas credentials --platform ios` üzerinden doğru Apple team ve sertifika kontrol edilmeli.
- `App Store Connect API Keys cannot be set up in --non-interactive mode`: API key Expo tarafına önceden bağlanmamış; Expo Credentials menüsünde kur.
- `iOS icon ready: https://progres.turmarkt.com/api/mayk/branding/icon.png`: Canlı logo kaynağının build aşamasında alındığını gösterir, ancak Apple'ın TestFlight'ta işlediğini tek başına kanıtlamaz.

### İlgili resmi kılavuzlar

- https://docs.expo.dev/submit/ios/
- https://docs.expo.dev/submit/testflight/
- https://docs.expo.dev/tutorial/eas/ios-production-build/
