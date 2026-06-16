// Payments list. Mirrors Registrations but groups by payment intent.
// Shows revenue at the top - the question finance asks most often.

import { useEffect, useState, useCallback } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { toCsv, downloadCsv } from '../csv';

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
  student_full_name: string | null;
  guardian_full_name: string | null;
  guardian_email: string | null;
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

export function Payments() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [reconcilingAll, setReconcilingAll] = useState(false);

  const fetchData = useCallback(() => {
    setError(null);
    setData(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    api.get<Response>(`/api/admin/payments${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function reconcile(id: string) {
    setReconciling(id);
    try {
      const res = await api.post<{ ok: true; status: string }>(`/api/admin/payments/${id}/reconcile`);
      alert(`Reconciled: ${res.status}`);
      fetchData();
    } catch (err) {
      alert((err as ApiError).message);
    } finally {
      setReconciling(null);
    }
  }

  async function reconcileAll() {
    setReconcilingAll(true);
    try {
      const res = await api.post<{ ok: true; checked: number; paid: number; failed: number }>('/api/admin/payments/reconcile-stale');
      alert(`Reconciled ${res.checked} stale payments: ${res.paid} paid, ${res.failed} failed.`);
      fetchData();
    } catch (err) {
      alert((err as ApiError).message);
    } finally {
      setReconcilingAll(false);
    }
  }

  // Export the current filtered view (up to the API's 1000-row cap) to CSV.
  async function exportCsv() {
    setExporting(true);
    try {
      const qs = ['limit=1000'];
      if (statusFilter) qs.push(`status=${encodeURIComponent(statusFilter)}`);
      const res = await api.get<Response>(`/api/admin/payments?${qs.join('&')}`);
      const headers = [
        'Status', 'Amount (BDT)', 'Currency', 'Student', 'Program', 'Guardian',
        'Guardian email', 'Tran ID', 'Gateway status', 'Coupon', 'Created', 'Updated',
      ];
      const rows = res.rows.map((p) => [
        p.status, p.amount, p.currency, p.student_full_name || '', p.registration_type || '',
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
      <div class="page-header">
        <h1>Payments</h1>
        <p class="sub">All payment attempts via shurjoPay. Updated-first.</p>
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
          disabled={reconcilingAll || !data}
          onClick={reconcileAll}
          style="margin-left:auto;"
        >
          {reconcilingAll ? 'Reconciling…' : 'Reconcile All Stale'}
        </button>
        <button
          type="button"
          class="btn-secondary"
          disabled={exporting || !data}
          onClick={exportCsv}
          style="align-self:flex-end;"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && <div class="muted">Loading…</div>}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No payments match the current filter.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Amount</th>
                <th>Student</th>
                <th>Guardian</th>
                <th>Tran ID</th>
                <th>Gateway</th>
                <th>Coupon</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => {
                const linkable = !!p.registration_id;
                return (
                  <tr
                    class={linkable ? 'row-link' : undefined}
                    onClick={linkable ? () => navigate(`/registrations/${p.registration_id}`) : undefined}
                  >
                    <td>
                      <span class={`badge badge-${p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td><strong>{formatBdt(p.amount)}</strong></td>
                    <td>
                      {p.student_full_name ? (
                        linkable ? (
                          <a
                            class="cell-strong"
                            href={href(`/registrations/${p.registration_id}`)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.student_full_name}
                          </a>
                        ) : (
                          <span class="cell-strong">{p.student_full_name}</span>
                        )
                      ) : <span class="muted">-</span>}
                      <div class="cell-sub">{p.registration_type || ''}</div>
                    </td>
                    <td>
                      <div class="cell-strong">{p.guardian_full_name || '-'}</div>
                      <div class="cell-sub">{p.guardian_email || ''}</div>
                    </td>
                    <td><code>{p.tran_id}</code></td>
                    <td>{p.gateway_status || '-'}</td>
                    <td>{p.coupon_code ? <code>{p.coupon_code}</code> : <span class="muted">-</span>}</td>
                    <td class="cell-sub">{formatDateTime(p.updated_at)}</td>
                    <td>
                      {p.status === 'pending' && (
                        <button
                          type="button"
                          class="btn-secondary btn-sm"
                          disabled={reconciling === p.id}
                          onClick={(e) => { e.stopPropagation(); reconcile(p.id); }}
                        >
                          {reconciling === p.id ? '…' : 'Reconcile'}
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
