FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

COPY package*.json ./

# Derleme için esbuild dahil geliştirme bağımlılıklarını kur
RUN npm install --include=dev

COPY . .

RUN npm run build

# Derlemeden sonra gereksiz geliştirme paketlerini kaldır
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"] 