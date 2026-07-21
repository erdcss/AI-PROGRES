import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleHelp,
  MinusCircle,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  resolveColorFamilyUiStatus,
  type ColorFamilyUiCheck,
  type ColorFamilyUiStatus,
} from "@/lib/color-family-ui-status";
import { resolvePreviewProxyUrl } from "@/lib/product-image-url";
import { getTrendyolImageFallbackUrls } from "@shared/trendyol-product-images";

type PreviewLike = Parameters<typeof resolveColorFamilyUiStatus>[0];

const CHECK_TEST_IDS: Record<string, string> = {
  candidates: "color-family-check-candidates",
  members: "color-family-check-members",
  colors: "color-family-check-colors",
  galleries: "color-family-check-galleries",
  "variant-images": "color-family-check-variant-images",
  "family-key": "color-family-check-family-key",
  aliases: "color-family-check-aliases",
};

function GalleryThumb({ url, alt }: { url: string; alt: string }) {
  const candidates = useMemo(() => getTrendyolImageFallbackUrls(url), [url]);
  const [idx, setIdx] = useState(0);
  const [useProxy, setUseProxy] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setIdx(0);
    setUseProxy(true);
    setFailed(false);
  }, [url]);
  const current = candidates[idx] ?? url;
  const src = useProxy ? resolvePreviewProxyUrl(current) ?? current : current;
  if (failed || !src) {
    return <div className="w-full h-full bg-zinc-900" />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (useProxy) {
          setUseProxy(false);
          return;
        }
        if (idx + 1 < candidates.length) {
          setIdx((i) => i + 1);
          setUseProxy(true);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

function stateStyles(state: ColorFamilyUiStatus["state"]) {
  switch (state) {
    case "success":
      return {
        badge: "border-emerald-800/50 bg-emerald-950/40 text-emerald-300",
        Icon: CheckCircle2,
        iconClass: "text-emerald-400",
      };
    case "partial":
      return {
        badge: "border-amber-800/50 bg-amber-950/30 text-amber-300",
        Icon: AlertTriangle,
        iconClass: "text-amber-400",
      };
    case "failed":
      return {
        badge: "border-red-900/50 bg-red-950/30 text-red-300",
        Icon: XCircle,
        iconClass: "text-red-400",
      };
    case "not_applicable":
      return {
        badge: "border-zinc-700 bg-zinc-900/60 text-zinc-400",
        Icon: MinusCircle,
        iconClass: "text-zinc-500",
      };
    default:
      return {
        badge: "border-zinc-700 bg-zinc-900/50 text-zinc-500",
        Icon: CircleHelp,
        iconClass: "text-zinc-500",
      };
  }
}

function CheckRow({ check }: { check: ColorFamilyUiCheck }) {
  const Icon = check.ok ? Check : check.warning ? AlertTriangle : X;
  const color = check.ok
    ? "text-emerald-400"
    : check.warning
      ? "text-amber-400"
      : "text-red-400";
  return (
    <div
      className="flex items-center justify-between gap-3 py-1 text-xs"
      data-testid={CHECK_TEST_IDS[check.key]}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
        <span className="text-zinc-300 truncate">{check.label}</span>
      </div>
      <span
        className={`tabular-nums shrink-0 max-w-[55%] truncate text-right ${
          check.key === "family-key" ? "font-mono text-[10px] text-zinc-400" : "text-zinc-500"
        }`}
        title={check.value}
      >
        {check.value}
      </span>
    </div>
  );
}

export function ColorFamilyStatusPanel({
  preview,
  compact = false,
}: {
  preview: PreviewLike;
  compact?: boolean;
}) {
  const ui = resolveColorFamilyUiStatus(preview);
  const { badge, Icon, iconClass } = stateStyles(ui.state);

  const compactLabel =
    ui.state === "success"
      ? `Renk ailesi çalıştı: ${ui.colorCount} renk`
      : ui.state === "partial"
        ? `Renk ailesi kısmi · ${ui.failedCount} hata`
        : ui.state === "failed"
          ? "Renk ailesi başarısız"
          : ui.state === "not_applicable"
            ? ui.colorCount >= 2
              ? `Çok renkli (tek ürün): ${ui.colorCount} renk`
              : "Tek renkli ürün"
            : "Renk ailesi doğrulanmadı";

  if (compact) {
    return (
      <Badge
        variant="outline"
        title={ui.description}
        data-testid="color-family-status-badge"
        className={`h-5 text-[10px] gap-1 max-w-full ${badge}`}
      >
        <Icon className={`w-3 h-3 shrink-0 ${iconClass}`} />
        <span className="truncate">{compactLabel}</span>
      </Badge>
    );
  }

  const memberProductIds = new Map<string, string>();
  const familyMembers = (
    preview as {
      colorFamily?: { members?: Array<{ color?: string; productId?: string }> };
    }
  )?.colorFamily?.members;
  if (Array.isArray(familyMembers)) {
    for (const m of familyMembers) {
      if (m.color && m.productId) memberProductIds.set(m.color, m.productId);
    }
  }

  return (
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-3"
      data-testid="color-family-status-panel"
      title={ui.description}
    >
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200">{ui.title}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {ui.state === "success" && `${ui.colorCount} renk • ${ui.memberCount} ürün`}
            {ui.state === "partial" &&
              `${ui.memberCount} ürün çekildi • ${ui.failedCount} başarısız`}
            {(ui.state === "failed" ||
              ui.state === "not_applicable" ||
              ui.state === "unknown") &&
              ui.description}
          </p>
        </div>
      </div>

      {ui.checks.length > 0 && (
        <div className="space-y-0.5 border-t border-zinc-800/80 pt-2">
          {ui.checks.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </div>
      )}

      {ui.memberStatuses.length > 0 && (
        <div data-testid="color-family-member-statuses">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Renk Ailesi</p>
          <div className="space-y-1.5">
            {ui.memberStatuses.map((m) => {
              const missingImages = m.fetched && m.imageCount === 0;
              const missingSizes = m.fetched && m.sizeCount === 0;
              const failed = !m.fetched;
              const IconM = failed ? X : missingImages || missingSizes ? AlertTriangle : Check;
              const iconColor = failed
                ? "text-red-400"
                : missingImages || missingSizes
                  ? "text-amber-400"
                  : "text-emerald-400";
              return (
                <div
                  key={m.productId || m.color}
                  className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-2"
                  data-testid={`color-family-member-status-${m.productId}`}
                >
                  <div className="flex items-start gap-2">
                    <IconM className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iconColor}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-200 truncate">{m.color || "?"}</span>
                        <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                          {m.productId}
                        </span>
                      </div>
                      {failed ? (
                        <p className="text-[11px] text-red-300/90 mt-0.5">
                          {m.error || "Sayfa alınamadı"}
                        </p>
                      ) : (
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          <span data-testid={`color-family-member-images-${m.productId}`}>
                            {m.imageCount} görsel
                          </span>
                          {" • "}
                          <span data-testid={`color-family-member-sizes-${m.productId}`}>
                            {m.sizeCount} beden
                          </span>
                          {" • "}
                          <span data-testid={`color-family-member-variants-${m.productId}`}>
                            {m.variantCount} varyant
                          </span>
                          {m.imageSource || m.sizeSource
                            ? ` · ${[m.imageSource, m.sizeSource].filter(Boolean).join("/")}`
                            : ""}
                        </p>
                      )}
                      {missingImages && (
                        <p className="text-[11px] text-amber-400/90 mt-0.5">Renk galerisi alınamadı</p>
                      )}
                      {missingSizes && (
                        <p className="text-[11px] text-amber-400/90 mt-0.5">Bedenler alınamadı</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ui.shopifyUploadBlocked && ui.blockReason && (
        <div className="rounded-md border border-red-900/40 bg-red-950/20 p-2">
          <p className="text-[11px] text-red-300/90">{ui.blockReason}</p>
        </div>
      )}

      {ui.familySourceKey && (
        <div className="text-[10px] text-zinc-500">
          <span className="uppercase tracking-wide">familySourceKey</span>
          <div
            className="mt-1 font-mono text-zinc-300 break-all"
            data-testid="color-family-family-key"
          >
            {ui.familySourceKey}
          </div>
        </div>
      )}

      {ui.sourceAliases.length > 0 && (
        <div data-testid="color-family-source-aliases">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1.5">
            sourceAliases
          </p>
          <div className="flex flex-wrap gap-1">
            {ui.sourceAliases.map((alias) => (
              <Badge
                key={alias}
                variant="outline"
                className="border-zinc-700 text-zinc-400 text-[9px] h-5 font-mono"
              >
                {alias}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {ui.failedMembers.length > 0 && (
        <div className="rounded-md border border-red-900/40 bg-red-950/20 p-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-red-400/80">
            Başarısız kardeşler
          </p>
          {ui.failedMembers.map((m, i) => (
            <p key={`${m.productId}-${i}`} className="text-[11px] text-red-300/90">
              {m.productId || "?"}
              {m.error ? ` — ${m.error}` : ""}
            </p>
          ))}
        </div>
      )}

      {Object.keys(ui.imagesByColor).length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">
            Renk Galerileri
          </p>
          <div className="space-y-2">
            {Object.entries(ui.imagesByColor).map(([color, images]) => {
              const empty = !images?.length;
              const productId = memberProductIds.get(color);
              return (
                <div
                  key={color}
                  className={`rounded-md border p-2 ${
                    empty
                      ? "border-amber-900/40 bg-amber-950/10"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs text-zinc-300">{color}</span>
                    <span className="text-[10px] text-zinc-500">
                      {images?.length ?? 0} görsel
                      {productId ? ` · ${productId}` : ""}
                    </span>
                  </div>
                  {empty ? (
                    <p className="text-[11px] text-amber-400/90 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Bu rengin galerisi boş
                    </p>
                  ) : (
                    <div className="flex gap-1.5 overflow-x-auto">
                      {images.slice(0, 3).map((imgUrl, i) => (
                        <div
                          key={`${imgUrl}-${i}`}
                          className="w-12 h-12 rounded overflow-hidden border border-zinc-800 shrink-0 bg-zinc-950"
                        >
                          <GalleryThumb url={imgUrl} alt={`${color} ${i + 1}`} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
