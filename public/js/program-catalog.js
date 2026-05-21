// Program catalog accessor for the static pages. The single source of
// truth is /data/programs-detail.json (the same file the worker
// imports and the SPAs read). Fetched once, cached for the page.

let catalogPromise = null;

export function loadCatalog() {
  if (!catalogPromise) {
    // no-cache: always revalidate so edits to programs-detail.json
    // show up without a hard refresh.
    catalogPromise = fetch('/data/programs-detail.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return catalogPromise;
}

// Returns { names, prices } lookup maps keyed by registration_type
// slug. prices are numbers, or null for "on enquiry" programs.
export async function programMaps() {
  const catalog = await loadCatalog();
  const names = {};
  const prices = {};
  for (const p of catalog) {
    names[p.slug] = p.title;
    prices[p.slug] = p.feeAmount ?? null;
  }
  return { names, prices };
}
