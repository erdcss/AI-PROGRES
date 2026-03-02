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
  ChevronDown as ScrollDown,
  ChevronUp as ScrollUp,
  MousePointer,
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

const HOME_URL = "https://www.trendyol.com/";

async function browserApi(endpoint: string, body?: object): Promise<BrowserState> {
  const res = await fetch(`/api/browser/${endpoint}`, {
    method: body !== undefined ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Browser API hatası: ${res.status}`);
  return res.json();
}

export default function MiniBrowser({ onExtract }: MiniBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<BrowserState | null>(null);
  const [addressBar, setAddressBar] = useState(HOME_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const doAction = useCallback(async (action: () => Promise<BrowserState>) => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await action();
      setState(s);
      setAddressBar(s.url);
    } catch (e: any) {
      setError(e.message || "Bir hata oluştu");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // İlk açılışta Trendyol'a git
  useEffect(() => {
    if (isOpen && !initialized) {
      setInitialized(true);
      doAction(() => browserApi("navigate", { url: HOME_URL }));
    }
  }, [isOpen, initialized, doAction]);

  const navigate = (url: string) => {
    let u = url.trim();
    if (!u.startsWith("http")) u = "https://" + u;
    setAddressBar(u);
    doAction(() => browserApi("navigate", { url: u }));
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(addressBar);
  };

  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !state) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    doAction(() => browserApi("click", {
      x,
      y,
      pageWidth: rect.width,
      pageHeight: rect.height,
    }));
  };

  const handleScroll = (e: React.WheelEvent) => {
    e.preventDefault();
    doAction(() => browserApi("scroll", { deltaY: e.deltaY > 0 ? 400 : -400 }));
  };

  const isTrendyolProduct = (state?.url || "").includes("trendyol.com/") &&
    ((state?.url || "").includes("-p-") || (state?.url || "").includes("/p/"));

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
          <span className="text-xs text-slate-400 hidden sm:inline">— Trendyol'da gez, hızlıca çek</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {/* Tarayıcı paneli */}
      {isOpen && (
        <div className="mt-2 rounded-lg border border-cyan-800/30 overflow-hidden bg-slate-950 shadow-2xl flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800/90 border-b border-slate-700/60 shrink-0">
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30"
              onClick={() => doAction(() => browserApi("back", {}))} disabled={isLoading} title="Geri">
              <ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30"
              onClick={() => doAction(() => browserApi("forward", {}))} disabled={isLoading} title="İleri">
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={() => navigate(addressBar)} disabled={isLoading} title="Yenile">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={() => navigate(HOME_URL)} disabled={isLoading} title="Trendyol Ana Sayfa">
              <Home className="w-3.5 h-3.5" />
            </Button>

            {/* Adres çubuğu */}
            <form onSubmit={handleAddressSubmit} className="flex-1 flex items-center">
              <div className="flex-1 flex items-center bg-slate-900 border border-slate-600/50 rounded px-2 h-7 gap-1.5 focus-within:border-cyan-500/50 transition-colors">
                <Link2 className="w-3 h-3 text-slate-500 shrink-0" />
                <input
                  type="text"
                  value={addressBar}
                  onChange={(e) => setAddressBar(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500 min-w-0"
                  placeholder="https://www.trendyol.com/..."
                  spellCheck={false}
                />
              </div>
            </form>

            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
              onClick={() => window.open(state?.url || HOME_URL, "_blank")} title="Tarayıcıda Aç">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-slate-700"
              onClick={() => setIsOpen(false)} title="Kapat">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Ekran görüntüsü alanı */}
          <div className="relative bg-slate-950 flex items-start justify-center" style={{ height: 500 }}>
            {/* İlk yükleme */}
            {!state && isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 border border-slate-700">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span className="text-sm text-slate-300">Tarayıcı başlatılıyor...</span>
                </div>
                <p className="text-xs text-slate-500 max-w-56 text-center">
                  İlk açılışta 5–10 saniye sürebilir
                </p>
              </div>
            )}

            {/* Hata */}
            {error && !isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/95 p-6">
                <p className="text-red-400 text-sm font-medium">⚠️ Hata</p>
                <p className="text-slate-400 text-xs text-center max-w-64">{error}</p>
                <Button size="sm" variant="outline" className="text-xs"
                  onClick={() => navigate(HOME_URL)}>
                  Yeniden Dene
                </Button>
              </div>
            )}

            {/* Ekran görüntüsü */}
            {state && (
              <div className="relative w-full h-full overflow-hidden">
                <img
                  ref={imgRef}
                  src={state.screenshot}
                  alt="Tarayıcı"
                  className={`w-full h-full object-cover object-top select-none transition-opacity duration-150 ${isLoading ? "opacity-50" : "opacity-100"}`}
                  style={{ cursor: isLoading ? "wait" : "default" }}
                  onClick={handleImgClick}
                  onWheel={handleScroll}
                  draggable={false}
                />
                {/* Yükleme overlay */}
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-full border border-slate-700">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      <span className="text-xs text-slate-300">Yükleniyor...</span>
                    </div>
                  </div>
                )}
                {/* Scroll yardımcıları */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-auto">
                  <Button type="button" size="sm" variant="ghost"
                    className="h-7 w-7 p-0 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/50"
                    onClick={() => doAction(() => browserApi("scroll", { deltaY: -500 }))} disabled={isLoading}>
                    <ScrollUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost"
                    className="h-7 w-7 p-0 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/50"
                    onClick={() => doAction(() => browserApi("scroll", { deltaY: 500 }))} disabled={isLoading}>
                    <ScrollDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Hızlı çek butonu - sabit altta */}
            {state && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/95 backdrop-blur border border-cyan-600/40 rounded-full px-3 py-1.5 shadow-xl">
                  <span className="text-xs text-slate-500 max-w-40 truncate hidden sm:block">
                    {(state.url || "").replace("https://www.trendyol.com", "trendyol.com")}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onExtract(state.url)}
                    disabled={isLoading}
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
            )}
          </div>

          {/* Alt bilgi çubuğu */}
          <div className="px-3 py-1 bg-slate-800/60 border-t border-slate-700/40 flex items-center justify-between shrink-0">
            <span className="text-xs flex items-center gap-1.5">
              {isTrendyolProduct ? (
                <span className="text-cyan-400">✓ Ürün sayfası — "Bu Ürünü Çek" butonuna tıklayın</span>
              ) : (
                <span className="text-slate-500 flex items-center gap-1">
                  <MousePointer className="w-3 h-3" />
                  Sayfaya tıklayarak gezin, ürün sayfasında &quot;Bu Ürünü Çek&quot; butonunu kullanın
                </span>
              )}
            </span>
            {state?.title && (
              <span className="text-xs text-slate-600 max-w-32 truncate hidden sm:block">{state.title}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
