import { Switch, Route, Redirect } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { useIsMobile } from "@/hooks/use-mobile";
import ScraperPage from "@/pages/scraper";
import PriceComparisonPage from "@/pages/price-comparison";
import MarketplaceSelection from "@/pages/marketplace-selection";
import MainDashboard from "@/pages/main-dashboard";
import ComingSoon from "@/pages/coming-soon";
import { TelegramPage } from "@/pages/telegram";
import EmailSettings from "@/pages/EmailSettings";
import ArcelikScraper from "@/pages/arcelik-scraper";
import PttAvmScraper from "@/pages/pttavm-scraper";
import AIEnhancedScraper from "@/pages/ai-enhanced-scraper";
import PriceMovementTest from "@/pages/price-movement-test";
// Removed auto-csv page import
// Removed bulk-csv page import
import { useState, useEffect, useSyncExternalStore, Component, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck, AlertCircle, CheckCircle } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { AIBrandLogo } from "@/components/AILogo";
import ProductDataAnalysisPage from "@/pages/product-data-analysis";
import SchedulerPage from "@/pages/scheduler";
import SystemStatusPage from "@/pages/system-status";
import ReplitAgent from "@/pages/replit-agent-fixed";
import SOSControl from "@/pages/sos-control";
import ProductReviews from "@/pages/product-reviews";
import TrendyolReviewsPage from "@/pages/trendyol-reviews";
import MemoryTrackingPage from "@/pages/MemoryTrackingPage";
import SavedUrlsPage from "@/pages/SavedUrlsPage";
import ShopifyTrackingPage from "@/pages/ShopifyTrackingPage";
import TrackingDashboard from "@/pages/tracking-dashboard";
import ProductPreview from "@/pages/product-preview";
import TelegramNotifications from "@/pages/TelegramNotifications";
import ProductTrackingPage from "@/pages/ProductTrackingPage";
import UrunTakipPage from "@/pages/urun-takip";
import ControlCenterPage from "@/pages/control-center";
import TelegramManagementPage from "@/pages/TelegramManagementPage";
import ProductStatisticsPage from "@/pages/ProductStatisticsPage";
import { TBotAssistant } from "@/components/TBotAssistant";
import { MobileNavigation } from "@/components/MobileNavigation";
import MemoryDashboard from "@/pages/memory-dashboard";
import ShopifySystemPage from "@/pages/ShopifySystemPage";
import { MatrixBackground } from "@/components/MatrixBackground";
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
          <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl flex items-center justify-center shadow-lg">
            <Lock className="h-6 w-6 md:h-8 md:w-8 text-white" />
          </div>
          <CardTitle className="text-2xl md:text-3xl font-bold text-white">
            Veri Transfer Programı
          </CardTitle>
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
              
              <div className="flex justify-center">
                <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 bg-blue-900 rounded-full border business-border">
                  <div className="w-6 h-6 md:w-8 md:h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                    <span className="text-white text-xs md:text-sm font-bold">AI</span>
                  </div>
                  <span className="text-xs md:text-sm text-white font-bold">Yapay Zeka Destekli</span>
                </div>
              </div>
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
    if (import.meta.env.DEV) {
      console.error("[AppErrorBoundary]", error);
    }
    // UI'ı kilitleme — hatayı logla, çocukları render etmeye devam et
    return { error: null };
  }

  componentDidCatch(error: Error) {
    console.error("[AppErrorBoundary] recovered:", error.message);
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
              <Button onClick={this.resetError}>Devam Et</Button>
              <Button variant="outline" onClick={() => { markUserInitiatedReload(); window.location.reload(); }}>Sayfayı Yenile</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  const isMobile = useIsMobile();
  
  return (
      <Switch>
      <Route path="/">
        <PageTransition>
          <MarketplaceSelection />
        </PageTransition>
      </Route>
      <Route path="/marketplace">
        <PageTransition>
          <MarketplaceSelection />
        </PageTransition>
      </Route>
      <Route path="/coming-soon/:platform?">
        {(params) => (
          <PageTransition>
            <ComingSoon platform={params && params.platform} />
          </PageTransition>
        )}
      </Route>
      {/* Scraper routes */}
      <Route path="/scraper/:platform?">
        <PageTransition>
          <div className={`mx-auto ${isMobile ? "px-4 py-4 max-w-full" : "container px-4 py-4"}`}>
            <ScraperPage />
          </div>
        </PageTransition>
      </Route>
      <Route path="/trendyol">
        <PageTransition>
          <div className={`mx-auto ${isMobile ? "px-4 py-4 max-w-full" : "container px-4 py-4"}`}>
            <ScraperPage />
          </div>
        </PageTransition>
      </Route>
      <Route path="/price-comparison">
        <PageTransition>
          <PriceComparisonPage />
        </PageTransition>
      </Route>
      <Route path="/telegram">
        <PageTransition>
          <TelegramPage />
        </PageTransition>
      </Route>
      <Route path="/email">
        <PageTransition>
          <EmailSettings />
        </PageTransition>
      </Route>
      
      <Route path="/product-data-analysis">
        <PageTransition>
          <ProductDataAnalysisPage />
        </PageTransition>
      </Route>
      <Route path="/data-analysis">
        <PageTransition>
          <ProductDataAnalysisPage />
        </PageTransition>
      </Route>
      <Route path="/saved-urls">
        <PageTransition>
          <SavedUrlsPage />
        </PageTransition>
      </Route>
      <Route path="/scheduler">
        <PageTransition>
          <SchedulerPage />
        </PageTransition>
      </Route>
      <Route path="/system-status">
        <PageTransition>
          <SystemStatusPage />
        </PageTransition>
      </Route>
      <Route path="/replit-agent">
        <PageTransition>
          <ReplitAgent />
        </PageTransition>
      </Route>
      <Route path="/sos-control">
        <PageTransition>
          <SOSControl />
        </PageTransition>
      </Route>
      <Route path="/product-reviews">
        <PageTransition>
          <ProductReviews />
        </PageTransition>
      </Route>
      <Route path="/trendyol-reviews">
        <PageTransition>
          <TrendyolReviewsPage />
        </PageTransition>
      </Route>
      <Route path="/memory-tracking">
        <PageTransition>
          <MemoryTrackingPage />
        </PageTransition>
      </Route>
      <Route path="/control-center">
        <PageTransition>
          <ControlCenterPage />
        </PageTransition>
      </Route>
      <Route path="/tracking-dashboard">
        <Redirect to="/control-center?tab=tracking" />
      </Route>
      <Route path="/arcelik">
        <PageTransition>
          <ArcelikScraper />
        </PageTransition>
      </Route>
      <Route path="/scraper/arcelik">
        <PageTransition>
          <ArcelikScraper />
        </PageTransition>
      </Route>
      <Route path="/pttavm">
        <PageTransition>
          <PttAvmScraper />
        </PageTransition>
      </Route>
      <Route path="/scraper/pttavm">
        <PageTransition>
          <PttAvmScraper />
        </PageTransition>
      </Route>
      <Route path="/ai-enhanced">
        <PageTransition>
          <AIEnhancedScraper />
        </PageTransition>
      </Route>
      <Route path="/price-movement-test">
        <PageTransition>
          <PriceMovementTest />
        </PageTransition>
      </Route>
      <Route path="/shopify-tracking">
        <Redirect to="/control-center?tab=shopify" />
      </Route>
      <Route path="/product-preview">
        <PageTransition>
          <ProductPreview />
        </PageTransition>
      </Route>
      <Route path="/telegram-notifications">
        <PageTransition>
          <TelegramNotifications />
        </PageTransition>
      </Route>
      <Route path="/product-tracking">
        <Redirect to="/control-center?tab=tracking" />
      </Route>
      <Route path="/urun-takip">
        <Redirect to="/control-center?tab=tracking" />
      </Route>
      <Route path="/memory-dashboard">
        <MemoryDashboard />
      </Route>
      <Route path="/shopify-system">
        <Redirect to="/control-center?tab=shopify" />
      </Route>
      <Route path="/telegram-management">
        <PageTransition>
          <TelegramManagementPage />
        </PageTransition>
      </Route>
      <Route path="/product-statistics/:id">
        {(params) => (
          <PageTransition>
            <ProductStatisticsPage />
          </PageTransition>
        )}
      </Route>
      </Switch>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen" style={{ position: "relative" }}>
      <MatrixBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <AppErrorBoundary>
          <MobileNavigation />
          <Router />
          <TBotAssistant />
        </AppErrorBoundary>
      </div>
    </div>
  );
}

function App() {
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
      <AppShell />
      <Toaster />
    </>
  );
}

export default App;