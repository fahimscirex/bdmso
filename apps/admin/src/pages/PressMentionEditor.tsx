// Press mention create/edit. `id` is "new" (create) or a numeric id (edit).
// Mirrors PostEditor's form/state/save patterns: "Saved" button flash on edit,
// confirm-delete, and the shared ImageField (optional upload or pasted URL).

import { useEffect, useRef, useState } from 'preact/hooks';
import { DateField } from '../components/DateField';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { Icon } from '../components/Icon';
import { ImageField } from '../components/ImageField';

type PressMention = {
  id: number;
  outlet: string;
  title: string;
  url: string;
  published_on: string;
  image: string;
  featured: boolean;
  sort_order: number;
  published: boolean;
};

type FormState = Omit<PressMention, 'id'>;

const EMPTY: FormState = {
  outlet: '',
  title: '',
  url: '',
  published_on: '',
  image: '',
  featured: false,
  sort_order: 0,
  published: false,
};

export function PressMentionEditor({ id }: { id: string }) {
  const isNew = id === 'new';
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedKind, setSavedKind] = useState<null | 'draft' | 'publish'>(null);
  const savedTimer = useRef<number | undefined>(undefined);
  function flashSaved(kind: 'draft' | 'publish') {
    setSavedKind(kind);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedKind(null), 1600);
  }

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api.get<{ item: PressMention }>(`/api/admin/press-mentions/${encodeURIComponent(id)}`)
      .then((d) => setForm({
        outlet: d.item.outlet,
        title: d.item.title,
        url: d.item.url,
        published_on: d.item.published_on,
        image: d.item.image,
        featured: d.item.featured,
        sort_order: d.item.sort_order,
        published: d.item.published,
      }))
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(publish?: boolean) {
    setError(null);
    if (!form.outlet.trim()) { setError('Outlet is required.'); return; }
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.url.trim()) { setError('Article URL is required.'); return; }
    setSaving(true);

    const payload = {
      outlet: form.outlet,
      title: form.title,
      url: form.url,
      published_on: form.published_on,
      image: form.image,
      featured: form.featured,
      sort_order: form.sort_order,
      published: publish ?? form.published,
    };

    try {
      if (isNew) {
        const res = await api.post<{ id: number }>('/api/admin/press-mentions', payload);
        navigate(`/press/${res.id}/edit`);
      } else {
        await api.patch<{ ok: true }>(`/api/admin/press-mentions/${encodeURIComponent(id)}`, payload);
        if (publish !== undefined) set('published', publish);
        flashSaved(publish ? 'publish' : 'draft');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (!confirm(`Delete "${form.title}"? This can't be undone.`)) return;
    try {
      await api.delete<{ ok: true }>(`/api/admin/press-mentions/${encodeURIComponent(id)}`);
      navigate('/press');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (loading) {
    return (
      <>
        <a class="back-link" href={href('/press')} onClick={(e) => { e.preventDefault(); navigate('/press'); }}>
          ← Press mentions
        </a>
        <div class="page-header"><h1>Loading…</h1></div>
      </>
    );
  }

  return (
    <>
      <a class="back-link" href={href('/press')} onClick={(e) => { e.preventDefault(); navigate('/press'); }}>
        ← Press mentions
      </a>

      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>{isNew ? 'New mention' : form.title || '(untitled)'}</h1>
          <p class="sub">{isNew ? 'Saves as a draft until you click Publish.' : (form.published ? 'Published - live on the site.' : 'Draft - not yet shown publicly.')}</p>
        </div>
        <div class="action-row">
          {!isNew && (
            <button type="button" class="btn-danger" onClick={deleteItem} disabled={saving}>
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
          <label>Outlet</label>
          <input type="text" value={form.outlet} onInput={(e) => set('outlet', (e.target as HTMLInputElement).value)} placeholder="e.g. The Business Standard" />
        </div>
        <div class="field">
          <label>Publication date</label>
          <DateField value={form.published_on.length === 10 ? form.published_on : ''} onChange={(v) => set('published_on', v)} />
          <p class="field-hint">Shown on the card. Some legacy items only have a month.</p>
        </div>

        <div class="field field-full">
          <label>Headline</label>
          <input type="text" value={form.title} onInput={(e) => set('title', (e.target as HTMLInputElement).value)} placeholder="The article headline as shown on the card" />
        </div>

        <div class="field field-full">
          <label>Article URL</label>
          <input type="text" value={form.url} onInput={(e) => set('url', (e.target as HTMLInputElement).value)} placeholder="https://example.com/article" />
        </div>

        <div class="field">
          <label>Featured</label>
          <label class="checkbox-inline" style="margin-top:6px;">
            <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', (e.target as HTMLInputElement).checked)} />
            Large lead card in the homepage collage
          </label>
        </div>
        <div class="field">
          <label>Sort order</label>
          <input type="number" value={form.sort_order} onInput={(e) => set('sort_order', Number((e.target as HTMLInputElement).value) || 0)} />
          <p class="field-hint">Lower shows first (after featured).</p>
        </div>

        <ImageField
          label="Thumbnail image"
          hint="Optional. Upload a thumbnail (recommended) or paste an /images/* path or URL."
          prefix="press"
          value={form.image}
          onChange={(v) => set('image', v)}
        />
      </div>
    </>
  );
}
