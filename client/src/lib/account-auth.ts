export type AccountUser = {
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  systemRole: "user" | "admin";
  workspaceRole: "owner" | "admin" | "member";
};

type AuthState = {
  loading: boolean;
  user: AccountUser | null;
};

let state: AuthState = { loading: true, user: null };
const listeners = new Set<() => void>();

function emit(next: AuthState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function jsonRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `İstek başarısız (${response.status})`);
  }
  return payload;
}

export function subscribeAccountAuth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccountAuthSnapshot() {
  return state;
}

export function getAccountAuthServerSnapshot() {
  return state;
}

export async function refreshAccountSession() {
  try {
    const payload = await jsonRequest("/api/auth/me", { method: "GET", headers: {} });
    emit({ loading: false, user: payload.user || null });
  } catch {
    emit({ loading: false, user: null });
  }
}

export async function loginAccount(email: string, password: string) {
  await jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  await refreshAccountSession();
}

export async function registerAccount(displayName: string, email: string, password: string) {
  await jsonRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ displayName, email, password }),
  });
  await refreshAccountSession();
}

export async function logoutAccount() {
  await jsonRequest("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => undefined);
  emit({ loading: false, user: null });
}
