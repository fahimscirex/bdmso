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

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
