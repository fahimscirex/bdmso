// Single source of truth for who's signed in. We deliberately use the
// SAME localStorage key + shape as the marketing site's site.js (which
// reads `bdmso_user` to swap the nav between logged-out and logged-in
// state). When a parent signs in here they immediately see "Dashboard"
// in the site header on every page, and vice versa.

const KEY = 'bdmso_user';

export type Session = {
  token: string;
  accountId: string;
  fullName: string;       // guardian / account holder
  email: string;
  studentName?: string;   // registered student - shown in the site header
};

export function getSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function setSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

// Keep the cached guardian name/email fresh (used as the header's
// fallback). Call after any /api/me fetch so an edit isn't lost.
export function syncSessionName(fullName: string, email: string): void {
  const sess = getSession();
  if (!sess || !fullName) return;
  if (sess.fullName === fullName && sess.email === email) return;
  setSession({ ...sess, fullName, email });
}

// The site header shows the registered STUDENT's name, not the
// guardian's. Cache it and live-update the header text.
export function syncHeaderName(studentFullName: string): void {
  const sess = getSession();
  if (!sess || !studentFullName) return;
  if (sess.studentName !== studentFullName) {
    setSession({ ...sess, studentName: studentFullName });
  }
  const first = studentFullName.split(' ')[0];
  document.querySelectorAll('.nav-user').forEach((el) => {
    (el as HTMLElement).textContent = first;
  });
}

// Compatibility shim for api.ts (and anywhere else that just wants the
// bearer token without unpacking the whole session object).
export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function clearToken(): void {
  clearSession();
}
