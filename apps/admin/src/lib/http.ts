// Typed fetch wrapper around /api/*. Auth is the HttpOnly session cookie set by
// the worker on login - sent automatically on these same-origin requests, never
// read or stored in JS (so XSS can't lift it). On 401 we broadcast
// `auth:unauthorized` so the auth context drops to the login screen.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function onUnauthorized() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth:unauthorized'));
}

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    throw new ApiError(res.status, (json as { error?: string })?.error || `HTTP ${res.status}`);
  }
  return json as T;
}

// Short-lived GET dedupe/cache. Concurrent or near-concurrent GETs to the same
// path share one in-flight promise, and a resolved response is reused for TTL
// ms. This collapses the sidebar nav-counts + dashboard summary overlap (both
// hit /api/admin/triage and the registrations/payments summaries on mount) and
// keeps page revisits instant. Any mutation clears the cache so edits show
// immediately.
const GET_TTL = 30_000;
type CacheEntry = { at: number; promise: Promise<unknown> };
const getCache = new Map<string, CacheEntry>();

function cachedGet<T>(path: string): Promise<T> {
  const hit = getCache.get(path);
  if (hit && Date.now() - hit.at < GET_TTL) return hit.promise as Promise<T>;
  const promise = request<T>('GET', path);
  getCache.set(path, { at: Date.now(), promise });
  // A rejected GET must not be cached, or a transient failure sticks for the
  // whole TTL and the Retry button can't recover.
  promise.catch(() => { if (getCache.get(path)?.promise === promise) getCache.delete(path); });
  return promise;
}

// After any mutation, drop the GET cache and signal interested widgets (e.g. the
// PublishBar's pending-changes count) to re-fetch immediately rather than wait
// for their next poll.
function invalidateGetCache() {
  getCache.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('admin:mutated'));
}

export const http = {
  get: <T>(p: string) => cachedGet<T>(p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b).finally(invalidateGetCache),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b).finally(invalidateGetCache),
  del: <T>(p: string) => request<T>('DELETE', p).finally(invalidateGetCache),
  upload: <T>(p: string, f: FormData) => upload<T>(p, f).finally(invalidateGetCache),
};

// Multipart upload (FormData) - no JSON content-type so the browser sets the
// multipart boundary. Same cookie auth and error handling as request().
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    throw new ApiError(res.status, (json as { error?: string })?.error || `HTTP ${res.status}`);
  }
  return json as T;
}
