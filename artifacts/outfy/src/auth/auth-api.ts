export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface AuthMessageResponse {
  message: string;
  email?: string | null;
}

export class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'No se ha podido completar la solicitud.';
    throw new AuthApiError(message, response.status);
  }

  return payload as T;
}

export function getSession() {
  return request<AuthSessionResponse>('/session');
}

export function signIn(input: { username: string; password: string }) {
  return request<AuthSessionResponse>('/sign-in', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function signUp(input: {
  username: string;
  email: string;
  password: string;
}) {
  return request<AuthMessageResponse>('/sign-up', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function verifyEmail(input: { email: string; token: string }) {
  return request<AuthSessionResponse>('/verify-email', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resendVerificationCode(input: { email: string }) {
  return request<AuthMessageResponse>('/resend-code', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function signOut() {
  return request<AuthMessageResponse>('/sign-out', { method: 'POST' });
}