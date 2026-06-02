// Post create/edit page. Single component handles both - if `slug` is
// "new", it's a create; otherwise it loads the existing row by slug and
// PATCHes. Live markdown preview pane on the right; metadata in a
// compact form-grid on top.
//
// Preview uses the same markdownToHtml the worker uses to render the
// public page, so what an editor sees is exactly what visitors get.
//
// XSS note: public/js/md.js escapes inline HTML via escHtml; no raw
// HTML pass-through. We additionally strip <script>/<iframe> from the
// rendered HTML defensively before innerHTML-ing it in the preview.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DateField } from '../components/DateField';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { Icon } from '../components/Icon';
import { ImageField } from '../components/ImageField';
// @ts-ignore - md.js is JS not TS but exports work via Vite's transpile
import { markdownToHtml } from '../../../../public/js/md.js';

type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  image: string;
  body_md: string;
  published: boolean;
  featured: boolean;
  published_at: string | null;
  updated_at: string;
};

type FormState = Omit<Post, 'updated_at'>;

const EMPTY: FormState = {
  slug: '',
  title: '',
  excerpt: '',
  category: '',
  author: '',
  image: '',
  body_md: '',
  published: false,
  featured: false,
  published_at: null,
};

// Server-side slug regex mirrored here so we can warn before submit.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$/;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// Strip a handful of dangerous tags from rendered HTML before previewing.
// md.js already escapes inline HTML; this is belt + suspenders against any
// future parser change or edge-case.
function sanitisePreview(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

export function PostEditor({ slug }: { slug: string }) {
  const isNew = slug === 'new';
  const [form, setForm]       = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  // Brief "Saved" confirmation on the button that was clicked (edits only;
  // a create navigates to the edit page, which is its own confirmation).
  const [savedKind, setSavedKind] = useState<null | 'draft' | 'publish'>(null);
  const savedTimer = useRef<number | undefined>(undefined);
  function flashSaved(kind: 'draft' | 'publish') {
    setSavedKind(kind);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedKind(null), 1600);
  }

  // Load existing post.
  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api.get<{ post: Post }>(`/api/admin/posts/${encodeURIComponent(slug)}`)
      .then((d) => setForm({
        slug:         d.post.slug,
        title:        d.post.title,
        excerpt:      d.post.excerpt,
        category:     d.post.category,
        author:       d.post.author,
        image:        d.post.image,
        body_md:      d.post.body_md,
        published:    d.post.published,
        featured:     d.post.featured,
        published_at: d.post.published_at,
      }))
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, isNew]);

  // Auto-derive slug from title on create until the user types in the slug field.
  useEffect(() => {
    if (!isNew || slugTouched) return;
    setForm((f) => ({ ...f, slug: slugify(f.title) }));
  }, [form.title, isNew, slugTouched]);

  // Render preview HTML.
  const previewHtml = useMemo(() => {
    try { return sanitisePreview(markdownToHtml(form.body_md || '')); }
    catch { return '<p><em>Preview error.</em></p>'; }
  }, [form.body_md]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(publish?: boolean) {
    setError(null);
    if (!form.title.trim())   { setError('Title is required.'); return; }
    if (!form.body_md.trim()) { setError('Body markdown is required.'); return; }
    if (isNew && !SLUG_RE.test(form.slug)) {
      setError('Slug must be lowercase letters/numbers/hyphens (3-80 chars).');
      return;
    }
    setSaving(true);

    const payload = {
      ...(isNew ? { slug: form.slug } : {}),
      title:        form.title,
      excerpt:      form.excerpt,
      category:     form.category,
      author:       form.author,
      image:        form.image,
      body_md:      form.body_md,
      published:    publish ?? form.published,
      featured:     form.featured,
      published_at: form.published_at,
    };

    try {
      if (isNew) {
        await api.post<{ slug: string }>('/api/admin/posts', payload);
        navigate(`/posts/${form.slug}/edit`);
      } else {
        await api.patch<{ ok: true }>(`/api/admin/posts/${encodeURIComponent(slug)}`, payload);
        if (publish !== undefined) set('published', publish);
        flashSaved(publish ? 'publish' : 'draft');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deletePost() {
    if (!confirm(`Delete "${form.title}"? This can't be undone.`)) return;
    try {
      await api.delete<{ ok: true }>(`/api/admin/posts/${encodeURIComponent(slug)}`);
      navigate('/posts');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (loading) {
    return (
      <>
        <a class="back-link" href={href('/posts')} onClick={(e) => { e.preventDefault(); navigate('/posts'); }}>
          ← Posts
        </a>
        <div class="page-header"><h1>Loading…</h1></div>
      </>
    );
  }

  return (
    <>
      <a class="back-link" href={href('/posts')} onClick={(e) => { e.preventDefault(); navigate('/posts'); }}>
        ← Posts
      </a>

      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>{isNew ? 'New post' : form.title || '(untitled)'}</h1>
          <p class="sub">
            {isNew ? 'Saves as a draft until you click Publish.' : (
              <>Live URL:{' '}
                {form.published
                  ? <a href={`/posts/${form.slug}`} target="_blank">/posts/{form.slug} <Icon name="external" size={12} /></a>
                  : <span class="muted">/posts/{form.slug} (unpublished)</span>}
              </>
            )}
          </p>
        </div>
        <div class="action-row">
          {!isNew && (
            <button type="button" class="btn-danger" onClick={deletePost} disabled={saving}>
              <Icon name="trash" size={14} /> Delete
            </button>
          )}
          <button type="button" class={`btn-secondary${savedKind === 'draft' ? ' is-saved' : ''}`} onClick={() => save(false)} disabled={saving}>
            {savedKind === 'draft' ? <><Icon name="check" size={14} /> Saved</> : (form.published ? 'Unpublish' : 'Save as draft')}
          </button>
          <button type="button" class={`btn-primary${savedKind === 'publish' ? ' is-saved' : ''}`} onClick={() => save(true)} disabled={saving}>
            {saving ? 'Saving…' : savedKind === 'publish' ? <><Icon name="check" size={14} /> Saved</> : (form.published ? 'Save changes' : 'Publish')}
          </button>
        </div>
      </div>

      {error && <div class="error">{error}</div>}

      <div class="form-grid">
        <div class="field">
          <label>Title</label>
          <input
            type="text"
            value={form.title}
            onInput={(e) => set('title', (e.target as HTMLInputElement).value)}
            placeholder="e.g. BdMSO 2026 National Round wraps up"
          />
        </div>
        <div class="field">
          <label>Slug</label>
          <input
            type="text"
            value={form.slug}
            onInput={(e) => { setSlugTouched(true); set('slug', (e.target as HTMLInputElement).value); }}
            disabled={!isNew}
            placeholder="lowercase-with-hyphens"
          />
          <p class="field-hint">
            {isNew ? 'Auto-fills from title until you edit.' : 'Slug is permanent after creation.'}
          </p>
        </div>

        <div class="field field-full">
          <label>Excerpt</label>
          <textarea
            rows={2}
            value={form.excerpt}
            onInput={(e) => set('excerpt', (e.target as HTMLTextAreaElement).value)}
            placeholder="1-2 sentence summary (appears in blog list + OG tags)"
          />
        </div>

        <div class="field">
          <label>Category</label>
          <input
            type="text"
            value={form.category}
            onInput={(e) => set('category', (e.target as HTMLInputElement).value)}
            placeholder="e.g. News, Programs, Spotlight"
          />
        </div>
        <div class="field">
          <label>Author</label>
          <input
            type="text"
            value={form.author}
            onInput={(e) => set('author', (e.target as HTMLInputElement).value)}
            placeholder="e.g. BdMSO Team"
          />
        </div>

        <div class="field">
          <label>Publish date</label>
          <DateField
            value={form.published_at ? form.published_at.slice(0, 10) : ''}
            onChange={(v) => set('published_at', v || null)}
          />
          <p class="field-hint">Shown to readers; defaults to today if blank.</p>
        </div>
        <div class="field">
          <label>Featured</label>
          <label class="checkbox-inline" style="margin-top:6px;">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => set('featured', (e.target as HTMLInputElement).checked)}
            />
            Surface in featured section
          </label>
        </div>

        <div class="field field-full">
          <ImageField
            label="Cover image"
            hint="Used in OG/Twitter cards and the optional hero image. Upload or paste any /images/* path."
            prefix="posts"
            value={form.image}
            onChange={(v) => set('image', v)}
          />
        </div>
      </div>

      {/* Markdown editor + live preview, side-by-side. */}
      <div class="card" style="margin-top:18px; padding:0;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:stretch;">
          <div style="border-right:1px solid var(--line);padding:18px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <h2 style="margin:0;font-size:13px;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:6px;">
                <Icon name="edit" size={13} /> Markdown
              </h2>
              <span class="cell-sub">{form.body_md.length} chars</span>
            </div>
            <textarea
              value={form.body_md}
              onInput={(e) => set('body_md', (e.target as HTMLTextAreaElement).value)}
              rows={28}
              style="width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;line-height:1.55;resize:vertical;border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--bg-alt);color:var(--navy-900);"
              placeholder="# Heading&#10;&#10;Your markdown content here…&#10;&#10;## Subsection&#10;&#10;- Bullet&#10;- List"
            />
          </div>
          <div style="padding:18px;background:var(--bg-alt);overflow-x:auto;">
            <h2 style="margin:0 0 12px;font-size:13px;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:6px;">
              <Icon name="eye" size={13} /> Preview
            </h2>
            {/* Safe-to-innerHTML: md.js escapes inline HTML and sanitisePreview
                strips script/iframe + on* handlers. */}
            <div class="prose post-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      </div>
    </>
  );
}
