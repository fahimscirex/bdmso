import { useMemo, useState, type ReactNode } from 'react';
import {
  type ColumnDef, type ColumnFiltersState, type RowData, type SortingState,
  type Table as TanstackTable, type VisibilityState, flexRender, getCoreRowModel,
  getFacetedRowModel, getFacetedUniqueValues, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from './data-table-pagination';
import { DataTableViewOptions } from './data-table-view-options';

// Column meta - title (for the view-options menu), cell className (alignment),
// and per-column filtering driven from the header (filterVariant + optionLabel).
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    title?: string;
    className?: string;
    filterVariant?: 'facet' | 'date';
    optionLabel?: (value: string) => string;
    // When this column's filter is active, hide the column (its value is
    // implied by the filter). Used when filtering moves to a toolbar control.
    hideWhenFiltered?: boolean;
    // Start hidden - useful for a column that exists only to back a toolbar
    // filter (e.g. exam region) without taking a table column.
    defaultHidden?: boolean;
  }
}

type Props<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  loading?: boolean;
  searchPlaceholder?: string;
  getSearchText?: (row: TData) => string;
  initialSort?: SortingState;
  initialColumnFilters?: ColumnFiltersState;
  pageSize?: number;
  onExport?: (rows: TData[]) => void;
  bulkActions?: (rows: TData[], clear: () => void) => ReactNode;
  toolbarExtra?: (table: TanstackTable<TData>) => ReactNode;
  onRowClick?: (row: TData) => void;
  // Shown when the dataset is genuinely empty (zero rows, no filters active),
  // distinct from the "no results match your filters" message.
  emptyState?: ReactNode;
};

export function DataTable<TData>({
  columns, data, loading, searchPlaceholder, getSearchText,
  initialSort = [], initialColumnFilters = [], pageSize = 10, onExport, bulkActions, toolbarExtra, onRowClick, emptyState,
}: Props<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialColumnFilters);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const v: VisibilityState = {};
    for (const col of columns) {
      const id = (col as { id?: string; accessorKey?: string }).id ?? (col as { accessorKey?: string }).accessorKey;
      if (id && col.meta?.defaultHidden) v[id] = false;
    }
    return v;
  });
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  // Columns marked hideWhenFiltered collapse once their own filter is active
  // (the filter control elsewhere makes the column redundant).
  const effectiveVisibility = useMemo(() => {
    const auto: VisibilityState = {};
    for (const col of columns) {
      const id = (col as { id?: string; accessorKey?: string }).id ?? (col as { accessorKey?: string }).accessorKey;
      if (id && col.meta?.hideWhenFiltered && columnFilters.some((f) => f.id === id)) auto[id] = false;
    }
    return { ...columnVisibility, ...auto };
  }, [columns, columnFilters, columnVisibility]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility: effectiveVisibility, rowSelection, globalFilter },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: getSearchText
      ? (row, _id, value: string) => getSearchText(row.original).toLowerCase().includes(value.toLowerCase())
      : 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize } },
  });

  const isFiltered = columnFilters.length > 0 || globalFilter !== '';
  const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {getSearchText && (
          <Input
            placeholder={searchPlaceholder ?? 'Search...'}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 w-full sm:w-[240px]"
          />
        )}
        {toolbarExtra?.(table)}
        {isFiltered && (
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { table.resetColumnFilters(); setGlobalFilter(''); }}>
            Reset <X className="size-3.5" />
          </Button>
        )}
        <Separator orientation="vertical" className="ml-auto data-[orientation=vertical]:h-6" />
        <div className="flex items-center gap-2">
          {onExport && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => onExport(table.getFilteredRowModel().rows.map((r) => r.original))}>
              <Download className="size-3.5" /> Export
            </Button>
          )}
          <DataTableViewOptions table={table} />
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkActions && selectedRows.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-accent/40 px-3 py-2 text-sm">
          <span className="font-medium">{selectedRows.length} selected</span>
          <div className="ml-auto flex items-center gap-2">{bulkActions(selectedRows, () => setRowSelection({}))}</div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={h.column.columnDef.meta?.className}
                    aria-sort={
                      h.column.getIsSorted() === 'asc' ? 'ascending'
                        : h.column.getIsSorted() === 'desc' ? 'descending'
                          : h.column.getCanSort() ? 'none' : undefined
                    }
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={columns.length}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={onRowClick ? 'cursor-pointer focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset' : undefined}
                  role={onRowClick ? 'link' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onRowClick(row.original);
                    }
                  } : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-28 text-center text-muted-foreground">
                  {data.length === 0 && !isFiltered
                    ? (emptyState ?? 'Nothing here yet.')
                    : 'No results match your filters.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
