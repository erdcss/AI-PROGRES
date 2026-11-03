# M.A.Y.K — iPhone Ürün Takip Anlık Bildirimleri

## Kapsam

M.A.Y.K 1.2.0, canlı AI PROGRES/Railway Postgres durumlarını iPhone'a Expo/APNs aracılığıyla bildirir. Web ve iOS aynı veritabanı ve aynı takip olaylarını kullanır; ürün verileri iki kez tutulmaz.

Bildirim türleri: yeni takip ürünü, fiyat/stok/varyant değişikliği, manuel inceleme, onay/red/görüldü/yok say, otomatik ve manuel MarktGO düzeltme, düzeltme hatası, ürün takip aç/kapat, kaynak doğrulama uyarısı, takip hatası ve düzelme, zamanlayıcı hatası.

Sunucuda olaylar `mayk_push_events` tablosunda tekil anahtarla tutulur; `mayk_push_deliveries` tablosu deneme ve teslim durumlarını saklar; `mayk_push_devices` sadece giriş yapmış yönetici hesaplarının izinli iOS tokenlarını tutar. Üç tablo Railway Postgres'te sunucu ilk açıldığında oluşturulur. Android ORVIAN/FCM bildirimleri bağımsızdır.

## Apple push key — ZORUNLU

Daha önceki M.A.Y.K Expo kimlik bilgileri ekranında **Push key ekli değildi**. iOS Distribution Certificate ve App Store Connect Submit API Key, APNs Push Notification Key'in yerine geçmez.

1. `cd "$HOME\MAYK-IOS\mayk-ios"`
2. `npx eas-cli@latest credentials --platform ios`
3. `production` profilini seçin.
4. **Push Notifications: Manage your Apple Push Notifications Key** bölümüne girin.
5. Apple Team `U3WGSDJCT2` hesabında bir push key varsa **Use an existing push key** ile **M.A.Y.K** projesine atayın. Yoksa Apple hesabından yeni APNs key oluşturun.
6. Daha önce diğer uygulamalar tarafından kullanılan key'leri silmeyin veya iptal etmeyin.
7. Expo Credentials → iOS → `com.turmarkt.mayk` → **Push key** bölümünde anahtarın gerçekten bağlı olduğunu doğrulayın.

APNs anahtarı EAS'te görünmeden kilitli iPhone bildirimlerinin çalıştığı iddia edilemez. Anahtar yüklenince uygulama için yeni iOS native derleme (M.A.Y.K 1.2.0+) gereklidir.

## TestFlight sonrası doğrulama

- TestFlight sürümünü yükleyin, M.A.Y.K yönetici hesabıyla oturum açın.
- iOS bildirim izin penceresini **İzin Ver** ile onaylayın.
- Uygulama menüsündeki **Ürün Takip Bildirimleri** durumu **hazır** olmalıdır.
- **Ürün Takip → Bildirim Merkezi** bölümünden etkin cihaz sayısını ve bildirim geçmişini kontrol edin.
- **Test bildirimi gönder** ile kilitli/arka plandaki iPhone'da uyarı gelip gelmediğini doğrulayın.
- Ürün fiyat/stock testinde kayıt ekleme, auto-apply veya manuel düzeltme sonrası ayrı durum bildirimi bekleyin.
- Expo Push Service ticket'ın `ok` olması teslim garantisi değildir; sunucu 15 dakika sonra push receipt sorgular ve `DeviceNotRegistered` tokenlarını pasifleştirir.

Güvenlik: push tokenları oturum açıkken aynı-orijin, yönetici yetkili API ile kaydedilir; logout işleminde cihaz devre dışı kalır. Ürün adları kilit ekranında görünebilir; iOS Bildirimler > Önizlemeleri Göster ayarından mahremiyet yönetilebilir.

## iOS build / Apple gönderimi

Eski 1.1.0 Build 4 derlemesi başarılıydı fakat App Store Connect gönderiminde geçici Apple sunucu hatası döndü. Aynı build'i tekrar göndermek için ortak repo'da ücretli yeniden derleme yapmayan `mayk-submit-existing-testflight.yml` akışı hazırlandı. Native push değişikliği ise **yeni 1.2.0** ikili dosyası gerektirir; eski Build 4'e sonradan APNs entegre edilemez.

GitHub merkezi: https://github.com/erdcss/CRM-RMA-PANEL/actions/workflows/shared-expo-testflight-hub.yml
