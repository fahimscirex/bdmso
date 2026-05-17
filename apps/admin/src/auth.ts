// Token storage + retrieval. Plain localStorage for now; revisit if/when
// session security needs HttpOnly cookies.

const TOKEN_KEY = 'bdmso.admin.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
