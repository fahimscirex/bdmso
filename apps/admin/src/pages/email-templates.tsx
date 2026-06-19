import { useEffect, useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { EmailTemplate } from '@/lib/types';
import { api } from '@/lib/api';
import { useList } from '@/hooks/use-list';
import { run } from '@/lib/run';
import { dateUK } from '@/lib/format';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { ConfirmDeleteItem } from '@/components/confirm-delete';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export function EmailTemplatesPage() {
  const { data: rows, error, reload } = useList(api.listEmailTemplates);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const duplicate = (t: EmailTemplate) =>
    run(api.templateCreate({ name: `${t.name} (copy)`, subject: t.subject, body: t.body, category: t.category }), 'Duplicated', reload);
  const onDelete = (t: EmailTemplate) => run(api.templateDelete(t.id), `${t.name} deleted`, reload);

  return (
    <>
      <PageHeader title="Email Templates" description="Reusable templates for broadcasts and transactional emails." actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New template</Button>} />
      {error ? (
        <ListError message={error} onRetry={reload} />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Subject</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows ? Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              )) : rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{t.subject}</TableCell>
                  <TableCell className="text-muted-foreground">{t.category}</TableCell>
                  <TableCell className="hidden lg:table-cell whitespace-nowrap text-muted-foreground">{dateUK(t.updatedAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${t.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => setEditing(t)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate(t)}>Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <ConfirmDeleteItem name={t.name} onConfirm={() => onDelete(t)} />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <TemplateDialog
        open={creating || !!editing}
        template={editing}
        onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}
        onDone={reload}
      />
    </>
  );
}

function TemplateDialog({
  open, template, onOpenChange, onDone,
}: { open: boolean; template: EmailTemplate | null; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const editing = !!template;
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setSubject(template?.subject ?? '');
    setBody(template?.body ?? '');
  }, [open, template]);

  const submit = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) { return; }
    setBusy(true);
    const payload = { name: name.trim(), subject: subject.trim(), body: body.trim() };
    const p = editing ? api.templateUpdate(template!.id, payload) : api.templateCreate(payload);
    await run(p, editing ? `${name.trim()} updated` : 'Template created', () => { onOpenChange(false); onDone(); });
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Edit template' : 'New template'}</DialogTitle><DialogDescription>{editing ? 'Update this reusable email template.' : 'Create a reusable email template.'}</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label htmlFor="tname">Name</Label><Input id="tname" placeholder="Payment reminder" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="tsubject">Subject</Label><Input id="tsubject" placeholder="Complete your payment" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="tbody">Body</Label><Textarea id="tbody" rows={6} placeholder="Dear guardian, ..." value={body} onChange={(e) => setBody(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving...' : editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
