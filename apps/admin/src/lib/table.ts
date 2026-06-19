import type { FilterFn } from '@tanstack/react-table';

// Shared faceted "value is one of the selected options" filter for DataTable
// columns. The selected values arrive as a string[]; the cell value is coerced
// to a string so it matches regardless of the underlying column type.
export const inArray: FilterFn<any> = (row, id, value) =>
  (value as string[]).includes(String(row.getValue(id)));

// Capitalize the first letter; guards against the empty string.
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
