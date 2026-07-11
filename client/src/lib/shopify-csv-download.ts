export const CSV_NOT_READY_MESSAGE = "CSV henüz gerçek ürün içermiyor. Önce ürün çekin.";

export interface CsvStatusResponse {
  ready: boolean;
  downloadUrl?: string;
  filename?: string;
  productCount?: number;
  csvExists?: boolean;
  csvModified?: string | null;
  rowCount?: number;
  variantRowCount?: number;
  imageRowCount?: number;
  headers?: string[];
}

export interface CsvPreviewResponse {
  headers: string[];
  rows: string[][];
  rowCount: number;
  totalRows?: number;
  productCount?: number;
  variantRowCount?: number;
  imageRowCount?: number;
  filename?: string;
  ready?: boolean;
}

export async function fetchShopifyCsvStatus(): Promise<CsvStatusResponse> {
  const response = await fetch("/api/csv/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("CSV durumu alınamadı");
  }
  return response.json();
}

export async function fetchShopifyCsvPreview(): Promise<CsvPreviewResponse> {
  const response = await fetch("/api/csv/preview", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("CSV önizlemesi alınamadı");
  }
  return response.json();
}

export async function fetchShopifyCsvText(
  downloadUrl = "/api/download/shopify-urunler.csv",
): Promise<string> {
  const response = await fetch(downloadUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("CSV dosyası indirilemedi");
  }
  return response.text();
}

export async function deleteCurrentShopifyCsv(): Promise<void> {
  const response = await fetch("/api/csv/current", {
    method: "DELETE",
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : "CSV dosyası silinemedi",
    );
  }
}

export async function downloadShopifyCsvFromServer(): Promise<{ ok: true } | { ok: false; message: string }> {
  const status = await fetchShopifyCsvStatus();

  if (!status.ready) {
    return { ok: false, message: CSV_NOT_READY_MESSAGE };
  }

  const downloadUrl = status.downloadUrl || "/api/download/shopify-urunler.csv";
  const downloadResponse = await fetch(downloadUrl, { cache: "no-store" });

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
