// Input validation and HTML escaping for user-supplied strings.

export function normalizeString(value) {
  return String(value ?? "").trim();
}

export function requireField(value, label) {
  const v = normalizeString(value);
  if (!v) {
    // Mark as 400 so the onError handler returns a clear client error naming
    // the field instead of an opaque 500 - mirrors parseJson's err.status=400.
    const err = new Error(`${label} is required.`);
    err.status = 400;
    throw err;
  }
  return v;
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isPhoneLike(value) {
  return normalizeString(value).replace(/[^\d+]/g, "").length >= 8;
}

// Canonicalise a Bangladesh mobile to "+8801XXXXXXXXX". Handles the common
// entry mistakes: a leading 0 (local form 01XXXXXXXXX) and/or a country code
// with or without '+'. Returns "+880" + the 10-digit subscriber number, or the
// stripped input unchanged if it doesn't look like a BD number (caller validates).
export function normalizeBdPhone(value) {
  let d = normalizeString(value).replace(/\D+/g, "");   // digits only
  if (d.startsWith("880")) d = d.slice(3);              // drop country code
  d = d.replace(/^0+/, "");                             // drop local leading 0(s)
  return "+880" + d;
}

// True for a well-formed BD mobile in canonical form: +880 then 10 digits
// starting 1 (e.g. +8801712345678).
export function isBdMobile(value) {
  return /^\+8801\d{9}$/.test(normalizeString(value));
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
