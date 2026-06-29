# Browser Worker

Bağımsız Playwright/Chromium servisi. Railway veya başka bir cloud ortamında deploy edilir; ana uygulama `BROWSER_WORKER_ENDPOINT` ile bu servise istek atar.

## Yerel çalıştırma

```bash
cd browser-worker
npm install
npx playwright install chromium
export BROWSER_WORKER_TOKEN=change-me
npm run dev
```

## Docker

```bash
docker build -t browser-worker .
docker run -p 8080:8080 -e BROWSER_WORKER_TOKEN=change-me browser-worker
```

## Endpointler

- `GET /health` — token gerekmez
- `POST /scrape/html` — `Authorization: Bearer TOKEN`
- `POST /scrape/trendyol` — Trendyol ürün HTML + JSON state

Detaylı deploy: [docs/browser-worker-deploy.md](../docs/browser-worker-deploy.md)
