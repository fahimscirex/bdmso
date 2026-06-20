import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, Check, ChevronsUpDown, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { RegistrationDetail } from '@/lib/types';
import { api } from '@/lib/api';
import { run } from '@/lib/run';
import { bdt, dateUK, dateTimeUK } from '@/lib/format';
import { Link } from '@/router';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { PaymentActions } from '@/components/payment-actions';
import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import { EditorDialog, EditorSection, EditorField, DateField } from '@/components/editor/editor-kit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CLASS_OPTIONS, DISTRICT_OPTIONS, GENDER_OPTIONS, MEDIUM_OPTIONS, RELATIONSHIP_OPTIONS } from '@/lib/options';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || '—'}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/registrations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      Back to participants
    </Link>
  );
}

// Searchable dropdown (type to filter) for long option lists like districts.
function ComboSelect({ value, onChange, options, placeholder = 'Select' }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <Check className={cn('mr-2 size-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Dropdown for an enum field; preserves a current value that isn't in the
// predefined list (legacy free-text data) so editing never silently drops it.
function OptionSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const known = options.some((o) => o.value === value);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
      <SelectContent>
        {!known && value && <SelectItem value={value}>{value}</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Edit the student + guardian fields of a registration. Maps the detail view
// type back to the snake_case columns the worker whitelists, then reloads.
function RegistrationEditDialog({ reg, onSaved }: { reg: RegistrationDetail; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    student_full_name: reg.student,
    student_date_of_birth: reg.dateOfBirth,
    student_class_name: reg.studentClass,
    student_gender: reg.gender,
    student_medium: reg.medium,
    student_school: reg.school,
    student_district: reg.district,
    guardian_full_name: reg.guardian,
    guardian_relationship: reg.relationship,
    guardian_phone: reg.phone,
    guardian_email: reg.email,
    guardian_address: reg.address,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      student_full_name: reg.student,
      student_date_of_birth: reg.dateOfBirth,
      student_class_name: reg.studentClass,
      student_gender: reg.gender,
      student_medium: reg.medium,
      student_school: reg.school,
      student_district: reg.district,
      guardian_full_name: reg.guardian,
      guardian_relationship: reg.relationship,
      guardian_phone: reg.phone,
      guardian_email: reg.email,
      guardian_address: reg.address,
    });
  }, [open, reg]);

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => run(api.registrationUpdate(reg.id, form), 'Registration updated', () => { onSaved(); setOpen(false); });

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline" size="sm"><Pencil className="size-4" /> Edit</Button>}
      title="Edit registration"
      description="Update the student and guardian details."
      onSubmit={submit}
      submitLabel="Save changes"
    >
      <EditorSection title="Student">
        <EditorField label="Full name" htmlFor="student_full_name">
          <Input id="student_full_name" value={form.student_full_name} onChange={(e) => set('student_full_name', e.target.value)} />
        </EditorField>
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Date of birth">
            <DateField value={form.student_date_of_birth} onChange={(v) => set('student_date_of_birth', v)} />
          </EditorField>
          <EditorField label="Class">
            <OptionSelect value={form.student_class_name} onChange={(v) => set('student_class_name', v)} options={CLASS_OPTIONS} />
          </EditorField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Gender">
            <OptionSelect value={form.student_gender} onChange={(v) => set('student_gender', v)} options={GENDER_OPTIONS} />
          </EditorField>
          <EditorField label="Medium">
            <OptionSelect value={form.student_medium} onChange={(v) => set('student_medium', v)} options={MEDIUM_OPTIONS} />
          </EditorField>
        </div>
        <EditorField label="School" htmlFor="student_school">
          <Input id="student_school" value={form.student_school} onChange={(e) => set('student_school', e.target.value)} />
        </EditorField>
        <EditorField label="District">
          <ComboSelect value={form.student_district} onChange={(v) => set('student_district', v)} options={DISTRICT_OPTIONS} placeholder="Search district" />
        </EditorField>
      </EditorSection>
      <EditorSection title="Guardian">
        <EditorField label="Full name" htmlFor="guardian_full_name">
          <Input id="guardian_full_name" value={form.guardian_full_name} onChange={(e) => set('guardian_full_name', e.target.value)} />
        </EditorField>
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Relationship">
            <OptionSelect value={form.guardian_relationship} onChange={(v) => set('guardian_relationship', v)} options={RELATIONSHIP_OPTIONS} />
          </EditorField>
          <EditorField label="Phone" htmlFor="guardian_phone">
            <Input id="guardian_phone" value={form.guardian_phone} onChange={(e) => set('guardian_phone', e.target.value)} />
          </EditorField>
        </div>
        <EditorField label="Email" htmlFor="guardian_email">
          <Input id="guardian_email" value={form.guardian_email} onChange={(e) => set('guardian_email', e.target.value)} />
        </EditorField>
        <EditorField label="Address" htmlFor="guardian_address">
          <Input id="guardian_address" value={form.guardian_address} onChange={(e) => set('guardian_address', e.target.value)} />
        </EditorField>
      </EditorSection>
    </EditorDialog>
  );
}

