// Program catalog accessor for the dashboards + interactive pages. The single
// source of truth is the D1 `programs` table, served by the worker at
// /api/catalog. Fetched once, cached for the page.

let catalogPromise = null;

export function loadCatalog() {
  if (!catalogPromise) {
    // no-cache: always revalidate so edits show up without a hard refresh.
    catalogPromise = fetch('/api/catalog', { cache: 'no-cache' })
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
