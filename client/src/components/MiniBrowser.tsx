import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";

interface MiniBrowserProps {
  onExtract: (url: string) => void;
}

const HOME_URL = "https://www.trendyol.com/";
const PROXY_BASE = "/api/browser-proxy?url=";

function toProxyUrl(url: string): string {
  return PROXY_BASE + encodeURIComponent(url);
}

export default function MiniBrowser({ onExtract }: MiniBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [addressBar, setAddressBar] = useState(HOME_URL);
  const [currentUrl, setCurrentUrl] = useState(HOME_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([HOME_URL]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // postMessage listener - iframe içinden URL değişikliklerini al
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "BROWSER_URL_CHANGE") {
        const raw: string = e.data.url || "";
        // Proxy URL gelirse decode et, Trendyol URL'si ise göster
        if (raw.startsWith("http") && !raw.includes("/api/browser-proxy")) {
          setCurrentUrl(raw);
          setAddressBar(raw);
          // Geçmişe ekle
          setHistory((prev) => {
            const trimmed = prev.slice(0, historyIndex + 1);
            if (trimmed[trimmed.length - 1] !== raw) {
              const next = [...trimmed, raw];
              setHistoryIndex(next.length - 1);
              return next;
            }
            return prev;
          });
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [historyIndex]);

  const navigate = useCallback((url: string) => {
    let normalized = url.trim();
    if (!normalized.startsWith("http")) normalized = "https://" + normalized;
    setCurrentUrl(normalized);
    setAddressBar(normalized);
    setIsLoading(true);
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const next = [...trimmed, normalized];
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [historyIndex]);

  const goBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const url = history[newIndex];
      setCurrentUrl(url);
      setAddressBar(url);
      setIsLoading(true);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const url = history[newIndex];
      setCurrentUrl(url);
      setAddressBar(url);
      setIsLoading(true);
    }
  };

  const refresh = () => {
    setIsLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = toProxyUrl(currentUrl) + "&_t=" + Date.now();
    }
  };

  const isTrendyolProduct = currentUrl.includes("trendyol.com/") &&
    (currentUrl.includes("-p-") || currentUrl.includes("/p/"));

  const handleExtract = () => {
    onExtract(currentUrl);
  };

  const proxyUrl = toProxyUrl(currentUrl) + "&_t=" + Math.floor(Date.now() / 30000);

  return (
    <div className="w-full">
      {/* Toggle butonu */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border-cyan-700/40 hover:border-cyan-500/60 hover:bg-slate-700/50 text-cyan-300 hover:text-cyan-200 transition-all"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <span className="font-medium text-sm">Dahili Tarayıcı</span>
          <span className="text-xs text-slate-400">— Trendyol'da gez, hızlıca çek</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </Button>

      {/* Tarayıcı paneli */}
      {isOpen && (
        <div className="mt-2 rounded-lg border border-cyan-800/30 overflow-hidden bg-slate-900/95 shadow-2xl">
          {/* Adres çubuğu toolbar */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 border-b border-slate-700/50">
            {/* Navigation butonları */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30"
              onClick={goBack}
              disabled={historyIndex <= 0}
              title="Geri"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30"
              onClick={goForward}
              disabled={historyIndex >= history.length - 1}
              title="İleri"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={refresh}
              title="Yenile"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5" />
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={() => navigate(HOME_URL)}
              title="Ana Sayfa (Trendyol)"
            >
              <Home className="w-3.5 h-3.5" />
            </Button>

            {/* Adres çubuğu */}
            <form
              className="flex-1 flex items-center"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(addressBar);
              }}
            >
              <div className="flex-1 flex items-center bg-slate-900/80 border border-slate-600/50 rounded-md px-2 h-7 gap-1.5">
                <Link2 className="w-3 h-3 text-slate-500 shrink-0" />
                <input
                  type="text"
                  value={addressBar}
                  onChange={(e) => setAddressBar(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
                  placeholder="https://www.trendyol.com/..."
                  spellCheck={false}
                />
              </div>
            </form>

            {/* Dışarıda aç */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={() => window.open(currentUrl, "_blank")}
              title="Tarayıcıda Aç"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>

            {/* Kapat */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-slate-700"
              onClick={() => setIsOpen(false)}
              title="Kapat"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* iframe alanı */}
          <div className="relative" style={{ height: "480px" }}>
            <iframe
              ref={iframeRef}
              src={proxyUrl}
              title="Mini Tarayıcı"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              onLoad={() => setIsLoading(false)}
              onError={() => setIsLoading(false)}
            />

            {/* Yükleniyor overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-full border border-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span className="text-sm text-slate-300">Yükleniyor...</span>
                </div>
              </div>
            )}

            {/* Hızlı Çek butonu - ürün sayfasındaysa göster */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
              <div className="pointer-events-auto flex gap-2 items-center bg-slate-900/90 backdrop-blur-sm border border-cyan-600/40 rounded-full px-3 py-1.5 shadow-xl">
                <span className="text-xs text-slate-400 max-w-48 truncate">{currentUrl.replace("https://www.trendyol.com", "trendyol.com")}</span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleExtract}
                  className={`h-7 px-3 text-xs font-semibold rounded-full gap-1.5 transition-all ${
                    isTrendyolProduct
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/30"
                      : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  {isTrendyolProduct ? "Bu Ürünü Çek" : "URL'yi Ekle"}
                </Button>
              </div>
            </div>
          </div>

          {/* Alt bilgi */}
          <div className="px-3 py-1.5 bg-slate-800/50 border-t border-slate-700/30 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {isTrendyolProduct ? (
                <span className="text-cyan-400">✓ Ürün sayfası algılandı</span>
              ) : (
                "Bir ürün sayfasına gidin, ardından \"Bu Ürünü Çek\" butonuna tıklayın"
              )}
            </span>
            <span className="text-xs text-slate-600">Dahili Tarayıcı</span>
          </div>
        </div>
      )}
    </div>
  );
}
