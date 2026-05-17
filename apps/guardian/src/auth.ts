// Bearer-token storage. Separate key from the admin SPA so signing in
// on /admin doesn't grant /dashboard access (and vice-versa).

const KEY = 'bdmso.guardian.token';

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}
