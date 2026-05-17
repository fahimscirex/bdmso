// Typed fetch wrapper around /api/admin/*. Throws ApiError on non-2xx so
// callers can handle errors with try/catch + render a friendly message.

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

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const init: RequestInit = {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res  = await fetch(path, init);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    // 401 from any admin endpoint = token rotted; force a re-login.
    if (res.status === 401) clearToken();
    const message = (json as { error?: string })?.error || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, json);
  }
  return json as T;
}

export const api = {
  get:  <T,>(path: string)                 => request<T>('GET',    path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST',   path, body),
  put:  <T,>(path: string, body?: unknown) => request<T>('PUT',    path, body),
  del:  <T,>(path: string)                 => request<T>('DELETE', path),
};
