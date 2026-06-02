// Medalists - the /results page. Backed by D1 `medalists`, materialized to the
// medalists content collection. Records are tiny and bulk, so this is an inline
// editor: filter by year/category, a quick-add row, and edit/delete in place -
// no per-record page. Mirrors the API conventions of the other admin screens.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { SkRoot, SkStatRow, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';

type Row = {
  id: number;
  year: string;
  category: string;
  medal: string;
  name: string;
  school: string;
  sort_order: number;
  published: boolean;
  updated_at: string;
};

type Summary = { total: number; published: number; drafts: number };
type Response = { ok: true; rows: Row[]; years: string[]; summary: Summary };

type Draft = { year: string; category: string; medal: string; name: string; school: string };

const CATEGORIES = ['Mathematics', 'Science'];
const MEDALS = ['gold', 'silver', 'bronze'];

const CSV_TEMPLATE =
  'year,category,medal,name,school\n' +
  '2025,Mathematics,gold,Ali Omar,St. Joseph HSS · 5\n' +
  '2025,Science,bronze,Tahmid Hasan,Manarat Dhaka Int\'l · 5\n';
const CSV_TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

// Split one CSV line into fields, honouring quoted fields + "" escapes.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Parse a medalists CSV into rows. Headers are case-insensitive; category
// accepts "subject", school accepts class/detail/institution.
function parseMedalistCsv(text: string): { rows: Draft[] } | { error: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { error: 'CSV needs a header row and at least one data row.' };
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; }
    return -1;
  };
  const yi = idx(['year']);
  const ci = idx(['category', 'subject']);
  const mi = idx(['medal', 'award']);
  const ni = idx(['name', 'student', 'student name']);
  const si = idx(['school', 'class', 'detail', 'institution']);
  if (yi < 0 || ci < 0 || mi < 0 || ni < 0) {
    return { error: 'CSV must have columns: year, category (or subject), medal, name.' };
  }
  const rows: Draft[] = [];
  for (let r = 1; r < lines.length; r++) {
    const f = parseCsvLine(lines[r]);
    rows.push({
      year: f[yi] || '',
      category: f[ci] || '',
      medal: (f[mi] || '').toLowerCase(),
      name: f[ni] || '',
      school: si >= 0 ? (f[si] || '') : '',
    });
  }
  return { rows };
}

