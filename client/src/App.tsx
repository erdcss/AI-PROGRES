import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import ScraperPage from "@/pages/scraper";
import MarketplaceSelection from "@/pages/marketplace-selection";
import ComingSoon from "@/pages/coming-soon";
import AutoCSVPage from "@/pages/auto-csv";
import BulkCSVPage from "@/pages/bulk-csv";
import { useState, useEffect } from "react";
import { UrlHistory } from "@/components/UrlHistory";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck, AlertCircle } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      <Card className="w-[380px] shadow-xl border-slate-700">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">
            <div className="flex items-center justify-center gap-2">
              <Lock className="h-6 w-6 text-blue-500" />
              <span>Veri Transfer Programı</span>
            </div>
          </CardTitle>
          <CardDescription className="text-center">
            {success ? 
              <span className="text-green-500 font-bold animate-pulse">
                Giriş başarılı, sistem aktif ediliyor... ({countdown}s)
              </span>
             : 
              "Lütfen şifrenizi girin"
            }
          </CardDescription>
        </CardHeader>
        {!success && (
          <>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Lütfen şifreyi giriniz"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={error ? "border-red-500" : ""}
                  autoFocus
                />
                {error && (
                  <div className="text-sm text-red-500 flex items-center gap-1 animate-pulse">
                    <AlertCircle className="h-4 w-4" />
                    <span>Hatalı şifre</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="captcha">Güvenlik sorusu: {num1} + {num2} = ?</Label>
                <Input
                  id="captcha"
                  type="text"
                  value={sum}
                  onChange={(e) => setSum(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={captchaError ? "border-red-500" : ""}
                  placeholder="Lütfen toplamı yazın"
                />
                {captchaError && (
                  <div className="text-sm text-red-500 flex items-center gap-1 animate-pulse">
                    <AlertCircle className="h-4 w-4" />
                    <span>Hatalı toplama</span>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleLogin} 
                className="w-full" 
                variant="default"
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
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

function Router() {
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
            <ComingSoon platform={params.platform} />
          </PageTransition>
        )}
      </Route>
      <Route path="/scraper/:platform?">
        {(params) => (
          <PageTransition>
            <div className="container mx-auto p-4">
              <div className="flex flex-col gap-4">
                <ScraperPage platform={params.platform || 'trendyol'} />
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
      <Route>
        <PageTransition>
          <NotFound />
        </PageTransition>
      </Route>
    </Switch>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
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
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;