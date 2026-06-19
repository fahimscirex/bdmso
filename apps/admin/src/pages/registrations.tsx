import { useMemo, useState } from 'react';
import type { ColumnDef, Table } from '@tanstack/react-table';
import { Mail, MoreHorizontal } from 'lucide-react';
import type { Registration } from '@/lib/types';
import { api } from '@/lib/api';
import { inArray, cap } from '@/lib/table';
import { useList } from '@/hooks/use-list';
import { renderMarkdown } from '@/lib/markdown';
import { run } from '@/lib/run';
import { bdt, dateBD, timeBD } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { ConfirmDeleteItem } from '@/components/confirm-delete';
import { StatusBadge } from '@/components/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DataTableFacetedFilter } from '@/components/data-table/data-table-faceted-filter';
import { DataTableDateFilter, dateMatches, type DateFilterValue } from '@/components/data-table/data-table-date-filter';
import { useRouter } from '@/router';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentField, type Attachment } from '@/components/attachment-field';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const subjectLabel = (s: string) =>
  s === 'both' ? 'Math & Science' : s === 'math' ? 'Math' : s === 'science' ? 'Science' : s;

const makeColumns = (reload: () => void): ColumnDef<Registration>[] => [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { className: 'w-10' },
  },
  {
    accessorKey: 'student',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Student" />,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.student}</div>
        <div className="font-mono text-xs text-muted-foreground">{row.original.bdmsoId}</div>
      </div>
    ),
    enableHiding: false,
    meta: { title: 'Student', className: 'w-[190px] max-w-[190px]' },
  },
  {
    accessorKey: 'program',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Program" />,
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[170px]">
        <div className="truncate text-muted-foreground">{row.original.program.replace('BdMSO ', '')}</div>
        {row.original.studentClass && <div className="truncate text-xs text-muted-foreground">{row.original.studentClass}</div>}
      </div>
    ),
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Program', className: 'w-[170px] max-w-[170px]', hideWhenFiltered: true },
  },
  {
    accessorKey: 'district',
    header: ({ column }) => <DataTableColumnHeader column={column} title="District" />,
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[200px]">
        <div className="truncate">{row.original.district}</div>
        {row.original.venue !== '—' && <div className="truncate text-xs text-muted-foreground">Exam: {cap(row.original.venue)}</div>}
        {row.original.school !== '—' && <div className="truncate text-xs text-muted-foreground">{row.original.school}</div>}
      </div>
    ),
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'District', filterVariant: 'facet', className: 'max-w-[200px]' },
  },
  {
    // Hidden - exists only to back the "Exam region" toolbar filter; the value
    // itself is shown inside the District column.
    accessorKey: 'venue',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Exam region" />,
    cell: ({ row }) => <span className="text-muted-foreground">{cap(row.original.venue)}</span>,
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Exam region', optionLabel: cap, defaultHidden: true },
  },
  {
    accessorKey: 'subject',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subject" />,
    cell: ({ row }) => {
      const { subject, preferredSubject } = row.original;
      if (subject === '—') return <span className="text-muted-foreground">—</span>;
      const showPref = preferredSubject && preferredSubject !== subject;
      return (
        <div className="min-w-0">
          <div>{subjectLabel(subject)}</div>
          {showPref && <div className="text-xs text-muted-foreground">Prefers {subjectLabel(preferredSubject)}</div>}
        </div>
      );
    },
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Subject', filterVariant: 'facet', optionLabel: subjectLabel },
  },
  {
    // Hidden - backs the "Class" toolbar filter; the value is shown inside the
    // Program column.
    accessorKey: 'studentClass',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Class" />,
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Class', defaultHidden: true },
  },
  {
    accessorKey: 'guardian',
    header: 'Guardian',
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[180px]">
        <div className="truncate">{row.original.guardian}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">{row.original.phone}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
      </div>
    ),
    enableSorting: false,
    meta: { title: 'Guardian', className: 'max-w-[180px]' },
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" className="justify-end" />,
    cell: ({ row }) => (
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono font-medium tabular-nums">{bdt(row.original.amount)}</span>
        <StatusBadge status={row.original.payment} />
      </div>
    ),
    meta: { title: 'Amount', className: 'text-right' },
  },
  {
    // Hidden - backs the "Payment" toolbar filter; the badge is shown in the
    // Amount column.
    accessorKey: 'payment',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Payment" />,
    cell: ({ row }) => <StatusBadge status={row.original.payment} />,
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Payment', defaultHidden: true },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => (
      <div className="whitespace-nowrap text-muted-foreground">
        <div>{dateBD(row.original.createdAt)}</div>
        <div className="text-xs">{timeBD(row.original.createdAt)}</div>
      </div>
    ),
    filterFn: (row, _id, value) => dateMatches(row.original.createdAt, value as DateFilterValue),
    meta: { title: 'Date', hideWhenFiltered: true },
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { className: 'w-10' },
    cell: ({ row }) => <div onClick={(e) => e.stopPropagation()}><RowActions row={row.original} onChanged={reload} /></div>,
  },
];

function RowActions({ row, onChanged }: { row: Registration; onChanged: () => void }) {
  const { navigate } = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.student}`}><MoreHorizontal className="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => navigate(`/registrations/${row.id}`)}>View details</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run(api.registrationStatus(row.id, 'paid'), `${row.student} marked paid`, onChanged)}>Mark as paid</DropdownMenuItem>
        <DropdownMenuSeparator />
        <ConfirmDeleteItem name={`${row.student}'s registration`} onConfirm={() => run(api.registrationStatus(row.id, 'cancelled'), `${row.student} cancelled`, onChanged)}>
          Cancel registration
        </ConfirmDeleteItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Toolbar action: compose a one-off email to the guardians of the selected
