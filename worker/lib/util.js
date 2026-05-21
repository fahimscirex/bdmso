// HTTP response helpers, ID generators, body parsers - pure utilities with no
// dependencies on other worker modules.

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export function badRequest(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export function redirectTo(url) {
  return Response.redirect(url, 302);
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

// "Pre-primary" → 0, "Class 1" → 1, ..., "Class 6" → 6. Anything weird → 0.
// Single-digit only - primary-school scope; widen format if we ever go higher.
export function parseClassDigit(className) {
  if (!className) return 0;
  const m = String(className).match(/\d/);
  return m ? Math.min(9, Number(m[0])) : 0;
}

// Atomic reservation of the next BdMSO ID within (year, class). Returns
// a formatted string like "BdMSO2604-001" - see member_id_class_seq
// schema notes for the format. The INSERT … ON CONFLICT DO UPDATE …
// RETURNING pattern runs in a single statement so two concurrent
// requests can't land on the same sequence number.
export async function reserveMemberId(env, year, classDigit) {
  const row = await env.DB.prepare(`
    INSERT INTO member_id_class_seq (year, class_digit, next_seq) VALUES (?, ?, 2)
    ON CONFLICT(year, class_digit) DO UPDATE SET next_seq = next_seq + 1
    RETURNING next_seq
  `).bind(year, classDigit).first();
  // next_seq is the post-allocation cursor, so the value we just
  // reserved is one less.
  const seq = Math.max(1, Number(row?.next_seq || 2) - 1);
  const yy = String(year).slice(-2);
  return `BdMSO${yy}0${classDigit}-${String(seq).padStart(3, "0")}`;
}

// applies_to stored as JSON array string e.g. '["nqr","stem-foundation"]'.
// Falls back to legacy CSV for rows written before this change.
export function couponAppliesToType(appliesTo, type) {
  try {
    const parsed = JSON.parse(appliesTo);
    if (Array.isArray(parsed)) return parsed.includes(type);
  } catch {}
  return appliesTo.split(",").map(s => s.trim()).includes(type);
}

export async function parseJson(request) {
  try { return await request.json(); }
  catch { throw new Error("Request body must be valid JSON."); }
}

export async function parseForm(request) {
  try { return Object.fromEntries(new URLSearchParams(await request.text())); }
  catch { return {}; }
}

export function getBaseUrl(request) {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}
