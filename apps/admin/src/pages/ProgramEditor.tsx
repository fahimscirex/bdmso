// Program create/edit. Same pattern as PostEditor: one form, slug=null
// for create. The three JSON columns (subjects, routine, pricing) get
// raw JSON textareas — a structured editor can come later once we know
// which shapes editors actually reach for.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';

type Program = {
  slug: string;
  title: string;
  tagline: string | null;
  cohort: string | null;
  image: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  audience: string | null;
  subjects_json: string | null;
  body_md: string | null;
  routine_json: string | null;
  pricing_json: string | null;
  registration_url: string | null;
  published: number;
  published_at: string | null;
};

type Form = {
  slug: string;
  title: string;
  tagline: string;
  cohort: string;
  image: string;
  start_date: string;
  end_date: string;
  venue: string;
  audience: string;
  subjects_json: string;
  body_md: string;
  routine_json: string;
  pricing_json: string;
  registration_url: string;
  published: boolean;
  published_at: string;
};

const EMPTY: Form = {
  slug: '', title: '', tagline: '', cohort: '', image: '',
  start_date: '', end_date: '', venue: '', audience: '',
  subjects_json: '', body_md: '', routine_json: '', pricing_json: '',
  registration_url: '', published: false, published_at: '',
};

function fromProgram(p: Program): Form {
  return {
    slug: p.slug,
    title: p.title,
    tagline: p.tagline || '',
    cohort: p.cohort || '',
    image: p.image || '',
    start_date: p.start_date ? p.start_date.slice(0, 10) : '',
    end_date:   p.end_date   ? p.end_date.slice(0, 10)   : '',
    venue: p.venue || '',
    audience: p.audience || '',
    subjects_json: p.subjects_json || '',
    body_md: p.body_md || '',
    routine_json: p.routine_json || '',
    pricing_json: p.pricing_json || '',
    registration_url: p.registration_url || '',
    published: !!p.published,
    published_at: p.published_at ? p.published_at.slice(0, 10) : '',
  };
}

function validateJson(s: string): string | null {
  if (!s.trim()) return null;
  try { JSON.parse(s); return null; }
  catch (e) { return (e as Error).message; }
}

export function ProgramEditor({ slug }: { slug: string | null }) {
  const isNew = slug === null;
  const [form, setForm]   = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState<boolean>(isNew);
  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState<boolean>(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    api.get<{ program: Program }>(`/api/admin/programs/${slug}`)
      .then((r) => { setForm(fromProgram(r.program)); setLoaded(true); })
      .catch((err: ApiError) => setError(err.message));
  }, [slug]);

  function patch<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: Event) {
    e.preventDefault();
    setError(null);

    // Client-side JSON gate so we don't even hit the server with garbage.
    for (const [label, value] of [
      ['Subjects JSON', form.subjects_json],
      ['Routine JSON',  form.routine_json],
      ['Pricing JSON',  form.pricing_json],
    ] as const) {
      const err = validateJson(value);
      if (err) { setError(`${label} is not valid JSON: ${err}`); return; }
    }

    setBusy(true);
    try {
      const payload = {
        ...form,
        tagline:          form.tagline          || null,
        cohort:           form.cohort           || null,
        image:            form.image            || null,
        start_date:       form.start_date       || null,
        end_date:         form.end_date         || null,
        venue:            form.venue            || null,
        audience:         form.audience         || null,
        subjects_json:    form.subjects_json    || null,
        body_md:          form.body_md          || null,
        routine_json:     form.routine_json     || null,
        pricing_json:     form.pricing_json     || null,
        registration_url: form.registration_url || null,
        published_at:     form.published_at     || null,
      };
      if (isNew) {
        await api.post<{ ok: true; slug: string }>('/api/admin/programs', payload);
        navigate(`/programs/${form.slug}/edit`);
      } else {
        await api.patch<{ ok: true }>(`/api/admin/programs/${slug}`, payload);
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
    if (!confirm(`Delete program "${form.title}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/programs/${slug}`);
      navigate('/programs');
    } catch (err) {
      alert((err as Error).message);
      setBusy(false);
    }
  }

  if (!loaded && !error) return <div class="muted">Loading…</div>;

  const mono = "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;";

  return (
    <>
      <div class="page-header">
        <a class="back-link" href={href('/programs')} onClick={(e) => { e.preventDefault(); navigate('/programs'); }}>
          ← Back to Programs
        </a>
        <h1 style="margin-top:8px;">{isNew ? 'New program' : form.title || 'Edit program'}</h1>
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

          <Field label="Slug" hint={isNew ? "a–z, 0–9, hyphens. Becomes /programs/<slug>." : "Slug is permanent."}>
            <input
              type="text"
              required
              disabled={!isNew}
              value={form.slug}
              onInput={(e) => patch('slug', (e.target as HTMLInputElement).value.toLowerCase())}
            />
          </Field>

          <Field label="Tagline" full>
            <input type="text" value={form.tagline} onInput={(e) => patch('tagline', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Cohort" hint="e.g. Class 3–5">
            <input type="text" value={form.cohort} onInput={(e) => patch('cohort', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Audience" hint="e.g. Primary, Junior">
            <input type="text" value={form.audience} onInput={(e) => patch('audience', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Start date">
            <input type="date" value={form.start_date} onInput={(e) => patch('start_date', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="End date">
            <input type="date" value={form.end_date} onInput={(e) => patch('end_date', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Venue">
            <input type="text" value={form.venue} onInput={(e) => patch('venue', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Registration URL">
            <input type="text" value={form.registration_url} onInput={(e) => patch('registration_url', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Cover image URL" full hint="/images/foo.webp or a full URL.">
            <input type="text" value={form.image} onInput={(e) => patch('image', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Body (Markdown)" full>
            <textarea
              rows={12}
              value={form.body_md}
              onInput={(e) => patch('body_md', (e.target as HTMLTextAreaElement).value)}
              style={mono}
            />
          </Field>

          <Field label="Subjects (JSON)" full hint='e.g. ["Mathematics","Science"]'>
            <textarea
              rows={3}
              value={form.subjects_json}
              onInput={(e) => patch('subjects_json', (e.target as HTMLTextAreaElement).value)}
              style={mono}
            />
          </Field>

          <Field label="Routine (JSON)" full hint='Array of {day,date,blocks:[{subject,slots:[{time,label}]}]}'>
            <textarea
              rows={6}
              value={form.routine_json}
              onInput={(e) => patch('routine_json', (e.target as HTMLTextAreaElement).value)}
              style={mono}
            />
          </Field>

          <Field label="Pricing (JSON)" full hint='Array of {name,price,currency,perks,featured}'>
            <textarea
              rows={6}
              value={form.pricing_json}
              onInput={(e) => patch('pricing_json', (e.target as HTMLTextAreaElement).value)}
              style={mono}
            />
          </Field>

          <Field label="Publish date" hint="Auto-stamped on first publish.">
            <input type="date" value={form.published_at} onInput={(e) => patch('published_at', (e.target as HTMLInputElement).value)} />
          </Field>

          <Field label="Flags">
            <label class="checkbox-inline">
              <input type="checkbox" checked={form.published} onChange={(e) => patch('published', (e.target as HTMLInputElement).checked)} />
              <span>Published <span class="muted">— visible on the public site</span></span>
            </label>
          </Field>
        </div>

        <div class="action-row" style="margin-top:18px;">
          <button type="submit" class="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create program' : 'Save changes'}
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