export function RegistrationDetailPage({ id }: { id: string }) {
  const [reg, setReg] = useState<RegistrationDetail | null>(null);
  const [error, setError] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  // Refetch after a payment mutation so statuses/methods reflect the change.
  const reload = useCallback(() => api.getRegistrationDetail(id).then(setReg).catch(() => setError(true)), [id]);

  useEffect(() => {
    let active = true;
    setReg(null);
    setError(false);
    api.getRegistrationDetail(id)
      .then((r) => { if (active) setReg(r); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <PageHeader title="Registration not found" description={`No registration matches ${id}.`} />
      </div>
    );
  }

  if (!reg) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title={reg.student}
        description={`${reg.bdmsoId} · ${reg.program.replace('BdMSO ', '')}`}
        actions={
          <div className="flex items-center gap-2">
            {reg.status !== 'confirmed' && reg.status !== 'cancelled' && (
              <Button size="sm" onClick={() => setPayOpen(true)}><BadgeCheck className="size-4" /> Record payment</Button>
            )}
            <RegistrationEditDialog reg={reg} onSaved={reload} />
          </div>
        }
      />
      <RecordPaymentDialog
        open={payOpen} onOpenChange={setPayOpen} regId={reg.id}
        defaultAmount={reg.payments.find((p) => p.status !== 'paid')?.amount}
        onDone={reload}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">{reg.student}</Field>
              <Field label="Class">{reg.studentClass}</Field>
              <Field label="Date of birth">{reg.dateOfBirth ? dateUK(reg.dateOfBirth) : '—'}</Field>
              <Field label="Gender"><span className="capitalize">{reg.gender}</span></Field>
              <Field label="Medium"><span className="capitalize">{reg.medium}</span></Field>
              <Field label="District">{reg.district}</Field>
              <div className="sm:col-span-2"><Field label="School">{reg.school}</Field></div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guardian</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">{reg.guardian}</Field>
              <Field label="Relationship"><span className="capitalize">{reg.relationship}</span></Field>
              <Field label="Phone"><span className="font-mono">{reg.phone}</span></Field>
              <div className="sm:col-span-2">
                <Field label="Email">
                  <button
                    type="button"
                    title="Click to copy"
                    onClick={() => { navigator.clipboard.writeText(reg.email); toast.success('Email copied'); }}
                    className="inline-flex max-w-full items-center gap-1.5 text-left hover:text-foreground"
                  >
                    <span className="break-all underline-offset-2 hover:underline">{reg.email}</span>
                    {reg.emailVerified && <BadgeCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Verified" />}
                  </button>
                </Field>
              </div>
              <div className="sm:col-span-2"><Field label="Address">{reg.address}</Field></div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Program">{reg.program.replace('BdMSO ', '')}</Field>
              <Field label="Status"><StatusBadge status={reg.status} /></Field>
              <Field label="Venue">{reg.venue}</Field>
              <Field label="Subject">{reg.subject}</Field>
              <div className="sm:col-span-2"><Field label="Registered on">{dateUK(reg.createdAt)}</Field></div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment ID</TableHead>
                <TableHead>Txn ID</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reg.payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No payments recorded.
                  </TableCell>
                </TableRow>
              ) : (
                reg.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell className="font-mono text-xs">{p.txnId || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{p.program.replace('BdMSO ', '')}</TableCell>
                    <TableCell>
                      {p.method}
                      {p.accountNumber && <div className="font-mono text-xs text-muted-foreground">{p.accountNumber}</div>}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{bdt(p.amount)}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{dateTimeUK(p.createdAt)}</TableCell>
                    <TableCell className="text-right"><PaymentActions payment={p} onDone={reload} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
