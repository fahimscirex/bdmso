// Programs list. Same shape as Posts (drafts vs published), but each
// program drives a /programs/<slug> landing page on the public site.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';

type Row = {
  slug: string;
  title: string;
  tagline: string | null;
  cohort: string | null;
  image: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  audience: string | null;
  published: number;
  published_at: string | null;
  updated_at: string;
};

type Summary = { total: number; published: number; drafts: number };

type Response = {
  ok: true;
  rows: Row[];
  summary: Summary;
  filter: { status: string | null; q: string | null; limit: number };
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Programs() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [query, setQuery] = useState<string>('');

  useEffect(() => {
    const t = setTimeout(() => {
      setError(null);
      setData(null);
      const qs: string[] = [];
      if (statusFilter) qs.push(`status=${encodeURIComponent(statusFilter)}`);
      if (query)        qs.push(`q=${encodeURIComponent(query)}`);
      const url = `/api/admin/programs${qs.length ? `?${qs.join('&')}` : ''}`;
      api.get<Response>(url).then(setData).catch((err: ApiError) => setError(err.message));
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [statusFilter, query]);

  return (
    <>
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
        <div>
          <h1>Programs</h1>
          <p class="sub">Workshops, camps and courses. Each drives a /programs/&lt;slug&gt; page.</p>
        </div>
        <button type="button" class="btn-primary" onClick={() => navigate('/programs/new')}>
          New program
        </button>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total"     value={data.summary.total} />
          <Stat label="Published" value={data.summary.published} tone="ok" />
          <Stat label="Drafts"    value={data.summary.drafts}    tone="warn" />
        </div>
      )}

      <div class="toolbar">
        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </label>
        <label style="flex:1;min-width:240px;">
          <span>Search</span>
          <input
            type="search"
            placeholder="title, slug, tagline…"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            style="min-width:100%;"
          />
        </label>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && <div class="muted">Loading…</div>}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No programs yet.</p>
          <p class="muted">Click <strong>New program</strong> to add one.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Cohort</th>
                <th>Dates</th>
                <th>Venue</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <tr class="row-link" onClick={() => navigate(`/programs/${p.slug}/edit`)}>
                  <td>
                    <div class="cell-strong">{p.title}</div>
                    {p.tagline && <div class="cell-sub">{p.tagline.slice(0, 80)}{p.tagline.length > 80 ? '…' : ''}</div>}
                  </td>
                  <td>
                    <a
                      href={href(`/programs/${p.slug}/edit`)}
                      onClick={(e) => e.stopPropagation()}
                    ><code>{p.slug}</code></a>
                  </td>
                  <td>{p.cohort || <span class="muted">-</span>}</td>
                  <td class="cell-sub">
                    {p.start_date ? formatDate(p.start_date) : <span class="muted">-</span>}
                    {p.end_date && <> – {formatDate(p.end_date)}</>}
                  </td>
                  <td>{p.venue || <span class="muted">-</span>}</td>
                  <td>
                    {p.published
                      ? <span class="badge badge-ok">published</span>
                      : <span class="badge badge-warn">draft</span>}
                  </td>
                  <td class="cell-sub">{formatDate(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
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
