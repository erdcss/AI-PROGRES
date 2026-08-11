# ORVIAN Monitor (Android)

İzole Expo uygulaması — ürün çekmez / Shopify yönetmez. Yalnızca dashboard, çekilen ürünler, takip ve bildirimler.

## Kurulum

```bash
cd mobile
cp .env.example .env
# EXPO_PUBLIC_API_URL=https://your-backend
npm install
npx expo start
```

## APK (EAS)

```bash
cd mobile
eas build --platform android --profile apk
```

APK, Expo push token kaydeder. Backend `ExponentPushToken[...]` için Expo Push API kullanır; native FCM token için isteğe bağlı `FCM_*` yeterlidir.

## Backend env

Expo token’lar için ekstra secret gerekmez. Native FCM için: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (veya `GOOGLE_APPLICATION_CREDENTIALS`). İsteğe bağlı `EXPO_ACCESS_TOKEN`.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (yalnızca sunucu)

## Mobile env

```
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Supabase kurulumu: `../supabase/README.md`
