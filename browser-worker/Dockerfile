FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app/browser-worker

COPY browser-worker/package*.json ./

# Build için esbuild dahil tüm bağımlılıkları kur
RUN npm install --include=dev

# Worker ve ihtiyaç duyduğu ortak kaynakları kopyala
COPY browser-worker/ ./
COPY shared/ /app/shared/
COPY server/ /app/server/

RUN npm run build

# Üretimde gerekmeyen geliştirme paketlerini kaldır
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080
# Canlı Trendyol çekiminde tarayıcı navigasyonu ve toplam iş süresi sınırlı kalır.
# Böylece engelli/yavaş sayfa ana pipeline'ı 40-90 saniye bekletmez.
ENV BROWSER_NAV_TIMEOUT_MS=15000
ENV BROWSER_SCRAPE_DEADLINE_MS=22000

EXPOSE 8080

CMD ["npm", "start"]
