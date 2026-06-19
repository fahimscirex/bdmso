import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleDollarSign, Clock, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Payment } from '@/lib/types';
import { api } from '@/lib/api';
import { bdt, dateTimeUK } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import { inArray, cap } from '@/lib/table';
import { useList } from '@/hooks/use-list';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { PaymentActions } from '@/components/payment-actions';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { dateMatches, type DateFilterValue } from '@/components/data-table/data-table-date-filter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const makeColumns = (reload: () => void): ColumnDef<Payment>[] => [
  {
    accessorKey: 'student',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Student" />,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.student}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.program.replace('BdMSO ', '')}</div>
      </div>
    ),
    enableHiding: false,
    meta: { title: 'Student', className: 'max-w-[200px]' },
  },
  {
    accessorKey: 'id',
    header: 'Payment',
    cell: ({ row }) => (
      <div>
        <div className="font-mono text-sm font-medium">{row.original.id}</div>
        <div className="font-mono text-xs text-muted-foreground">{row.original.txnId ?? '—'}</div>
      </div>
    ),
    enableSorting: false,
    meta: { title: 'Payment', className: 'whitespace-nowrap' },
  },
  {
    accessorKey: 'method',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Method" />,
    cell: ({ row }) => (
      <div>
        <div className="text-sm">{row.original.method}</div>
        {row.original.accountNumber && (
          <div className="font-mono text-xs text-muted-foreground">{row.original.accountNumber}</div>
        )}
      </div>
    ),
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Method', className: 'whitespace-nowrap', filterVariant: 'facet' },
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" className="justify-end" />,
    cell: ({ row }) => <div className="text-right font-mono font-medium tabular-nums">{bdt(row.original.amount)}</div>,
    meta: { title: 'Amount', className: 'text-right' },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Status', filterVariant: 'facet', optionLabel: cap },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{dateTimeUK(row.original.createdAt)}</span>,
    filterFn: (row, id, value) => dateMatches(row.getValue(id), value as DateFilterValue),
    meta: { title: 'When', filterVariant: 'date' },
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { className: 'w-10' },
    cell: ({ row }) => <PaymentActions payment={row.original} onDone={reload} />,
  },
];

export function PaymentsPage() {
  const { data: rows, error, reload } = useList(api.listPayments);

  const data = useMemo(() => rows ?? [], [rows]);
  const columns = useMemo(() => makeColumns(reload), [reload]);

  // Re-verify EVERY pending payment against shurjoPay on demand (not just the
  // >30min stale ones the cron handles). Clears the backlog after a deploy.
  const reverifyAll = async () => {
    const t = toast.loading('Reconciling all pending payments with the gateway...');
    try {
      const r = await api.reverifyAllPending();
      toast.success(`Checked ${r.checked} - ${r.paid} now paid, ${r.failed} failed`, { id: t });
      reload();
    } catch (e) {
      toast.error('Re-verify failed', { id: t, description: (e as Error).message });
    }
  };

  const stats = useMemo(() => ({
    collected: data.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0),
    pending: data.filter((p) => p.status === 'pending').length,
    failed: data.filter((p) => p.status === 'failed').length,
  }), [data]);

  const onExport = (toExport: Payment[]) =>
    exportCsv('payments.csv', toExport, [
      { header: 'Payment ID', value: (p) => p.id },
      { header: 'Txn ID', value: (p) => p.txnId ?? '' },
      { header: 'Student', value: (p) => p.student },
      { header: 'Program', value: (p) => p.program },
      { header: 'Method', value: (p) => p.method },
      { header: 'Account', value: (p) => p.accountNumber ?? '' },
      { header: 'Amount (BDT)', value: (p) => p.amount },
      { header: 'Status', value: (p) => p.status },
      { header: 'When', value: (p) => dateTimeUK(p.createdAt) },
    ]);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Reconcile transactions, then report on revenue."
        actions={
          <Button size="sm" onClick={reverifyAll}><RefreshCw className="size-4" /> Reconcile pending</Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={CircleDollarSign} label="Collected" value={bdt(stats.collected)} tone="emerald" loading={!rows} />
        <StatCard icon={Clock} label="Pending" value={String(stats.pending)} tone="amber" loading={!rows} />
        <StatCard icon={XCircle} label="Failed" value={String(stats.failed)} tone="red" loading={!rows} />
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Transactions</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {error ? <ListError message={error} onRetry={reload} /> : (
            <DataTable
              columns={columns}
              data={data}
              loading={!rows}
              getSearchText={(p) => `${p.student} ${p.id} ${p.txnId ?? ''} ${p.program} ${p.accountNumber ?? ''}`}
              searchPlaceholder="Search student, txn, ID..."
              initialSort={[{ id: 'createdAt', desc: true }]}
              onExport={onExport}
            />
          )}
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by method</CardTitle>
              <CardDescription>Lifetime, paid transactions only</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(['bKash', 'Nagad', 'Card'] as const).map((m) => {
                const total = data.filter((p) => p.method === m && p.status === 'paid').reduce((s, p) => s + p.amount, 0);
                return (
                  <div key={m} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                    <span className="text-sm">{m}</span>
                    <span className="font-mono font-medium tabular-nums">{bdt(total)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function StatCard({ icon: Icon, label, value, tone, loading }: {
  icon: typeof CircleDollarSign; label: string; value: string; tone: 'emerald' | 'amber' | 'red'; loading: boolean;
}) {
  const toneCls = tone === 'emerald'
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : tone === 'amber' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    : 'bg-red-500/15 text-red-600 dark:text-red-400';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-5">
        <span className={`flex size-10 items-center justify-center rounded-lg ${toneCls}`}><Icon className="size-5" /></span>
        <div>
          {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-semibold tabular-nums">{value}</div>}
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
