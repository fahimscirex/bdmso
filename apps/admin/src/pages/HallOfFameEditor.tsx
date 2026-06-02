// Hall of Fame photo create/edit. `id` is "new" or a numeric id. Mirrors the
// PressMentionEditor patterns (Saved flash, confirm-delete, shared ImageField).

import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { Icon } from '../components/Icon';
import { ImageField } from '../components/ImageField';

type Photo = {
  id: number;
  image: string;
  caption: string;
  year: string;
  sort_order: number;
  published: boolean;
};

type FormState = Omit<Photo, 'id'>;

const EMPTY: FormState = { image: '', caption: '', year: '', sort_order: 0, published: false };

export function HallOfFameEditor({ id }: { id: string }) {
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
    api.get<{ item: Photo }>(`/api/admin/hall-of-fame/${encodeURIComponent(id)}`)
      .then((d) => setForm({
        image: d.item.image,
        caption: d.item.caption,
        year: d.item.year,
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
    if (!form.image.trim()) { setError('An image is required.'); return; }
    setSaving(true);
    const payload = {
      image: form.image,
      caption: form.caption,
      year: form.year,
      sort_order: form.sort_order,
      published: publish ?? form.published,
    };
    try {
      if (isNew) {
        const res = await api.post<{ id: number }>('/api/admin/hall-of-fame', payload);
        navigate(`/hall-of-fame/${res.id}/edit`);
      } else {
        await api.patch<{ ok: true }>(`/api/admin/hall-of-fame/${encodeURIComponent(id)}`, payload);
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
    if (!confirm('Delete this photo? This can\'t be undone.')) return;
    try {
      await api.delete<{ ok: true }>(`/api/admin/hall-of-fame/${encodeURIComponent(id)}`);
      navigate('/hall-of-fame');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (loading) {
    return (
      <>
        <a class="back-link" href={href('/hall-of-fame')} onClick={(e) => { e.preventDefault(); navigate('/hall-of-fame'); }}>
          ← Hall of Fame
        </a>
        <div class="page-header"><h1>Loading…</h1></div>
      </>
    );
  }

  return (
    <>
      <a class="back-link" href={href('/hall-of-fame')} onClick={(e) => { e.preventDefault(); navigate('/hall-of-fame'); }}>
        ← Hall of Fame
      </a>

      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>{isNew ? 'New photo' : form.caption || '(no caption)'}</h1>
          <p class="sub">{isNew ? 'Saves as a draft until you click Publish.' : (form.published ? 'Published - live in the slider.' : 'Draft - not yet shown publicly.')}</p>
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
        <div class="field field-full">
          <label>Caption</label>
          <input type="text" value={form.caption} onInput={(e) => set('caption', (e.target as HTMLInputElement).value)} placeholder="e.g. IMSO 2025 inauguration ceremony · Malaysia" />
        </div>
        <div class="field">
          <label>Year</label>
          <input type="text" value={form.year} onInput={(e) => set('year', (e.target as HTMLInputElement).value)} placeholder="e.g. 2025" />
        </div>
        <div class="field">
          <label>Sort order</label>
          <input type="number" value={form.sort_order} onInput={(e) => set('sort_order', Number((e.target as HTMLInputElement).value) || 0)} />
          <p class="field-hint">Lower shows first in the slider.</p>
        </div>

        <ImageField
          label="Photo"
          hint="Upload a photo (recommended) or paste an /images/* path or URL. Wide images (16:7) fit the slider best."
          prefix="hall-of-fame"
          value={form.image}
          onChange={(v) => set('image', v)}
        />
      </div>
    </>
  );
}
