import { useEffect, useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { TeamMember } from '@/lib/types';
import { api } from '@/lib/api';
import { useList } from '@/hooks/use-list';
import { run } from '@/lib/run';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { ConfirmDeleteItem } from '@/components/confirm-delete';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EditorDialog, EditorSection, EditorField, SwitchField, ImageField } from '@/components/editor/editor-kit';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

const SECTIONS = ['delegation', 'advisor', 'organizing', 'mentor', 'alumni'];
// Admin-only display label; the stored value stays 'mentor' (public site + data unchanged).
const sectionLabel = (s: string) => (s === 'mentor' ? 'Volunteer' : s);
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

type TeamForm = {
  section: string;
  subgroup: string;
  year: string;
  name: string;
  role: string;
  affiliation: string;
  image: string;
  sort_order: number;
  published: boolean;
};

const BLANK: TeamForm = {
  section: 'organizing', subgroup: '', year: '', name: '', role: '',
  affiliation: '', image: '', sort_order: 0, published: true,
};

export function TeamPage() {
  const { data: rows, error, reload } = useList(api.listTeam);
  const [section, setSection] = useState('all');
  const filtered = (rows ?? []).filter((m) => section === 'all' || m.section === section);

  return (
    <>
      <PageHeader
        title="Team"
        description="People listed on the public team page."
        actions={
          <>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger size="sm" className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {SECTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{sectionLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            <TeamEditor
              trigger={<Button size="sm"><Plus className="size-4" /> Add member</Button>}
              onSaved={reload}
            />
          </>
        }
      />
      {error ? (
        <ListError message={error} onRetry={reload} />
      ) : !rows ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No members in this section.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((m) => (
            <Card key={m.id} className="gap-3 p-4">
              <div className="flex items-start gap-3">
                <Avatar className="size-12 rounded-lg">
                  <AvatarImage src={m.image || undefined} alt={m.name} className="rounded-lg object-cover" />
                  <AvatarFallback className="rounded-lg">{initials(m.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium leading-tight">{m.name}</div>
                  <div className="truncate text-sm text-muted-foreground">{m.role || '—'}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mt-1 -mr-1 size-8" aria-label={`Actions for ${m.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <TeamEditor
                      item={m}
                      trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Edit</DropdownMenuItem>}
                      onSaved={reload}
                    />
                    <DropdownMenuSeparator />
                    <ConfirmDeleteItem name={m.name} onConfirm={() => run(api.teamDelete(m.id), 'Member removed', reload)}>Delete</ConfirmDeleteItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="outline" className="capitalize">{sectionLabel(m.section)}</Badge>
                {m.affiliation && <span className="truncate text-xs text-muted-foreground">{m.affiliation}</span>}
              </div>
              <div className="mt-auto flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">{m.published ? 'Public' : 'Hidden'}</span>
                <Switch defaultChecked={m.published} onCheckedChange={(v) => run(api.teamPublish(m.id, v), `${m.name} ${v ? 'published' : 'hidden'}`)} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function TeamEditor({ item, trigger, onSaved }: { item?: TeamMember; trigger: React.ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TeamForm>(BLANK);

  useEffect(() => {
    if (!open) return;
    if (item) {
      api.getTeamBody(item.id).then((r) => setForm({
        section: r.section, subgroup: r.subgroup, year: r.year, name: r.name, role: r.role,
        affiliation: r.affiliation, image: r.image, sort_order: r.sort_order, published: r.published,
      }));
    } else {
      setForm(BLANK);
    }
  }, [open, item]);

  const set = <K extends keyof TeamForm>(k: K, v: TeamForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const payload = { ...form, sort_order: Number(form.sort_order) };
    run(
      item ? api.teamUpdate(item.id, payload) : api.teamCreate(payload),
      item ? 'Member saved' : 'Member added',
      () => { onSaved(); setOpen(false); },
    );
  };

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={item ? 'Edit member' : 'Add member'}
      description={item ? 'Update this team member.' : 'Add a person to the public team page.'}
      onSubmit={submit}
      submitLabel={item ? 'Save changes' : 'Add member'}
    >
      <EditorSection title="Member">
        <EditorField label="Full name" hint="Full name of the member." htmlFor="name">
          <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" />
        </EditorField>
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Section" hint="Which group they belong to.">
            <Select value={form.section} onValueChange={(v) => set('section', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SECTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{sectionLabel(s)}</SelectItem>)}</SelectContent>
            </Select>
          </EditorField>
          <EditorField label="Subgroup" hint="Optional sub-grouping within the section." htmlFor="subgroup">
            <Input id="subgroup" value={form.subgroup} onChange={(e) => set('subgroup', e.target.value)} />
          </EditorField>
        </div>
        <EditorField label="Role" hint="Title or role, e.g. Team Leader." htmlFor="role">
          <Input id="role" value={form.role} onChange={(e) => set('role', e.target.value)} />
        </EditorField>
        <EditorField label="Affiliation" hint="School or organization." htmlFor="affiliation">
          <Input id="affiliation" value={form.affiliation} onChange={(e) => set('affiliation', e.target.value)} />
        </EditorField>
      </EditorSection>
      <EditorSection title="Display">
        <EditorField label="Year" hint="Relevant year, e.g. 2026." htmlFor="year">
          <Input id="year" value={form.year} onChange={(e) => set('year', e.target.value)} />
        </EditorField>
        <EditorField label="Image" hint="Upload a headshot or paste a URL (/images/... or https://...)." htmlFor="image">
          <ImageField id="image" value={form.image} onChange={(v) => set('image', v)} prefix="team" />
        </EditorField>
        <EditorField label="Sort order" hint="Manual order (lower shows first)." htmlFor="sort_order">
          <Input id="sort_order" type="number" value={form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} />
        </EditorField>
        <SwitchField label="Published" hint="Show on the public site when on." checked={form.published} onChange={(v) => set('published', v)} />
      </EditorSection>
    </EditorDialog>
  );
}
