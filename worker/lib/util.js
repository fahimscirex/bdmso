// HTTP response helpers, ID generators, body parsers - pure utilities with no
// dependencies on other worker modules.

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
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

// Apply a coupon to a base amount. Pure so it can be unit-tested without a DB.
// "percent" -> rounded percentage off; anything else -> flat amount off,
// floored at 0 so a large flat discount can't produce a negative charge.
export function couponDiscount(baseAmount, discountType, discountValue) {
  return discountType === "percent"
    ? Math.round(baseAmount * (1 - discountValue / 100))
    : Math.max(0, baseAmount - discountValue);
}

// Does the gateway-verified amount cover what we billed? Money-critical:
// a non-finite verified amount, or one that falls short by more than a 0.01
// epsilon (float/rounding slack), counts as an underpayment. Pure + shared by
// the callback and reconciliation so the two can't drift.
export function amountCoversBilled(verifiedAmount, billedAmount) {
  return Number.isFinite(verifiedAmount) && verifiedAmount + 0.01 >= billedAmount;
}

export async function parseJson(request) {
  try { return await request.json(); }
  catch {
    // Mark as 400 so the onError handler returns a clear client error instead
    // of an opaque 500.
    const err = new Error("Request body must be valid JSON.");
    err.status = 400;
    throw err;
  }
}

export function getBaseUrl(request) {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}