export function Medalists() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [busy, setBusy] = useState(false);

  // Quick-add row. Year/category/medal persist between adds for fast bulk entry.
  const [add, setAdd] = useState<Draft>({ year: '', category: 'Mathematics', medal: 'gold', name: '', school: '' });

  // In-place edit.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Draft>({ year: '', category: '', medal: '', name: '', school: '' });

  function load() {
    setError(null);
    setData(null);
    const qs = new URLSearchParams();
    if (yearFilter) qs.set('year', yearFilter);
    if (categoryFilter) qs.set('category', categoryFilter);
    const suffix = qs.toString() ? `?${qs}` : '';
    api.get<Response>(`/api/admin/medalists${suffix}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, [yearFilter, categoryFilter]);

  async function addRow() {
    if (!add.year.trim() || !add.name.trim()) { setError('Year and name are required to add.'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.post<{ id: number }>('/api/admin/medalists', { ...add, published: true });
      setAdd((a) => ({ ...a, name: '', school: '' })); // keep year/category/medal for the next entry
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: Row) {
    setEditingId(r.id);
    setEdit({ year: r.year, category: r.category, medal: r.medal, name: r.name, school: r.school });
  }

  async function saveEdit(id: number) {
    setBusy(true);
    setError(null);
    try {
      await api.patch<{ ok: true }>(`/api/admin/medalists/${id}`, edit);
      setEditingId(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(r: Row) {
    try {
      await api.patch<{ ok: true }>(`/api/admin/medalists/${r.id}`, { published: !r.published });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function remove(r: Row) {
    if (!confirm(`Delete ${r.name} (${r.category} ${r.medal}, ${r.year})?`)) return;
    try {
      await api.delete<{ ok: true }>(`/api/admin/medalists/${r.id}`);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function importCsv(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = parseMedalistCsv(await file.text());
      if ('error' in parsed) { setError(parsed.error); return; }
      if (parsed.rows.length === 0) { setError('No data rows found in the CSV.'); return; }
      const csvYears = [...new Set(parsed.rows.map((r) => r.year).filter(Boolean))];
      if (!confirm(`Import ${parsed.rows.length} medalist(s)?\n\nThis REPLACES all existing results for: ${csvYears.join(', ')}.`)) return;
      setBusy(true);
      const res = await api.post<{ imported: number; years: string[] }>('/api/admin/medalists/import', { rows: parsed.rows });
      alert(`Imported ${res.imported} medalist(s) for ${res.years.join(', ')}.`);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      input.value = '';
    }
  }

  return (
    <>
      <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Medalists</h1>
          <p class="sub">Winners on <code>/results</code>. Bulk-publish via CSV (replaces that year); use the row editor for fixes.</p>
        </div>
        <div class="action-row">
          <a class="btn-secondary" href={CSV_TEMPLATE_HREF} download="medalists-template.csv">Download template</a>
          <label class={`btn-primary${busy ? ' is-saved' : ''}`} style="cursor:pointer;">
            {busy ? 'Importing…' : <><Icon name="download" size={14} /> Import CSV</>}
            <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={busy} hidden />
          </label>
        </div>
      </div>
      <p class="field-hint" style="margin:-4px 0 16px;">CSV columns: <code>year, category, medal, name, school</code> (header row required; <code>subject</code> works for category).</p>

      {data && (
        <div class="stat-row">
          <Stat label="Total" value={data.summary.total} />
          <Stat label="Published" value={data.summary.published} tone="ok" />
          <Stat label="Drafts" value={data.summary.drafts} tone="warn" />
        </div>
      )}

      <div class="toolbar" style="display:flex;gap:16px;flex-wrap:wrap;">
        <label>
          <span>Year</span>
          <select value={yearFilter} onChange={(e) => setYearFilter((e.target as HTMLSelectElement).value)}>
            <option value="">All</option>
            {data?.years.map((y) => <option value={y}>{y}</option>)}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter((e.target as HTMLSelectElement).value)}>
            <option value="">All</option>
            {CATEGORIES.map((cat) => <option value={cat}>{cat}</option>)}
          </select>
        </label>
      </div>

      {error && <div class="error">{error}</div>}

      {/* Quick-add row */}
      <div class="card" style="padding:14px 16px;margin-bottom:16px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <FieldShell label="Year" width="84px">
            <input type="text" value={add.year} placeholder="2026" onInput={(e) => setAdd({ ...add, year: (e.target as HTMLInputElement).value })} />
          </FieldShell>
          <FieldShell label="Category" width="150px">
            <select value={add.category} onChange={(e) => setAdd({ ...add, category: (e.target as HTMLSelectElement).value })}>
              {CATEGORIES.map((cat) => <option value={cat}>{cat}</option>)}
            </select>
          </FieldShell>
          <FieldShell label="Medal" width="120px">
            <select value={add.medal} onChange={(e) => setAdd({ ...add, medal: (e.target as HTMLSelectElement).value })}>
              {MEDALS.map((m) => <option value={m}>{m}</option>)}
            </select>
          </FieldShell>
          <FieldShell label="Name" grow>
            <input type="text" value={add.name} placeholder="Student name" onInput={(e) => setAdd({ ...add, name: (e.target as HTMLInputElement).value })} />
          </FieldShell>
          <FieldShell label="School / detail" grow>
            <input type="text" value={add.school} placeholder="e.g. St. Joseph HSS · 5" onInput={(e) => setAdd({ ...add, school: (e.target as HTMLInputElement).value })} />
          </FieldShell>
          <button type="button" class="btn-primary" onClick={addRow} disabled={busy}>
            <Icon name="plus" size={14} /> Add
          </button>
        </div>
      </div>

      {!data && !error && (
        <SkRoot><SkStatRow /><SkTable headers={['Year', 'Category', 'Medal', 'Name', 'School', '']} rows={6} /></SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty"><p>No medalists{yearFilter || categoryFilter ? ' for this filter' : ' yet'}.</p></div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Year</th><th>Category</th><th>Medal</th><th>Name</th><th>School</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                editingId === r.id ? (
                  <tr key={r.id}>
                    <td><input type="text" value={edit.year} style="width:70px;" onInput={(e) => setEdit({ ...edit, year: (e.target as HTMLInputElement).value })} /></td>
                    <td>
                      <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: (e.target as HTMLSelectElement).value })}>
                        {CATEGORIES.map((cat) => <option value={cat}>{cat}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={edit.medal} onChange={(e) => setEdit({ ...edit, medal: (e.target as HTMLSelectElement).value })}>
                        {MEDALS.map((m) => <option value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td><input type="text" value={edit.name} onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} /></td>
                    <td><input type="text" value={edit.school} onInput={(e) => setEdit({ ...edit, school: (e.target as HTMLInputElement).value })} /></td>
                    <td colSpan={2}>
                      <div class="action-row">
                        <button type="button" class="btn-primary" onClick={() => saveEdit(r.id)} disabled={busy}>Save</button>
                        <button type="button" class="btn-secondary" onClick={() => setEditingId(null)} disabled={busy}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td>{r.year}</td>
                    <td>{r.category}</td>
                    <td><span class={`badge badge-${r.medal === 'gold' ? 'ok' : r.medal === 'silver' ? 'muted' : 'warn'}`}>{r.medal}</span></td>
                    <td class="cell-strong">{r.name}</td>
                    <td class="cell-sub">{r.school || <span class="muted">-</span>}</td>
                    <td>
                      <button type="button" class={`badge badge-${r.published ? 'ok' : 'warn'}`} style="cursor:pointer;border:none;" onClick={() => togglePublish(r)} title="Toggle publish">
                        {r.published ? 'published' : 'draft'}
                      </button>
                    </td>
                    <td>
                      <div class="action-row">
                        <button type="button" class="btn-secondary" onClick={() => startEdit(r)}><Icon name="edit" size={13} /></button>
                        <button type="button" class="btn-danger" onClick={() => remove(r)}><Icon name="trash" size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FieldShell({ label, children, width, grow }: { label: string; children: any; width?: string; grow?: boolean }) {
  return (
    <div style={`display:flex;flex-direction:column;gap:4px;${grow ? 'flex:1;min-width:140px;' : width ? `width:${width};` : ''}`}>
      <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-3);">{label}</span>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' | 'muted' }) {
  return (
    <div class={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </div>
  );
}
