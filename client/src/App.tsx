import { Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TrackingStartupNotifier } from "@/components/TrackingStartupNotifier";
import AppTabWorkspace from "@/components/AppTabWorkspace";
import { useState, useEffect, useSyncExternalStore, Component, type ReactNode, type ErrorInfo } from "react";
import { AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ShieldCheck, AlertCircle, CheckCircle } from "lucide-react";
import { AppOpenSplash } from "@/components/AppOpenSplash";
import { MobileNavigation } from "@/components/MobileNavigation";
import { MatrixBackground } from "@/components/MatrixBackground";
import { TrendyolCategoryBulkDrawer } from "@/components/TrendyolCategoryBulkDrawer";
import {
  ensureAppSessionRestored,
  getAppSessionSnapshot,
  getInitialLoggedInState,
  pruneExpiredAppSession,
  saveAppSession,
  subscribeAppSession,
  touchAppSession,
  verifyAppPassword,
} from "@/lib/app-auth";
import { markUserInitiatedReload } from "@/lib/dev-stability";

// Login component with password protection
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [num1, setNum1] = useState(Math.floor(Math.random() * 10));
  const [num2, setNum2] = useState(Math.floor(Math.random() * 10));
  const [sum, setSum] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const handleLogin = () => {
    if (!verifyAppPassword(password)) {
      setError(true);
      setTimeout(() => setError(false), 2000);
      return;
    }

    const expectedSum = num1 + num2;
    const userSum = Number(String(sum).trim());
    if (!Number.isFinite(userSum) || userSum !== expectedSum) {
      setCaptchaError(true);
      setNum1(Math.floor(Math.random() * 10));
      setNum2(Math.floor(Math.random() * 10));
      setSum("");
      return;
    }

    setCaptchaError(false);
    setError(false);
    setSuccess(true);
    onLogin();
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center min-h-screen bg-slate-950 px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950/50 to-slate-950"
        aria-hidden
      />
      <Card className="relative z-10 w-full max-w-md border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur-md md:max-w-lg">
        <CardHeader className="space-y-4 px-4 text-center md:space-y-6 md:px-6">
          <img
            src="/orvian-logo.png"
            alt="ORVIAN"
            className="mx-auto h-10 w-auto object-contain md:h-12"
          />
          <CardDescription className="text-white text-base md:text-lg font-bold">
            Güvenli sistem erişimi için kimlik doğrulama
          </CardDescription>
          {success && (
            <div className="p-4 bg-green-900/30 rounded-xl border border-green-500/30">
              <span className="text-green-400 font-semibold flex items-center justify-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Giriş başarılı, yönlendiriliyorsunuz...
              </span>
            </div>
          )}
        </CardHeader>
        {!success && (
          <>
            <CardContent className="space-y-4 md:space-y-6 px-4 md:px-8">
              <div className="space-y-3">
                <Label htmlFor="password" className="text-sm font-bold text-white">
                  Şifre
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={`business-input h-12 md:h-14 text-base md:text-lg rounded-xl ${error ? "border-red-500 focus:border-red-500" : ""}`}
                  autoFocus
                  autoComplete="current-password"
                  inputMode="text"
                />
                {error && (
                  <div className="text-sm text-red-400 flex items-center gap-2 p-3 bg-red-900/20 rounded-lg border border-red-500/30 animate-pulse">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>Hatalı şifre</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-3">
                <Label htmlFor="captcha" className="text-sm font-bold text-white">
                  Güvenlik sorusu: {num1} + {num2} = ?
                </Label>
                <Input
                  id="captcha"
                  type="number"
                  value={sum}
                  onChange={(e) => setSum(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={`business-input h-12 md:h-14 text-base md:text-lg rounded-xl ${captchaError ? "border-red-500 focus:border-red-500" : ""}`}
                  placeholder="Toplamı yazın"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                {captchaError && (
                  <div className="text-sm text-red-400 flex items-center gap-2 p-3 bg-red-900/20 rounded-lg border border-red-500/30 animate-pulse">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>Hatalı toplama</span>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 px-4 md:px-8 pb-6 md:pb-8">
              <Button 
                onClick={handleLogin} 
                className="business-button w-full h-12 md:h-14 text-base md:text-lg font-bold rounded-xl shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95" 
                variant="default"
              >
                <ShieldCheck className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                Giriş Yap
              </Button>
            </CardFooter>
          </>
        )}
        {success && (
          <CardContent className="py-6">
            <div className="flex items-center justify-center">
              <div className="h-12 w-12 rounded-full border-4 border-t-blue-500 border-b-blue-600 border-r-transparent border-l-transparent animate-spin"></div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AppErrorBoundary]", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  private resetError = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
          <div className="max-w-lg text-center space-y-4">
            <h1 className="text-xl font-semibold">Sayfa yüklenemedi</h1>
            <p className="text-slate-400 text-sm">{this.state.error.message}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button type="button" onClick={this.resetError}>Tekrar Dene</Button>
              <Button type="button" variant="outline" onClick={() => { markUserInitiatedReload(); window.location.reload(); }}>Sayfayı Yenile</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppShell() {
  return (
    <WouterRouter>
      <div className="min-h-screen" style={{ position: "relative" }}>
        <MatrixBackground />
        <div style={{ position: "relative", zIndex: 1 }}>
          <AppErrorBoundary>
            <AppTabWorkspace />
            <TrendyolCategoryBulkDrawer />
          </AppErrorBoundary>
        </div>
      </div>
    </WouterRouter>
  );
}

function App() {
  const [bootSplash, setBootSplash] = useState(true);
  const isLoggedIn = useSyncExternalStore(
    subscribeAppSession,
    getAppSessionSnapshot,
    getInitialLoggedInState,
  );

  useEffect(() => {
    ensureAppSessionRestored();
    touchAppSession();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        touchAppSession();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const expiryCheck = setInterval(() => {
      pruneExpiredAppSession();
    }, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(expiryCheck);
    };
  }, []);

  const handleLogin = () => {
    saveAppSession();
  };

  if (!isLoggedIn) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <AnimatePresence>
        {bootSplash ? (
          <AppOpenSplash key="boot" onDone={() => setBootSplash(false)} />
        ) : null}
      </AnimatePresence>
      <AppShell />
      <TrackingStartupNotifier />
      <Toaster />
    </>
  );
}

export default App;