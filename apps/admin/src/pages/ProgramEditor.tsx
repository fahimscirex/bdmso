// Program create/edit. Mirrors PostEditor: if `slug` is "new" it's a create,
// otherwise it loads the row and PATCHes. The novel part is the pricing widget -
// the priced `choices` the worker validates at checkout, so its fields
// (id/label/note/price) are the money inputs.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DateField } from '../components/DateField';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { Icon } from '../components/Icon';
import { ImageField } from '../components/ImageField';
// @ts-ignore - md.js is JS not TS but exports work via Vite's transpile
import { markdownToHtml } from '../../../../public/js/md.js';

type Choice = { id: string; label: string; note: string; price: number };
type Pricing = { selection: 'single' | 'multiple'; choices: Choice[] };

type Program = {
  slug: string;
  title: string;
  category: string;
  registration_status: string;
  registration_opens: string | null;
  registration_closes: string | null;
  schedule_label: string;
  starts_on: string | null;
  ends_on: string | null;
  price_label: string;
  fee_amount: number | null;
  pricing: Pricing | null;
  tagline: string;
  eyebrow: string;
  image: string;
  audience: string;
  duration: string;
  format: string;
  outcome: string;
  level: string;
  meta_description: string;
  home_order: string;
  register_url: string;
  register_label: string;
  body_md: string;
  hidden: boolean;
  repeatable: boolean;
  always_open: boolean;
  published: boolean;
};

type FormState = Omit<Program, 'fee_amount'> & { fee_amount: string };

const CATEGORIES = ['competition', 'beginner', 'advanced', 'residential'];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$/;

const EMPTY: FormState = {
  slug: '', title: '', category: '', registration_status: 'closed',
  registration_opens: null, registration_closes: null,
  schedule_label: '', starts_on: null, ends_on: null,
  price_label: '', fee_amount: '', pricing: null,
  tagline: '', eyebrow: '', image: '', audience: '', duration: '', format: '', outcome: '',
  level: '', meta_description: '', home_order: '', register_url: '', register_label: '',
  body_md: '', hidden: false, repeatable: false, always_open: false, published: false,
};

function slugify(t: string): string {
  return t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 80);
}
// md.js escapes inline HTML; this additionally strips script/iframe + on*
// handlers before the preview is shown. The content is the admin's own markdown.
function sanitisePreview(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '').replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

