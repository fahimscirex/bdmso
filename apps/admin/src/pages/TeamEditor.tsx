// Team member create/edit. `id` is "new" or a numeric id. One editor for every
// section; the subgroup/year fields only matter for the delegation section
// (shown with a hint). Mirrors the other editors (Saved flash, ImageField).

import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { Icon } from '../components/Icon';
import { ImageField } from '../components/ImageField';

type Member = {
  id: number;
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

type FormState = Omit<Member, 'id'>;

const SECTIONS = ['delegation', 'advisor', 'organizing', 'mentor', 'alumni'];
const SUBGROUPS = ['Mathematics', 'Science', 'Leadership'];

const EMPTY: FormState = {
  section: 'organizing',
  subgroup: '',
  year: '',
  name: '',
  role: '',
  affiliation: '',
  image: '',
  sort_order: 0,
  published: false,
};

export function TeamEditor({ id }: { id: string }) {
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
    api.get<{ item: Member }>(`/api/admin/team/${encodeURIComponent(id)}`)
      .then((d) => setForm({
        section: d.item.section,
        subgroup: d.item.subgroup,
        year: d.item.year,
        name: d.item.name,
        role: d.item.role,
        affiliation: d.item.affiliation,
        image: d.item.image,
        sort_order: d.item.sort_order,
        published: d.item.published,
      }))
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const isDelegation = form.section === 'delegation';

  async function save(publish?: boolean) {
    setError(null);
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    const payload = {
      section: form.section,
      subgroup: isDelegation ? form.subgroup : '',
      year: isDelegation ? form.year : '',
      name: form.name,
      role: form.role,
      affiliation: form.affiliation,
      image: form.image,
      sort_order: form.sort_order,
      published: publish ?? form.published,
    };
    try {
      if (isNew) {
        const res = await api.post<{ id: number }>('/api/admin/team', payload);
        navigate(`/team/${res.id}/edit`);
      } else {
        await api.patch<{ ok: true }>(`/api/admin/team/${encodeURIComponent(id)}`, payload);
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
    if (!confirm(`Delete "${form.name}"? This can't be undone.`)) return;
    try {
      await api.delete<{ ok: true }>(`/api/admin/team/${encodeURIComponent(id)}`);
      navigate('/team');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (loading) {
    return (
      <>
        <a class="back-link" href={href('/team')} onClick={(e) => { e.preventDefault(); navigate('/team'); }}>← Team</a>
        <div class="page-header"><h1>Loading…</h1></div>
      </>
    );
  }

  return (
    <>
      <a class="back-link" href={href('/team')} onClick={(e) => { e.preventDefault(); navigate('/team'); }}>← Team</a>

      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>{isNew ? 'New team member' : form.name || '(unnamed)'}</h1>
          <p class="sub">{isNew ? 'Saves as a draft until you click Publish.' : (form.published ? 'Published - live on /team.' : 'Draft - not yet shown publicly.')}</p>
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
          <label>Section</label>
          <select value={form.section} onChange={(e) => set('section', (e.target as HTMLSelectElement).value)}>
            {SECTIONS.map((s) => <option value={s}>{s}</option>)}
          </select>
        </div>
        <div class="field">
          <label>Name</label>
          <input type="text" value={form.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} placeholder="Full name" />
        </div>

        {isDelegation && (
          <>
            <div class="field">
              <label>Subgroup</label>
              <select value={form.subgroup} onChange={(e) => set('subgroup', (e.target as HTMLSelectElement).value)}>
                <option value="">-</option>
                {SUBGROUPS.map((s) => <option value={s}>{s}</option>)}
              </select>
              <p class="field-hint">Delegation only: which team block this person sits in.</p>
            </div>
            <div class="field">
              <label>Year</label>
              <input type="text" value={form.year} onInput={(e) => set('year', (e.target as HTMLInputElement).value)} placeholder="e.g. 2025" />
              <p class="field-hint">Delegation only: which year's tab.</p>
            </div>
          </>
        )}

        <div class="field">
          <label>Role</label>
          <input type="text" value={form.role} onInput={(e) => set('role', (e.target as HTMLInputElement).value)} placeholder="e.g. Program Lead, 🥈 Silver, Math Tutor" />
        </div>
        <div class="field">
          <label>Affiliation</label>
          <input type="text" value={form.affiliation} onInput={(e) => set('affiliation', (e.target as HTMLInputElement).value)} placeholder="e.g. President, SPSB & BdOSN" />
        </div>

        <div class="field">
          <label>Sort order</label>
          <input type="number" value={form.sort_order} onInput={(e) => set('sort_order', Number((e.target as HTMLInputElement).value) || 0)} />
          <p class="field-hint">Lower shows first within the section.</p>
        </div>

        <ImageField
          label="Photo"
          hint="Upload a portrait (recommended) or paste an /images/* path. Portrait (4:5) crops best."
          prefix="team"
          value={form.image}
          onChange={(v) => set('image', v)}
        />
      </div>
    </>
  );
}
