import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeAccountPassword } from "@/lib/account-auth";

export function AccountSecurityButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage(null);
  };

  const submit = async () => {
    setMessage(null);
    if (newPassword.length < 10) {
      setMessage({ type: "error", text: "Yeni şifre en az 10 karakter olmalı." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Yeni şifreler eşleşmiyor." });
      return;
    }
    setBusy(true);
    try {
      const result = await changeAccountPassword(currentPassword, newPassword);
      setMessage({ type: "success", text: result?.message || "Şifre değiştirildi." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Şifre değiştirilemedi." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <KeyRound className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"} />
        {compact ? <span className="sr-only">Şifre Değiştir</span> : "Şifre Değiştir"}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) close(); }}>
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Hesap Güvenliği</h2>
                <p className="mt-1 text-sm text-slate-400">Şifrenizi değiştirdiğinizde diğer açık oturumlar otomatik kapatılır.</p>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={close} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-account-password">Mevcut şifre</Label>
                <Input id="current-account-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-account-password">Yeni şifre</Label>
                <Input id="new-account-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-account-password">Yeni şifre tekrar</Label>
                <Input id="confirm-account-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} />
              </div>

              {message ? (
                <div className={`rounded-lg border px-3 py-2 text-sm ${message.type === "success" ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300" : "border-red-500/30 bg-red-950/40 text-red-300"}`}>
                  {message.text}
                </div>
              ) : null}

              <Button type="button" className="w-full" onClick={() => void submit()} disabled={busy || !currentPassword || !newPassword || !confirmPassword}>
                <KeyRound className="mr-2 h-4 w-4" /> {busy ? "Değiştiriliyor..." : "Şifreyi Değiştir"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
