FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app/browser-worker

COPY browser-worker/package*.json ./

# Build için esbuild dahil geliştirme bağımlılıklarını kur
RUN npm install --include=dev

# Browser Worker ve ortak kaynak kodlarını kopyala
COPY browser-worker/ ./
COPY shared/ /app/shared/

RUN npm run build

# Build sonrasında geliştirme bağımlılıklarını kaldır
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]