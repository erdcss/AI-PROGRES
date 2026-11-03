import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Keyboard, Linking, Modal, Pressable,
  ScrollView, Share, StyleSheet, Text, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

const SITE = (process.env.EXPO_PUBLIC_MAYK_WEB_URL || "https://progres.turmarkt.com").replace(/\/$/, "");
const ORIGIN = new URL(SITE).origin;

type MainTab = "home" | "tracking" | "scraper" | "more";
type MenuItem = { title: string; subtitle: string; path: string };

const MORE_ITEMS: MenuItem[] = [
  { title: "Ürün Havuzu", subtitle: "Kaynaklardan ürün toplama", path: "/urun-havuzu" },
  { title: "Kategoriler", subtitle: "Koleksiyon ve etiketler", path: "/kategoriler" },
  { title: "Değişiklik Merkezi", subtitle: "Takip ve düzeltme", path: "/control-center?tab=tracking" },
  { title: "Bildirimler", subtitle: "Sistem bildirimleri", path: "/bildirimler" },
  { title: "Veri Analizi", subtitle: "Raporlar ve karşılaştırmalar", path: "/data-analysis" },
  { title: "Sistem Durumu", subtitle: "M.A.Y.K logosu ve sistem sağlığı", path: "/system-status" },
  { title: "Zamanlayıcı", subtitle: "Otomatik görevler", path: "/scheduler" },
  { title: "API Bağlantıları", subtitle: "Entegrasyon yönetimi", path: "/baglanti-api" },
];

const TAB_ITEMS: Array<{ id: MainTab; title: string; symbol: string }> = [
  { id: "home", title: "Ana Sayfa", symbol: "⌂" },
  { id: "tracking", title: "Ürün Takip", symbol: "▤" },
  { id: "scraper", title: "Ürün Çek", symbol: "↗" },
  { id: "more", title: "Diğer", symbol: "☷" },
];

function isInternalUrl(input: string): boolean {
  if (!input || input === "about:blank") return true;
  if (/^(blob:|data:)/i.test(input)) return true;
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" && parsed.origin === ORIGIN;
  } catch {
    return false;
  }
}

function tabForPath(path: string): MainTab {
  if (path === "/" || path === "/marketplace") return "home";
  if (path.startsWith("/urun-takip")) return "tracking";
  if (path.startsWith("/trendyol") || path.startsWith("/scraper")) return "scraper";
  return "more";
}

// Keep the bottom tab in sync with Wouter's in-page navigation.
// The message contains only a pathname; nothing sensitive or authenticated is transferred.
const ROUTE_BRIDGE = `
(function(){
  document.documentElement.classList.add("mayk-ios");
  if (window.__maykRouteBridge) return true;
  window.__maykRouteBridge = true;
  var notify = function() {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({type:"mayk-route",path:window.location.pathname}));
    } catch(e) {}
  };
  ["pushState","replaceState"].forEach(function(name){
    var original = history[name];
    history[name] = function(){
      var result = original.apply(this,arguments);
      notify();
      return result;
    };
  });
  window.addEventListener("popstate", notify);
  window.addEventListener("pageshow", notify);
  notify();
})();
true;`;

