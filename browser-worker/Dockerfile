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

EXPOSE 8080

CMD ["npm", "start"]