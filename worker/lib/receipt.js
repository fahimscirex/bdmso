// Receipt (registration_cohorts) write helpers for the options model. Each
// returns an array of prepared statements so callers batch them atomically with
// their own writes. No-op ([]) for legacy (pricing_json / flat-fee) programs,
// which don't use the receipt table.
//
// Dual-write phase: these run alongside the program_options writes; program_options
// stays the authoritative read path for /api/me, reports, and receipts until the
// Phase 6 backfill. The roster already reads the receipt.

// Insert statements for a brand-new registration (no existing receipt rows).
export function receiptInsertStatements(env, catalog, registrationId, programSlug, keys, createdAt) {
  if (!catalog.isRunPriced(programSlug)) return [];
  const priceByKey = Object.fromEntries(catalog.runsFor(programSlug).map((r) => [r.key, r.price || 0]));
  return (keys || []).map((k) =>
    env.DB.prepare(
      "INSERT INTO registration_cohorts (registration_id, cohort_key, price_paid, created_at) VALUES (?, ?, ?, ?)"
    ).bind(registrationId, k, priceByKey[k] ?? 0, createdAt)
  );
}

// Replace a registration's receipt with a new selection (edit / option-upgrade):
// delete existing rows then re-insert, price re-frozen at edit time. Atomic when
// batched with the caller's program_options update.
export function receiptSyncStatements(env, catalog, registrationId, programSlug, keys, createdAt) {
  if (!catalog.isRunPriced(programSlug)) return [];
  return [
    env.DB.prepare("DELETE FROM registration_cohorts WHERE registration_id = ?").bind(registrationId),
    ...receiptInsertStatements(env, catalog, registrationId, programSlug, keys, createdAt),
  ];
}
