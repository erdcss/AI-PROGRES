import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { useState, useEffect } from "react";
import { UrlHistory } from "@/components/UrlHistory";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck, AlertCircle } from "lucide-react";

// Login component with password protection
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [num1, setNum1] = useState(Math.floor(Math.random() * 10));
  const [num2, setNum2] = useState(Math.floor(Math.random() * 10));
  const [sum, setSum] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [loggedInUser, setLoggedInUser] = useState("");
  
  // Kullanıcı bilgileri
  const users = {
    "Oğuz Aslan": "4434",
    "Erdem Çalışgan": "953151"
  };
  
  // Kullanıcı seçildiğinde username state'ini güncelle
  const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUsername(e.target.value);
    setError(false);
  };
  
  const handleLogin = () => {
    const correctPassword = users[username as keyof typeof users];
    
    if (correctPassword && password === correctPassword) {
      // Check captcha
      if (parseInt(sum) === num1 + num2) {
        setCaptchaError(false);
        setSuccess(true);
        setLoggedInUser(username);
        
        // Başlat geri sayım
        let count = 5;
        setCountdown(count);
        
        const timer = setInterval(() => {
          count--;
          setCountdown(count);
          
          if (count <= 0) {
            clearInterval(timer);
            // Kullanıcı adını localStorage'a kaydet
            localStorage.setItem('currentUser', username);
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
                {loggedInUser} için giriş başarılı, sistem aktif ediliyor... ({countdown}s)
              </span>
             : 
              "Lütfen kullanıcı adı ve şifrenizi girin"
            }
          </CardDescription>
        </CardHeader>
        {!success && (
          <>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Kullanıcı Seçin</Label>
                <select
                  id="username"
                  value={username}
                  onChange={handleUserSelect}
                  onKeyDown={handleKeyDown}
                  className={`w-full rounded-md border ${error ? "border-red-500" : "border-input"} px-3 py-2 text-sm ring-offset-background transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-background`}
                >
                  <option value="">Kullanıcı seçin</option>
                  {Object.keys(users).map((user) => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={error ? "border-red-500" : ""}
                  placeholder="••••"
                />
                {error && (
                  <div className="text-sm text-red-500 flex items-center gap-1 animate-pulse">
                    <AlertCircle className="h-4 w-4" />
                    <span>Hatalı kullanıcı adı veya şifre</span>
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
        <div className="container mx-auto p-4">
          <div className="flex flex-col gap-4">
            <Home />
            <UrlHistory onSelect={(url) => {
              // Find the Home component and update its URL
              const homeComponent = document.querySelector('input[name="url"]');
              if (homeComponent) {
                const event = new Event('change', { bubbles: true });
                Object.defineProperty(event, 'target', { value: { value: url } });
                homeComponent.dispatchEvent(event);
              }
            }} />
          </div>
        </div>
      </Route>
      <Route component={NotFound} />
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
    
    // Kullanıcı bilgisini görüntüle
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      console.log(`Giriş yapan kullanıcı: ${currentUser}`);
    }
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