import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, EyeOff, ListFilter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { DateFilterContent } from './data-table-date-filter';

// Column header that folds sorting AND filtering into one click target. A
// column opts into filtering via meta.filterVariant ('facet' multi-select or
// 'date'); facet options are derived from the column's faceted unique values,
// with optional label formatting via meta.optionLabel.
export function DataTableColumnHeader<TData, TValue>({
  column, title, className,
}: { column: Column<TData, TValue>; title: string; className?: string }) {
  const canSort = column.getCanSort();
  const variant = column.columnDef.meta?.filterVariant;
  const canFilter = column.getCanFilter() && !!variant;
  if (!canSort && !canFilter) return <div className={className}>{title}</div>;

  const sorted = column.getIsSorted();
  const filterValue = column.getFilterValue();
  const selectedCount = variant === 'facet' && Array.isArray(filterValue) ? filterValue.length : 0;
  const isFiltered = filterValue != null && (variant !== 'facet' || selectedCount > 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('-ml-2 h-8 data-[state=open]:bg-accent', isFiltered && 'text-primary', className)}>
          <span>{title}</span>
          {sorted === 'desc' ? <ArrowDown className="size-3.5" />
            : sorted === 'asc' ? <ArrowUp className="size-3.5" />
              : canSort ? <ChevronsUpDown className="size-3.5 opacity-50" /> : null}
          {canFilter && (selectedCount > 0
            ? <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded bg-primary px-1 font-mono text-[10px] text-primary-foreground">{selectedCount}</span>
            : <ListFilter className={cn('size-3.5', isFiltered ? 'text-primary' : 'opacity-50')} />)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('p-0', variant === 'date' ? 'w-auto' : 'w-56')}>
        {variant === 'date' ? (
          // Date: fold sort + hide into the picker's left rail so it reads as one panel.
          <DateFilterContent
            column={column}
            leading={canSort ? <SortButtons column={column} /> : undefined}
            trailing={column.getCanHide() ? <HideButton column={column} /> : undefined}
          />
        ) : (
          <>
            {canSort && <div className="flex flex-col p-1"><SortButtons column={column} /></div>}
            {canSort && canFilter && <Separator />}
            {variant === 'facet' && <FacetList column={column} />}
            {column.getCanHide() && (
              <>
                <Separator />
                <div className="p-1"><HideButton column={column} /></div>
              </>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SortButtons<TData, TValue>({ column }: { column: Column<TData, TValue> }) {
  return (
    <>
      <Button variant="ghost" size="sm" className="justify-start font-normal" onClick={() => column.toggleSorting(false)}>
        <ArrowUp className="text-muted-foreground" /> Asc
      </Button>
      <Button variant="ghost" size="sm" className="justify-start font-normal" onClick={() => column.toggleSorting(true)}>
        <ArrowDown className="text-muted-foreground" /> Desc
      </Button>
    </>
  );
}

function HideButton<TData, TValue>({ column }: { column: Column<TData, TValue> }) {
  return (
    <Button variant="ghost" size="sm" className="w-full justify-start font-normal" onClick={() => column.toggleVisibility(false)}>
      <EyeOff className="text-muted-foreground" /> Hide column
    </Button>
  );
}

function FacetList<TData, TValue>({ column }: { column: Column<TData, TValue> }) {
  const facets = column.getFacetedUniqueValues();
  const optionLabel = column.columnDef.meta?.optionLabel ?? ((v: string) => v);
  const values = Array.from(facets.keys())
    .filter((v) => v != null && v !== '' && v !== '—')
    .map(String)
    .sort();
  const selected = new Set(column.getFilterValue() as string[] | undefined);

  return (
    <Command>
      <CommandInput placeholder="Filter..." />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup>
          {values.map((v) => {
            const isSel = selected.has(v);
            return (
              <CommandItem
                key={v}
                onSelect={() => {
                  if (isSel) selected.delete(v); else selected.add(v);
                  const arr = Array.from(selected);
                  column.setFilterValue(arr.length ? arr : undefined);
                }}
              >
                <div className={cn(
                  'flex size-4 items-center justify-center rounded-[4px] border',
                  isSel ? 'border-primary bg-primary text-primary-foreground' : 'border-input [&_svg]:invisible',
                )}>
                  <Check className="size-3" />
                </div>
                <span>{optionLabel(v)}</span>
                {facets.get(v) !== undefined && (
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{facets.get(v)}</span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
        {selected.size > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={() => column.setFilterValue(undefined)} className="justify-center text-center">
                Clear filter
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
