// Blog posts list. Backed by the new D1 posts table (the file-based
// blog under public/blog/ still ships until the public renderer is
// migrated). New / edit actions land on /posts/:slug/edit (or /new).

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';

type Row = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  author: string | null;
  image: string | null;
  published: number;
  featured: number;
  published_at: string | null;
  updated_at: string;
};

type Summary = { total: number; published: number; drafts: number; featured: number };

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

export function Posts() {
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
      const url = `/api/admin/posts${qs.length ? `?${qs.join('&')}` : ''}`;
      api.get<Response>(url).then(setData).catch((err: ApiError) => setError(err.message));
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [statusFilter, query]);

  return (
    <>
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
        <div>
          <h1>Posts</h1>
          <p class="sub">Blog and news entries. Drafts stay hidden from the public site.</p>
        </div>
        <button type="button" class="btn-primary" onClick={() => navigate('/posts/new')}>
          New post
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
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="featured">Featured</option>
          </select>
        </label>
        <label style="flex:1;min-width:240px;">
          <span>Search</span>
          <input
            type="search"
            placeholder="title, slug, excerpt…"
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
          <p>No posts yet.</p>
          <p class="muted">Click <strong>New post</strong> to write the first one.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Category</th>
                <th>Author</th>
                <th>Status</th>
                <th>Published</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <tr class="row-link" onClick={() => navigate(`/posts/${p.slug}/edit`)}>
                  <td>
                    <div class="cell-strong">{p.title}</div>
                    {p.excerpt && <div class="cell-sub">{p.excerpt.slice(0, 80)}{p.excerpt.length > 80 ? '…' : ''}</div>}
                  </td>
                  <td>
                    <a
                      href={href(`/posts/${p.slug}/edit`)}
                      onClick={(e) => e.stopPropagation()}
                    ><code>{p.slug}</code></a>
                  </td>
                  <td>{p.category || <span class="muted">-</span>}</td>
                  <td>{p.author || <span class="muted">-</span>}</td>
                  <td>
                    {p.published
                      ? <span class="badge badge-ok">published</span>
                      : <span class="badge badge-warn">draft</span>}
                    {p.featured ? <span class="badge badge-muted" style="margin-left:4px;">featured</span> : null}
                  </td>
                  <td class="cell-sub">{formatDate(p.published_at)}</td>
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
