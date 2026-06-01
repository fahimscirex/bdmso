// Posts list. Surfaces every row in the D1 `posts` table, with quick
// publish/unpublish toggles, draft/featured/published filters, and a
// "New post" button that opens the editor at /posts/new.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { SkRoot, SkStatRow, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';

type Row = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  image: string;
  published: boolean;
  featured: boolean;
  published_at: string | null;
  updated_at: string;
  updated_by: string | null;
};

type Summary = { total: number; published: number; drafts: number; featured: number };

type Response = { ok: true; rows: Row[]; summary: Summary };

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Posts() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  function load() {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/posts${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, [statusFilter]);

  async function togglePublish(slug: string, currently: boolean) {
    try {
      await api.patch<{ ok: true }>(`/api/admin/posts/${encodeURIComponent(slug)}`, {
        published: !currently,
      });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <h1>Posts</h1>
          <p class="sub">Blog content served at <code>/posts/&lt;slug&gt;</code>. Edited here, served live from D1.</p>
        </div>
        <button type="button" class="btn-primary" onClick={() => navigate('/posts/new')}>
          <Icon name="plus" size={15} /> New post
        </button>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total"     value={data.summary.total} />
          <Stat label="Published" value={data.summary.published} tone="ok" />
          <Stat label="Drafts"    value={data.summary.drafts}    tone="warn" />
          <Stat label="Featured"  value={data.summary.featured} />
        </div>
      )}

      <div class="toolbar">
        <label>
          <span>Filter</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value)}>
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
        </label>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot>
          <SkStatRow />
          <SkTable headers={['Title', 'Category', 'Author', 'Status', 'Date', '']} rows={5} />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No posts yet.</p>
          <p class="muted">Click <strong>New post</strong> to create one. It'll be served at <code>/posts/&lt;slug&gt;</code> as soon as you flip it to Published.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Author</th>
                <th>Status</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr class="row-link" key={r.slug} onClick={() => navigate(`/posts/${r.slug}/edit`)}>
                  <td>
                    <div class="cell-strong">{r.title}</div>
                    <div class="cell-sub">/posts/{r.slug}{r.featured ? ' · ★ featured' : ''}</div>
                  </td>
                  <td>{r.category || <span class="muted">-</span>}</td>
                  <td>{r.author   || <span class="muted">-</span>}</td>
                  <td>
                    <span class={`badge badge-${r.published ? 'ok' : 'warn'}`}>
                      {r.published ? 'published' : 'draft'}
                    </span>
                  </td>
                  <td class="cell-sub">{formatDate(r.published_at || r.updated_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      class="btn-secondary"
                      onClick={() => togglePublish(r.slug, r.published)}
                      title={r.published ? 'Unpublish' : 'Publish'}
                    >
                      {r.published ? 'Unpublish' : 'Publish'}
                    </button>
                  </td>
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
