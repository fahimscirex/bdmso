// Press mentions list. Surfaces every row in the D1 `press_mentions` table,
// with publish/unpublish toggles and a "New mention" button. Edits here feed
// the homepage press collage and the /media page (materialized to D1 → JSON).

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { SkRoot, SkStatRow, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';

type Row = {
  id: number;
  outlet: string;
  title: string;
  url: string;
  published_on: string;
  image: string;
  featured: boolean;
  sort_order: number;
  published: boolean;
  updated_at: string;
};

type Summary = { total: number; published: number; drafts: number };
type Response = { ok: true; rows: Row[]; summary: Summary };

export function PressMentions() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  function load() {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/press-mentions${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, [statusFilter]);

  async function togglePublish(id: number, currently: boolean) {
    try {
      await api.patch<{ ok: true }>(`/api/admin/press-mentions/${id}`, { published: !currently });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <h1>Press mentions</h1>
          <p class="sub">Media coverage shown on the homepage collage and <code>/media</code>. Edited here, served live from D1.</p>
        </div>
        <button type="button" class="btn-primary" onClick={() => navigate('/press/new')}>
          <Icon name="plus" size={15} /> New mention
        </button>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total" value={data.summary.total} />
          <Stat label="Published" value={data.summary.published} tone="ok" />
          <Stat label="Drafts" value={data.summary.drafts} tone="warn" />
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
          <SkTable headers={['Outlet', 'Title', 'Status', 'Date', '']} rows={5} />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No press mentions yet.</p>
          <p class="muted">Click <strong>New mention</strong> to add coverage.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Outlet</th>
                <th>Title</th>
                <th>Status</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr class="row-link" key={r.id} onClick={() => navigate(`/press/${r.id}/edit`)}>
                  <td>
                    <div class="cell-strong">{r.outlet}</div>
                    {r.featured && <div class="cell-sub">★ featured</div>}
                  </td>
                  <td>{r.title}</td>
                  <td>
                    <span class={`badge badge-${r.published ? 'ok' : 'warn'}`}>
                      {r.published ? 'published' : 'draft'}
                    </span>
                  </td>
                  <td class="cell-sub">{r.published_on || '-'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      class="btn-secondary"
                      onClick={() => togglePublish(r.id, r.published)}
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
