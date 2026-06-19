// Session creation / verification / extraction. Bearer-token style sessions
// stored in D1 (id = token, account_id, expires_at).

// Absolute lifetime cap: a session can never live longer than this from
// creation, regardless of activity. Also the cookie Max-Age, so an active
// user's browser keeps the cookie for the full window.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Idle window: the server-side expiry slides to now + IDLE on each authenticated
// request (capped at the absolute lifetime). A session unused for longer than
// this is rejected even though the browser may still hold the cookie - so a
// stolen or forgotten cookie dies after a week of inactivity, not 30 days.
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
// Only rewrite expires_at when the slide would advance it by more than this, so
// we do not issue a DB write on every single request.
const SESSION_REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

export async function createSession(env, accountId) {
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_IDLE_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(token, accountId, expiresAt, new Date().toISOString()).run();
  return token;
}

export async function verifySession(env, token) {
  if (!token) return null;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const row = await env.DB.prepare(`
    SELECT s.id, s.account_id, s.created_at, s.expires_at, a.email, a.full_name, a.role
    FROM sessions s
    JOIN guardian_accounts a ON a.id = s.account_id
    WHERE s.id = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(token, now).first();
  if (!row) {
    // Lazily purge this specific expired token and any others older than 60 days.
    env.DB.prepare("DELETE FROM sessions WHERE id = ? OR expires_at < ?")
      .bind(token, new Date(nowMs - 60 * 24 * 60 * 60 * 1000).toISOString()).run().catch(() => {});
    return null;
  }
  // Sliding refresh: push the expiry out to now + IDLE on activity, never past
  // the absolute lifetime (created_at + SESSION_TTL_MS). Throttled so a burst of
  // requests does not each write.
  const absoluteCap = new Date(row.created_at).getTime() + SESSION_TTL_MS;
  const newExpiry = Math.min(nowMs + SESSION_IDLE_MS, absoluteCap);
  if (newExpiry - new Date(row.expires_at).getTime() > SESSION_REFRESH_THRESHOLD_MS) {
    env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(new Date(newExpiry).toISOString(), token).run().catch(() => {});
  }
  return row;
}

export const SESSION_COOKIE = "bdmso_session";

// Prefer the HttpOnly session cookie (not readable by JS, so XSS can't steal it);
// fall back to the Authorization: Bearer header for non-browser/API clients and
// surfaces not yet migrated off Bearer (guardian SPA + static-site scripts).
export function extractToken(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)bdmso_session=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

// Build the Set-Cookie value for the session token. Secure is set only over
// HTTPS so it also works on http://localhost in dev. SameSite=Lax keeps it sent
// on top-level navigations + same-site requests while blocking cross-site POSTs.
export function sessionCookie(token, request, ttlMs = SESSION_TTL_MS) {
  const secure = new URL(request.url).protocol === "https:";
  const maxAge = Math.floor(ttlMs / 1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function requireAuth(request, env) {
  const account = await verifySession(env, extractToken(request));
  if (!account) throw Object.assign(new Error("Unauthorised."), { status: 401 });
  return account;
}
