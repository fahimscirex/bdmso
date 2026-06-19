// Typed fetch wrapper around the /api/* surface. 401s clear the token
// so the auth gate re-renders the login screen.

import { getToken, clearToken } from './auth';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body  ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res  = await fetch(path, init);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) clearToken();
    const message = (json as { error?: string })?.error || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, json);
  }
  return json as T;
}

export const api = {
  get:   <T,>(path: string)                 => request<T>('GET',    path),
  post:  <T,>(path: string, body?: unknown) => request<T>('POST',   path, body),
  put:   <T,>(path: string, body?: unknown) => request<T>('PUT',    path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>('PATCH',  path, body),
  del:   <T,>(path: string)                 => request<T>('DELETE', path),
};
