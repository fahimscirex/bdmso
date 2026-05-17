// Session creation / verification / extraction. Bearer-token style sessions
// stored in D1 (id = token, account_id, expires_at).

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(env, accountId) {
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  ).bind(token, accountId, expiresAt, new Date().toISOString()).run();
  return token;
}

export async function verifySession(env, token) {
  if (!token) return null;
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT s.account_id, a.email, a.full_name, a.role
    FROM sessions s
    JOIN guardian_accounts a ON a.id = s.account_id
    WHERE s.id = ? AND s.expires_at > ?
    LIMIT 1
  `).bind(token, now).first();
  if (!row) {
    // Lazily purge this specific expired token and any others older than 60 days.
    env.DB.prepare("DELETE FROM sessions WHERE id = ? OR expires_at < ?")
      .bind(token, new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()).run().catch(() => {});
  }
  return row || null;
}

export function extractToken(request) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

export async function requireAuth(request, env) {
  const account = await verifySession(env, extractToken(request));
  if (!account) throw Object.assign(new Error("Unauthorised."), { status: 401 });
  return account;
}
