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
  Lock,
  Search,
  Keyboard,
  Star,
  MoreHorizontal,
  Copy,
  MousePointer2,
} from "lucide-react";

interface BrowserState {
  screenshot: string;
  url: string;
  title: string;
  width: number;
  height: number;
  canGoBack?: boolean;
}

interface MiniBrowserProps {
  onExtract: (url: string) => void;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface ContextMenu {
  x: number;
  y: number;
  pageX: number;
  pageY: number;
  linkUrl?: string;
}

const HOME_URL = "https://www.trendyol.com/cep-telefonu-x-c104";
const VP_W = 1280;
const VP_H = 800;

const SPECIAL_KEYS: Record<string, string> = {
  Enter: "Enter", Backspace: "Backspace", Delete: "Delete",
  Escape: "Escape", Tab: "Tab", ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
};

async function browserApi(endpoint: string, body?: object): Promise<BrowserState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 38000);
  try {
    const isGet = body === undefined;
    const res = await fetch(`/api/browser/${endpoint}`, {
      method: isGet ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: isGet ? undefined : JSON.stringify(body),
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

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function isHttps(url: string): boolean {
  return url.startsWith("https://");
}

function isTrendyolProductUrl(url: string): boolean {
  return url.includes("trendyol.com/") && (url.includes("-p-") || url.includes("/p/"));
}

export default function MiniBrowser({ onExtract }: MiniBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<BrowserState | null>(null);
  const [addressBar, setAddressBar] = useState(HOME_URL);
  const [isAddressEditing, setIsAddressEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [progress, setProgress] = useState(0);
  const [isProgressing, setIsProgressing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [imgOpacity, setImgOpacity] = useState(1);
  const [prevScreenshot, setPrevScreenshot] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollRef = useRef(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rippleIdRef = useRef(0);

  // Yükleme çubuğu animasyonu
  const startProgress = useCallback(() => {
    setProgress(0);
    setIsProgressing(true);
    let p = 0;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      p += Math.random() * 12 + 3;
      if (p >= 85) {
        p = 85;
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      }
      setProgress(p);
    }, 120);
  }, []);

  const finishProgress = useCallback(() => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setProgress(100);
    setTimeout(() => { setIsProgressing(false); setProgress(0); }, 350);
  }, []);

  // Tıklama animasyonu
  const addRipple = useCallback((x: number, y: number) => {
    const id = ++rippleIdRef.current;
    setRipples(r => [...r, { id, x, y }]);
    setTimeout(() => setRipples(r => r.filter(ri => ri.id !== id)), 600);
  }, []);

  // Genel işlem yürütücü
  const doAction = useCallback(async (
    action: () => Promise<BrowserState>,
    keepKeyboard = false,
    showProgress = true
  ) => {
    setIsLoading(true);
    setError(null);
    if (showProgress) startProgress();
    try {
      // Önceki ekranı soluklaştır
      setImgOpacity(0.55);
      const s = await action();
      // Yeni ekran gelince geçiş yap
      setPrevScreenshot(state?.screenshot || null);
      setState(s);
      setAddressBar(s.url);
      setImgOpacity(1);
    } catch (e: any) {
      const msg = e.name === "AbortError"
        ? "Zaman aşımı. Lütfen tekrar deneyin."
        : (e.message || "Bir hata oluştu");
      setError(msg);
      setImgOpacity(1);
    } finally {
      setIsLoading(false);
      finishProgress();
      if (!keepKeyboard) setKeyboardMode(false);
    }
  }, [state, startProgress, finishProgress]);

  // İlk açılış
  useEffect(() => {
    if (isOpen && !initialized) {
      setInitialized(true);
      setWarmingUp(true);
      setIsLoading(true);
      startProgress();
      browserApi("navigate", { url: HOME_URL })
        .then(s => { setState(s); setAddressBar(s.url); setError(null); setImgOpacity(1); })
        .catch(e => setError(e.name === "AbortError" ? "Zaman aşımı. Tekrar deneyin." : e.message))
        .finally(() => { setIsLoading(false); setWarmingUp(false); finishProgress(); });
    }
  }, [isOpen, initialized, startProgress, finishProgress]);

  // Klavye modu focus
  useEffect(() => {
    if (keyboardMode && hiddenInputRef.current) hiddenInputRef.current.focus();
  }, [keyboardMode]);

  // Arama kutusu focus
  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
      searchRef.current.select();
    }
  }, [searchOpen]);

  // Adres çubuğu focus
  useEffect(() => {
    if (isAddressEditing && addressRef.current) {
      addressRef.current.focus();
      addressRef.current.select();
    }
  }, [isAddressEditing]);

  // Scroll — debounced, batched
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isLoading) return;
      pendingScrollRef.current += e.deltaY;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        const delta = pendingScrollRef.current;
        pendingScrollRef.current = 0;
        const clampedDelta = Math.max(-1200, Math.min(1200, delta));
        doAction(() => browserApi("scroll", { deltaY: clampedDelta }), keyboardMode, false);
      }, 40);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [isLoading, keyboardMode, doAction]);

  // Global klavye kısayolları
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (contextMenu) { setContextMenu(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        setIsAddressEditing(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        if (!isLoading) navigate(addressBar);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(s => !s);
      }
      if (e.key === 'F5') {
        e.preventDefault();
        if (!isLoading) navigate(addressBar);
      }
      if (e.key === 'Escape' && !keyboardMode) {
        setSearchOpen(false);
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isLoading, keyboardMode, addressBar, contextMenu]);

  // Sağ tık menüsünü kapat
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close, { once: true });
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const navigate = useCallback((url: string) => {
    let u = url.trim();
    if (!u) return;
    if (!u.startsWith("http") && !u.startsWith("//")) {
      if (u.includes(".") && !u.includes(" ")) {
        u = "https://" + u;
      } else {
        u = `https://www.trendyol.com/sr?q=${encodeURIComponent(u)}&lang=tr`;
      }
    }
    setAddressBar(u);
    setIsAddressEditing(false);
    setKeyboardMode(false);
    doAction(() => browserApi("navigate", { url: u }));
  }, [doAction]);

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); navigate(addressBar); }
    if (e.key === "Escape") { setIsAddressEditing(false); setAddressBar(state?.url || HOME_URL); }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchOpen(false);
    navigate(searchQuery);
    setSearchQuery("");
  };

  // Tıklama
  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !state || isLoading || isDragging) return;
    if (contextMenu) { setContextMenu(null); return; }
    const rect = imgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    const px = Math.round(xRatio * VP_W);
    const py = Math.round(yRatio * VP_H);
    // Ripple animasyonu (ekrandaki koordinat)
    const rippleX = e.clientX - rect.left;
    const rippleY = e.clientY - rect.top;
    addRipple(rippleX, rippleY);
    setKeyboardMode(true);
    setPendingText("");
    doAction(() => browserApi("click", { x: px, y: py, pageWidth: VP_W, pageHeight: VP_H }), true);
  };

  // Çift tıklama
  const handleImgDblClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !state || isLoading) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    const px = Math.round(xRatio * VP_W);
    const py = Math.round(yRatio * VP_H);
    doAction(() => browserApi("dblclick", { x: px, y: py, pageWidth: VP_W, pageHeight: VP_H }), true);
  };

  // Sağ tık menüsü
  const handleImgContextMenu = (e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    if (!imgRef.current || !state) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    setContextMenu({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pageX: Math.round(xRatio * VP_W),
      pageY: Math.round(yRatio * VP_H),
    });
  };

  // Drag-to-scroll
  const handleImgMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (e.button !== 0 || isLoading) return;
    setDragStartY(e.clientY);
    setIsDragging(false);
  };

  const handleImgMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (e.buttons !== 1 || isLoading) return;
    const diff = Math.abs(e.clientY - dragStartY);
    if (diff > 8) setIsDragging(true);
  };

  const handleImgMouseUp = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isDragging || isLoading || !imgRef.current) {
      setIsDragging(false);
      return;
    }
    const rect = imgRef.current.getBoundingClientRect();
    const startYRatio = dragStartY - rect.top;
    const endYRatio = e.clientY - rect.top;
    const delta = (startYRatio - endYRatio) * 2.5;
    if (Math.abs(delta) > 10) {
      doAction(() => browserApi("scroll", { deltaY: delta }), keyboardMode, false);
    }
    setIsDragging(false);
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
      typeTimerRef.current = setTimeout(() => {
        setPendingText("");
        doAction(() => browserApi("type", { text: newText }), true);
      }, 350);
    }
  };

  const isProduct = isTrendyolProductUrl(state?.url || "");
  const domain = getDomain(state?.url || addressBar);
  const isSecure = isHttps(state?.url || addressBar);

  return (
    <div className="w-full">
      {/* Açma/kapama butonu */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border-cyan-700/40 hover:border-cyan-500/60 hover:bg-slate-700/50 text-cyan-300 hover:text-cyan-200 transition-all"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <span className="font-medium text-sm">Dahili Tarayıcı</span>
          <span className="text-xs text-slate-400 hidden sm:inline">— Gerçek Chromium motoru</span>
          {isOpen && isProduct && (
            <span className="text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded-full">Ürün</span>
          )}
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {isOpen && (
        <div className="mt-2 rounded-xl border border-slate-700/60 overflow-hidden bg-[#1a1b1e] shadow-2xl flex flex-col"
          style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)" }}>

          {/* Yükleme çubuğu */}
          {isProgressing && (
            <div className="relative h-0.5 w-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 transition-all"
                style={{ width: `${progress}%`, transition: progress === 100 ? "width 0.15s ease" : "width 0.12s linear" }}
              />
              {progress < 100 && (
                <div className="absolute top-0 right-0 w-24 h-full bg-gradient-to-r from-transparent to-cyan-300/40 animate-pulse" />
              )}
            </div>
          )}

          {/* Sekme çubuğu */}
          <div className="flex items-center px-2 pt-1.5 pb-0 bg-[#16171a] border-b border-slate-800/80 gap-1">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-t-lg text-xs max-w-60 truncate cursor-default
              bg-[#1a1b1e] border border-slate-700/40 border-b-transparent -mb-px relative`}>
              <Globe className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="text-slate-300 truncate">
                {state?.title || domain || "Yeni Sekme"}
              </span>
              {isLoading && <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin ml-auto shrink-0" />}
            </div>
            <div className="flex-1" />
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-0.5 px-2 py-1.5 bg-[#1e1f23] border-b border-slate-800/60">
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 disabled:opacity-25 transition-colors"
              onClick={() => doAction(() => browserApi("back", {}))}
              disabled={isLoading}
              title="Geri (Alt+Sol)">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 disabled:opacity-25 transition-colors"
              onClick={() => doAction(() => browserApi("forward", {}))}
              disabled={isLoading}
              title="İleri (Alt+Sağ)">
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
              onClick={() => navigate(state?.url || addressBar)}
              disabled={isLoading}
              title="Yenile (Ctrl+R)">
              {isLoading
                ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                : <RotateCw className="w-4 h-4" />}
            </button>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-amber-400 hover:bg-slate-700/60 transition-colors"
              onClick={() => navigate(HOME_URL)}
              disabled={isLoading}
              title="Trendyol'a Git">
              <Home className="w-4 h-4" />
            </button>

            {/* Adres çubuğu */}
            <div
              className={`flex-1 flex items-center gap-1.5 bg-[#2a2b2f] border rounded-full px-3 h-8 mx-1.5 cursor-text transition-all
                ${isAddressEditing ? "border-cyan-500/70 bg-[#2e2f35]" : "border-slate-700/50 hover:border-slate-600/70"}`}
              onClick={() => { if (!isAddressEditing) { setIsAddressEditing(true); setAddressBar(state?.url || addressBar); } }}>
              {isAddressEditing ? (
                <Search className="w-3 h-3 text-slate-500 shrink-0" />
              ) : isSecure ? (
                <Lock className="w-3 h-3 text-green-500/80 shrink-0" />
              ) : (
                <Globe className="w-3 h-3 text-slate-500 shrink-0" />
              )}
              {isAddressEditing ? (
                <input
                  ref={addressRef}
                  type="text"
                  value={addressBar}
                  onChange={e => setAddressBar(e.target.value)}
                  onKeyDown={handleAddressKeyDown}
                  onBlur={() => { setIsAddressEditing(false); setAddressBar(state?.url || HOME_URL); }}
                  className="flex-1 bg-transparent text-xs text-slate-100 outline-none min-w-0"
                  spellCheck={false}
                />
              ) : (
                <span className="flex-1 text-xs text-slate-300 truncate min-w-0 select-none">
                  {state ? (
                    <span>
                      <span className="text-slate-500">{isSecure ? "https://" : "http://"}</span>
                      <span className="font-medium">{domain}</span>
                      <span className="text-slate-500">
                        {(() => {
                          try { return new URL(state.url).pathname.slice(0, 40); } catch { return ""; }
                        })()}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500">Adres veya arama...</span>
                  )}
                </span>
              )}
              {!isAddressEditing && isProduct && (
                <Star className="w-3 h-3 text-cyan-400/70 shrink-0" />
              )}
            </div>

            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-cyan-400 hover:bg-slate-700/60 transition-colors"
              onClick={() => { setSearchOpen(s => !s); setSearchQuery(""); }}
              disabled={isLoading}
              title="Trendyol'da Ara (Ctrl+F)">
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
              onClick={() => window.open(state?.url || HOME_URL, "_blank")}
              title="Tarayıcıda Aç">
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="h-7 w-7 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-700/60 transition-colors"
              onClick={() => setIsOpen(false)}
              title="Kapat">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Arama overlay */}
          {searchOpen && (
            <div className="px-3 py-2 bg-[#16171a] border-b border-slate-800/60">
              <form onSubmit={handleSearchSubmit} className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-[#2a2b2f] border border-slate-600/50 rounded-lg px-3 py-1.5 focus-within:border-cyan-500/60">
                  <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Escape" && setSearchOpen(false)}
                    placeholder="URL veya ürün adı yaz..."
                    className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                    spellCheck={false}
                  />
                </div>
                <Button type="submit" size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white h-8 px-3 text-xs rounded-lg">
                  Git
                </Button>
                <button type="button" onClick={() => setSearchOpen(false)} className="text-slate-500 hover:text-slate-300 px-1">
                  <X className="w-4 h-4" />
                </button>
              </form>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {["Telefon", "Laptop", "Ayakkabı", "Çanta", "Saat"].map(q => (
                  <button key={q} type="button"
                    className="text-xs px-2 py-0.5 bg-slate-700/60 hover:bg-slate-600/60 text-slate-400 hover:text-slate-200 rounded-full transition-colors"
                    onClick={() => { setSearchQuery(q); }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Klavye modu banner */}
          {keyboardMode && !isLoading && (
            <div className="flex items-center justify-between px-3 py-1 bg-cyan-900/20 border-b border-cyan-700/20">
              <div className="flex items-center gap-2 text-xs text-cyan-400/80">
                <Keyboard className="w-3 h-3" />
                <span>Klavye aktif</span>
                {pendingText && (
                  <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300 border border-slate-700/50">
                    "{pendingText}"
                  </span>
                )}
              </div>
              <button type="button" onClick={() => setKeyboardMode(false)}
                className="text-xs text-slate-500 hover:text-slate-300">Kapat</button>
            </div>
          )}

          {/* Ana görüntü alanı */}
          <div
            ref={containerRef}
            className="relative bg-[#0e0f11] w-full select-none"
            style={{ paddingTop: "44%" }}>
            <div className="absolute inset-0">

              {/* İlk yükleme */}
              {!state && isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#0e0f11]">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 flex items-center justify-center">
                      <Globe className="w-8 h-8 text-cyan-500/60" />
                    </div>
                    <div className="absolute inset-0 rounded-2xl border border-cyan-500/30 animate-ping opacity-40" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm text-slate-300 font-medium">
                      {warmingUp ? "Chromium başlatılıyor..." : "Sayfa yükleniyor..."}
                    </p>
                    <p className="text-xs text-slate-600">
                      {warmingUp ? "İlk açılış 10-20 saniye sürebilir" : "Lütfen bekleyin"}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-500/40 animate-bounce"
                        style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Hata */}
              {error && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0e0f11] p-8">
                  <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl">⚠</div>
                  <div className="text-center">
                    <p className="text-slate-200 text-sm font-medium mb-1">Bağlantı Hatası</p>
                    <p className="text-slate-500 text-xs max-w-64">{error}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm"
                      className="bg-cyan-600/90 hover:bg-cyan-500 text-white text-xs"
                      onClick={() => navigate(state?.url || HOME_URL)}>Tekrar Dene</Button>
                    <Button type="button" size="sm" variant="outline"
                      className="border-slate-700 text-slate-400 text-xs"
                      onClick={() => navigate(HOME_URL)}>Ana Sayfa</Button>
                  </div>
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
              />

              {/* Ekran görüntüsü */}
              {state && (
                <div className="absolute inset-0">
                  <img
                    ref={imgRef}
                    src={state.screenshot}
                    alt="Tarayıcı"
                    className="w-full h-full block select-none"
                    style={{
                      objectFit: "fill",
                      opacity: imgOpacity,
                      transition: imgOpacity === 1 ? "opacity 0.15s ease" : "opacity 0.08s ease",
                      cursor: isLoading ? "wait" : isDragging ? "grabbing" : keyboardMode ? "text" : "default",
                    }}
                    onClick={handleImgClick}
                    onDoubleClick={handleImgDblClick}
                    onContextMenu={handleImgContextMenu}
                    onMouseDown={handleImgMouseDown}
                    onMouseMove={handleImgMouseMove}
                    onMouseUp={handleImgMouseUp}
                    onMouseLeave={() => setIsDragging(false)}
                    draggable={false}
                  />

                  {/* Ripple animasyonları */}
                  {ripples.map(r => (
                    <div key={r.id}
                      className="absolute pointer-events-none"
                      style={{ left: r.x, top: r.y, transform: "translate(-50%, -50%)" }}>
                      <div className="w-8 h-8 rounded-full border-2 border-cyan-400/70 animate-ping opacity-0"
                        style={{ animationDuration: "0.5s" }} />
                      <div className="absolute inset-0 w-2 h-2 m-auto rounded-full bg-cyan-400/50" />
                    </div>
                  ))}

                  {/* Sürükleme göstergesi */}
                  {isDragging && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
                      <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/60 rounded-full px-2.5 py-1">
                        <MousePointer2 className="w-3 h-3 text-slate-400" />
                        <span className="text-xs text-slate-400">Kaydır</span>
                      </div>
                    </div>
                  )}

                  {/* Klavye modu göstergesi */}
                  {keyboardMode && !isLoading && (
                    <div className="absolute top-2 right-14 pointer-events-none">
                      <div className="flex items-center gap-1 bg-cyan-900/90 border border-cyan-600/40 rounded-full px-2 py-0.5">
                        <Keyboard className="w-2.5 h-2.5 text-cyan-400" />
                        <span className="text-xs text-cyan-300">Yazın</span>
                      </div>
                    </div>
                  )}

                  {/* Yükleniyor overlay */}
                  {isLoading && (
                    <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                      <div className="flex items-center gap-2 bg-slate-900/95 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-700/50 shadow-xl">
                        <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                        <span className="text-xs text-slate-300">Yükleniyor...</span>
                      </div>
                    </div>
                  )}

                  {/* Scroll butonları */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 pointer-events-auto">
                    <button type="button"
                      className="h-7 w-7 flex items-center justify-center bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/40 rounded-lg transition-colors backdrop-blur-sm disabled:opacity-30"
                      onClick={() => doAction(() => browserApi("scroll", { deltaY: -500 }), keyboardMode, false)}
                      disabled={isLoading}>
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button type="button"
                      className="h-7 w-7 flex items-center justify-center bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/40 rounded-lg transition-colors backdrop-blur-sm disabled:opacity-30"
                      onClick={() => doAction(() => browserApi("scroll", { deltaY: 500 }), keyboardMode, false)}
                      disabled={isLoading}>
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Çek butonu */}
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-700/50 rounded-full px-3 py-1.5 shadow-2xl">
                      <span className="text-xs text-slate-600 max-w-48 truncate hidden lg:block">
                        {(state.url || "").replace("https://", "").slice(0, 45)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onExtract(state.url)}
                        disabled={isLoading}
                        className={`h-7 px-3 text-xs font-semibold rounded-full gap-1.5 transition-all ${
                          isProduct
                            ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20"
                            : "bg-slate-700/80 hover:bg-slate-600 text-slate-300"
                        }`}>
                        <Zap className="w-3 h-3" />
                        {isProduct ? "Bu Ürünü Çek!" : "URL'yi Kullan"}
                      </Button>
                    </div>
                  </div>

                  {/* Sağ tık menüsü */}
                  {contextMenu && (
                    <div
                      className="absolute bg-[#252628] border border-slate-700/60 rounded-lg shadow-2xl py-1 z-50 pointer-events-auto min-w-44"
                      style={{ left: Math.min(contextMenu.x, (imgRef.current?.clientWidth || 500) - 180), top: Math.min(contextMenu.y, (imgRef.current?.clientHeight || 400) - 180) }}
                      onClick={e => e.stopPropagation()}>
                      {[
                        { icon: <ArrowLeft className="w-3.5 h-3.5" />, label: "Geri Git", action: () => { setContextMenu(null); doAction(() => browserApi("back", {})); } },
                        { icon: <RotateCw className="w-3.5 h-3.5" />, label: "Yenile", action: () => { setContextMenu(null); navigate(state.url); } },
                        null,
                        { icon: <ExternalLink className="w-3.5 h-3.5" />, label: "Yeni Sekmede Aç", action: () => { setContextMenu(null); window.open(state.url, "_blank"); } },
                        { icon: <Copy className="w-3.5 h-3.5" />, label: "URL'yi Kopyala", action: () => { setContextMenu(null); navigator.clipboard.writeText(state.url); } },
                        ...(isProduct ? [null, { icon: <Zap className="w-3.5 h-3.5 text-cyan-400" />, label: "Bu Ürünü Çek!", action: () => { setContextMenu(null); onExtract(state.url); }, className: "text-cyan-400 font-semibold" }] : []),
                      ].map((item, i) =>
                        item === null ? (
                          <div key={i} className="my-1 border-t border-slate-700/40" />
                        ) : (
                          <button key={i} type="button"
                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-slate-700/60 transition-colors text-left ${(item as any).className || "text-slate-300"}`}
                            onClick={(item as any).action}>
                            <span className="text-slate-500">{(item as any).icon}</span>
                            {(item as any).label}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Alt durum çubuğu */}
          <div className="px-3 py-1.5 bg-[#16171a] border-t border-slate-800/60 flex items-center justify-between">
            <span className="text-xs flex items-center gap-1.5">
              {isProduct ? (
                <span className="text-cyan-400 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Ürün sayfası algılandı
                </span>
              ) : keyboardMode ? (
                <span className="text-amber-400/80 flex items-center gap-1">
                  <Keyboard className="w-3 h-3" />
                  Klavye aktif
                </span>
              ) : isLoading ? (
                <span className="text-slate-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {state?.url?.replace("https://", "").slice(0, 50)}
                </span>
              ) : (
                <span className="text-slate-600 flex items-center gap-1">
                  <MousePointer2 className="w-3 h-3" />
                  Tıkla · Kaydır · Sağ tık
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {isSecure && <Lock className="w-3 h-3 text-green-500/50" />}
              <span className="text-xs text-slate-700">Chromium 125</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
