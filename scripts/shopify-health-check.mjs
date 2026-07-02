function resolveBaseUrl() {
  const explicit = process.env.SHOPIFY_TEST_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const port = process.env.PORT?.trim();
  if (port) return `http://127.0.0.1:${port}`;
  return 'http://127.0.0.1:3000';
}

function isHtmlResponse(contentType, body) {
  const trimmed = body.trimStart().toLowerCase();
  return contentType.includes('text/html') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

async function main() {
  const base = resolveBaseUrl();
  const url = `${base}/api/shopify/health`;

  console.log(`\nShopify health check`);
  console.log(`URL: ${url}`);

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.error(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`Hint: Sunucu çalışıyor mu? (ör. npm run dev:stable → port 3000)`);
    process.exit(1);
  }

  const contentType = response.headers.get('content-type') || '(none)';
  const body = await response.text();

  console.log(`HTTP status: ${response.status}`);
  console.log(`Content-Type: ${contentType}`);

  if (isHtmlResponse(contentType, body)) {
    console.error('Expected JSON but received HTML. API route may be falling through to static fallback.');
    console.log('Body (first 500 chars):');
    console.log(body.slice(0, 500));
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error('Expected JSON but response was not valid JSON.');
    console.log('Body:');
    console.log(body);
    process.exit(1);
  }

  console.log('Response body:');
  console.log(JSON.stringify(parsed, null, 2));

  if (!response.ok || parsed.ok !== true) {
    process.exit(1);
  }

  console.log('\nHealth check passed.');
}

main();
