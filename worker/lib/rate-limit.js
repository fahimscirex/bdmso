// Login rate limiting — bucket failed attempts per email in a sliding window.

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;

export async function checkLoginRateLimit(env, email) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND success = 0 AND attempted_at > ?"
  ).bind(email, since).first();
  // Lazily purge rows outside the window - no need to await.
  env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(since).run().catch(() => {});
  return (row?.n || 0) < LOGIN_MAX_FAILS;
}

export async function recordLoginAttempt(env, email, success) {
  await env.DB.prepare(
    "INSERT INTO login_attempts (email, success, attempted_at) VALUES (?, ?, ?)"
  ).bind(email, success ? 1 : 0, new Date().toISOString()).run();
}
