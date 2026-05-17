// Post create/edit. One screen handles both because the form is the
// same — `slug=null` means create. Markdown body is a plain textarea
// for now; switch to a CodeMirror or Lexical mode later if editors
// ask for live preview / syntax highlighting.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { ImageField } from '../components/ImageField';

type Post = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  author: string | null;
  image: string | null;
  body_md: string;
  published: number;
  featured: number;
  published_at: string | null;
};

type Form = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  image: string;
  body_md: string;
  published: boolean;
  featured: boolean;
  published_at: string;
};

const EMPTY: Form = {
  slug: '', title: '', excerpt: '', category: '', author: '', image: '',
  body_md: '', published: false, featured: false, published_at: '',
};

function fromPost(p: Post): Form {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt || '',
    category: p.category || '',
    author: p.author || '',
    image: p.image || '',
    body_md: p.body_md,
    published: !!p.published,
    featured:  !!p.featured,
    published_at: p.published_at ? p.published_at.slice(0, 10) : '',
  };
}

export function PostEditor({ slug }: { slug: string | null }) {
  const isNew = slug === null;
  const [form, setForm]   = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState<boolean>(isNew);
  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState<boolean>(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    api.get<{ post: Post }>(`/api/admin/posts/${slug}`)
      .then((r) => { setForm(fromPost(r.post)); setLoaded(true); })
      .catch((err: ApiError) => setError(err.message));
  }, [slug]);

  function patch<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...form,
        excerpt:      form.excerpt      || null,
        category:     form.category     || null,
        author:       form.author       || null,
        image:        form.image        || null,
        published_at: form.published_at || null,
      };
      if (isNew) {
        await api.post<{ ok: true; slug: string }>('/api/admin/posts', payload);
        navigate(`/posts/${form.slug}/edit`);
      } else {
        await api.patch<{ ok: true }>(`/api/admin/posts/${slug}`, payload);
        setSavedAt(new Date().toLocaleTimeString());
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (isNew) return;
    if (!confirm(`Delete post "${form.title}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/posts/${slug}`);
      navigate('/posts');
    } catch (err) {
      alert((err as Error).message);
      setBusy(false);
    }
  }

  if (!loaded && !error) return <div class="muted">Loading…</div>;

  return (
    <>
      <div class="page-header">
        <a class="back-link" href={href('/posts')} onClick={(e) => { e.preventDefault(); navigate('/posts'); }}>
          ← Back to Posts
        </a>
        <h1 style="margin-top:8px;">{isNew ? 'New post' : form.title || 'Edit post'}</h1>
        {!isNew && (
          <p class="sub">
            <code>{form.slug}</code>
            {savedAt && <> · <span style="color:var(--green);">Saved at {savedAt}</span></>}
          </p>
        )}
      </div>

      {error && <div class="error" style="margin-bottom:14px;">{error}</div>}

      <form onSubmit={save}>
        <div class="form-grid">
          <Field label="Title">
            <input type="text" required value={form.title} onInput={(e) => patch('title', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Slug" hint={isNew ? "a–z, 0–9, hyphens. Becomes /blog/<slug>." : "Slug is permanent once a post exists."}>
            <input
              type="text"
              required
              disabled={!isNew}
              value={form.slug}
              onInput={(e) => patch('slug', (e.target as HTMLInputElement).value.toLowerCase())}
            />
          </Field>

          <Field label="Excerpt" hint="Shown in lists and social previews.">
            <textarea rows={2} value={form.excerpt} onInput={(e) => patch('excerpt', (e.target as HTMLTextAreaElement).value)} />
          </Field>

          <Field label="Category">
            <input type="text" value={form.category} onInput={(e) => patch('category', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Author">
            <input type="text" value={form.author} onInput={(e) => patch('author', (e.target as HTMLInputElement).value)} />
          </Field>

          <ImageField
            label="Cover image"
            prefix="posts"
            hint="Upload a file or paste a URL / /images/* path."
            value={form.image}
            onChange={(v) => patch('image', v)}
          />

          <Field label="Body (Markdown)" full>
            <textarea
              rows={18}
              required
              value={form.body_md}
              onInput={(e) => patch('body_md', (e.target as HTMLTextAreaElement).value)}
              style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;"
            />
          </Field>

          <Field label="Publish date" hint="Auto-stamped when you first publish; override if backdating.">
            <input type="date" value={form.published_at} onInput={(e) => patch('published_at', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Flags" full>
            <label class="checkbox-inline">
              <input type="checkbox" checked={form.published} onChange={(e) => patch('published', (e.target as HTMLInputElement).checked)} />
              <span>Published <span class="muted">— visible on the public site</span></span>
            </label>
            <label class="checkbox-inline">
              <input type="checkbox" checked={form.featured} onChange={(e) => patch('featured', (e.target as HTMLInputElement).checked)} />
              <span>Featured <span class="muted">— pinned at the top of /blog</span></span>
            </label>
          </Field>
        </div>

        <div class="action-row" style="margin-top:18px;">
          <button type="submit" class="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create post' : 'Save changes'}
          </button>
          {!isNew && (
            <button type="button" class="btn-danger" onClick={destroy} disabled={busy}>
              Delete
            </button>
          )}
        </div>
      </form>
    </>
  );
}

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: any }) {
  return (
    <div class={`field${full ? ' field-full' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <p class="field-hint">{hint}</p>}
    </div>
  );
}
