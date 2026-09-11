import { Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TrackingStartupNotifier } from "@/components/TrackingStartupNotifier";
import AppTabWorkspace from "@/components/AppTabWorkspace";
import { Component, type ErrorInfo, type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, ShieldCheck } from "lucide-react";
import { AppOpenSplash } from "@/components/AppOpenSplash";
import { TrendyolCategoryBulkDrawer } from "@/components/TrendyolCategoryBulkDrawer";
import { TenantWorkspace } from "@/components/TenantWorkspace";
import {
  getAccountAuthServerSnapshot,
  getAccountAuthSnapshot,
  loginAccount,
  refreshAccountSession,
  subscribeAccountAuth,
} from "@/lib/account-auth";
import { markUserInitiatedReload } from "@/lib/dev-stability";

function LoginScreen() {
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
      await loginAccount(email.trim(), password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş yapılamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] grid min-h-screen place-items-center bg-[#090909] px-4 py-8 text-[#f5f5f5]">
      <div className="w-full max-w-[420px] rounded-[10px] border border-[#252525] bg-[#101010] p-6 shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-[7px] border border-[#343434] bg-[#151515] text-[11px] font-semibold">O</span>
            <span className="text-[13px] font-semibold tracking-[-0.02em]">ORVIAN <span className="text-[#b8f171]">AI</span></span>
          </div>
          <span className="text-[9px] uppercase tracking-[0.1em] text-[#555]">Turmarkt</span>
        </div>

        <div className="mb-5 mt-7">
          <div className="text-[10px] uppercase tracking-[0.09em] text-[#666]">Güvenli yönetici erişimi</div>
          <h1 className="mb-2 mt-1 text-2xl font-medium tracking-[-0.03em]">Veri Programına Giriş</h1>
          <p className="m-0 text-[12px] leading-5 text-[#888]">Orvian arayüzü ile ürün aktarımı, takip ve bildirim sistemine tek hesabınızla erişin.</p>
        </div>

        {success ? (
          <div className="mb-4 flex items-center gap-2 rounded-[7px] border border-[#b8f171]/20 bg-[#b8f171]/[0.06] px-3 py-2.5 text-[11px] text-[#b8f171]">
            <CheckCircle className="h-4 w-4" /> Giriş başarılı
          </div>
        ) : null}

        {!success ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="email" className="text-[11px] font-normal text-[#b3b3b3]">E-posta</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-10 rounded-[8px] border-[#292929] bg-[#151515] px-3 text-[12px] text-[#ededed] placeholder:text-[#555] focus-visible:ring-[#b8f171]/40"
                placeholder="Yönetici e-postası"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password" className="text-[11px] font-normal text-[#b3b3b3]">Şifre</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-10 rounded-[8px] border-[#292929] bg-[#151515] px-3 text-[12px] text-[#ededed] focus-visible:ring-[#b8f171]/40"
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              />
            </div>

            {error ? (
              <div className="flex items-center gap-2 rounded-[7px] border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-[11px] text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span>
              </div>
            ) : null}

            <Button
              onClick={() => void submit()}
              disabled={busy || !email.trim() || !password}
              className="mt-1 h-10 rounded-[8px] border border-[#b8f171] bg-[#b8f171] text-[11px] font-semibold text-[#080808] hover:bg-[#c5f58e] disabled:opacity-40"
            >
              <ShieldCheck className="mr-2 h-4 w-4" /> {busy ? "Doğrulanıyor..." : "Giriş Yap"}
            </Button>
            <div className="pt-1 text-center text-[9px] text-[#555]">Hesap ve oturum bilgileri Turmarkt Veri Programı ile senkronize edilir.</div>
          </div>
        ) : null}
      </div>
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
        <div className="flex min-h-screen items-center justify-center bg-[#090909] p-6 text-white">
          <div className="max-w-lg space-y-4 text-center">
            <h1 className="text-xl font-semibold">Sayfa yüklenemedi</h1>
            <p className="text-sm text-[#777]">{this.state.error.message}</p>
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
      <AppErrorBoundary>
        <AppTabWorkspace />
        <TrendyolCategoryBulkDrawer />
      </AppErrorBoundary>
    </WouterRouter>
  );
}

function App() {
  const [bootSplash, setBootSplash] = useState(true);
  const auth = useSyncExternalStore(subscribeAccountAuth, getAccountAuthSnapshot, getAccountAuthServerSnapshot);

  useEffect(() => { void refreshAccountSession(); }, []);

  if (auth.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#090909] text-sm text-[#777]">Oturum doğrulanıyor...</div>;
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
