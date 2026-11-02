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

  async function normalizeLogo(file: File): Promise<{ imageBase64: string; resized: boolean }> {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      throw new Error("PNG, JPG veya WEBP formatında görsel seçin.");
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new Error("Kaynak görsel en fazla 20 MB olabilir.");
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Görsel açılamadı. Lütfen başka bir dosya deneyin."));
        img.src = objectUrl;
      });
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || width > 8192 || height > 8192) {
        throw new Error("Görsel boyutu geçersiz veya çok büyük (en fazla 8192 piksel).");
      }

      // iOS ikon kaynağı: oranı koruyan, tam 1024×1024, opak PNG.
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Tarayıcı görsel dönüştürmeyi desteklemiyor.");
      ctx.fillStyle = "#081327";
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const scale = Math.min(1024 / width, 1024 / height);
      const w = width * scale;
      const h = height * scale;
      ctx.drawImage(image, (1024 - w) / 2, (1024 - h) / 2, w, h);

      const imageBase64 = canvas.toDataURL("image/png");
      if (!imageBase64.startsWith("data:image/png;base64,")) {
        throw new Error("PNG biçimine dönüştürme başarısız oldu.");
      }
      const base64 = imageBase64.slice("data:image/png;base64,".length);
      if (base64.length * 3 / 4 > 4 * 1024 * 1024) {
        throw new Error("Dönüştürülen PNG 4 MB sınırını aşıyor. Daha düşük detaylı bir görsel deneyin.");
      }
      return { imageBase64, resized: width !== 1024 || height !== 1024 || file.type !== "image/png" };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function upload(file: File) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { imageBase64, resized } = await normalizeLogo(file);
      const response = await fetch("/api/mayk/branding/icon", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const result: Branding = await response.json().catch(() => ({
        success: false,
        message: "Sunucudan geçerli yanıt alınamadı.",
      }));
      if (!response.ok || !result.success) throw new Error(result.message || "Logo yüklenemedi");
      setNotice(
        (resized ? "Görsel otomatik olarak 1024 × 1024 PNG biçimine dönüştürüldü. " : "") +
        (result.message || "Logo kaydedildi."),
      );
      setRevision(current => current + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo yüklenemedi.");
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
            {branding?.hasIcon ? "Logo Railway PostgreSQL veritabanında kayıtlı. Sonraki iOS derlemesine aktarılmaya hazır." : "Henüz özel logo yüklenmemiş. Logoyu Railway PostgreSQL veritabanına kaydedebilirsiniz."}
          </p>
          <p className="text-xs text-slate-400">PNG / JPG / WEBP · Otomatik 1024 × 1024 PNG dönüşümü · Kaynak en fazla 20 MB</p>
          {!branding?.configured && branding ? <p className="text-xs text-amber-300">Logo depolaması için Railway PostgreSQL bağlantısı gereklidir.</p> : null}
          {isAdmin ? (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="mayk-app-icon" disabled={busy} onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file).catch(err => setError(String(err)));
              }} />
              <label htmlFor="mayk-app-icon" className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 ${busy ? "pointer-events-none opacity-50" : ""}`}>
                <ImagePlus className="h-4 w-4" /> {busy ? "Kaydediliyor..." : branding?.hasIcon ? "Logoyu Değiştir" : "Uygulama Logosu Yükle"}
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
