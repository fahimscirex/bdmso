import { useEffect, useState, type ReactNode } from 'react';
import { ImageIcon, MoreHorizontal, Plus } from 'lucide-react';
import type { HofPhoto } from '@/lib/types';
import { api } from '@/lib/api';
import { useList } from '@/hooks/use-list';
import { run } from '@/lib/run';
import { ListError } from '@/components/list-error';
import { ConfirmDeleteItem } from '@/components/confirm-delete';
import { EditorDialog, EditorSection, EditorField, SwitchField, ImageField } from '@/components/editor/editor-kit';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export function HallOfFamePage() {
  const { data: rows, error, reload } = useList(api.listHallOfFame);
  const [tab, setTab] = useState('all');
  const filtered = (rows ?? []).filter((p) => tab === 'all' || (tab === 'published' ? p.published : !p.published));

  return (
    <>
      <PageHeader
        title="Hall of Fame"
        description="Homepage slider photos."
        actions={<HofEditor trigger={<Button size="sm"><Plus className="size-4" /> Add photo</Button>} onSaved={reload} />}
      />
      {error && <ListError message={error} onRetry={reload} />}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16">Photo</TableHead>
              <TableHead>Caption</TableHead>
              <TableHead>Year</TableHead>
              <TableHead className="hidden sm:table-cell">Order</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
            )) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex aspect-video w-12 items-center justify-center rounded-md bg-muted text-muted-foreground"><ImageIcon className="size-4" /></div>
                </TableCell>
                <TableCell className="font-medium">{p.caption}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{p.year}</TableCell>
                <TableCell className="hidden sm:table-cell tabular-nums text-muted-foreground">{p.sortOrder}</TableCell>
                <TableCell><Switch defaultChecked={p.published} onCheckedChange={(v) => run(api.hofPublish(p.id, v), `Photo ${v ? 'published' : 'hidden'}`)} /></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.caption}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <HofEditor item={p} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Edit</DropdownMenuItem>} onSaved={reload} />
                      <DropdownMenuSeparator />
                      <ConfirmDeleteItem name="this photo" onConfirm={() => run(api.hofDelete(p.id), 'Photo deleted', reload)}>Delete</ConfirmDeleteItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

type HofForm = { image: string; caption: string; year: string; sort_order: string; published: boolean };

const blankForm: HofForm = { image: '', caption: '', year: '', sort_order: '0', published: true };

function HofEditor({ item, trigger, onSaved }: { item?: HofPhoto; trigger: ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HofForm>(blankForm);

  useEffect(() => {
    if (!open) return;
    if (item) {
      api.getHofBody(item.id).then((r) => setForm({
        image: r.image, caption: r.caption ?? '', year: r.year ?? '',
        sort_order: String(r.sort_order ?? 0), published: r.published,
      }));
    } else {
      setForm(blankForm);
    }
  }, [open, item]);

  const set = <K extends keyof HofForm>(k: K, v: HofForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const payload = {
      image: form.image,
      caption: form.caption,
      year: form.year,
      sort_order: Number(form.sort_order) || 0,
      published: form.published,
    };
    run(
      item ? api.hofUpdate(item.id, payload) : api.hofCreate(payload),
      item ? 'Photo saved' : 'Photo added',
      () => { onSaved(); setOpen(false); },
    );
  };

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={item ? 'Edit photo' : 'Add photo'}
      description="Homepage slider photo details."
      onSubmit={save}
      submitLabel={item ? 'Save changes' : 'Add photo'}
    >
      <EditorSection title="Photo">
        <EditorField label="Image" hint="Upload an image or paste a URL (/images/... or https://...)." htmlFor="image">
          <ImageField id="image" value={form.image} onChange={(v) => set('image', v)} prefix="hall-of-fame" />
        </EditorField>
        <EditorField label="Caption" hint="Short caption shown under the photo." htmlFor="caption">
          <Input id="caption" value={form.caption} onChange={(e) => set('caption', e.target.value)} />
        </EditorField>
        <EditorField label="Year" hint="Year the photo is from, e.g. 2026." htmlFor="year">
          <Input id="year" value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="2026" />
        </EditorField>
        <EditorField label="Order" hint="Manual order in the gallery (lower shows first)." htmlFor="sort_order">
          <Input id="sort_order" type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
        </EditorField>
        <SwitchField label="Published" hint="Show on the public site when on." checked={form.published} onChange={(v) => set('published', v)} />
      </EditorSection>
    </EditorDialog>
  );
}
