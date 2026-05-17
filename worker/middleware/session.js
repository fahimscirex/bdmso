// Session middleware. Reads the Bearer token, verifies it against D1, and
// attaches the session (or null) to the Hono context. Downstream middleware
// (requireAuth, requireRole) then make access decisions based on c.get('session').

import { verifySession, extractToken } from "../lib/sessions.js";

export async function sessionMiddleware(c, next) {
  const token = extractToken(c.req.raw);
  const session = await verifySession(c.env, token);
  c.set("session", session);
  await next();
}