// rows. Reuses the broadcast endpoint's manual-recipient path.
function EmailSelected({ table }: { table: Table<Registration> }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);

  const selected = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
  const emails = [...new Set(selected.map((r) => r.email).filter((e) => e && e !== '—'))];

  const send = async () => {
    setSending(true);
    await run(
      api.broadcastSend({ subject, message: renderMarkdown(body), emails, attachments }),
      `Email sent to ${emails.length} guardian${emails.length === 1 ? '' : 's'}`,
      () => { setOpen(false); setSubject(''); setBody(''); setAttachments([]); table.resetRowSelection(); },
    );
    setSending(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        disabled={emails.length === 0}
        onClick={() => setOpen(true)}
      >
        <Mail className="size-3.5" /> Email{selected.length ? ` (${selected.length})` : ''}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email selected guardians</DialogTitle>
            <DialogDescription>
              Reaches {emails.length} guardian{emails.length === 1 ? '' : 's'} for the {selected.length} selected
              registration{selected.length === 1 ? '' : 's'}. Markdown is supported.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="mail-subject">Subject</Label>
              <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mail-body">Message</Label>
              <Textarea id="mail-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Write your message..." />
            </div>
            <div className="grid gap-2">
              <Label>Attachments</Label>
              <AttachmentField value={attachments} onChange={setAttachments} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={send} disabled={sending || !subject.trim() || !body.trim()}>
              {sending ? 'Sending...' : `Send to ${emails.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RegistrationsPage() {
  const { navigate } = useRouter();
  const { data: rows, error, reload } = useList(api.listRegistrations);

  const data = useMemo(() => rows ?? [], [rows]);
  const columns = useMemo(() => makeColumns(reload), [reload]);
  // Deep-link support: /registrations?program=<label> (e.g. from a dashboard
  // card) pre-applies the Program filter. The value matches the program column
  // (program_label), so it slots straight into the faceted inArray filter.
  const initialColumnFilters = useMemo(() => {
    const program = new URLSearchParams(window.location.search).get('program');
    return program ? [{ id: 'program', value: [program] }] : [];
  }, []);
  const programOptions = useMemo(
    () => [...new Set(data.map((r) => r.program).filter(Boolean))].sort().map((v) => ({ label: v.replace('BdMSO ', ''), value: v })),
    [data],
  );
  const venueOptions = useMemo(
    () => [...new Set(data.map((r) => r.venue).filter((v) => v && v !== '—'))].sort().map((v) => ({ label: cap(v), value: v })),
    [data],
  );
  const classOptions = useMemo(
    () => [...new Set(data.map((r) => r.studentClass).filter(Boolean))].sort().map((v) => ({ label: v, value: v })),
    [data],
  );

  const onExport = (toExport: Registration[]) =>
    exportCsv('registrations.csv', toExport, [
      { header: 'BdMSO ID', value: (r) => r.bdmsoId },
      { header: 'Reg ID', value: (r) => r.id },
      { header: 'Student', value: (r) => r.student },
      { header: 'Class', value: (r) => r.studentClass },
      { header: 'Program', value: (r) => r.program },
      { header: 'District', value: (r) => r.district },
      { header: 'Exam region', value: (r) => cap(r.venue) },
      { header: 'School', value: (r) => r.school },
      { header: 'Subject', value: (r) => subjectLabel(r.subject) },
      { header: 'Guardian', value: (r) => r.guardian },
      { header: 'Phone', value: (r) => r.phone },
      { header: 'Email', value: (r) => r.email },
      { header: 'Amount (BDT)', value: (r) => r.amount },
      { header: 'Payment', value: (r) => r.payment },
      { header: 'Date', value: (r) => `${dateBD(r.createdAt)} ${timeBD(r.createdAt)}` },
    ]);

  return (
    <>
      <PageHeader
        title="Participants"
        description="Every registration across all programs - filter by program, region, status, and class."
      />
      {error ? <ListError message={error} onRetry={reload} /> : (
      <DataTable
        columns={columns}
        data={data}
        loading={!rows}
        getSearchText={(r) => `${r.student} ${r.bdmsoId} ${r.id} ${r.phone} ${r.guardian} ${r.email}`}
        searchPlaceholder="Search name, ID, phone..."
        initialSort={[{ id: 'createdAt', desc: true }]}
        initialColumnFilters={initialColumnFilters}
        onExport={onExport}
        onRowClick={(r) => navigate(`/registrations/${r.id}`)}
        toolbarExtra={(table) => (
          <>
            <EmailSelected table={table} />
            <DataTableFacetedFilter column={table.getColumn('program')} title="Program" options={programOptions} />
            <DataTableFacetedFilter column={table.getColumn('venue')} title="Exam region" options={venueOptions} />
            <DataTableFacetedFilter column={table.getColumn('studentClass')} title="Class" options={classOptions} />
            <DataTableFacetedFilter
              column={table.getColumn('payment')}
              title="Payment"
              options={[{ label: 'Paid', value: 'paid' }, { label: 'Pending', value: 'pending' }, { label: 'Failed', value: 'failed' }]}
            />
            <DataTableDateFilter column={table.getColumn('createdAt')} />
          </>
        )}
        bulkActions={(selected, clear) => (
          <>
            <Button variant="outline" size="sm" onClick={() => { run(api.bulkRemind(selected.map((s) => s.id)), `Reminder sent to ${selected.length} guardians`, reload); clear(); }}>
              Send reminder
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">Cancel</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel {selected.length} registration{selected.length === 1 ? '' : 's'}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks them cancelled and notifies guardians. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep them</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => { run(api.bulkCancel(selected.map((s) => s.id)), `${selected.length} registrations cancelled`, reload); clear(); }}
                  >
                    Cancel registrations
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      />
      )}
    </>
  );
}
