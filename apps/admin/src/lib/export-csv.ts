// Minimal client-side CSV export. Columns are explicit so we control headers
// and ordering (and keep BDT/date formatting consistent with the UI).

export type CsvColumn<T> = { header: string; value: (row: T) => string | number };

export function exportCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const esc = (v: string | number) => {
    let s = String(v ?? '');
    // Guard against CSV formula injection: a cell starting with one of these is
    // evaluated as a formula by Excel/Sheets. Prefix with ' so it stays text.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(c.value(r))).join(',')).join('\n');
  // Lead with a UTF-8 BOM so Excel renders Bangla (names, etc.) correctly.
  const blob = new Blob([`﻿${head}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
