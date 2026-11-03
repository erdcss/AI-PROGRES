const WEB_URL = (process.env.EXPO_PUBLIC_MAYK_WEB_URL || "https://progres.turmarkt.com").replace(/\/$/, "");
if (!WEB_URL.startsWith("https://")) {
  throw new Error("M.A.Y.K production web URL must use HTTPS");
}

module.exports = {
  expo: {
    name: "M.A.Y.K",
    slug: "mayk-ios",
    version: "1.1.0",
    orientation: "portrait",
    platforms: ["ios"],
    scheme: "mayk",
    owner: process.env.MAYK_EXPO_OWNER || "erdcls",
    userInterfaceStyle: "dark",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#081327",
    },
    ios: {
      bundleIdentifier: "com.turmarkt.mayk",
      buildNumber: "1",
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
