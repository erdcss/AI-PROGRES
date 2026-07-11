import { useState } from "react";
import { Package } from "lucide-react";
import { resolvePreviewImageUrl, resolvePreviewProxyUrl } from "@/lib/product-image-url";

type TrackingProductImageProps = {
  imageUrl?: string | null;
  title?: string | null;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASS = {
  sm: "w-14 h-14",
  md: "w-20 h-20",
  lg: "w-24 h-24",
} as const;

export function TrackingProductImage({
  imageUrl,
  title,
  size = "md",
}: TrackingProductImageProps) {
  const direct = imageUrl ? resolvePreviewImageUrl(imageUrl) : null;
  const proxy = direct ? resolvePreviewProxyUrl(direct) : null;
  const [src, setSrc] = useState<string | null>(direct);
  const dim = SIZE_CLASS[size];

  if (!src) {
    return (
      <div
        className={`${dim} shrink-0 rounded-xl overflow-hidden bg-muted/60 border border-border/40 flex items-center justify-center`}
      >
        <Package className="w-7 h-7 text-muted-foreground/35" />
      </div>
    );
  }

  return (
    <div
      className={`${dim} shrink-0 rounded-xl overflow-hidden bg-muted/40 border border-border/40`}
    >
      <img
        src={src}
        alt={title || "Ürün görseli"}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => {
          if (proxy && src !== proxy) setSrc(proxy);
          else setSrc(null);
        }}
      />
    </div>
  );
}
