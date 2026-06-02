// Lightweight keyword-overlap matcher to cross-link the programs and blog
// collections. Neither has an explicit tag taxonomy, so we tokenise each item's
// title + slug, drop generic/brand stopwords, and require at least MIN_SHARED
// meaningful tokens in common. Precision over recall: a weak or wrong "related"
// link is worse than none for both SEO and the reader, so we only surface
// genuinely-related items (e.g. the Lab Day program <-> the Lab Day post).

const STOP = new Set([
  "bdmso", "the", "a", "an", "of", "for", "and", "to", "at", "in", "on", "with",
  "spsb", "imso", "series", "program", "programme", "course", "camp",
  "workshop", "event", "press", "announcement",
]);

function tokens(...parts) {
  return new Set(
    parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t)),
  );
}

function overlap(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

const MIN_SHARED = 2;

// Return up to `limit` candidates most related to `subject` ({ title, slug }),
// scored by shared tokens, filtered to score >= MIN_SHARED, best first. Each
// candidate is passed through unchanged so callers keep their own fields.
export function relatedTo(subject, candidates, limit = 2) {
  const s = tokens(subject.title, subject.slug);
  return candidates
    .map((c) => ({ item: c, score: overlap(s, tokens(c.title, c.slug)) }))
    .filter((x) => x.score >= MIN_SHARED)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}
