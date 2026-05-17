// HTTP response helpers, ID generators, body parsers — pure utilities with no
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

export async function reserveMemberId(env, year) {
  const result = await env.DB.prepare(
    "INSERT INTO member_id_seq (reserved_at) VALUES (?)"
  ).bind(new Date().toISOString()).run();
  const seq = result.meta?.last_row_id ?? 0;
  const yy = String(year).slice(-2);
  return `${yy}-${String(seq).padStart(5, "0")}`;
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
