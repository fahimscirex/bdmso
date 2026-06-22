// Key/value app settings backed by the `settings` table. Values are stored as
// text; callers coerce. Used for runtime toggles that admins flip without a
// deploy (e.g. offline_payment_enabled).

export async function getSetting(env, key, fallback = null) {
  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = ? LIMIT 1"
  ).bind(key).first();
  return row ? row.value : fallback;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).bind(key, String(value)).run();
}

// Boolean-ish read: '1'/'true' => true. Default applies when the key is unset.
export async function getBoolSetting(env, key, fallback = true) {
  const v = await getSetting(env, key, fallback ? "1" : "0");
  return v === "1" || v === "true";
}
