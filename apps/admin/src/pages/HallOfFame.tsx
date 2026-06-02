// Hall of Fame photos list - the homepage slider. Backed by D1
// `hall_of_fame_photos`, materialized to the halloffame content collection.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { SkRoot, SkStatRow, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { previewSrc } from '../img';

type Row = {
  id: number;
  image: string;
  caption: string;
  year: string;
  sort_order: number;
  published: boolean;
  updated_at: string;
};

type Summary = { total: number; published: number; drafts: number };
type Response = { ok: true; rows: Row[]; summary: Summary };

export function HallOfFame() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  function load() {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/hall-of-fame${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, [statusFilter]);

  async function togglePublish(id: number, currently: boolean) {
    try {
      await api.patch<{ ok: true }>(`/api/admin/hall-of-fame/${id}`, { published: !currently });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <h1>Hall of Fame</h1>
          <p class="sub">Photo slider on the homepage. Edited here, served live from D1.</p>
        </div>
        <button type="button" class="btn-primary" onClick={() => navigate('/hall-of-fame/new')}>
          <Icon name="plus" size={15} /> New photo
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
          <SkTable headers={['Photo', 'Caption', 'Year', 'Status', '']} rows={4} />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No photos yet.</p>
          <p class="muted">Click <strong>New photo</strong> to add one to the homepage slider.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Caption</th>
                <th>Year</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr class="row-link" key={r.id} onClick={() => navigate(`/hall-of-fame/${r.id}/edit`)}>
                  <td>
                    {r.image
                      ? <img src={previewSrc(r.image)} alt="" style="width:64px;height:40px;object-fit:cover;border-radius:6px;" />
                      : <span class="muted">-</span>}
                  </td>
                  <td>{r.caption || <span class="muted">-</span>}</td>
                  <td>{r.year || <span class="muted">-</span>}</td>
                  <td>
                    <span class={`badge badge-${r.published ? 'ok' : 'warn'}`}>
                      {r.published ? 'published' : 'draft'}
                    </span>
                  </td>
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
