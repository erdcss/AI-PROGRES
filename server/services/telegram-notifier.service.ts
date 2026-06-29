import axios from "axios";

export type TelegramProductChangeMessage = {
  title: string;
  url: string;
  priceChange?: string;
  stockChange?: string;
  variantChange?: string;
  shopifyStatus?: string;
  partial?: boolean;
  warning?: string;
};

function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim());
}

export function formatProductChangeTelegramMessage(input: TelegramProductChangeMessage): string {
  const lines = [
    "Ürün değişikliği tespit edildi",
    `Başlık: ${input.title}`,
    `URL: ${input.url}`,
  ];
  if (input.priceChange) lines.push(`Fiyat: ${input.priceChange}`);
  if (input.stockChange) lines.push(`Stok: ${input.stockChange}`);
  if (input.variantChange) lines.push(`Varyant: ${input.variantChange}`);
  if (input.shopifyStatus) lines.push(`Shopify: ${input.shopifyStatus}`);
  if (input.partial) lines.push("Durum: kısmi veri (Browser Worker/HTML eksik olabilir)");
  if (input.warning) lines.push(`Uyarı: ${input.warning}`);
  return lines.join("\n");
}

export async function sendTelegramTrackingNotification(
  message: string,
): Promise<{ sent: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    return { sent: false, error: "telegram-not-configured" };
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      },
      { timeout: 12_000 },
    );
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn("Telegram bildirimi gönderilemedi:", error);
    return { sent: false, error };
  }
}

export async function notifyProductChange(input: TelegramProductChangeMessage): Promise<boolean> {
  if (!isTelegramConfigured()) return false;
  const text = formatProductChangeTelegramMessage(input);
  const result = await sendTelegramTrackingNotification(text);
  return result.sent;
}

export function isProductTrackingEnvEnabled(): boolean {
  return process.env.PRODUCT_TRACKING_ENABLED === "true";
}

export function getProductTrackingIntervalMinutes(): number {
  const raw = Number(process.env.PRODUCT_TRACKING_INTERVAL_MINUTES ?? 30);
  if (!Number.isFinite(raw) || raw < 5) return 30;
  return Math.min(raw, 24 * 60);
}
