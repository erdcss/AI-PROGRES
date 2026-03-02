import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Zap,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Link2,
  MousePointer,
  Keyboard,
  Search,
} from "lucide-react";

interface BrowserState {
  screenshot: string;
  url: string;
  title: string;
  width: number;
  height: number;
}

interface MiniBrowserProps {
  onExtract: (url: string) => void;
}

const HOME_URL = "https://www.trendyol.com/cep-telefonu-x-c104";

// Viewport boyutları (backend ile aynı olmalı)
const VP_W = 1280;
const VP_H = 800;

// Özel tuş haritası
const SPECIAL_KEYS: Record<string, string> = {
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Escape: "Escape",
  Tab: "Tab",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

async function browserApi(endpoint: string, body?: object): Promise<BrowserState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const res = await fetch(`/api/browser/${endpoint}`, {
      method: body !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status}: ${text.slice(0, 120)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export default function MiniBrowser({ onExtract }: MiniBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<BrowserState | null>(null);
  const [addressBar, setAddressBar] = useState(HOME_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [pendingText, setPendingText] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doAction = useCallback(async (action: () => Promise<BrowserState>, keepKeyboard = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await action();
      setState(s);
      setAddressBar(s.url);
    } catch (e: any) {
      const msg = e.name === "AbortError"
        ? "Zaman aşımı. Lütfen tekrar deneyin."
        : (e.message || "Bir hata oluştu");
      setError(msg);
    } finally {
      setIsLoading(false);
      if (!keepKeyboard) setKeyboardMode(false);
    }
  }, []);

  // İlk açılışta başlat
  useEffect(() => {
    if (isOpen && !initialized) {
      setInitialized(true);
      setWarmingUp(true);
      setIsLoading(true);
      browserApi("navigate", { url: HOME_URL })
        .then((s) => { setState(s); setAddressBar(s.url); setError(null); })
        .catch((e) => setError(e.name === "AbortError" ? "Zaman aşımı. Tekrar deneyin." : e.message))
        .finally(() => { setIsLoading(false); setWarmingUp(false); });
    }
  }, [isOpen, initialized]);

  // Klavye modu: gizli input'a fokus
  useEffect(() => {
    if (keyboardMode && hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  }, [keyboardMode]);

  // Sayfa scroll'unu engelleyen non-passive wheel listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isLoading) return;
      const delta = e.deltaY > 0 ? 350 : -350;
      doAction(() => browserApi("scroll", { deltaY: delta }), keyboardMode);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [isLoading, keyboardMode, doAction]);

  const navigate = useCallback((url: string) => {
    let u = url.trim();
    if (!u.startsWith("http")) u = "https://" + u;
    setAddressBar(u);
    setKeyboardMode(false);
    doAction(() => browserApi("navigate", { url: u }));
  }, [doAction]);

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      navigate(addressBar);
    }
  };

  // Tıklama koordinatlarını doğru hesapla (object-fill kullanıyoruz, 1:1 mapping)
  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !state || isLoading) return;
    const rect = imgRef.current.getBoundingClientRect();
    // object-fill kullandığımız için rect boyutları = görünen resim boyutları
    // Koordinatları doğrudan viewport boyutuna ölçekle
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    const px = Math.round(xRatio * VP_W);
    const py = Math.round(yRatio * VP_H);
    setKeyboardMode(true);
    setPendingText("");
    doAction(() => browserApi("click", {
      x: px,
      y: py,
      pageWidth: VP_W,
      pageHeight: VP_H,
    }), true);
  };

  // Klavye girişi
  const handleHiddenKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (isLoading) return;

    if (SPECIAL_KEYS[e.key]) {
      setPendingText("");
      if (typeTimerRef.current) { clearTimeout(typeTimerRef.current); typeTimerRef.current = null; }
      doAction(() => browserApi("keypress", { key: SPECIAL_KEYS[e.key] }), true);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const newText = pendingText + e.key;
      setPendingText(newText);
      if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
      typeTimerRef.current = setTimeout(async () => {
        setPendingText("");
        doAction(() => browserApi("type", { text: newText }), true);
      }, 400);
    }
  };

  const isTrendyolProduct = (state?.url || "").includes("trendyol.com/") &&
    ((state?.url || "").includes("-p-") || (state?.url || "").includes("/p/"));

  const searchTrendyol = () => {
    const query = prompt("Trendyol ürün URL'si veya arama terimi girin:");
    if (!query) return;
    if (query.startsWith("http")) {
      navigate(query);
    } else {
      navigate(`https://www.trendyol.com/sr?q=${encodeURIComponent(query)}&lang=tr`);
    }
  };

  return (
    <div className="w-full">
      {/* Toggle */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border-cyan-700/40 hover:border-cyan-500/60 hover:bg-slate-700/50 text-cyan-300 hover:text-cyan-200 transition-all"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <span className="font-medium text-sm">Dahili Tarayıcı</span>
          <span className="text-xs text-slate-400 hidden sm:inline">— Gerçek Chromium motoru</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {isOpen && (
        <div className="mt-2 rounded-xl border border-cyan-800/30 overflow-hidden bg-slate-950 shadow-2xl flex flex-col">

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-900 border-b border-slate-700/50">
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700/60 disabled:opacity-25 rounded-md"
              onClick={() => doAction(() => browserApi("back", {}))} disabled={isLoading}>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700/60 disabled:opacity-25 rounded-md"
              onClick={() => doAction(() => browserApi("forward", {}))} disabled={isLoading}>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-md"
              onClick={() => navigate(addressBar)} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <RotateCw className="w-3.5 h-3.5" />}
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-md"
              onClick={() => navigate(HOME_URL)} disabled={isLoading} title="Trendyol Ana Sayfa">
              <Home className="w-3.5 h-3.5" />
            </Button>

            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/60 rounded-md"
              onClick={searchTrendyol} disabled={isLoading} title="Trendyol'da Ara">
              <Search className="w-3.5 h-3.5" />
            </Button>

            {/* Adres çubuğu */}
            <div className="flex-1 flex items-center bg-slate-800/80 border border-slate-600/40 rounded-md px-2.5 h-7 gap-1.5 focus-within:border-cyan-500/60 transition-colors mx-1">
              <Link2 className="w-3 h-3 text-slate-600 shrink-0" />
              <input
                type="text"
                value={addressBar}
                onChange={(e) => setAddressBar(e.target.value)}
                onKeyDown={handleAddressKeyDown}
                className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600 min-w-0"
                placeholder="https://www.trendyol.com/..."
                spellCheck={false}
              />
            </div>

            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-md"
              onClick={() => window.open(state?.url || HOME_URL, "_blank")} title="Tarayıcıda Aç">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-slate-700/60 rounded-md"
              onClick={() => setIsOpen(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Klavye modu banner */}
          {keyboardMode && !isLoading && (
            <div className="flex items-center justify-between px-3 py-1 bg-cyan-900/30 border-b border-cyan-700/30">
              <div className="flex items-center gap-2 text-xs text-cyan-300">
                <Keyboard className="w-3.5 h-3.5" />
                <span>Klavye aktif — yazı yazabilirsiniz</span>
                {pendingText && (
                  <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-cyan-200">
                    "{pendingText}"
                  </span>
                )}
              </div>
              <Button type="button" size="sm" variant="ghost"
                className="h-5 px-2 text-xs text-slate-400 hover:text-white"
                onClick={() => setKeyboardMode(false)}>
                Kapat
              </Button>
            </div>
          )}

          {/* Görüntü alanı — doğru aspect ratio (1280:800 = 8:5) */}
          <div
            ref={containerRef}
            className="relative bg-slate-950 w-full"
            style={{ paddingTop: `${(VP_H / VP_W) * 100}%` }}
          >
            <div className="absolute inset-0 flex items-start justify-center">

              {/* İlk yükleme */}
              {!state && isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
                    <Globe className="w-7 h-7 text-cyan-400 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <p className="text-sm text-slate-200 font-medium">
                      {warmingUp ? "Chromium tarayıcısı başlatılıyor..." : "Sayfa yükleniyor..."}
                    </p>
                    <p className="text-xs text-slate-500">
                      {warmingUp ? "Gerçek tarayıcı motoru hazırlanıyor (10-15 sn)" : "Lütfen bekleyin"}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-500/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.12}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Hata */}
              {error && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 p-6">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                    <span className="text-2xl">⚠</span>
                  </div>
                  <p className="text-slate-300 text-sm text-center max-w-72">{error}</p>
                  <Button type="button" size="sm" variant="outline"
                    className="border-cyan-700/50 text-cyan-400 hover:bg-cyan-900/20 text-xs"
                    onClick={() => navigate(HOME_URL)}>
                    Yeniden Başlat
                  </Button>
                </div>
              )}

              {/* Gizli klavye input */}
              <input
                ref={hiddenInputRef}
                type="text"
                className="absolute opacity-0 w-0 h-0 pointer-events-none"
                onKeyDown={handleHiddenKeyDown}
                onChange={() => {}}
                value=""
                tabIndex={-1}
                aria-hidden="true"
                readOnly={false}
              />

              {/* Screenshot — object-fill ile tam ve doğru koordinat eşlemesi */}
              {state && (
                <div className="absolute inset-0">
                  <img
                    ref={imgRef}
                    src={state.screenshot}
                    alt="Tarayıcı"
                    className={`w-full h-full select-none transition-opacity duration-100 ${
                      isLoading ? "opacity-40" : "opacity-100"
                    }`}
                    style={{
                      objectFit: "fill",
                      cursor: isLoading ? "wait" : keyboardMode ? "text" : "crosshair",
                      display: "block",
                    }}
                    onClick={handleImgClick}
                    draggable={false}
                  />

                  {/* Klavye modu göstergesi */}
                  {keyboardMode && !isLoading && (
                    <div className="absolute top-2 right-12 pointer-events-none">
                      <div className="flex items-center gap-1 bg-cyan-900/80 border border-cyan-600/50 rounded-full px-2 py-0.5">
                        <Keyboard className="w-3 h-3 text-cyan-400" />
                        <span className="text-xs text-cyan-300">Yazı yazın</span>
                      </div>
                    </div>
                  )}

                  {/* Yükleniyor overlay */}
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="flex items-center gap-2 bg-slate-900/95 px-3 py-2 rounded-lg border border-cyan-700/40 shadow-xl">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span className="text-xs text-slate-200">İşleniyor...</span>
                      </div>
                    </div>
                  )}

                  {/* Scroll butonları */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-auto">
                    <Button type="button" size="sm" variant="ghost"
                      className="h-7 w-7 p-0 bg-slate-800/85 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/50 rounded-md"
                      onClick={() => doAction(() => browserApi("scroll", { deltaY: -450 }), keyboardMode)} disabled={isLoading}>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost"
                      className="h-7 w-7 p-0 bg-slate-800/85 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/50 rounded-md"
                      onClick={() => doAction(() => browserApi("scroll", { deltaY: 450 }), keyboardMode)} disabled={isLoading}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Hızlı çek butonu */}
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/95 backdrop-blur-sm border border-cyan-600/40 rounded-full px-3 py-1.5 shadow-2xl">
                      <span className="text-xs text-slate-500 max-w-44 truncate hidden md:block">
                        {(state.url || "").replace("https://www.trendyol.com", "trendyol.com")}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onExtract(state.url)}
                        disabled={isLoading}
                        className={`h-7 px-3 text-xs font-semibold rounded-full gap-1.5 transition-all ${
                          isTrendyolProduct
                            ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 animate-pulse-slow"
                            : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                        }`}
                      >
                        <Zap className="w-3 h-3" />
                        {isTrendyolProduct ? "Bu Ürünü Çek!" : "URL'yi Ekle"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Alt durum çubuğu */}
          <div className="px-3 py-1.5 bg-slate-900/80 border-t border-slate-700/40 flex items-center justify-between">
            <span className="text-xs flex items-center gap-1.5">
              {isTrendyolProduct ? (
                <span className="text-cyan-400 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Ürün sayfası algılandı — çekmeye hazır
                </span>
              ) : keyboardMode ? (
                <span className="text-amber-400 flex items-center gap-1">
                  <Keyboard className="w-3 h-3" />
                  Klavye aktif — sayfaya yazı yazabilirsiniz
                </span>
              ) : (
                <span className="text-slate-500 flex items-center gap-1">
                  <MousePointer className="w-3 h-3" />
                  Tıklayarak gezin · Tıkladıktan sonra yazı yazabilirsiniz
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {state?.title && (
                <span className="text-xs text-slate-600 max-w-44 truncate hidden sm:block">{state.title}</span>
              )}
              <span className="text-xs text-slate-700">Chromium</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
