import { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCcw, Smartphone } from "lucide-react";

type Branding = {
  success: boolean;
  configured?: boolean;
  hasIcon?: boolean;
  iconUrl?: string | null;
  updatedAt?: string | null;
  appName?: string;
  message?: string;
};
export default function MaykAppBranding() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  async function load() {
    try {
      const [brandingRes, authRes] = await Promise.all([
        fetch("/api/mayk/branding", { credentials: "include", cache: "no-store" }),
        fetch("/api/auth/me", { credentials: "include", cache: "no-store" }),
      ]);
      if (!brandingRes.ok) throw new Error("Logo ayarları okunamadı");
      const data = await brandingRes.json();
      const auth = authRes.ok ? await authRes.json() : null;
      setBranding(data);
      setIsAdmin(auth?.user?.systemRole === "admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo ayarları okunamadı");
    }
  }
  useEffect(() => { void load(); }, []);

  async function upload(file: File) {
    setError(""); setNotice("");
    if (file.type !== "image/png") { setError("Yalnızca PNG formatı kabul edilir."); return; }
    if (file.size > 4 * 1024 * 1024) { setError("Logo dosyası en fazla 4 MB olabilir."); return; }
    const imageBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Dosya okunamadı"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
    const validSize = await new Promise<boolean>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth === 1024 && image.naturalHeight === 1024);
      image.onerror = () => resolve(false);
      image.src = imageBase64;
    });
    if (!validSize) { setError("Görsel 1024 × 1024 piksel olmalıdır."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/mayk/branding/icon", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const result: Branding = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Yükleme başarısız");
      setNotice(result.message || "Logo kaydedildi.");
      setRevision(current => current + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme başarısız");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-cyan-800/70 bg-slate-900/90 p-5 text-white">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Smartphone className="h-6 w-6 text-cyan-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">M.A.Y.K — iOS Uygulaması</h2>
          <p className="text-xs text-slate-400">iPhone uygulama simgesi ve TestFlight logo yönetimi</p>
        </div>
        <button type="button" onClick={() => { setError(""); void load(); }} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" aria-label="Logo durumunu yenile">
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
          {branding?.hasIcon ? (
            <img src={`/api/mayk/branding/icon.png?v=${revision || branding.updatedAt || 0}`} alt="M.A.Y.K uygulama logosu" className="h-full w-full object-cover" />
          ) : <ImagePlus className="h-10 w-10 text-slate-600" />}
        </div>
        <div className="flex-1 space-y-3">
          <p className="text-sm text-slate-300">
            {branding?.hasIcon ? "Logo sunucuda kayıtlı. Sonraki iOS derlemesine aktarılmaya hazır." : "Henüz özel logo yüklenmemiş. Varsayılan M.A.Y.K logosu kullanılacak."}
          </p>
          <p className="text-xs text-slate-400">Dosya: PNG · Ölçü: 1024 × 1024 px · En fazla 4 MB</p>
          {!branding?.configured && branding ? <p className="text-xs text-amber-300">Kalıcı logo depolaması için Supabase sunucu ayarları gereklidir.</p> : null}
          {isAdmin ? (
            <>
              <input ref={fileRef} type="file" accept="image/png" className="sr-only" id="mayk-app-icon" disabled={busy} onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file).catch(err => setError(String(err)));
              }} />
              <label htmlFor="mayk-app-icon" className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 ${busy ? "pointer-events-none opacity-50" : ""}`}>
                <ImagePlus className="h-4 w-4" /> {busy ? "Kaydediliyor..." : branding?.hasIcon ? "Logoyu Değiştir" : "1024×1024 Logo Yükle"}
              </label>
            </>
          ) : <p className="text-xs text-slate-500">Logo yükleme yetkisi sistem yöneticisine aittir.</p>}
          {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
          {notice ? <p role="status" className="text-sm text-emerald-400">{notice}</p> : null}
          <p className="text-xs text-slate-500">Web arayüzündeki logo hemen değişir. iPhone ana ekranındaki simgeyi değiştirmek için yeni TestFlight sürümü gerekir.</p>
        </div>
      </div>
    </section>
  );
}
