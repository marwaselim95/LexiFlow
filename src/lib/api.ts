// ─── NestJS API client ────────────────────────────────────────────────────────
// Replaces src/lib/supabase.ts. All backend calls go through here so the JWT
// header and error normalization stay consistent.

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api';

const TOKEN_KEY = 'lexiflow_token';

// Structured error matching the backend's { error: { type, message } } shape.
export class ApiError extends Error {
  errorType?: string;
  constructor(message: string, errorType?: string) {
    super(message);
    this.name = 'ApiError';
    this.errorType = errorType;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode etc.) — session simply won't persist
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  // Only set JSON content-type when not sending multipart data
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token && !init.skipAuth) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Failed to fetch — could not reach the server.', 'offline');
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // non-JSON body
    }
  }

  if (!res.ok || (data && typeof data === 'object' && !Array.isArray(data) && data.error)) {
    const message = data?.error?.message ?? `Request failed (HTTP ${res.status}).`;
    throw new ApiError(message, data?.error?.type);
  }

  return data as T;
}

/** Decode a JWT payload locally (no verification — server validates every call). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
