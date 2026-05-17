// Append-only audit trail for admin actions. Called explicitly from mutating
// admin handlers (post.publish, registration.update_status, etc.) — not a
// middleware, because the relevant target and payload aren't known until the
// handler has parsed its request.

import { createId } from "./util.js";

/**
 * Record an admin action.
 * @param {Env} env
 * @param {string} accountId   guardian_accounts.id of the actor
 * @param {string} action      e.g. "post.publish", "registration.update_status"
 * @param {{ type?: string, id?: string, payload?: object }} target
 */
export async function recordAudit(env, accountId, action, target = {}) {
  const id = createId("audit");
  await env.DB.prepare(
    "INSERT INTO admin_audit_log (id, account_id, action, target_type, target_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id,
    accountId,
    action,
    target.type || null,
    target.id || null,
    target.payload ? JSON.stringify(target.payload) : null,
    new Date().toISOString()
  ).run();
  return id;
}
