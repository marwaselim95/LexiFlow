// ─── Auth Service Layer ───────────────────────────────────────────────────────
// NestJS JWT auth implementation. Signatures are frozen — authSlice depends on them.

import { apiFetch, ApiError, setToken, getToken, decodeJwtPayload } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
}

export type SignUpResult =
  | { userId: string }
  | { error: { type: 'email_taken' | 'weak_password' | 'unknown'; message: string } };

export type SignInResult =
  | { userId: string; email: string }
  | { error: { type: 'invalid_credentials' | 'unknown'; message: string } };

export type PasswordResetResult =
  | { success: true }
  | { error: { type: 'expired_token' | 'weak_password' | 'unknown'; message: string } };

// ─── Service Functions ────────────────────────────────────────────────────────

export async function signUp(input: { email: string; password: string }): Promise<SignUpResult> {
  try {
    const data = await apiFetch<{ userId: string; token: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    setToken(data.token);
    return { userId: data.userId };
  } catch (err) {
    return { error: classifyAuthError(err) };
  }
}

export async function signIn(input: { email: string; password: string }): Promise<SignInResult> {
  try {
    const data = await apiFetch<{ userId: string; email: string; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    setToken(data.token);
    return { userId: data.userId, email: data.email };
  } catch (err) {
    if (err instanceof ApiError && err.errorType === 'invalid_credentials') {
      return { error: { type: 'invalid_credentials', message: 'Email or password is incorrect.' } };
    }
    return { error: { type: 'unknown', message: (err as Error).message } };
  }
}

export async function signOut(): Promise<{ success: boolean }> {
  setToken(null);
  return { success: true };
}

export async function requestPasswordReset(_input: { email: string }): Promise<{ success: boolean }> {
  // Always returns success — must not reveal whether the email exists.
  await apiFetch('/auth/request-reset', {
    method: 'POST',
    body: JSON.stringify(_input),
    skipAuth: true,
  });
  return { success: true };
}

export async function confirmPasswordReset(input: {
  token: string;
  newPassword: string;
}): Promise<{ success: true } | PasswordResetResult> {
  try {
    await apiFetch('/auth/reset', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    return { success: true };
  } catch (err) {
    if (err instanceof ApiError && err.errorType === 'expired_token') {
      return { error: { type: 'expired_token', message: 'This reset link has expired. Please request a new one.' } };
    }
    if (err instanceof ApiError && err.errorType === 'weak_password') {
      return { error: { type: 'weak_password', message: err.message } };
    }
    return { error: { type: 'unknown', message: (err as Error).message } };
  }
}

export async function restoreSession(): Promise<AuthUser | null> {
  // Restore from the persisted JWT. Payload decoded locally; the token is
  // re-validated server-side on every API call anyway.
  const token = getToken();
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.sub !== 'string') {
    setToken(null);
    return null;
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (exp !== null && exp * 1000 <= Date.now()) {
    setToken(null);
    return null;
  }

  return { id: payload.sub, email: String(payload.email ?? '') };
}

function classifyAuthError(err: unknown): { type: 'email_taken' | 'weak_password' | 'unknown'; message: string } {
  if (!(err instanceof Error)) {
    return { type: 'unknown', message: 'An unknown error occurred.' };
  }
  const msg = err.message;
  const lower = msg.toLowerCase();
  if (lower.includes('already exists') || lower.includes('already registered')) {
    return { type: 'email_taken', message: 'An account with this email already exists.' };
  }
  if (lower.includes('password')) {
    return { type: 'weak_password', message: msg };
  }
  return { type: 'unknown', message: msg };
}
