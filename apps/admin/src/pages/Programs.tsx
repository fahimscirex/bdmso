// Programs list. Surfaces every row in the D1 `programs` table - the catalogue
// the worker prices against and the marketing site builds from. Publish/draft
// filter, quick publish toggle, and a "New program" button into the editor.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { SkRoot, SkStatRow, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';

type Row = {
  slug: string;
  title: string;
  category: string;
  registration_status: string;
  price_label: string;
  fee_amount: number | null;
  pricing: { selection: string; choices: { id: string; label: string; note: string; price: number }[] } | null;
  home_order: string;
  hidden: boolean;
  published: boolean;
  updated_at: string;
  updated_by: string | null;
};

type Summary = { total: number; published: number; drafts: number };
type Response = { ok: true; rows: Row[]; summary: Summary };

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'muted'> = {
  open: 'ok', coming_soon: 'warn', closed: 'muted', on_enquiry: 'muted',
};

function priceText(r: Row): string {
  if (r.price_label) return r.price_label;
  if (r.pricing) {
    const prices = r.pricing.choices.map((c) => c.price);
    return `from ৳${Math.min(...prices).toLocaleString('en-BD')}`;
  }
  if (typeof r.fee_amount === 'number') return `৳${r.fee_amount.toLocaleString('en-BD')}`;
  return '-';
}

export function Programs() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  function load() {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/programs${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, [statusFilter]);

  async function togglePublish(slug: string, currently: boolean) {
    try {
      await api.patch<{ ok: true }>(`/api/admin/programs/${encodeURIComponent(slug)}`, { published: !currently });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <h1>Programs</h1>
          <p class="sub">The catalogue the worker prices against and the site builds from. Edited here, stored in D1.</p>
        </div>
        <button type="button" class="btn-primary" onClick={() => navigate('/programs/new')}>
          <Icon name="plus" size={15} /> New program
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
          <SkTable headers={['Title', 'Category', 'Registration', 'Price', 'Status', '']} rows={6} />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No programs yet.</p>
          <p class="muted">Click <strong>New program</strong> to create one. Publish it to include it in the next site build.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Registration</th>
                <th>Price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr class="row-link" key={r.slug} onClick={() => navigate(`/programs/${r.slug}/edit`)}>
                  <td>
                    <div class="cell-strong">{r.title}</div>
                    <div class="cell-sub">/programs/{r.slug}{r.hidden ? ' · hidden' : ''}</div>
                  </td>
                  <td>{r.category || <span class="muted">-</span>}</td>
                  <td>
                    <span class={`badge badge-${STATUS_TONE[r.registration_status] || 'muted'}`}>
                      {r.registration_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td class="cell-sub">{priceText(r)}</td>
                  <td>
                    <span class={`badge badge-${r.published ? 'ok' : 'warn'}`}>
                      {r.published ? 'published' : 'draft'}
                    </span>
                  </td>
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
