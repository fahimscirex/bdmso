import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import type { User } from '@/lib/types';
import { api } from '@/lib/api';
import { inArray } from '@/lib/table';
import { useList } from '@/hooks/use-list';
import { run } from '@/lib/run';
import { relativeTime } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { EditorDialog, EditorSection, EditorField } from '@/components/editor/editor-kit';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Edit a guardian/admin account's profile fields. Maps the view type's `name`
// back to the `full_name` column the worker whitelists, then reloads.
function UserEditDialog({ user, trigger, onSaved }: { user: User; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: user.name, email: user.email, phone: '' });

  useEffect(() => {
    if (open) setForm({ full_name: user.name, email: user.email, phone: '' });
  }, [open, user]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => run(api.userUpdate(user.id, form), 'Profile updated', () => { onSaved(); setOpen(false); });

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Edit profile"
      description="Update this account's name, email, and phone."
      onSubmit={submit}
      submitLabel="Save changes"
    >
      <EditorSection title="Profile">
        <EditorField label="Full name" htmlFor="full_name">
          <Input id="full_name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </EditorField>
        <EditorField label="Email" htmlFor="email">
          <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </EditorField>
        <EditorField label="Phone" htmlFor="phone">
          <Input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </EditorField>
      </EditorSection>
    </EditorDialog>
  );
}

const makeColumns = (reload: () => void): ColumnDef<User>[] => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <Avatar className="size-8"><AvatarFallback className="text-xs">{row.original.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.email}</div>
        </div>
      </div>
    ),
    enableHiding: false,
    meta: { title: 'User' },
  },
  {
    accessorKey: 'role',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
    cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.original.role}</Badge>,
    enableSorting: false,
    filterFn: inArray,
    meta: { title: 'Role', filterVariant: 'facet', optionLabel: (v: string) => v.charAt(0).toUpperCase() + v.slice(1) },
  },
  {
    accessorKey: 'verified',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.verified ? 'verified' : 'unverified'} />,
    enableSorting: false,
    meta: { title: 'Status' },
  },
  {
    accessorKey: 'lastActive',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last active" />,
    cell: ({ row }) => <span className="text-muted-foreground">{relativeTime(row.original.lastActive)}</span>,
    meta: { title: 'Last active' },
  },
  {
    id: 'actions',
    enableHiding: false,
    meta: { className: 'w-10' },
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.original.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <UserEditDialog
            user={row.original}
            trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Edit profile</DropdownMenuItem>}
            onSaved={reload}
          />
          <DropdownMenuItem onClick={() => run(api.userResetPassword(row.original.id), `Password reset sent to ${row.original.email}`)}>Send password reset</DropdownMenuItem>
          <DropdownMenuSeparator />
          {(['admin', 'editor', 'mentor', 'viewer'] as const).filter((r) => r !== row.original.role).map((r) => (
            <DropdownMenuItem key={r} onClick={() => run(api.userRole(row.original.id, r), `${row.original.name} is now ${r}`)} className="capitalize">Make {r}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function UsersPage() {
  const { data: rows, error, reload } = useList(api.listUsers);
  const columns = useMemo(() => makeColumns(reload), [reload]);
  return (
    <>
      <PageHeader title="Users" description="Admin accounts and their access." />
      {error ? <ListError message={error} onRetry={reload} /> : (
      <DataTable
        columns={columns}
        data={rows ?? []}
        loading={!rows}
        initialSort={[{ id: 'name', desc: false }]}
        getSearchText={(u) => `${u.name} ${u.email}`}
        searchPlaceholder="Search users..."
        emptyState="No user accounts yet."
        onExport={(toExport) => exportCsv('users.csv', toExport, [
          { header: 'Name', value: (u) => u.name },
          { header: 'Email', value: (u) => u.email },
          { header: 'Role', value: (u) => u.role },
          { header: 'Verified', value: (u) => (u.verified ? 'yes' : 'no') },
          { header: 'Last active', value: (u) => relativeTime(u.lastActive) },
        ])}
      />
      )}
    </>
  );
}
