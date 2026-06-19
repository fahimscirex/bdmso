import { useEffect, useState, type ReactNode } from 'react';
import { MoreHorizontal, Plus, Star } from 'lucide-react';
import type { Post } from '@/lib/types';
import { api } from '@/lib/api';
import { useList } from '@/hooks/use-list';
import { run } from '@/lib/run';
import { dateUK } from '@/lib/format';
import { ListError } from '@/components/list-error';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDeleteItem } from '@/components/confirm-delete';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EditorDialog, EditorSection, EditorField, SwitchField, DateField, ImageField, MarkdownTextarea, MarkdownPreview } from '@/components/editor/editor-kit';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export function PostsPage() {
  const { data: rows, error, reload } = useList(api.listPosts);
  const [tab, setTab] = useState('all');
  const filtered = (rows ?? []).filter((p) => tab === 'all' || p.status === tab);

  return (
    <>
      <PageHeader title="Posts" description="Blog articles published to the marketing site." actions={<PostEditor trigger={<Button size="sm"><Plus className="size-4" /> New post</Button>} onSaved={reload} />} />
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
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Author</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Updated</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rows ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            )) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {p.featured && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                    <span className="font-medium">{p.title}</span>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">/{p.slug}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{p.author}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
                <TableCell className="hidden lg:table-cell whitespace-nowrap text-muted-foreground">{dateUK(p.updatedAt)}</TableCell>
                <TableCell><Switch defaultChecked={p.status === 'published'} onCheckedChange={(v) => run(api.postPublish(p.slug, v), `"${p.title}" ${v ? 'published' : 'unpublished'}`)} /></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.title}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <PostEditor item={p} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Edit</DropdownMenuItem>} onSaved={reload} />
                      <DropdownMenuItem onClick={() => window.open(`/posts/${p.slug}`, '_blank', 'noopener')}>Preview</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <ConfirmDeleteItem name={p.title} onConfirm={() => run(api.postDelete(p.slug), 'Post deleted', reload)}>Delete</ConfirmDeleteItem>
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

type PostForm = {
  slug: string; title: string; excerpt: string; category: string; author: string;
  image: string; body_md: string; published: boolean; featured: boolean; published_at: string;
};

const blankForm: PostForm = {
  slug: '', title: '', excerpt: '', category: '', author: '',
  image: '', body_md: '', published: false, featured: false, published_at: '',
};

function PostEditor({ item, trigger, onSaved }: { item?: Post; trigger: ReactNode; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PostForm>(blankForm);

  useEffect(() => {
    if (!open) return;
    if (!item) { setForm(blankForm); return; }
    api.getPostBody(item.slug).then((p) => setForm({
      slug: String(p.slug ?? ''),
      title: String(p.title ?? ''),
      excerpt: String(p.excerpt ?? ''),
      category: String(p.category ?? ''),
      author: String(p.author ?? ''),
      image: String(p.image ?? ''),
      body_md: String(p.body_md ?? ''),
      published: Boolean(p.published),
      featured: Boolean(p.featured),
      published_at: String(p.published_at ?? ''),
    }));
  }, [open, item]);

  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const fields = {
      title: form.title,
      excerpt: form.excerpt,
      category: form.category,
      author: form.author,
      image: form.image,
      body_md: form.body_md,
      published: form.published,
      featured: form.featured,
      published_at: form.published_at,
    };
    const payload = item ? fields : { slug: form.slug, ...fields };
    run(
      item ? api.postUpdate(item.slug, payload) : api.postCreate(payload),
      item ? 'Post saved' : 'Post created',
      () => { onSaved(); setOpen(false); },
    );
  };

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={item ? 'Edit post' : 'New post'}
      description={item ? 'Update this blog article.' : 'Create a new blog article.'}
      onSubmit={submit}
      submitLabel={item ? 'Save changes' : 'Create post'}
      preview={<MarkdownPreview md={form.body_md} image={form.image} />}
    >
      <EditorSection title="Basics">
        {!item && (
          <EditorField label="Slug" htmlFor="slug" hint="URL path: lowercase letters, numbers and hyphens (e.g. spring-camp-2026). Cannot be changed after creation.">
            <Input id="slug" value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="my-post-slug" className="font-mono" />
          </EditorField>
        )}
        <EditorField label="Title" htmlFor="title" hint="Headline shown on the blog and in listings.">
          <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </EditorField>
        <EditorField label="Excerpt" htmlFor="excerpt" hint="Short summary, 1-2 sentences, shown in cards and previews.">
          <Textarea id="excerpt" rows={2} value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
        </EditorField>
        <div className="grid grid-cols-2 gap-3">
          <EditorField label="Category" htmlFor="category" hint="Optional grouping label, e.g. News or Announcements.">
            <Input id="category" value={form.category} onChange={(e) => set('category', e.target.value)} />
          </EditorField>
          <EditorField label="Author" htmlFor="author" hint="Name shown as the post author.">
            <Input id="author" value={form.author} onChange={(e) => set('author', e.target.value)} />
          </EditorField>
        </div>
      </EditorSection>
      <EditorSection title="Media and visibility">
        <EditorField label="Cover image" htmlFor="image" hint="Upload an image or paste a URL (/images/... or https://...).">
          <ImageField id="image" value={form.image} onChange={(v) => set('image', v)} prefix="posts" hidePreview />
        </EditorField>
        <EditorField label="Published on" htmlFor="published_at" hint="Date shown as the publish date. Leave empty to use today when publishing.">
          <DateField id="published_at" value={form.published_at} onChange={(v) => set('published_at', v)} />
        </EditorField>
        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchField label="Published" hint="When on, the post is publicly visible." checked={form.published} onChange={(v) => set('published', v)} />
          <SwitchField label="Featured" hint="When on, the post is highlighted on the blog." checked={form.featured} onChange={(v) => set('featured', v)} />
        </div>
      </EditorSection>
      <EditorSection title="Content">
        <EditorField label="Body (markdown)" htmlFor="body_md" hint="Main content in Markdown: ## headings, ** for bold, - for lists, [text](url) for links.">
          <MarkdownTextarea id="body_md" rows={16} value={form.body_md} onChange={(v) => set('body_md', v)} />
        </EditorField>
      </EditorSection>
    </EditorDialog>
  );
}
