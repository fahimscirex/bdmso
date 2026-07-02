import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { Cohort, CohortStatus, Program } from '@/lib/types';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { run } from '@/lib/run';
import { bdt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { cap } from '@/lib/table';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDeleteItem } from '@/components/confirm-delete';
import { EditorDialog, EditorSection, EditorField, SwitchField, ImageField, MarkdownTextarea, MarkdownPreview } from '@/components/editor/editor-kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

// Cohort (run) lifecycle - see the runs panel inside each program. The stage is
// derived from each run's dates (server-side); only draft/archived are manual.
const RUN_TONE: Record<CohortStatus, string> = {
  enrolling: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  running:   'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  upcoming:  'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  draft:     'bg-muted text-muted-foreground',
  ended:     'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
  archived:  'bg-zinc-500/10 text-muted-foreground',
};

export function ProgramsPage() {
  const [rows, setRows] = useState<Program[] | null>(null);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const reload = () => { setError(null); return api.listPrograms().then(setRows).catch((e) => { if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message || 'Failed to load.'); }); };
  const reloadCohorts = () => api.listCohorts().then(setCohorts);
  // Editing a program re-syncs its live runs' dates server-side, so refresh both.
  const reloadAll = () => { reload(); reloadCohorts().catch(() => {}); };
  useEffect(() => { reload(); reloadCohorts().catch(() => {}); }, []);

  const cohortsByProgram = cohorts.reduce<Record<string, Cohort[]>>((m, c) => {
    (m[c.programSlug] ??= []).push(c);
    return m;
  }, {});
  const toggle = (slug: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });

  const filtered = (rows ?? []).filter((p) => tab === 'all' || p.status === tab);

  return (
    <>
      <PageHeader
        title="Programs"
        description="The catalogue that drives registrations - pricing, status, and visibility."
        actions={
          <ProgramEditor
            trigger={<Button size="sm"><Plus className="size-4" /> New program</Button>}
            onSaved={reloadAll}
          />
        }
      />

      {error && <ListError message={error} onRetry={reloadAll} />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="coming_soon">Coming soon</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Program</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))
              : filtered.map((p) => {
                  const runs = cohortsByProgram[p.slug] ?? [];
                  const isOpen = expanded.has(p.slug);
                  // Price lives on the runs now: show the range across this
                  // program's run/option prices (— when no run is priced yet).
                  const runPrices = runs.flatMap((r) => (r.options.length ? r.options.map((o) => o.price) : (r.priceOverride != null ? [r.priceOverride] : [])));
                  const feeCell = runPrices.length === 0 ? '—'
                    : Math.min(...runPrices) === Math.max(...runPrices) ? bdt(Math.min(...runPrices))
                    : `${bdt(Math.min(...runPrices))} - ${bdt(Math.max(...runPrices))}`;
                  return (
                    <Fragment key={p.slug}>
                      <TableRow>
                        <TableCell>
                          <button type="button" onClick={() => toggle(p.slug)} className="flex items-center gap-2 text-left">
                            <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                            <span>
                              <span className="block font-medium">{p.title}</span>
                              <span className="block text-xs text-muted-foreground">{p.category} · {runs.length} run{runs.length === 1 ? '' : 's'}</span>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                        <TableCell className="text-right font-mono font-medium tabular-nums">{feeCell}</TableCell>
                        <TableCell>
                          <Switch
                            checked={p.published}
                            onCheckedChange={(v) => run(api.programPublish(p.slug, v), `${p.title} ${v ? 'published' : 'unpublished'}`, reload)}
                          />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.title}`}><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <ProgramEditor
                                item={p}
                                trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Edit</DropdownMenuItem>}
                                onSaved={reloadAll}
                              />
                              <DropdownMenuItem onClick={() => window.open(`/programs/${p.slug}`, '_blank', 'noopener')}>View page</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <ConfirmDeleteItem name={p.title} onConfirm={() => run(api.programDelete(p.slug), 'Program deleted', reload)}>
                                Delete
                              </ConfirmDeleteItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="bg-muted/20 p-0">
                            <ProgramRuns program={p} runs={runs} onChange={reloadCohorts} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

type Form = {
  slug: string;
  title: string;
  category: string;
  registration_status: string;
  tagline: string;
  eyebrow: string;
  image: string;
  audience: string;
  duration: string;
  format: string;
  outcome: string;
  level: string;
  schedule_label: string;
  starts_on: string;
  ends_on: string;
  registration_opens: string;
  registration_closes: string;
  price_label: string;
  fee_amount: string;
  meta_description: string;
  home_order: string;
  register_url: string;
  register_label: string;
  body_md: string;
  published: boolean;
  hidden: boolean;
  repeatable: boolean;
  always_open: boolean;
  enroll_by_run: boolean;
  pick_one: boolean;
};

const blankForm: Form = {
  slug: '', title: '', category: 'competition', registration_status: 'closed',
  tagline: '', eyebrow: '', image: '', audience: '', duration: '', format: '',
  outcome: '', level: '', schedule_label: '', starts_on: '', ends_on: '',
  registration_opens: '', registration_closes: '', price_label: '', fee_amount: '',
  meta_description: '', home_order: '', register_url: '', register_label: '', body_md: '',
  published: false, hidden: false, repeatable: false, always_open: false, enroll_by_run: false, pick_one: false,
};

const str = (v: unknown) => (v == null ? '' : String(v));

function ProgramEditor({ item, trigger, onSaved }: { item?: Program; trigger: ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(blankForm);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    if (!item) { setForm(blankForm); return; }
    api.getProgramBody(item.slug).then((p) => {
      setForm({
      slug: str(p.slug),
      title: str(p.title),
      category: str(p.category) || 'competition',
      registration_status: str(p.registration_status) || 'closed',
      tagline: str(p.tagline),
      eyebrow: str(p.eyebrow),
      image: str(p.image),
      audience: str(p.audience),
      duration: str(p.duration),
      format: str(p.format),
      outcome: str(p.outcome),
      level: str(p.level),
      schedule_label: str(p.schedule_label),
      starts_on: str(p.starts_on),
      ends_on: str(p.ends_on),
      registration_opens: str(p.registration_opens),
      registration_closes: str(p.registration_closes),
      price_label: str(p.price_label),
      fee_amount: p.fee_amount == null ? '' : String(p.fee_amount),
      meta_description: str(p.meta_description),
      home_order: p.home_order == null ? '' : String(p.home_order),
      register_url: str(p.register_url),
      register_label: str(p.register_label),
      body_md: str(p.body_md),
      published: !!p.published,
      hidden: !!p.hidden,
      repeatable: !!p.repeatable,
      always_open: !!p.always_open,
      enroll_by_run: !!p.enroll_by_run,
      pick_one: !!p.pick_one,
      });
    });
  }, [open, item]);

  function submit() {
    // Dates + price live on the runs now, not the program - so they are NOT
    // sent here (sending them would overwrite/clear the DB columns). The program
    // editor covers identity, content, and run behaviour (pick_one) only.
    const fields = {
      title: form.title,
      category: form.category,
      registration_status: form.registration_status,
      tagline: form.tagline,
      eyebrow: form.eyebrow,
      image: form.image,
      audience: form.audience,
      duration: form.duration,
      format: form.format,
      outcome: form.outcome,
      level: form.level,
      meta_description: form.meta_description,
      home_order: form.home_order,
      register_url: form.register_url,
      register_label: form.register_label,
      body_md: form.body_md,
      published: form.published,
      hidden: form.hidden,
      repeatable: form.repeatable,
      pick_one: form.pick_one,
    };
    const payload = item ? fields : { slug: form.slug, ...fields };
    run(
      item ? api.programUpdate(item.slug, payload) : api.programCreate(payload),
      item ? 'Program saved' : 'Program created',
      () => { onSaved(); setOpen(false); },
    );
  }

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={item ? 'Edit program' : 'New program'}
      description={item ? 'Update this program in the catalogue.' : 'Add a new program to the catalogue.'}
      onSubmit={submit}
      submitLabel={item ? 'Save changes' : 'Create program'}
      preview={<MarkdownPreview md={form.body_md} image={form.image} />}
    >
      <EditorSection title="Basics">
        {!item && (
          <EditorField
            label="Slug"
            htmlFor="slug"
            hint="URL path: lowercase letters, numbers, hyphens. Cannot change after creation."
          >
            <Input id="slug" className="font-mono" placeholder="math-olympiad" value={form.slug} onChange={(e) => set('slug', e.target.value)} />
          </EditorField>
        )}
        <EditorField label="Title" htmlFor="title" hint="Program name shown across the site.">
          <Input id="title" placeholder="Math Olympiad" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </EditorField>
        <div className="grid grid-cols-2 gap-4">
          <EditorField label="Category" hint="Drives grouping and styling.">
            <Select value={form.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="competition">Competition</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
                <SelectItem value="residential">Residential</SelectItem>
              </SelectContent>
            </Select>
          </EditorField>
          <EditorField label="Eyebrow" htmlFor="eyebrow" hint="Small label above the title.">
            <Input id="eyebrow" value={form.eyebrow} onChange={(e) => set('eyebrow', e.target.value)} />
          </EditorField>
        </div>
        <EditorField label="Tagline" htmlFor="tagline" hint="One-line summary under the title.">
          <Input id="tagline" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
        </EditorField>
      </EditorSection>

      <EditorSection title="Registration">
        <EditorField
          label="Registration status"
          hint="open accepts signups; coming_soon and on_enquiry show but do not take payment; closed hides registration."
        >
          <Select value={form.registration_status} onValueChange={(v) => set('registration_status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="coming_soon">Coming soon</SelectItem>
              <SelectItem value="on_enquiry">On enquiry</SelectItem>
            </SelectContent>
          </Select>
        </EditorField>
        <p className="text-sm text-muted-foreground">
          Dates and price live on the runs. Expand this program in the Programs list to add runs and set
          each run's enrolment window, session dates, and price/options. The site schedule is generated
          from the runs automatically.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchField label="Repeatable" hint="When on, a guardian may register more than once." checked={form.repeatable} onChange={(v) => set('repeatable', v)} />
          <SwitchField label="Parents pick one run" hint="On: parents choose exactly one run/option (e.g. Math / Science / Both). Off: they can combine runs and the prices add up (e.g. several Mock Test dates)." checked={form.pick_one} onChange={(v) => set('pick_one', v)} />
        </div>
      </EditorSection>

      <EditorSection title="Details">
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Audience" htmlFor="audience" hint="Who it is for, e.g. Class 6-8.">
            <Input id="audience" value={form.audience} onChange={(e) => set('audience', e.target.value)} />
          </EditorField>
          <EditorField label="Duration" htmlFor="duration" hint="How long it runs, e.g. 8 weeks.">
            <Input id="duration" value={form.duration} onChange={(e) => set('duration', e.target.value)} />
          </EditorField>
          <EditorField label="Format" htmlFor="format" hint="Delivery format, e.g. Online or In-person.">
            <Input id="format" value={form.format} onChange={(e) => set('format', e.target.value)} />
          </EditorField>
          <EditorField label="Outcome" htmlFor="outcome" hint="What participants gain.">
            <Input id="outcome" value={form.outcome} onChange={(e) => set('outcome', e.target.value)} />
          </EditorField>
          <EditorField label="Level" htmlFor="level" hint="Difficulty level.">
            <Input id="level" value={form.level} onChange={(e) => set('level', e.target.value)} />
          </EditorField>
          <EditorField label="Home order" htmlFor="home_order" hint="Sort order on the home page (lower shows first).">
            <Input id="home_order" type="number" value={form.home_order} onChange={(e) => set('home_order', e.target.value)} />
          </EditorField>
        </div>
        <EditorField label="Image" htmlFor="image" hint="Upload an image or paste a URL (/images/... or https://...).">
          <ImageField id="image" value={form.image} onChange={(v) => set('image', v)} prefix="programs" hidePreview />
        </EditorField>
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Register URL" htmlFor="register_url" hint="External registration link, if signup is off-site.">
            <Input id="register_url" value={form.register_url} onChange={(e) => set('register_url', e.target.value)} />
          </EditorField>
          <EditorField label="Register label" htmlFor="register_label" hint="Text for the register button.">
            <Input id="register_label" value={form.register_label} onChange={(e) => set('register_label', e.target.value)} />
          </EditorField>
        </div>
      </EditorSection>

      <EditorSection title="Content">
        <EditorField label="Meta description" htmlFor="meta_description" hint="SEO description for search results, ~155 characters.">
          <Textarea id="meta_description" rows={2} value={form.meta_description} onChange={(e) => set('meta_description', e.target.value)} />
        </EditorField>
        <EditorField
          label="Body (markdown)"
          htmlFor="body_md"
          hint="Full program details in Markdown: ## headings, ** bold, - lists, [text](url) links."
        >
          <MarkdownTextarea id="body_md" rows={16} value={form.body_md} onChange={(v) => set('body_md', v)} />
        </EditorField>
      </EditorSection>

      <EditorSection title="Visibility">
        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchField label="Published" hint="Publicly visible when on." checked={form.published} onChange={(v) => set('published', v)} />
          <SwitchField label="Hidden" hint="When on, hidden from listings even if published." checked={form.hidden} onChange={(v) => set('hidden', v)} />
        </div>
      </EditorSection>
    </EditorDialog>
  );
}

// ---- Runs (cohorts) -------------------------------------------------------
// A run is one scheduled instance of a program that students enrol into. Each
// run owns its dates, price (or priced options), and capacity - set on the row
// below. Students pick from the enrolling runs and pay per run. Lifecycle and
// featuring are managed per run here.

function ProgramRuns({ program, runs, onChange }: { program: Program; runs: Cohort[]; onChange: () => void }) {
  const [opening, setOpening] = useState(false);
  return (
    <div className="space-y-3 px-4 py-4 sm:px-12">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-medium">Runs</span>
          <p className="text-xs text-muted-foreground">Stage updates automatically from each run's dates. Draft and archived are manual.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpening(true)}><Plus className="size-4" /> Open new run</Button>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No runs yet. Open one to start taking registrations, then set its dates and price/options on the row.
        </p>
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {runs.map((c) => <RunRow key={c.cohortKey} cohort={c} onChange={onChange} />)}
        </div>
      )}
      {opening && <OpenRunDialog program={program} onClose={() => setOpening(false)} onDone={() => { setOpening(false); onChange(); }} />}
    </div>
  );
}

// A labelled field block: small uppercase caption above its control, so each
// piece of a run reads as its own thing instead of a run-on line.
function RunField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function RunRow({ cohort: c, onChange }: { cohort: Cohort; onChange: () => void }) {
  // c.status is the DERIVED stage. Manual overrides are only draft/archived;
  // upcoming/enrolling/running/ended are computed from the run's dates.
  const setStatus = (status: CohortStatus, msg: string) =>
    run(api.cohortUpdate(c.cohortKey, { status }), msg, onChange);
  const isDraft = c.status === 'draft';
  const isArchived = c.status === 'archived';

  // Per-run price (price_override). Empty/blank = fall back to the program's
  // flat fee. Editable inline; saved on blur or Enter.
  const [priceDraft, setPriceDraft] = useState(c.priceOverride == null ? '' : String(c.priceOverride));
  const [editingPrice, setEditingPrice] = useState(false);
  const commitPrice = () => {
    setEditingPrice(false);
    const trimmed = priceDraft.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    const current = c.priceOverride == null ? null : c.priceOverride;
    if ((next == null ? null : next) === current) return;
    if (next !== null && (!Number.isInteger(next) || next < 0)) return;
    run(api.cohortUpdate(c.cohortKey, { price_override: next }), 'Run price updated', onChange);
  };

  // Per-run dates: each option owns its enrol window + session dates. Saved on
  // change (native date input gives 'YYYY-MM-DD' or ''). Empty clears the date.
  const saveDate = (field: 'enroll_opens' | 'enroll_closes' | 'starts_on' | 'ends_on', value: string) =>
    run(api.cohortUpdate(c.cohortKey, { [field]: value || null }), 'Run dates updated', onChange);
  const dateInput = 'rounded border border-input bg-background px-1 py-0.5 text-xs';

  return (
    <div className="space-y-3 p-4">
      {/* Identity + status + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{c.label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{c.cohortKey}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge className={cn('border-transparent text-[10px] font-medium', RUN_TONE[c.status])}>{cap(c.status)}</Badge>
            {c.resultsPublished && <Badge className="border-transparent bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-400">Results live to guardians</Badge>}
            {c.publicFeatured && <Badge className="border-transparent bg-violet-500/15 text-[10px] text-violet-700 dark:text-violet-400">On public /results</Badge>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Actions for ${c.label}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {isDraft && <DropdownMenuItem onClick={() => setStatus('enrolling', `${c.label} is now live`)}>Make live</DropdownMenuItem>}
            {isArchived && <DropdownMenuItem onClick={() => setStatus('enrolling', `${c.label} restored`)}>Restore (make live)</DropdownMenuItem>}
            {!isDraft && !isArchived && <DropdownMenuItem onClick={() => setStatus('draft', `${c.label} moved to draft`)}>Move to draft</DropdownMenuItem>}
            {c.sections.length > 0 && (
              <DropdownMenuItem onClick={() => run(api.cohortFeature(c.cohortKey, !c.publicFeatured), c.publicFeatured ? 'Removed from public /results' : 'Winners featured on public /results', onChange)}>
                {c.publicFeatured ? 'Hide winners from public /results' : 'Feature winners on public /results'}
              </DropdownMenuItem>
            )}
            {!isArchived && <DropdownMenuItem onClick={() => setStatus('archived', `${c.label} archived`)}>Archive run</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <ConfirmDeleteItem name={c.label} onConfirm={() => run(api.cohortDelete(c.cohortKey), 'Run deleted', onChange)}>
              Delete run
            </ConfirmDeleteItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dates, price, registrations - each labelled */}
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <RunField label="Enrolment window">
          <div className="flex items-center gap-1.5">
            <input type="date" className={dateInput} value={c.enrollOpens ?? ''} onChange={(e) => saveDate('enroll_opens', e.target.value)} aria-label="Enrolment opens" />
            <span className="text-muted-foreground">→</span>
            <input type="date" className={dateInput} value={c.enrollCloses ?? ''} onChange={(e) => saveDate('enroll_closes', e.target.value)} aria-label="Enrolment closes" />
          </div>
        </RunField>
        <RunField label="Session dates">
          <div className="flex items-center gap-1.5">
            <input type="date" className={dateInput} value={c.startsOn ?? ''} onChange={(e) => saveDate('starts_on', e.target.value)} aria-label="Session starts" />
            <span className="text-muted-foreground">→</span>
            <input type="date" className={dateInput} value={c.endsOn ?? ''} onChange={(e) => saveDate('ends_on', e.target.value)} aria-label="Session ends" />
          </div>
        </RunField>
        <RunField label="Price">
          {c.options.length > 0 ? (
            <span className="text-sm text-muted-foreground">Priced by options below</span>
          ) : editingPrice ? (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">৳</span>
              <input autoFocus type="number" min={0} step={1} className="w-24 rounded border border-input bg-background px-1.5 py-0.5 text-sm" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} onBlur={commitPrice} onKeyDown={(e) => { if (e.key === 'Enter') commitPrice(); if (e.key === 'Escape') { setPriceDraft(c.priceOverride == null ? '' : String(c.priceOverride)); setEditingPrice(false); } }} />
            </span>
          ) : (
            <button type="button" className="rounded px-1.5 py-0.5 text-sm hover:bg-accent" title="Set this run's price" onClick={() => { setPriceDraft(c.priceOverride == null ? '' : String(c.priceOverride)); setEditingPrice(true); }}>
              {c.priceOverride == null ? <span className="text-amber-600 dark:text-amber-500">Set price</span> : <span className="font-medium">৳{c.priceOverride}</span>}
            </button>
          )}
        </RunField>
        <RunField label="Registrations">
          <span className="text-sm"><span className="font-semibold tabular-nums">{c.paid}</span> paid <span className="text-muted-foreground">/ {c.regs} total</span></span>
        </RunField>
      </div>

      <RunOptionsEditor cohort={c} onChange={onChange} />
    </div>
  );
}

// Per-run priced options (name + price). Parents pick one per run; a run with
// options ignores its flat price. Saved as a whole array on each edit; empty =
// back to the flat price. IDs are assigned server-side from the label.
function RunOptionsEditor({ cohort, onChange }: { cohort: Cohort; onChange: () => void }) {
  const [opts, setOpts] = useState<{ id: string; label: string; price: number | string }[]>(cohort.options);
  const save = (next: typeof opts) => {
    const clean = next.filter((o) => String(o.label).trim()).map((o) => ({ id: o.id, label: String(o.label).trim(), price: Number(o.price) || 0 }));
    run(api.cohortUpdate(cohort.cohortKey, { options: clean }), 'Run options updated', onChange);
  };
  const add = () => setOpts([...opts, { id: '', label: '', price: 0 }]);
  const removeAt = (i: number) => { const next = opts.filter((_, j) => j !== i); setOpts(next); save(next); };
  const patch = (i: number, p: Partial<{ label: string; price: number | string }>) =>
    setOpts(opts.map((o, j) => (j === i ? { ...o, ...p } : o)));

  if (opts.length === 0) {
    return (
      <button type="button" className="mt-1 ml-1 text-xs text-muted-foreground hover:text-foreground" onClick={add}>
        + Add priced options (e.g. 1 subject / 2 subjects)
      </button>
    );
  }
  return (
    <div className="mt-2 ml-1 space-y-1.5 border-l pl-3">
      <div className="text-xs font-medium text-muted-foreground">Options (parent picks one)</div>
      {opts.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text" placeholder="Option name (e.g. 2 subjects)"
            className="w-56 rounded border border-input bg-background px-1.5 py-0.5 text-sm"
            value={o.label}
            onChange={(e) => patch(i, { label: e.target.value })}
            onBlur={() => save(opts)}
          />
          <span className="text-muted-foreground">৳</span>
          <input
            type="number" min={0} step={1} placeholder="0"
            className="w-24 rounded border border-input bg-background px-1.5 py-0.5 text-sm"
            value={o.price}
            onChange={(e) => patch(i, { price: e.target.value })}
            onBlur={() => save(opts)}
          />
          <Button variant="ghost" size="icon" className="size-7" aria-label="Remove option" onClick={() => removeAt(i)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={add}>+ Add option</button>
    </div>
  );
}

function OpenRunDialog({ program, onClose, onDone }: { program: Program; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState('');
  const [asDraft, setAsDraft] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await run(
      api.cohortOpen({ program_slug: program.slug, label: label.trim() || undefined, status: asDraft ? 'draft' : 'enrolling' }),
      'New run opened',
      onDone,
    );
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open new run - {program.title}</DialogTitle>
          <DialogDescription>
            Creates a new run. Set its enrolment window, session dates, and price/options on the row -
            its stage (upcoming / enrolling / running / ended) is then derived automatically from those dates.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="run-label">Label</Label>
            <Input id="run-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Auto from program + year" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Create as draft</div>
              <div className="text-xs text-muted-foreground">Keep it hidden and inactive until you make it live.</div>
            </div>
            <Switch checked={asDraft} onCheckedChange={setAsDraft} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Opening...' : 'Open run'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
