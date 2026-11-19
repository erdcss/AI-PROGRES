const WEB_URL = (process.env.EXPO_PUBLIC_MAYK_WEB_URL || "https://progres.turmarkt.com").replace(/\/$/, "");
if (!WEB_URL.startsWith("https://")) {
  throw new Error("M.A.Y.K production web URL must use HTTPS");
}

// Codemagic builds are independent of EAS remote versioning.
// Each new Codemagic run gets a higher YYMMDDNNN CFBundleVersion.
const codemagicBuild = Boolean(process.env.CM_BUILD_ID);
const sequence = Number(process.env.PROJECT_BUILD_NUMBER);
if (codemagicBuild && (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999)) {
  throw new Error("M.A.Y.K Codemagic PROJECT_BUILD_NUMBER 1..999 aralığında olmalıdır");
}
const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
const iosBuildNumber = codemagicBuild ? stamp + String(sequence).padStart(3, "0") : "1";

// GitHub Actions Android builds use a unique versionCode for every requested APK.
// Android build signing is configured by Gradle, not Expo EAS.
const androidCodeRaw = process.env.MAYK_ANDROID_VERSION_CODE || "1";
const androidVersionCode = Number(androidCodeRaw);
if (!Number.isSafeInteger(androidVersionCode) || androidVersionCode < 1 || androidVersionCode > 2100000000) {
  throw new Error("M.A.Y.K Android versionCode geçerli bir pozitif tamsayı olmalıdır");
}

module.exports = {
  expo: {
    name: "M.A.Y.K",
    slug: "mayk-ios",
    version: "1.2.0",
    orientation: "portrait",
    platforms: ["ios", "android"],
    scheme: "mayk",
    plugins: ["expo-notifications"],
    owner: process.env.MAYK_EXPO_OWNER || "erdcls",
    userInterfaceStyle: "dark",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#081327",
    },
    android: {
      package: "com.turmarkt.mayk",
      versionCode: androidVersionCode,
      softwareKeyboardLayoutMode: "resize",
      permissions: ["CAMERA", "POST_NOTIFICATIONS"],
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#081327",
      },
    },
    ios: {
      bundleIdentifier: "com.turmarkt.mayk",
      buildNumber: iosBuildNumber,
      supportsTablet: true,
      infoPlist: {
        NSPhotoLibraryUsageDescription: "Ürün ve uygulama logosu görsellerini seçmek için fotoğraf arşivine erişim kullanılır.",
        NSCameraUsageDescription: "Ürün fotoğrafı çekmek ve sisteme yüklemek için kamera kullanılır.",
        NSPhotoLibraryAddUsageDescription: "Ürün görsellerini arşivinize kaydetmek için izin istenir.",
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    extra: {
      webUrl: WEB_URL,
      eas: { projectId: process.env.MAYK_EAS_PROJECT_ID || "904c797e-7ddc-46a6-b5ed-e081f1c39bd3" },
    },
  },
};
