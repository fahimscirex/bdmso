// Role-gated middleware factory. Pair with sessionMiddleware upstream.
//
//   admin.use("*", sessionMiddleware);
//   admin.use("*", requireRole("admin"));
//
//   // Multiple allowed roles:
//   admin.use("/posts/*", requireRole("admin", "editor"));

export function requireRole(...allowedRoles) {
  return async function roleGate(c, next) {
    const session = c.get("session");
    if (!session) return c.json({ error: "Unauthorised." }, 401);
    if (!allowedRoles.includes(session.role)) {
      return c.json({ error: "Forbidden." }, 403);
    }
    await next();
  };
}
