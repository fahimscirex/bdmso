// Shared formatters for the guardian dashboard. Consolidated from per-file
// copies so output strings stay identical across the app.

// "৳ 1,234" using Bangladesh grouping. Returns '-' when the amount is missing.
export function formatBdt(n: number | null): string {
  if (n == null) return '-';
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

// "5 Jun 2026" in en-GB (dd/mm-style short month). Returns '-' when missing.
export function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Local-date -> ISO yyyy-mm-dd (no timezone shift, unlike toISOString()).
export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
