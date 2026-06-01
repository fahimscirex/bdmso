// Canonical registration-state rule, shared by the static program surfaces.
// Today is an ISO 'YYYY-MM-DD' string (lexicographic compare works for ISO
// dates); when omitted, today's ISO date is computed.
export function deriveRegState(yearRound, starts, ends, today) {
  if (today == null) today = new Date().toISOString().slice(0, 10);
  if (yearRound) return "open";
  if (starts && today < starts) return "upcoming";
  if (ends && today > ends) return "closed";
  if (starts || ends) return "open";
  return "closed";
}
