// Payments list. Mirrors Registrations but groups by payment intent.
// Shows revenue at the top - the question finance asks most often.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { toCsv, downloadCsv } from '../csv';
import { SkRoot, SkStatRow, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';

type Row = {
  id: string;
  amount: number;
  currency: string;
  tran_id: string;
  val_id: string | null;
  gateway_status: string | null;
  status: 'pending' | 'paid' | 'failed';
  coupon_code: string | null;
  created_at: string;
  updated_at: string;
  registration_id: string | null;
  registration_type: string | null;
  preferred_subject: string | null;
  program_options: string | null;
  student_full_name: string | null;
  guardian_full_name: string | null;
  guardian_email: string | null;
  bdmso_id: string | null;
  program_label: string | null;
};

type Summary = { total: number; paid: number; pending: number; failed: number; revenue: number };

type Response = {
  ok: true;
  rows: Row[];
  summary: Summary;
  filter: { status: string | null; limit: number };
};

function formatBdt(n: number): string {
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// What subject the payment was for. Olympiad rows carry preferred_subject;
// option-based programs (Prep Course, Mock Test) carry program_options ids
// like "mt1-math"/"science"/"both". Distil both into a clean Math/Science
// label so finance can see at a glance what was bought.
function subjectOf(p: Row): string {
  const tokens = new Set<string>();
  const classify = (raw: string) => {
    const v = raw.toLowerCase();
    if (v.includes('both')) { tokens.add('math'); tokens.add('science'); }
    else if (v.includes('math')) tokens.add('math');
    else if (v.includes('sci')) tokens.add('science');
  };
  if (p.preferred_subject) classify(p.preferred_subject);
  if (p.program_options) {
    try {
      const arr = JSON.parse(p.program_options);
      if (Array.isArray(arr)) arr.forEach((id) => classify(String(id)));
    } catch { /* ignore malformed json */ }
  }
  if (tokens.has('math') && tokens.has('science')) return 'Math & Science';
  if (tokens.has('math')) return 'Math';
  if (tokens.has('science')) return 'Science';
  return '';
}

// Number of priced selections (Mock Test sessions / Prep subjects), shown as a
// quiet hint so a ৳2,000 / 4-session row reads clearly.
function optionCount(p: Row): number {
  if (!p.program_options) return 0;
  try { const a = JSON.parse(p.program_options); return Array.isArray(a) ? a.length : 0; }
  catch { return 0; }
}

export function Payments() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/payments${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  async function reverify(id: string) {
    setBusyId(id);
    try {
      const r = await api.post<{ status?: string; gateway?: unknown; message?: string }>(`/api/admin/payments/${id}/reverify`, {});
      if (r.message) alert(r.message);
      else           alert(`Reconciled: gateway says "${r.status || 'unchanged'}".`);
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  useEffect(load, [statusFilter]);

  // Export the current filtered view (up to the API's 1000-row cap) to CSV.
  async function exportCsv() {
    setExporting(true);
    try {
      const qs = ['limit=1000'];
      if (statusFilter) qs.push(`status=${encodeURIComponent(statusFilter)}`);
      const res = await api.get<Response>(`/api/admin/payments?${qs.join('&')}`);
      const headers = [
        'Status', 'Amount (BDT)', 'Currency', 'BdMSO ID', 'Student', 'Program', 'Subject',
        'Guardian', 'Guardian email', 'Tran ID', 'Gateway status', 'Coupon', 'Created', 'Updated',
      ];
      const rows = res.rows.map((p) => [
        p.status, p.amount, p.currency, p.bdmso_id || '', p.student_full_name || '',
        p.program_label || p.registration_type || '', subjectOf(p),
        p.guardian_full_name || '', p.guardian_email || '', p.tran_id,
        p.gateway_status || '', p.coupon_code || '', p.created_at, p.updated_at,
      ]);
      downloadCsv(`bdmso-payments-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Payments</h1>
          <p class="sub">All payment attempts via shurjoPay. Updated-first.</p>
        </div>
        <button type="button" class="btn-secondary" onClick={() => navigate('/payments/reports')}>
          <Icon name="dashboard" size={14} /> Reports
        </button>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Revenue (BDT)" value={formatBdt(data.summary.revenue)} tone="ok" />
          <Stat label="Paid"          value={String(data.summary.paid)} />
          <Stat label="Pending"       value={String(data.summary.pending)} tone="warn" />
          <Stat label="Failed"        value={String(data.summary.failed)} tone="bad" />
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
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <button
          type="button"
          class="btn-secondary"
          disabled={exporting || !data}
          onClick={exportCsv}
          style="margin-left:auto;align-self:flex-end;"
        >
          <Icon name="download" size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot>
          <SkStatRow />
          <SkTable headers={['Status', 'Amount', 'Student', 'Program / subject', 'Guardian', 'Transaction', 'Updated', '']} rows={6} />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No payments match the current filter.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table pay-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Amount</th>
                <th>Student</th>
                <th>Program / subject</th>
                <th>Guardian</th>
                <th>Transaction</th>
                <th>Updated</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => {
                const linkable = !!p.registration_id;
                const subject = subjectOf(p);
                const count = optionCount(p);
                return (
                  <tr
                    key={p.id}
                    class={linkable ? 'row-link' : undefined}
                    onClick={linkable ? () => navigate(`/registrations/${p.registration_id}`) : undefined}
                  >
                    <td>
                      <span class={`badge badge-${p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <div class="cell-amount">{formatBdt(p.amount)}</div>
                      {p.coupon_code && (
                        <div class="cell-sub coupon-tag" title={`Coupon: ${p.coupon_code}`}>
                          <Icon name="tag" size={10} /> {p.coupon_code}
                        </div>
                      )}
                    </td>
                    <td>
                      {p.student_full_name
                        ? <div class="cell-strong">{p.student_full_name}</div>
                        : <span class="muted">-</span>}
                      {p.bdmso_id
                        ? <div class="cell-sub cell-id">{p.bdmso_id}</div>
                        : <div class="cell-sub muted">No BdMSO ID yet</div>}
                    </td>
                    <td>
                      <div class="cell-strong">{p.program_label || p.registration_type || '-'}</div>
                      {subject && (
                        <div class="cell-sub">
                          {subject}{count > 1 ? ` · ${count} sessions` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <div class="cell-strong">{p.guardian_full_name || '-'}</div>
                      <div class="cell-sub">{p.guardian_email || ''}</div>
                    </td>
                    <td>
                      <div class="cell-tran" title={p.tran_id}>{p.tran_id}</div>
                      <div class="cell-sub">{p.gateway_status || 'no gateway reply'}</div>
                    </td>
                    <td class="cell-sub">{formatDateTime(p.updated_at)}</td>
                    <td onClick={(e) => e.stopPropagation()} style="white-space:nowrap;">
                      {(p.status === 'pending' || p.status === 'failed') && (
                        <button
                          type="button" class="btn-secondary"
                          disabled={busyId === p.id || !p.val_id}
                          title={p.val_id ? 'Ask shurjoPay for the current status' : 'No sp_order_id stored'}
                          onClick={() => reverify(p.id)}
                          style="padding:5px 9px;font-size:11.5px;"
                        >
                          <Icon name="refresh" size={11} /> Re-verify
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' | 'muted' }) {
  return (
    <div class={`stat${tone ? ` stat-${tone}` : ''}`}>
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </div>
  );
}
