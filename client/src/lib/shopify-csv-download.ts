export const CSV_NOT_READY_MESSAGE = "CSV henüz gerçek ürün içermiyor. Önce ürün çekin.";

interface CsvStatusResponse {
  ready: boolean;
  downloadUrl?: string;
  filename?: string;
  productCount?: number;
  csvExists?: boolean;
}

export async function fetchShopifyCsvStatus(): Promise<CsvStatusResponse> {
  const response = await fetch("/api/csv/status");
  if (!response.ok) {
    throw new Error("CSV durumu alınamadı");
  }
  return response.json();
}

export async function downloadShopifyCsvFromServer(): Promise<{ ok: true } | { ok: false; message: string }> {
  const status = await fetchShopifyCsvStatus();

  if (!status.ready) {
    return { ok: false, message: CSV_NOT_READY_MESSAGE };
  }

  const downloadUrl = status.downloadUrl || "/api/download/shopify-urunler.csv";
  const downloadResponse = await fetch(downloadUrl);

  if (!downloadResponse.ok) {
    return { ok: false, message: "CSV dosyası indirilemedi" };
  }

  const blob = await downloadResponse.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = status.filename || "shopify-urunler.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);

  return { ok: true };
}