export function ProgramEditor({ slug }: { slug: string }) {
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

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api.get<{ program: Program }>(`/api/admin/programs/${encodeURIComponent(slug)}`)
      .then((d) => setForm({ ...d.program, fee_amount: d.program.fee_amount == null ? '' : String(d.program.fee_amount) }))
      .catch((err: ApiError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, isNew]);

  useEffect(() => {
    if (!isNew || slugTouched) return;
    setForm((f) => ({ ...f, slug: slugify(f.title) }));
  }, [form.title, isNew, slugTouched]);

  const previewHtml = useMemo(() => {
    try { return sanitisePreview(markdownToHtml(form.body_md || '')); }
    catch { return '<p><em>Preview error.</em></p>'; }
  }, [form.body_md]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ── Pricing widget ──────────────────────────────────────────────────────
  function enablePricing() {
    set('pricing', { selection: 'single', choices: [{ id: '', label: '', note: '', price: 0 }] });
  }
  function disablePricing() { set('pricing', null); }
  function setSelection(selection: 'single' | 'multiple') {
    setForm((f) => f.pricing ? { ...f, pricing: { ...f.pricing, selection } } : f);
  }
  function addChoice() {
    setForm((f) => f.pricing ? { ...f, pricing: { ...f.pricing, choices: [...f.pricing.choices, { id: '', label: '', note: '', price: 0 }] } } : f);
  }
  function removeChoice(i: number) {
    setForm((f) => f.pricing ? { ...f, pricing: { ...f.pricing, choices: f.pricing.choices.filter((_, j) => j !== i) } } : f);
  }
  function updateChoice(i: number, key: keyof Choice, value: string) {
    setForm((f) => {
      if (!f.pricing) return f;
      const choices = f.pricing.choices.map((c, j) =>
        j === i ? { ...c, [key]: key === 'price' ? Number(value || 0) : value } : c);
      return { ...f, pricing: { ...f.pricing, choices } };
    });
  }

  async function save(publish?: boolean) {
    setError(null);
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (isNew && !SLUG_RE.test(form.slug)) { setError('Slug must be lowercase letters/numbers/hyphens (3-80 chars).'); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      ...(isNew ? { slug: form.slug } : {}),
      title: form.title, category: form.category || null,
      registration_opens: form.registration_opens || null,
      registration_closes: form.registration_closes || null,
      schedule_label: form.schedule_label, starts_on: form.starts_on || null, ends_on: form.ends_on || null,
      price_label: form.price_label,
      fee_amount: form.fee_amount === '' ? null : Number(form.fee_amount),
      pricing: form.pricing,
      tagline: form.tagline,
      eyebrow: form.eyebrow, image: form.image, audience: form.audience, duration: form.duration,
      format: form.format, outcome: form.outcome, level: form.level, meta_description: form.meta_description,
      home_order: form.home_order, register_url: form.register_url, register_label: form.register_label,
      body_md: form.body_md,
      hidden: form.hidden, repeatable: form.repeatable, always_open: form.always_open,
      published: publish ?? form.published,
    };
    try {
      if (isNew) {
        await api.post<{ slug: string }>('/api/admin/programs', payload);
        navigate(`/programs/${form.slug}/edit`);
      } else {
        await api.patch<{ ok: true }>(`/api/admin/programs/${encodeURIComponent(slug)}`, payload);
        if (publish !== undefined) set('published', publish);
        flashSaved(publish ? 'publish' : 'draft');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProgram() {
    if (!confirm(`Delete "${form.title}"? This can't be undone.`)) return;
    try {
      await api.delete<{ ok: true }>(`/api/admin/programs/${encodeURIComponent(slug)}`);
      navigate('/programs');
    } catch (err) { alert((err as Error).message); }
  }

  if (loading) {
    return (
      <>
        <a class="back-link" href={href('/programs')} onClick={(e) => { e.preventDefault(); navigate('/programs'); }}>← Programs</a>
        <div class="page-header"><h1>Loading…</h1></div>
      </>
    );
  }

  return (
    <>
      <a class="back-link" href={href('/programs')} onClick={(e) => { e.preventDefault(); navigate('/programs'); }}>← Programs</a>

      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>{isNew ? 'New program' : form.title || '(untitled)'}</h1>
          <p class="sub">
            {isNew ? 'Saves as a draft until you Publish.' : (
              <>Detail page: {form.published
                ? <a href={`/programs/${form.slug}`} target="_blank">/programs/{form.slug} <Icon name="external" size={12} /></a>
                : <span class="muted">/programs/{form.slug} (unpublished)</span>}</>
            )}
          </p>
        </div>
        <div class="action-row">
          {!isNew && <button type="button" class="btn-danger" onClick={deleteProgram} disabled={saving}><Icon name="trash" size={14} /> Delete</button>}
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
          <input type="text" value={form.title} onInput={(e) => set('title', (e.target as HTMLInputElement).value)} placeholder="e.g. BdMSO National Olympiad" />
        </div>
        <div class="field"><label>Tagline</label><input type="text" value={form.tagline} onInput={(e) => set('tagline', (e.target as HTMLInputElement).value)} placeholder="e.g. A one-line lede for the program" /></div>
        <div class="field">
          <label>Slug</label>
          <input type="text" value={form.slug} disabled={!isNew}
            onInput={(e) => { setSlugTouched(true); set('slug', (e.target as HTMLInputElement).value); }}
            placeholder="lowercase-with-hyphens" />
          <p class="field-hint">{isNew ? 'Auto-fills from title until you edit.' : 'Permanent after creation.'}</p>
        </div>

        <div class="field">
          <label>Category</label>
          <select value={form.category} onChange={(e) => set('category', (e.target as HTMLSelectElement).value)}>
            <option value="">(none)</option>
            {CATEGORIES.map((c) => <option value={c}>{c}</option>)}
          </select>
        </div>
        <div class="field">
          <label>Registration opens</label>
          <DateField value={form.registration_opens || ''} onChange={(v) => set('registration_opens', v || null)} />
        </div>
        <div class="field">
          <label>Registration closes</label>
          <DateField value={form.registration_closes || ''} onChange={(v) => set('registration_closes', v || null)} />
          <p class="field-hint">Also drives the guardian edit window.</p>
        </div>
        <div class="field">
          <label class="checkbox-inline"><input type="checkbox" checked={form.always_open} onChange={(e) => set('always_open', (e.target as HTMLInputElement).checked)} /> Always open (year-round)</label>
          <p class="field-hint">Registration stays open and the dates above are ignored.</p>
        </div>

        <div class="field">
          <label>Starts on</label>
          <DateField value={form.starts_on || ''} onChange={(v) => set('starts_on', v || null)} />
        </div>
        <div class="field">
          <label>Ends on</label>
          <DateField value={form.ends_on || ''} onChange={(v) => set('ends_on', v || null)} />
        </div>

        <div class="field">
          <label>Schedule label</label>
          <input type="text" value={form.schedule_label} onInput={(e) => set('schedule_label', (e.target as HTMLInputElement).value)} placeholder="e.g. Registration closes 26 June 2026" />
        </div>
        <div class="field">
          <label>Home order</label>
          <input type="text" value={form.home_order} onInput={(e) => set('home_order', (e.target as HTMLInputElement).value)} placeholder='e.g. "01" (sort key; blank = hide from home)' />
        </div>

        <div class="field">
          <label>Price label</label>
          <input type="text" value={form.price_label} onInput={(e) => set('price_label', (e.target as HTMLInputElement).value)} placeholder="e.g. ৳ 1,000 / From ৳ 500 / On enquiry" />
          <p class="field-hint">Display only. Charged price comes from fee or the choices below.</p>
        </div>
        <div class="field">
          <label>Flat fee (BDT)</label>
          <input type="number" min="0" value={form.fee_amount} onInput={(e) => set('fee_amount', (e.target as HTMLInputElement).value)} placeholder="Blank for on-enquiry or choice-priced" />
        </div>

        <div class="field"><label>Eyebrow</label><input type="text" value={form.eyebrow} onInput={(e) => set('eyebrow', (e.target as HTMLInputElement).value)} placeholder="e.g. National · Olympiad" /></div>
        <div class="field"><label>Audience</label><input type="text" value={form.audience} onInput={(e) => set('audience', (e.target as HTMLInputElement).value)} placeholder="e.g. Class 6 or below" /></div>
        <div class="field"><label>Duration</label><input type="text" value={form.duration} onInput={(e) => set('duration', (e.target as HTMLInputElement).value)} placeholder="e.g. 3 days · 10.5 hrs per subject" /></div>
        <div class="field">
          <label>Format</label>
          <input type="text" value={form.format} onInput={(e) => set('format', (e.target as HTMLInputElement).value)} placeholder="e.g. On-site · MASLab, Dhanmondi" />
          <p class="field-hint">How and where it runs (delivery mode and venue).</p>
        </div>
        <div class="field">
          <label>Outcome</label>
          <input type="text" value={form.outcome} onInput={(e) => set('outcome', (e.target as HTMLInputElement).value)} placeholder="e.g. Foundational Math & Science skills" />
          <p class="field-hint">What a student walks away with.</p>
        </div>
        <div class="field">
          <label>Level</label>
          <input type="text" value={form.level} onInput={(e) => set('level', (e.target as HTMLInputElement).value)} placeholder="e.g. Beginner" />
          <p class="field-hint">Optional difficulty tag shown on the card, separate from Category.</p>
        </div>
        <div class="field">
          <label>Register URL (external, optional)</label>
          <input type="text" value={form.register_url} onInput={(e) => set('register_url', (e.target as HTMLInputElement).value)} placeholder="https://..." />
          <p class="field-hint">Send registrations to an external link. Blank uses the built-in form.</p>
        </div>
        <div class="field"><label>Register label</label><input type="text" value={form.register_label} onInput={(e) => set('register_label', (e.target as HTMLInputElement).value)} placeholder="e.g. Register now" /></div>

        <div class="field field-full">
          <label>Meta description</label>
          <textarea rows={2} value={form.meta_description} onInput={(e) => set('meta_description', (e.target as HTMLTextAreaElement).value)} placeholder="1-2 sentence summary for SEO/OG." />
        </div>

        <div class="field field-full">
          <ImageField label="Card / hero image" hint="Upload or paste any /images/* path." prefix="programs" value={form.image} onChange={(v) => set('image', v)} />
        </div>
      </div>

      {/* Pricing: the priced choices the worker validates at checkout. */}
      <div class="card" style="margin-top:18px;padding:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <h2 style="margin:0;font-size:14px;">Priced choices</h2>
            <p class="cell-sub" style="margin:2px 0 0;">For programs the registrant picks from (subjects, sessions). Otherwise leave off and use the flat fee.</p>
          </div>
          {form.pricing
            ? <button type="button" class="btn-secondary" onClick={disablePricing}>Remove choices</button>
            : <button type="button" class="btn-secondary" onClick={enablePricing}><Icon name="plus" size={14} /> Add choices</button>}
        </div>

        {form.pricing && (
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:12px;">
            <label class="field" style="max-width:260px;">
              <span style="font-size:13px;font-weight:600;">Selection</span>
              <select value={form.pricing.selection} onChange={(e) => setSelection((e.target as HTMLSelectElement).value as 'single' | 'multiple')}>
                <option value="single">single - pick exactly one</option>
                <option value="multiple">multiple - pick any, prices sum</option>
              </select>
            </label>

            <table class="data-table">
              <thead><tr><th>id</th><th>label</th><th>note</th><th style="width:120px;">price (৳)</th><th /></tr></thead>
              <tbody>
                {form.pricing.choices.map((c, i) => (
                  <tr key={i}>
                    <td><input type="text" value={c.id} onInput={(e) => updateChoice(i, 'id', (e.target as HTMLInputElement).value)} placeholder="math" style="width:100%;" /></td>
                    <td><input type="text" value={c.label} onInput={(e) => updateChoice(i, 'label', (e.target as HTMLInputElement).value)} placeholder="Mathematics" style="width:100%;" /></td>
                    <td><input type="text" value={c.note} onInput={(e) => updateChoice(i, 'note', (e.target as HTMLInputElement).value)} placeholder="optional" style="width:100%;" /></td>
                    <td><input type="number" min="0" value={c.price} onInput={(e) => updateChoice(i, 'price', (e.target as HTMLInputElement).value)} style="width:100%;" /></td>
                    <td><button type="button" class="btn-secondary" onClick={() => removeChoice(i)} title="Remove"><Icon name="trash" size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div><button type="button" class="btn-secondary" onClick={addChoice}><Icon name="plus" size={14} /> Add choice</button></div>
          </div>
        )}
      </div>

      {/* Body: markdown + live preview. */}
      <div class="card" style="margin-top:18px;padding:0;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:stretch;">
          <div style="border-right:1px solid var(--line);padding:18px;display:flex;flex-direction:column;gap:8px;">
            <h2 style="margin:0;font-size:13px;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:6px;"><Icon name="edit" size={13} /> Body (markdown)</h2>
            <textarea value={form.body_md} onInput={(e) => set('body_md', (e.target as HTMLTextAreaElement).value)} rows={24}
              style="width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;line-height:1.55;resize:vertical;border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--bg-alt);color:var(--navy-900);"
              placeholder="## About this program&#10;&#10;…&#10;&#10;## What you'll do&#10;&#10;- …" />
          </div>
          <div style="padding:18px;background:var(--bg-alt);overflow-x:auto;">
            <h2 style="margin:0 0 12px;font-size:13px;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.08em;display:flex;align-items:center;gap:6px;"><Icon name="eye" size={13} /> Preview</h2>
            {/* Safe-to-innerHTML: md.js escapes inline HTML and sanitisePreview
                strips script/iframe + on* handlers. Same path as PostEditor. */}
            <div class="prose post-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      </div>

      {/* Visibility flags. */}
      <div class="card" style="margin-top:18px;padding:18px;display:flex;gap:24px;flex-wrap:wrap;">
        <label class="checkbox-inline"><input type="checkbox" checked={form.repeatable} onChange={(e) => set('repeatable', (e.target as HTMLInputElement).checked)} /> Repeatable (register more than once)</label>
        <label class="checkbox-inline"><input type="checkbox" checked={form.hidden} onChange={(e) => set('hidden', (e.target as HTMLInputElement).checked)} /> Hidden (no public page)</label>
      </div>
    </>
  );
}
