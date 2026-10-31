import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Linking, Pressable, Share,
  StyleSheet, Text, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

const SITE = (process.env.EXPO_PUBLIC_MAYK_WEB_URL || "https://progres.turmarkt.com").replace(/\/$/, "");
const ORIGIN = new URL(SITE).origin;

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

function WebApp() {
  const browser = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(SITE);
  const [pageProgress, setPageProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [viewKey, setViewKey] = useState(0);

  const handleExternal = useCallback((url: string) => {
    if (!/^(https?:|mailto:|tel:)/i.test(url)) return;
    Linking.openURL(url).catch(() => {
      Alert.alert("Bağlantı açılamadı", "Bu bağlantı şu anda açılamıyor.");
    });
  }, []);

  const shouldStart = useCallback((request: { url: string }) => {
    if (isInternalUrl(request.url)) return true;
    handleExternal(request.url);
    return false;
  }, [handleExternal]);

  const retry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setPageProgress(0);
    setViewKey(previous => previous + 1);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="light" backgroundColor="#081327" />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Önceki sayfaya dön"
          disabled={!canGoBack}
          onPress={() => browser.current?.goBack()}
          style={[styles.action, !canGoBack && styles.disabled]}
        >
          <Text style={styles.actionText}>‹</Text>
        </Pressable>
        <Image source={require("./assets/icon.png")} style={styles.logo} />
        <View style={styles.titleArea}>
          <Text numberOfLines={1} style={styles.title}>M.A.Y.K</Text>
          <Text style={styles.subtitle}>{hasError ? "Bağlantı sorunu" : isLoading ? "Yükleniyor" : "AI PROGRES"}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sayfayı yenile"
          style={styles.action}
          onPress={() => hasError ? retry() : browser.current?.reload()}
        >
          <Text style={styles.smallActionText}>↻</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sayfa bağlantısını paylaş"
          style={styles.action}
          onPress={() => { void Share.share({ message: currentUrl, url: currentUrl }); }}
        >
          <Text style={styles.smallActionText}>↥</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        {isLoading && !hasError ? (
          <View style={[styles.progressFill, { width: `${Math.max(7, pageProgress * 100)}%` }]} />
        ) : null}
      </View>

      {hasError ? (
        <View style={styles.error}>
          <Image source={require("./assets/icon.png")} style={styles.bigLogo} />
          <Text style={styles.errorTitle}>Sisteme bağlanılamadı</Text>
          <Text style={styles.errorInfo}>İnternet bağlantınızı ve AI PROGRES web sisteminin durumunu kontrol edin.</Text>
          <Pressable accessibilityRole="button" style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryText}>Yeniden Bağlan</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <WebView
            key={viewKey}
            ref={browser}
            source={{ uri: SITE }}
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
            onNavigationStateChange={state => {
              setCanGoBack(state.canGoBack);
              if (isInternalUrl(state.url) && state.url !== "about:blank") setCurrentUrl(state.url);
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
            onFileDownload={({ nativeEvent }) => handleExternal(nativeEvent.downloadUrl)}
            onOpenWindow={({ nativeEvent }) => handleExternal(nativeEvent.targetUrl)}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#3dd6bd" />
                <Text style={styles.loadingLabel}>AI PROGRES yükleniyor...</Text>
              </View>
            )}
            style={styles.browser}
          />
        </>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><WebApp /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#081327" },
  header: { height: 54, backgroundColor: "#0B1829", flexDirection: "row", alignItems: "center", paddingHorizontal: 7, borderBottomColor: "#23364B", borderBottomWidth: 1 },
  action: { height: 42, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  disabled: { opacity: 0.25 },
  actionText: { fontSize: 36, color: "#E2F7F2", lineHeight: 39 },
  smallActionText: { fontSize: 28, color: "#E2F7F2", lineHeight: 33 },
  logo: { width: 34, height: 34, borderRadius: 9, marginHorizontal: 4 },
  titleArea: { flex: 1, paddingHorizontal: 6 },
  title: { fontWeight: "800", color: "#F1F5F9", fontSize: 15, letterSpacing: 0.8 },
  subtitle: { fontSize: 10, color: "#86B4B2", marginTop: 1 },
  progressTrack: { height: 2, backgroundColor: "#0B1829" },
  progressFill: { height: 2, backgroundColor: "#35D9C2" },
  browser: { flex: 1, backgroundColor: "#081327" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#081327" },
  loadingLabel: { color: "#C5D6D7", marginTop: 18, fontSize: 13 },
  error: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  bigLogo: { width: 90, height: 90, borderRadius: 18, marginBottom: 28 },
  errorTitle: { fontSize: 21, fontWeight: "700", color: "#F1F5F9", textAlign: "center" },
  errorInfo: { color: "#A8B8C6", fontSize: 14, lineHeight: 23, textAlign: "center", marginTop: 12, marginBottom: 22 },
  retryButton: { backgroundColor: "#0D9488", paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12 },
  retryText: { color: "#FFFFFF", fontWeight: "700" },
});
