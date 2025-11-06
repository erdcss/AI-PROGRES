import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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
import AIEnhancedScraper from "@/pages/ai-enhanced-scraper";
import PriceMovementTest from "@/pages/price-movement-test";
// Removed auto-csv page import
// Removed bulk-csv page import
import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { UrlHistory } from "@/components/UrlHistory";
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
import MemoryTrackingPage from "@/pages/MemoryTrackingPage";
import SavedUrlsPage from "@/pages/SavedUrlsPage";
import ShopifyTrackingPage from "@/pages/ShopifyTrackingPage";
import ShopifyProductsPage from './pages/shopify-products';
import TrackingDashboard from "@/pages/tracking-dashboard";
import ProductPreview from "@/pages/product-preview";
import TelegramNotifications from "@/pages/TelegramNotifications";
import ProductTrackingPage from "@/pages/ProductTrackingPage";
import TelegramManagementPage from "@/pages/TelegramManagementPage";
import ProductStatisticsPage from "@/pages/ProductStatisticsPage";
import { TBotAssistant } from "@/components/TBotAssistant";
import { MobileNavigation } from "@/components/MobileNavigation";

// Login component with password protection
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [num1, setNum1] = useState(Math.floor(Math.random() * 10));
  const [num2, setNum2] = useState(Math.floor(Math.random() * 10));
  const [sum, setSum] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(5);
  
  // Sabit şifre (4434)
  const CORRECT_PASSWORD = "4434";
  
  const handleLogin = () => {
    // Sadece şifre kontrolü yap (Kullanıcı seçimi yok)
    if (password === CORRECT_PASSWORD) {
      // Check captcha
      if (parseInt(sum) === num1 + num2) {
        setCaptchaError(false);
        setSuccess(true);
        
        // Başlat geri sayım
        let count = 5;
        setCountdown(count);
        
        const timer = setInterval(() => {
          count--;
          setCountdown(count);
          
          if (count <= 0) {
            clearInterval(timer);
            // Giriş tamamlandı
            onLogin();
          }
        }, 1000);
      } else {
        setCaptchaError(true);
        // Generate new numbers
        setNum1(Math.floor(Math.random() * 10));
        setNum2(Math.floor(Math.random() * 10));
        setSum("");
      }
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };
  
  return (
    <div className="flex items-center justify-center min-h-screen business-bg px-4">
      <Card className="business-card w-full max-w-md md:max-w-lg shadow-2xl">
        <CardHeader className="business-header space-y-4 md:space-y-6 text-center px-4 md:px-6">
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
              <span className="text-green-400 font-semibold animate-pulse flex items-center justify-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Giriş başarılı, sistem aktif ediliyor... ({countdown}s)
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

function Router() {
  const isMobile = useIsMobile();
  
  return (
    <AnimatePresence mode="wait" initial={false}>
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
        {(params) => (
          <PageTransition>
            <div className={`mx-auto ${isMobile ? 'px-4 py-4 max-w-full' : 'container px-4 py-4'}`}>
              <div className={`flex flex-col ${isMobile ? 'gap-4' : 'gap-4'}`}>
                <ScraperPage />
                <UrlHistory onSelect={(url) => {
                  // Find the scraper component and update its URL
                  const scraperComponent = document.querySelector('input[name="url"]');
                  if (scraperComponent) {
                    const event = new Event('change', { bubbles: true });
                    Object.defineProperty(event, 'target', { value: { value: url } });
                    scraperComponent.dispatchEvent(event);
                  }
                }} />
              </div>
            </div>
          </PageTransition>
        )}
      </Route>
      <Route path="/trendyol">
        <PageTransition>
          <div className={`mx-auto ${isMobile ? 'px-4 py-4 max-w-full' : 'container px-4 py-4'}`}>
            <div className={`flex flex-col ${isMobile ? 'gap-4' : 'gap-4'}`}>
              <ScraperPage />
              <UrlHistory onSelect={(url) => {
                // Find the scraper component and update its URL
                const scraperComponent = document.querySelector('input[name="url"]');
                if (scraperComponent) {
                  const event = new Event('change', { bubbles: true });
                  Object.defineProperty(event, 'target', { value: { value: url } });
                  scraperComponent.dispatchEvent(event);
                }
              }} />
            </div>
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
      <Route path="/memory-tracking">
        <PageTransition>
          <MemoryTrackingPage />
        </PageTransition>
      </Route>
      <Route path="/tracking-dashboard">
        <PageTransition>
          <TrackingDashboard />
        </PageTransition>
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
        <PageTransition>
          <ShopifyTrackingPage />
        </PageTransition>
      </Route>
      <Route path="/shopify-products">
        <PageTransition>
          <ShopifyProductsPage />
        </PageTransition>
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
        <PageTransition>
          <ProductTrackingPage />
        </PageTransition>
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
    </AnimatePresence>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(true); // Testing: auto-login for enhanced variant extraction
  
  // Uygulama kapanıp açıldığında yeniden giriş istensin
  useEffect(() => {
    // Oturum durumunu zamanla sıfırla (opsiyonel)
    const checkInterval = setInterval(() => {
      const lastLogin = localStorage.getItem('lastLogin');
      if (lastLogin) {
        // 30 dakika sonra oturumu sonlandır
        const lastLoginTime = parseInt(lastLogin);
        const thirtyMinutes = 30 * 60 * 1000;
        if (Date.now() - lastLoginTime > thirtyMinutes) {
          setIsLoggedIn(false);
          localStorage.removeItem('lastLogin');
        }
      }
    }, 60000); // Her dakika kontrol et
    
    return () => clearInterval(checkInterval);
  }, []);
  
  const handleLogin = () => {
    setIsLoggedIn(true);
    localStorage.setItem('lastLogin', Date.now().toString());
  };
  
  if (!isLoggedIn) {
    return (
      <QueryClientProvider client={queryClient}>
        <LoginScreen onLogin={handleLogin} />
        <Toaster />
      </QueryClientProvider>
    );
  }
  
  return (
    <QueryClientProvider client={queryClient}>
      <div className="business-bg min-h-screen">
        <MobileNavigation />
        <Router />
        <TBotAssistant />
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;