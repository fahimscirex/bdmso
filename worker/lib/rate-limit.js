// Login rate limiting - bucket failed attempts per email in a sliding window.

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;

export async function checkLoginRateLimit(env, email) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND success = 0 AND attempted_at > ?"
  ).bind(email, since).first();
  // Lazily purge rows outside the window. Probabilistic (~2% of logins) so a
  // full-table DELETE doesn't run on every single login - the count query above
  // is index-backed and cheap regardless.
  if (Math.random() < 0.02) {
    env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(since).run().catch(() => {});
  }
  return (row?.n || 0) < LOGIN_MAX_FAILS;
}

export async function recordLoginAttempt(env, email, success) {
  await env.DB.prepare(
    "INSERT INTO login_attempts (email, success, attempted_at) VALUES (?, ?, ?)"
  ).bind(email, success ? 1 : 0, new Date().toISOString()).run();
}

// Generic sliding-window rate limiter backed by action_attempts. Use for
// any action that isn't login auth (which keeps login_attempts so the
// failed-auth signal stays clean).
//
//   bucket    action category ('payment-create' | 'registration' |
//             'sponsorship' | 'reset-password' | 'forgot-password' |
//             'admin-ip')
//   key       per-actor identifier (account_id, IP, or email)
//   limit     max attempts allowed within the window
//   windowMs  sliding window size
//
// Returns true when the next attempt is still allowed. The caller
// should record the attempt whether it succeeds or fails - the cap is
// about request volume, not failure count.
export async function checkActionRateLimit(env, bucket, key, limit, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM action_attempts WHERE bucket = ? AND key = ? AND attempted_at > ?"
  ).bind(bucket, key, since).first();
  // Probabilistic GC: a full-table prune is expensive; do it ~2% of
  // requests with a generous 24h cutoff that covers every bucket we
  // use today. The per-(bucket,key,time) index makes the count query
  // above cheap regardless.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    env.DB.prepare("DELETE FROM action_attempts WHERE attempted_at < ?").bind(cutoff).run().catch(() => {});
  }
  return (row?.n || 0) < limit;
}

export async function recordActionAttempt(env, bucket, key) {
  await env.DB.prepare(
    "INSERT INTO action_attempts (bucket, key, attempted_at) VALUES (?, ?, ?)"
  ).bind(bucket, key, new Date().toISOString()).run();
}

// IP extraction shared across the worker. Cloudflare's
// cf-connecting-ip wins, then x-forwarded-for's first hop, then a
// constant so a missing header in local dev doesn't blow up.
export function clientIpFor(request) {
  return request.headers.get("cf-connecting-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || "0.0.0.0";
}
