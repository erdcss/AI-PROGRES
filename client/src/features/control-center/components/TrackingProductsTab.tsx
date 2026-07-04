import UrunTakipPage from "@/pages/urun-takip";

export function TrackingProductsTab({ active }: { active: boolean }) {
  if (!active) return null;
  return <UrunTakipPage embedded />;
}
