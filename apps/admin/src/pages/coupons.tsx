import { useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Coupon } from '@/lib/types';
import { api } from '@/lib/api';
import { inArray } from '@/lib/table';
import { useList } from '@/hooks/use-list';
import { run } from '@/lib/run';
import { bdt, dateUK } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDeleteItem } from '@/components/confirm-delete';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// UI 'flat' is the worker's discount_type 'fixed' - keep them in sync here so a
// flat (৳) discount isn't silently created as a percent.
const toDiscountType = (uiType: 'percent' | 'flat') => (uiType === 'flat' ? 'fixed' : 'percent');

const makeColumns = (onEdit: (c: Coupon) => void, onDelete: (c: Coupon) => void): ColumnDef<Coupon>[] => [
  {
    accessorKey: 'code',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
    cell: ({ row }) => <span className="font-mono font-medium">{row.original.code}</span>,
    enableHiding: false,
    meta: { title: 'Code' },
  },
  {
    id: 'discount',
    header: 'Discount',
    cell: ({ row }) => (row.original.type === 'percent' ? `${row.original.value}%` : bdt(row.original.value)),
    meta: { title: 'Discount' },
  },
  {
    accessorKey: 'used',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Usage" />,
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.used} <span className="text-muted-foreground">/ {row.original.limit}</span></span>
    ),
    meta: { title: 'Usage' },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Status', filterVariant: 'facet', optionLabel: (v: string) => v.charAt(0).toUpperCase() + v.slice(1) },
  },
  {
    accessorKey: 'expiresOn',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Expires" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{dateUK(row.original.expiresOn)}</span>,
    meta: { title: 'Expires' },
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { className: 'w-10' },
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.original.code}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onEdit(row.original)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(api.couponExpire(row.original.code), `${row.original.code} expired`)}>Expire now</DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmDeleteItem name={row.original.code} onConfirm={() => onDelete(row.original)} />
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function CouponsPage() {
  const { data: rows, error, reload } = useList(api.listCoupons);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);

  const onDelete = (c: Coupon) => run(api.couponDelete(c.code), `${c.code} deleted`, reload);
  const columns = makeColumns(setEditing, onDelete);

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Discount codes and bulk vouchers."
        actions={
          <>
            <BulkGenerateDialog onDone={reload} />
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New coupon</Button>
          </>
        }
      />
      {error ? (
        <ListError message={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          data={rows ?? []}
          loading={!rows}
          initialSort={[{ id: 'expiresOn', desc: true }]}
          getSearchText={(c) => c.code}
          searchPlaceholder="Search code..."
          emptyState="No coupons yet. Create one to get started."
          onExport={(toExport) => exportCsv('coupons.csv', toExport, [
            { header: 'Code', value: (c) => c.code },
            { header: 'Type', value: (c) => c.type },
            { header: 'Value', value: (c) => c.value },
            { header: 'Used', value: (c) => c.used },
            { header: 'Limit', value: (c) => c.limit },
            { header: 'Status', value: (c) => c.status },
            { header: 'Expires', value: (c) => (c.expiresOn ? dateUK(c.expiresOn) : '') },
          ])}
        />
      )}

      <CouponDialog
        open={creating || !!editing}
        coupon={editing}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}
        onDone={reload}
      />
    </>
  );
}

// Create + edit share one dialog: when `coupon` is set the code field is locked
// and we PATCH; otherwise we POST a new code.
function CouponDialog({
  open, coupon, onOpenChange, onDone,
}: { open: boolean; coupon: Coupon | null; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const editing = !!coupon;
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'flat'>('percent');
  const [value, setValue] = useState('');
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);

  // Sync form to the row being edited each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setCode(coupon?.code ?? '');
    setType(coupon?.type ?? 'percent');
    setValue(coupon ? String(coupon.value) : '');
    setLimit(coupon && coupon.limit ? String(coupon.limit) : '');
  }, [open, coupon]);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    const num = Number(value);
    const lim = limit.trim() === '' ? null : Number(limit);
    if (!editing && trimmed.length < 3) { toast.error('Code must be at least 3 characters.'); return; }
    if (!Number.isFinite(num) || num <= 0) { toast.error('Value must be a positive number.'); return; }
    if (lim != null && (!Number.isFinite(lim) || lim < 0)) { toast.error('Usage limit must be 0 or more.'); return; }

    setBusy(true);
    const body = { discount_type: toDiscountType(type), discount_value: num, max_uses: lim };
    const p = editing
      ? api.couponUpdate(coupon!.code, body)
      : api.couponCreate({ code: trimmed, ...body });
    await run(p, editing ? `${coupon!.code} updated` : `Coupon ${trimmed} created`, () => { onOpenChange(false); onDone(); });
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${coupon!.code}` : 'New coupon'}</DialogTitle>
          <DialogDescription>{editing ? 'Update this discount code.' : 'Create a single discount code.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="code">Code</Label>
            <Input id="code" placeholder="EARLYBIRD25" className="font-mono" value={code} disabled={editing} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'percent' | 'flat')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="percent">Percent</SelectItem><SelectItem value="flat">Flat (৳)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label htmlFor="value">Value</Label><Input id="value" type="number" placeholder="25" value={value} onChange={(e) => setValue(e.target.value)} /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="limit">Usage limit</Label><Input id="limit" type="number" placeholder="200" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving...' : editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Generate prefix+random codes client-side, POST each, then download the
// successfully-created codes as CSV.
function genCode(prefix: string): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix.trim().toUpperCase()}${s}`;
}

function BulkGenerateDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('');
  const [type, setType] = useState<'percent' | 'flat'>('flat');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    const n = Number(count);
    const num = Number(value);
    if (!prefix.trim()) { toast.error('Prefix is required.'); return; }
    if (!Number.isInteger(n) || n <= 0 || n > 500) { toast.error('Choose between 1 and 500 codes.'); return; }
    if (!Number.isFinite(num) || num <= 0) { toast.error('Discount value must be positive.'); return; }

    setBusy(true);
    const t = toast.loading(`Generating ${n} coupons...`);
    const created: string[] = [];
    const body = { discount_type: toDiscountType(type), discount_value: num, max_uses: 1 };
    for (let i = 0; i < n; i += 1) {
      const code = genCode(prefix);
      try {
        await api.couponCreate({ code, ...body });
        created.push(code);
      } catch { /* skip collisions/failures, keep going */ }
    }
    setBusy(false);
    if (created.length) {
      exportCsv('coupons-generated.csv', created.map((c) => ({ code: c })), [{ header: 'Code', value: (r) => r.code }]);
      const skipped = n - created.length;
      const desc = skipped > 0 ? `${skipped} skipped, coupons-generated.csv downloaded` : 'coupons-generated.csv downloaded';
      toast.success(`${created.length} coupons generated`, { id: t, description: desc });
    } else {
      toast.error('No coupons generated', { id: t });
    }
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Wand2 className="size-4" /> Bulk generate</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk generate coupons</DialogTitle>
          <DialogDescription>Generate a batch of single-use codes and download them as CSV.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label htmlFor="prefix">Prefix</Label><Input id="prefix" placeholder="CAMP" className="font-mono" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="count">How many</Label><Input id="count" type="number" placeholder="100" value={count} onChange={(e) => setCount(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'percent' | 'flat')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="percent">Percent</SelectItem><SelectItem value="flat">Flat (৳)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label htmlFor="bvalue">Discount value</Label><Input id="bvalue" type="number" placeholder="500" value={value} onChange={(e) => setValue(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={generate} disabled={busy}>{busy ? 'Generating...' : 'Generate'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
