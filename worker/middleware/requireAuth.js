// Requires a valid session (any role). Pair with sessionMiddleware upstream.

export async function requireAuth(c, next) {
  const session = c.get("session");
  if (!session) return c.json({ error: "Unauthorised." }, 401);
  await next();
}
