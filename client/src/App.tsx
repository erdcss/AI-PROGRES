import { Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TrackingStartupNotifier } from "@/components/TrackingStartupNotifier";
import AppTabWorkspace from "@/components/AppTabWorkspace";
import { Component, type ErrorInfo, type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, LogOut, ShieldCheck } from "lucide-react";
import { AppOpenSplash } from "@/components/AppOpenSplash";
import { MatrixBackground } from "@/components/MatrixBackground";
import { TrendyolCategoryBulkDrawer } from "@/components/TrendyolCategoryBulkDrawer";
import { TenantWorkspace } from "@/components/TenantWorkspace";
import {
  getAccountAuthServerSnapshot,
  getAccountAuthSnapshot,
  loginAccount,
  logoutAccount,
  refreshAccountSession,
  registerAccount,
  subscribeAccountAuth,
} from "@/lib/account-auth";
import { markUserInitiatedReload } from "@/lib/dev-stability";

function LoginScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await registerAccount(displayName.trim(), email.trim(), password);
      } else {
        await loginAccount(email.trim(), password);
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950/40 to-slate-950" aria-hidden />
      <Card className="relative z-10 w-full max-w-md border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur-md md:max-w-lg">
        <CardHeader className="space-y-4 px-4 text-center md:px-8">
          <img src="/orvian-logo.png" alt="Turmarkt Veri Platformu" className="mx-auto h-10 w-auto object-contain md:h-12" />
          <div>
            <div className="text-xl font-bold text-white">Turmarkt Veri Platformu</div>
            <CardDescription className="mt-2 text-slate-300">
              {mode === "login" ? "Hesabınızla güvenli giriş yapın" : "Kendi çalışma alanınızı oluşturun"}
            </CardDescription>
          </div>
          {success ? (
            <div className="rounded-xl border border-green-500/30 bg-green-900/30 p-4 text-green-400">
              <span className="flex items-center justify-center gap-2 font-semibold"><CheckCircle className="h-5 w-5" /> Giriş başarılı</span>
            </div>
          ) : null}
        </CardHeader>
        {!success ? (
          <>
            <CardContent className="space-y-4 px-4 md:px-8">
              {mode === "register" ? (
                <div className="space-y-2">
                  <Label htmlFor="display-name" className="text-white">Ad / işletme adı</Label>
                  <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">E-posta</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                />
                {mode === "register" ? <div className="text-xs text-slate-500">En az 10 karakter.</div> : null}
              </div>
              {error ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" /><span>{error}</span>
                </div>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 px-4 pb-6 md:px-8 md:pb-8">
              <Button onClick={() => void submit()} disabled={busy || !email.trim() || !password} className="h-12 w-full">
                <ShieldCheck className="mr-2 h-4 w-4" /> {busy ? "İşleniyor..." : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-slate-300"
                onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              >
                {mode === "login" ? "Yeni hesap oluştur" : "Zaten hesabım var"}
              </Button>
            </CardFooter>
          </>
        ) : null}
      </Card>
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AppErrorBoundary]", { message: error.message, stack: error.stack, componentStack: errorInfo.componentStack });
  }
  private resetError = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-white">
          <div className="max-w-lg space-y-4 text-center">
            <h1 className="text-xl font-semibold">Sayfa yüklenemedi</h1>
            <p className="text-sm text-slate-400">{this.state.error.message}</p>
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

function AdminAppShell() {
  return (
    <WouterRouter>
      <div className="min-h-screen" style={{ position: "relative" }}>
        <MatrixBackground />
        <div className="fixed right-4 top-4 z-[9000]">
          <Button type="button" size="sm" variant="outline" onClick={() => void logoutAccount()}>
            <LogOut className="mr-2 h-4 w-4" /> Çıkış
          </Button>
        </div>
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
  const auth = useSyncExternalStore(subscribeAccountAuth, getAccountAuthSnapshot, getAccountAuthServerSnapshot);

  useEffect(() => { void refreshAccountSession(); }, []);

  if (auth.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Oturum doğrulanıyor...</div>;
  }

  if (!auth.user) {
    return <><LoginScreen /><Toaster /></>;
  }

  if (auth.user.systemRole !== "admin") {
    return <AppErrorBoundary><TenantWorkspace user={auth.user} /><Toaster /></AppErrorBoundary>;
  }

  return (
    <>
      <AnimatePresence>{bootSplash ? <AppOpenSplash key="boot" onDone={() => setBootSplash(false)} /> : null}</AnimatePresence>
      <AdminAppShell />
      <TrackingStartupNotifier />
      <Toaster />
    </>
  );
}

export default App;
