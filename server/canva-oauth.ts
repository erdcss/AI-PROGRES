import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID;
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET;
// Optional: if set, always use this as redirect URI (for Canva portal registration)
export const CANVA_REDIRECT_URI = process.env.CANVA_REDIRECT_URI || null;
const TOKEN_FILE = path.join(process.cwd(), '.canva-token.json');

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
}

// In-memory token storage (also persisted to file)
let cachedToken: TokenData | null = null;

// PKCE state store: state -> { code_verifier, expires }
const pkceStore: Map<string, { code_verifier: string; expires: number }> = new Map();

function loadTokenFromFile(): TokenData | null {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function saveTokenToFile(token: TokenData): void {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2), 'utf-8');
  } catch (e) {
    console.error('❌ [Canva] Token dosyaya kaydedilemedi:', e);
  }
}

export function initCanvaOAuth(): void {
  cachedToken = loadTokenFromFile();
  if (cachedToken?.access_token) {
    console.log('✅ [Canva] Kayıtlı access token bulundu, Canva aktif');
  } else if (CANVA_CLIENT_ID && CANVA_CLIENT_SECRET) {
    console.log('⚠️ [Canva] Client ID/Secret mevcut ama token yok - OAuth bağlantısı gerekli');
  } else {
    console.warn('⚠️ [Canva] CANVA_CLIENT_ID veya CANVA_CLIENT_SECRET eksik');
  }
}

export function getCanvaAccessToken(): string | null {
  if (!cachedToken?.access_token) return null;

  // Check expiry (with 5min buffer)
  if (cachedToken.expires_at && Date.now() > cachedToken.expires_at - 5 * 60 * 1000) {
    console.warn('⚠️ [Canva] Token süresi dolmuş');
    if (cachedToken.refresh_token) {
      // Refresh async - don't block
      refreshAccessToken(cachedToken.refresh_token).catch(() => {});
    }
    return null;
  }

  return cachedToken.access_token;
}

export function setCanvaToken(token: TokenData): void {
  if (token.expires_in) {
    (token as any).expires_at = Date.now() + (token as any).expires_in * 1000;
  }
  cachedToken = token;
  saveTokenToFile(token);
  console.log('✅ [Canva] Access token kaydedildi');
}

export function isCanvaConnected(): boolean {
  if (!cachedToken?.access_token) return false;
  if (cachedToken.expires_at && Date.now() > cachedToken.expires_at) return false;
  return true;
}

export function generateAuthUrl(redirectUri: string): { url: string; state: string } {
  if (!CANVA_CLIENT_ID) throw new Error('CANVA_CLIENT_ID eksik');

  // Generate PKCE
  const code_verifier = crypto.randomBytes(64).toString('base64url');
  const code_challenge = crypto
    .createHash('sha256')
    .update(code_verifier)
    .digest('base64url');

  const state = crypto.randomBytes(16).toString('hex');

  // Store for callback verification (expires in 10 min)
  pkceStore.set(state, { code_verifier, expires: Date.now() + 10 * 60 * 1000 });

  // Clean old states
  for (const [k, v] of pkceStore.entries()) {
    if (Date.now() > v.expires) pkceStore.delete(k);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CANVA_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'asset:write asset:read',
    code_challenge,
    code_challenge_method: 'S256',
    state
  });

  return {
    url: `https://www.canva.com/api/oauth/authorize?${params.toString()}`,
    state
  };
}

export async function exchangeCodeForToken(
  code: string,
  state: string,
  redirectUri: string
): Promise<TokenData> {
  if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
    throw new Error('CANVA_CLIENT_ID veya CANVA_CLIENT_SECRET eksik');
  }

  const pkce = pkceStore.get(state);
  if (!pkce) throw new Error('Geçersiz veya süresi dolmuş OAuth state');
  if (Date.now() > pkce.expires) {
    pkceStore.delete(state);
    throw new Error('OAuth state süresi dolmuş');
  }
  pkceStore.delete(state);

  const response = await axios.post(
    'https://api.canva.com/rest/v1/oauth/token',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.code_verifier,
      redirect_uri: redirectUri,
      client_id: CANVA_CLIENT_ID,
      client_secret: CANVA_CLIENT_SECRET
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000
    }
  );

  const token: TokenData = response.data;
  if (token.expires_in) {
    (token as any).expires_at = Date.now() + (token as any).expires_in * 1000;
  }
  setCanvaToken(token);
  return token;
}

export async function refreshAccessToken(refreshToken: string): Promise<void> {
  if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) return;

  try {
    const response = await axios.post(
      'https://api.canva.com/rest/v1/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CANVA_CLIENT_ID,
        client_secret: CANVA_CLIENT_SECRET
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      }
    );
    setCanvaToken(response.data);
    console.log('✅ [Canva] Token yenilendi');
  } catch (e) {
    console.error('❌ [Canva] Token yenileme başarısız:', e);
    cachedToken = null;
  }
}

export function disconnectCanva(): void {
  cachedToken = null;
  try { fs.unlinkSync(TOKEN_FILE); } catch {}
  console.log('✅ [Canva] Bağlantı kesildi');
}