function WebApp() {
  const browser = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(SITE);
  const [activePath, setActivePath] = useState("/");
  const [pageProgress, setPageProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const onShow = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const onHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const activeTab = useMemo(() => tabForPath(activePath), [activePath]);

  const openExternal = useCallback((url: string) => {
    if (!/^(https?:|mailto:|tel:)/i.test(url)) return;
    Linking.openURL(url).catch(() => Alert.alert("Bağlantı açılamadı", "Bağlantı şu anda açılamıyor."));
  }, []);

  const shouldStart = useCallback((request: { url: string }) => {
    if (isInternalUrl(request.url)) return true;
    openExternal(request.url);
    return false;
  }, [openExternal]);

  const navigate = useCallback((path: string) => {
    if (!path.startsWith("/") || path.startsWith("//")) return;
    setMenuOpen(false);
    setHasError(false);
    Keyboard.dismiss();
    setActivePath(path.split("?")[0] || "/");
    setIsLoading(true);
    browser.current?.injectJavaScript(`window.location.assign(${JSON.stringify(SITE)} + ${JSON.stringify(path)});true;`);
  }, []);

  const retry = useCallback(() => {
    setMenuOpen(false);
    setHasError(false);
    setIsLoading(true);
    setPageProgress(0);
    setViewKey(previous => previous + 1);
  }, []);

  const onTabPress = (tab: MainTab) => {
    if (tab === "more") { setMenuOpen(true); return; }
    const path = tab === "home" ? "/" : tab === "tracking" ? "/urun-takip" : "/scraper/trendyol";
    if (activePath === path && !hasError) { browser.current?.reload(); return; }
    navigate(path);
  };

  const onWebMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message?.type === "mayk-route" && typeof message.path === "string") {
        if (message.path.startsWith("/") && !message.path.startsWith("//")) setActivePath(message.path);
      }
    } catch {
      // Ignore unrelated site messages; no page data is passed to the native shell.
    }
  };

  const logout = () => {
    setMenuOpen(false);
    browser.current?.injectJavaScript("window.dispatchEvent(new Event('mayk:logout'));true;");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="light" backgroundColor="#0A121E" />
      <View style={styles.header}>
        <Image source={require("./assets/icon.png")} style={styles.logo} />
        <View style={styles.heading}>
          <Text style={styles.title} numberOfLines={1}>M.A.Y.K</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {hasError ? "Bağlantı kesildi" : isLoading ? "Bağlanıyor..." : "Güvenli yönetim merkezi"}
          </Text>
        </View>
        <Pressable onPress={() => browser.current?.reload()} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="Sayfayı yenile">
          <Text style={styles.actionText}>↻</Text>
        </Pressable>
        <Pressable onPress={() => setMenuOpen(true)} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="Tüm uygulama bölümlerini aç">
          <Text style={styles.actionText}>☷</Text>
        </Pressable>
      </View>

      <View style={styles.progressTrack}>
        {isLoading && !hasError ? <View style={[styles.progressFill, { width: `${Math.max(6, pageProgress * 100)}%` }]} /> : null}
      </View>

      <View style={styles.content}>
        <WebView
          key={viewKey}
          ref={browser}
          source={{ uri: SITE }}
          applicationNameForUserAgent="MAYK-IOS"
          originWhitelist={["https://*", "about:blank"]}
          onShouldStartLoadWithRequest={shouldStart}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
          pullToRefreshEnabled
          injectedJavaScript={ROUTE_BRIDGE}
          onMessage={onWebMessage}
          onNavigationStateChange={state => {
            setCanGoBack(state.canGoBack);
            if (isInternalUrl(state.url) && state.url !== "about:blank") {
              setCurrentUrl(state.url);
              try { setActivePath(new URL(state.url).pathname); } catch {}
            }
          }}
          onLoadStart={() => { setIsLoading(true); setPageProgress(0); }}
          onLoadProgress={event => setPageProgress(event.nativeEvent.progress)}
          onLoadEnd={() => setIsLoading(false)}
          onError={() => { setIsLoading(false); setHasError(true); }}
          onHttpError={event => {
            if (event.nativeEvent.statusCode >= 500 && event.nativeEvent.url === SITE) {
              setHasError(true);
            }
          }}
          onContentProcessDidTerminate={() => browser.current?.reload()}
          onFileDownload={({ nativeEvent }) => openExternal(nativeEvent.downloadUrl)}
          onOpenWindow={({ nativeEvent }) => openExternal(nativeEvent.targetUrl)}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color="#67DBD1" size="large" />
              <Text style={styles.loadingText}>Yönetim merkezi açılıyor</Text>
            </View>
          )}
          style={styles.webView}
        />

        {hasError ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>Bağlantı kurulamadı</Text>
            <Text style={styles.errorDescription}>İnternet bağlantınızı kontrol edip yeniden deneyin.</Text>
            <Pressable onPress={retry} style={styles.primaryButton} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Yeniden bağlan</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {!keyboardVisible && (
        <View style={styles.tabBar} accessibilityRole="tablist">
          {TAB_ITEMS.map(tab => {
            const selected = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={tab.title}
                style={[styles.tabItem, selected && styles.tabItemActive]}
                onPress={() => onTabPress(tab.id)}
              >
                <Text style={[styles.tabIcon, selected && styles.tabIconActive]}>{tab.symbol}</Text>
                <Text style={[styles.tabLabel, selected && styles.tabLabelActive]} numberOfLines={1}>{tab.title}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
          <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)} accessibilityLabel="Menüyü kapat" />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleWrap}>
                <Text style={styles.sheetTitle}>Tüm Modüller</Text>
                <Text style={styles.sheetSubtitle}>AI PROGRES işlemlerine hızlı erişim</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Menüyü kapat" onPress={() => setMenuOpen(false)} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.menuScroll} keyboardShouldPersistTaps="handled">
              {MORE_ITEMS.map(item => (
                <Pressable key={item.path} accessibilityRole="button" onPress={() => navigate(item.path)} style={styles.menuRow}>
                  <View style={styles.menuBody}>
                    <Text style={styles.menuTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.menuSubtitle} numberOfLines={2}>{item.subtitle}</Text>
                  </View>
                  <Text style={styles.menuChevron}>›</Text>
                </Pressable>
              ))}
              <View style={styles.menuFooter}>
                <Pressable onPress={() => { setMenuOpen(false); void Share.share({ message: currentUrl, url: currentUrl }); }} style={styles.footerButton}>
                  <Text style={styles.footerText}>Bağlantıyı paylaş</Text>
                </Pressable>
                <Pressable onPress={() => { setMenuOpen(false); if (canGoBack) browser.current?.goBack(); }} style={styles.footerButton}>
                  <Text style={styles.footerText}>Geri git</Text>
                </Pressable>
                <Pressable onPress={logout} style={styles.footerButton}>
                  <Text style={[styles.footerText, styles.logoutText]}>Oturumu kapat</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><WebApp /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A121E" },
  header: { height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 15, gap: 10, backgroundColor: "#101D2B", borderBottomWidth: 1, borderBottomColor: "#263B4D" },
  logo: { width: 39, height: 39, borderRadius: 11, backgroundColor: "#14202E", borderWidth: 1, borderColor: "#577283" },
  heading: { minWidth: 0, flex: 1 },
  title: { fontSize: 17, fontWeight: "800", letterSpacing: 1.2, color: "#E7F0F3" },
  subtitle: { fontSize: 10, marginTop: 2, color: "#8FA6B7" },
  headerAction: { minWidth: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#192838", borderRadius: 12, borderWidth: 1, borderColor: "#2A4253" },
  actionText: { color: "#D5EBEE", fontSize: 25 },
  progressTrack: { height: 2, backgroundColor: "#0A121E" },
  progressFill: { height: 2, backgroundColor: "#5ADDD2" },
  content: { minHeight: 0, flex: 1, backgroundColor: "#0A121E" },
  webView: { flex: 1, backgroundColor: "#0A121E" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0A121E" },
  loadingText: { color: "#9BAEBF", marginTop: 14, fontSize: 13 },
  errorOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0A121E" },
  errorTitle: { color: "#F1F5F9", fontSize: 21, fontWeight: "700" },
  errorDescription: { color: "#95AABC", marginTop: 9, textAlign: "center", lineHeight: 22 },
  primaryButton: { marginTop: 20, backgroundColor: "#148E90", paddingHorizontal: 25, paddingVertical: 14, borderRadius: 12 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700" },
  tabBar: { minHeight: 66, flexDirection: "row", backgroundColor: "#0E1A28", borderTopWidth: 1, borderColor: "#294357", paddingHorizontal: 8, paddingVertical: 5 },
  tabItem: { flex: 1, minWidth: 0, minHeight: 54, alignItems: "center", justifyContent: "center", borderRadius: 13, gap: 2 },
  tabItemActive: { backgroundColor: "#1A3543" },
  tabIcon: { color: "#8095A7", fontSize: 22, lineHeight: 26 },
  tabIconActive: { color: "#71E3D9" },
  tabLabel: { color: "#8DA3B2", fontSize: 10, fontWeight: "600" },
  tabLabelActive: { color: "#E5FAF9" },
  modalSafe: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(1,6,12,0.67)" },
  sheet: { maxHeight: "85%", backgroundColor: "#101E2D", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, borderWidth: 1, borderColor: "#355063" },
  sheetHandle: { width: 42, height: 4, alignSelf: "center", borderRadius: 3, backgroundColor: "#476171" },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  sheetTitleWrap: { flex: 1, minWidth: 0 },
  sheetTitle: { color: "#F5F8FA", fontSize: 22, fontWeight: "700" },
  sheetSubtitle: { color: "#93ABBD", fontSize: 12, marginTop: 4 },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#203445" },
  closeText: { color: "#C6DFE4", fontSize: 29 },
  menuScroll: { paddingHorizontal: 16, paddingBottom: 28 },
  menuRow: { flexDirection: "row", alignItems: "center", minHeight: 67, borderBottomWidth: 1, borderBottomColor: "#263D50", paddingVertical: 11, paddingHorizontal: 7 },
  menuBody: { flex: 1, minWidth: 0 },
  menuTitle: { color: "#E9F3F5", fontSize: 15, fontWeight: "600" },
  menuSubtitle: { color: "#91A6B7", fontSize: 12, marginTop: 4 },
  menuChevron: { color: "#8DA9B9", fontSize: 28, paddingLeft: 10 },
  menuFooter: { marginTop: 16, gap: 8 },
  footerButton: { borderRadius: 10, backgroundColor: "#1A2D3C", padding: 14 },
  footerText: { color: "#DCEBF0", fontSize: 14, fontWeight: "600" },
  logoutText: { color: "#FFA4A4" },
});
