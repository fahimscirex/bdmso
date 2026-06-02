// Team members list - the /team page. Backed by D1 `team_members`, materialized
// to the team content collection. Filter by section; click a row to edit.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { SkRoot, SkStatRow, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';
import { previewSrc } from '../img';

type Row = {
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

type Summary = { total: number; published: number; drafts: number };
type Response = { ok: true; rows: Row[]; summary: Summary };

const SECTIONS = ['delegation', 'advisor', 'organizing', 'mentor', 'alumni'];

export function Team() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState('');

  function load() {
    setError(null);
    setData(null);
    const qs = sectionFilter ? `?section=${encodeURIComponent(sectionFilter)}` : '';
    api.get<Response>(`/api/admin/team${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(load, [sectionFilter]);

  async function togglePublish(id: number, currently: boolean) {
    try {
      await api.patch<{ ok: true }>(`/api/admin/team/${id}`, { published: !currently });
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <h1>Team</h1>
          <p class="sub">People on <code>/team</code> - delegation, advisors, organizers, mentors, alumni. Edited here, served live from D1.</p>
        </div>
        <button type="button" class="btn-primary" onClick={() => navigate('/team/new')}>
          <Icon name="plus" size={15} /> New member
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
          <span>Section</span>
          <select value={sectionFilter} onChange={(e) => setSectionFilter((e.target as HTMLSelectElement).value)}>
            <option value="">All</option>
            {SECTIONS.map((s) => <option value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot><SkStatRow /><SkTable headers={['Photo', 'Name', 'Section', 'Role', 'Status', '']} rows={6} /></SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty"><p>No team members{sectionFilter ? ' in this section' : ' yet'}.</p></div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>Photo</th><th>Name</th><th>Section</th><th>Role</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr class="row-link" key={r.id} onClick={() => navigate(`/team/${r.id}/edit`)}>
                  <td>
                    {r.image
                      ? <img src={previewSrc(r.image)} alt="" style="width:38px;height:46px;object-fit:cover;border-radius:6px;" />
                      : <span class="muted">-</span>}
                  </td>
                  <td>
                    <div class="cell-strong">{r.name}</div>
                    {r.affiliation && <div class="cell-sub">{r.affiliation}</div>}
                  </td>
                  <td>
                    {r.section}
                    {r.subgroup && <div class="cell-sub">{r.subgroup}{r.year ? ` · ${r.year}` : ''}</div>}
                  </td>
                  <td>{r.role || <span class="muted">-</span>}</td>
                  <td>
                    <span class={`badge badge-${r.published ? 'ok' : 'warn'}`}>
                      {r.published ? 'published' : 'draft'}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" class="btn-secondary" onClick={() => togglePublish(r.id, r.published)} title={r.published ? 'Unpublish' : 'Publish'}>
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
