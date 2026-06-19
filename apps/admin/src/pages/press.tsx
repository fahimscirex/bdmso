import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, MoreHorizontal, Plus, Star } from 'lucide-react';
import type { Press } from '@/lib/types';
import { api } from '@/lib/api';
import { useList } from '@/hooks/use-list';
import { run } from '@/lib/run';
import { dateUK } from '@/lib/format';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { ConfirmDeleteItem } from '@/components/confirm-delete';
import { EditorDialog, EditorSection, EditorField, SwitchField, DateField, ImageField } from '@/components/editor/editor-kit';
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

export function PressPage() {
  const { data: rows, error, reload } = useList(api.listPress);
  const [tab, setTab] = useState('all');
  const filtered = (rows ?? []).filter((p) => tab === 'all' || (tab === 'published' ? p.published : !p.published));

  return (
    <>
      <PageHeader title="Press Mentions" description="Media coverage featured on the site." actions={<PressEditor trigger={<Button size="sm"><Plus className="size-4" /> New mention</Button>} onSaved={reload} />} />
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
              <TableHead>Outlet</TableHead>
              <TableHead>Headline</TableHead>
              <TableHead className="hidden lg:table-cell">Published on</TableHead>
              <TableHead>Live</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            )) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.outlet}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {p.featured && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                    <span className="max-w-[320px] truncate text-muted-foreground">{p.title}</span>
                    <ExternalLink className="size-3 text-muted-foreground/60" />
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell whitespace-nowrap text-muted-foreground">{dateUK(p.publishedOn)}</TableCell>
                <TableCell><Switch defaultChecked={p.published} onCheckedChange={(v) => run(api.pressPublish(p.id, v), `${p.outlet} ${v ? 'published' : 'hidden'}`)} /></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.outlet}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <PressEditor item={p} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Edit</DropdownMenuItem>} onSaved={reload} />
                      <DropdownMenuSeparator />
                      <ConfirmDeleteItem name={p.outlet} onConfirm={() => run(api.pressDelete(p.id), 'Mention deleted', reload)}>Delete</ConfirmDeleteItem>
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

type PressForm = {
  outlet: string; title: string; url: string; published_on: string;
  image: string; sort_order: number; featured: boolean; published: boolean;
};

const blankForm: PressForm = {
  outlet: '', title: '', url: '', published_on: '', image: '', sort_order: 0, featured: false, published: true,
};

function PressEditor({ item, trigger, onSaved }: { item?: Press; trigger: ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PressForm>(blankForm);

  useEffect(() => {
    if (!open) return;
    if (item) {
      api.getPressBody(item.id).then((p) => setForm({
        outlet: p.outlet, title: p.title, url: p.url, published_on: p.published_on,
        image: p.image, sort_order: p.sort_order, featured: p.featured, published: p.published,
      }));
    } else {
      setForm(blankForm);
    }
  }, [open, item]);

  const set = <K extends keyof PressForm>(key: K, value: PressForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const payload = { ...form, sort_order: Number(form.sort_order) };
    run(
      item ? api.pressUpdate(item.id, payload) : api.pressCreate(payload),
      item ? 'Mention saved' : 'Mention added',
      () => { onSaved(); setOpen(false); },
    );
  };

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={item ? 'Edit mention' : 'New mention'}
      description={item ? 'Update this press mention.' : 'Add a press mention to the site.'}
      onSubmit={submit}
      submitLabel={item ? 'Save changes' : 'Add mention'}
    >
      <EditorSection title="Press mention">
        <EditorField label="Outlet" htmlFor="outlet" hint="Name of the publication, e.g. Prothom Alo.">
          <Input id="outlet" value={form.outlet} onChange={(e) => set('outlet', e.target.value)} placeholder="The Daily Star" />
        </EditorField>
        <EditorField label="Headline" htmlFor="title" hint="Headline of the article.">
          <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </EditorField>
        <EditorField label="URL" htmlFor="url" hint="Full link to the article (https://...).">
          <Input id="url" type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
        </EditorField>
        <EditorField label="Published on" htmlFor="published_on" hint="Date the article was published.">
          <DateField id="published_on" value={form.published_on} onChange={(v) => set('published_on', v)} />
        </EditorField>
        <EditorField label="Image" htmlFor="image" hint="Optional logo or thumbnail. Upload or paste a URL.">
          <ImageField id="image" value={form.image} onChange={(v) => set('image', v)} prefix="press" />
        </EditorField>
        <EditorField label="Sort order" htmlFor="sort_order" hint="Manual order in the list (lower shows first).">
          <Input id="sort_order" type="number" value={form.sort_order} onChange={(e) => set('sort_order', e.target.valueAsNumber || 0)} />
        </EditorField>
        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchField label="Featured" hint="Highlight this mention on the site." checked={form.featured} onChange={(v) => set('featured', v)} />
          <SwitchField label="Published" hint="Show on the public site when on." checked={form.published} onChange={(v) => set('published', v)} />
        </div>
      </EditorSection>
    </EditorDialog>
  );
}
