import type { ColumnDef } from '@tanstack/react-table';
import type { AuditEntry } from '@/lib/types';
import { api } from '@/lib/api';
import { inArray } from '@/lib/table';
import { useList } from '@/hooks/use-list';
import { dateTimeUK } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const actorLabel = (v: string) => (v === 'system' ? 'System' : v);

const columns: ColumnDef<AuditEntry>[] = [
  {
    accessorKey: 'actor',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Actor" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Avatar className="size-6"><AvatarFallback className="text-[10px]">{row.original.actor === 'system' ? 'SY' : row.original.actor.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        <span className="text-sm">{row.original.actor === 'system' ? 'System' : row.original.actor}</span>
      </div>
    ),
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Actor', filterVariant: 'facet', optionLabel: actorLabel },
  },
  {
    accessorKey: 'action',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
    cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge>,
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Action', filterVariant: 'facet' },
  },
  { accessorKey: 'target', header: 'Target', cell: ({ row }) => <span className="font-mono text-sm">{row.original.target}</span>, enableSorting: false, meta: { title: 'Target' } },
  {
    accessorKey: 'at',
    header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{dateTimeUK(row.original.at)}</span>,
    meta: { title: 'When' },
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { className: 'w-16 text-right' },
    cell: ({ row }) => (
      <Dialog>
        <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-8">View</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Audit entry</DialogTitle>
            <DialogDescription>{row.original.actor} · {row.original.action} · {dateTimeUK(row.original.at)}</DialogDescription>
          </DialogHeader>
          <pre className="overflow-auto rounded-lg bg-muted p-4 font-mono text-xs">{JSON.stringify(row.original.payload, null, 2)}</pre>
        </DialogContent>
      </Dialog>
    ),
  },
];

export function AuditPage() {
  const { data: rows, error, reload } = useList(api.listAudit);

  const onExport = (toExport: AuditEntry[]) =>
    exportCsv('audit-log.csv', toExport, [
      { header: 'When', value: (r) => dateTimeUK(r.at) },
      { header: 'Actor', value: (r) => r.actor },
      { header: 'Action', value: (r) => r.action },
      { header: 'Target', value: (r) => r.target },
    ]);

  return (
    <>
      <PageHeader title="Audit Log" description="Every admin and system action, most recent first." />
      {error ? <ListError message={error} onRetry={reload} /> : (
        <DataTable
          columns={columns}
          data={rows ?? []}
          loading={!rows}
          getSearchText={(a) => `${a.actor} ${a.action} ${a.target}`}
          searchPlaceholder="Search actor, action, target..."
          initialSort={[{ id: 'at', desc: true }]}
          onExport={onExport}
        />
      )}
    </>
  );
}
