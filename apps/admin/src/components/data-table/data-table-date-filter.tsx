import { useState, type ReactNode } from 'react';
import type { Column } from '@tanstack/react-table';
import type { DateRange } from 'react-day-picker';
import { CalendarDays } from 'lucide-react';
import { dateUK } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

// A date column filter offering quick periods (last 7/30/90 days, this year),
// specific calendar years, and a from-to range via a calendar. The column
// filter value is a period-key string, a `y:<YYYY>` year key, or a
// { from, to } range (ISO strings); dateMatches interprets all three.
const PERIODS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'This year', value: 'year' },
];

export type DateFilterValue = string | { from?: string; to?: string };

function dateInPeriod(iso: string, period: string): boolean {
  if (!period || period === 'all') return true;
  const t = new Date(iso).getTime();
  if (period === 'year') return new Date(iso).getFullYear() === new Date().getFullYear();
  return t >= Date.now() - Number(period) * 86400000;
}

// Predicate for a date column's filterFn - handles period keys, year keys, and ranges.
export function dateMatches(iso: string, value: DateFilterValue | undefined): boolean {
  if (!value) return true;
  if (typeof value === 'string') {
    if (value.startsWith('y:')) return new Date(iso).getFullYear() === Number(value.slice(2));
    return dateInPeriod(iso, value);
  }
  const t = new Date(iso).getTime();
  if (value.from && t < new Date(value.from).setHours(0, 0, 0, 0)) return false;
  if (value.to && t > new Date(value.to).setHours(23, 59, 59, 999)) return false;
  return true;
}

export function dateFilterLabel(value: DateFilterValue | undefined): string {
  if (!value) return 'All time';
  if (typeof value === 'string') {
    if (value.startsWith('y:')) return value.slice(2);
    return PERIODS.find((p) => p.value === value)?.label ?? 'All time';
  }
  if (value.from && value.to) return `${dateUK(value.from)} - ${dateUK(value.to)}`;
  if (value.from) return `From ${dateUK(value.from)}`;
  if (value.to) return `Until ${dateUK(value.to)}`;
  return 'All time';
}

// The filter body (presets + years + range calendar). Rendered standalone in a
// header popover, or wrapped by DataTableDateFilter for a toolbar button. The
// leading/trailing slots let a header tuck sort + hide controls into the left
// rail so everything reads as one panel.
export function DateFilterContent<TData>({ column, onPick, leading, trailing }: {
  column?: Column<TData, unknown>; onPick?: () => void; leading?: ReactNode; trailing?: ReactNode;
}) {
  const value = column?.getFilterValue() as DateFilterValue | undefined;
  const range: DateRange | undefined =
    value && typeof value === 'object'
      ? { from: value.from ? new Date(value.from) : undefined, to: value.to ? new Date(value.to) : undefined }
      : undefined;

  const setPeriod = (v: string) => {
    column?.setFilterValue(v === 'all' ? undefined : v);
    onPick?.();
  };
  const setRange = (r: DateRange | undefined) => {
    if (!r?.from && !r?.to) return column?.setFilterValue(undefined);
    column?.setFilterValue({ from: r.from?.toISOString(), to: r.to?.toISOString() });
  };

  const years = column
    ? Array.from(
        new Set(
          column.getFacetedRowModel().flatRows
            .map((row) => new Date(row.getValue(column.id) as string).getFullYear())
            .filter((y) => !Number.isNaN(y)),
        ),
      ).sort((a, b) => b - a)
    : [];

  return (
    <div className="flex gap-0">
      <div className="flex w-36 flex-col gap-1 p-2">
        {leading}
        {leading && <Separator className="my-1" />}
        <Button variant={!value ? 'secondary' : 'ghost'} size="sm" className="justify-start font-normal" onClick={() => setPeriod('all')}>
          All time
        </Button>
        {PERIODS.map((p) => (
          <Button key={p.value} variant={value === p.value ? 'secondary' : 'ghost'} size="sm" className="justify-start font-normal" onClick={() => setPeriod(p.value)}>
            {p.label}
          </Button>
        ))}
        {years.map((y) => (
          <Button key={y} variant={value === `y:${y}` ? 'secondary' : 'ghost'} size="sm" className="justify-start font-normal" onClick={() => setPeriod(`y:${y}`)}>
            {y}
          </Button>
        ))}
        {trailing && <Separator className="my-1" />}
        {trailing}
      </div>
      <Separator orientation="vertical" className="h-auto" />
      <Calendar mode="range" numberOfMonths={1} captionLayout="dropdown" selected={range} onSelect={setRange} autoFocus />
    </div>
  );
}

// Standalone toolbar button variant (kept for callers that want a chip).
export function DataTableDateFilter<TData>({ column }: { column?: Column<TData, unknown> }) {
  const [open, setOpen] = useState(false);
  const value = column?.getFilterValue() as DateFilterValue | undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed font-normal">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          {dateFilterLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DateFilterContent column={column} onPick={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
