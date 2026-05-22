// Registrations list. The first real screen - answers an organiser's #1
// question ("who signed up?"). Sort newest-first, summary header counts,
// status + payment badges. Filters and pagination come once we hit the
// 1000-row hard cap.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { toCsv, downloadCsv } from '../csv';

type Row = {
  id: string;
  registration_type: string;
  program_label: string;       // catalog-derived, from /api/admin/registrations
  student_full_name: string;
  student_class_name: string;
  student_gender: string;
  student_school: string;
  student_district: string;
  preferred_venue: string | null;
  guardian_full_name: string;
  guardian_email: string;
  guardian_phone: string;
  status: 'submitted' | 'paid' | 'cancelled';
  created_at: string;
  payment_status: 'pending' | 'paid' | 'failed' | null;
  payment_amount: number | null;
  payment_tran_id: string | null;
  payment_updated_at: string | null;
};

type Summary = { total: number; paid: number; pending: number; cancelled: number };

type Response = {
  ok: true;
  rows: Row[];
  summary: Summary;
  filter: { status: string | null; type: string | null; q: string | null; limit: number };
};

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBdt(n: number | null): string {
  if (n == null) return '-';
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

export function Registrations() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  function load() {
    setError(null);
    setData(null);
    const qs: string[] = [];
    if (statusFilter) qs.push(`status=${encodeURIComponent(statusFilter)}`);
    if (query)        qs.push(`q=${encodeURIComponent(query)}`);
    const url = `/api/admin/registrations${qs.length ? `?${qs.join('&')}` : ''}`;
    api.get<Response>(url)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  // Debounce the search box; status changes apply immediately.
  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [statusFilter, query]);

  // Export the current filtered view (up to the API's 1000-row cap) to CSV.
  async function exportCsv() {
    setExporting(true);
    try {
      const qs = ['limit=1000'];
      if (statusFilter) qs.push(`status=${encodeURIComponent(statusFilter)}`);
      if (query)        qs.push(`q=${encodeURIComponent(query)}`);
      const res = await api.get<Response>(`/api/admin/registrations?${qs.join('&')}`);
      const headers = [
        'Student', 'Class', 'Gender', 'School', 'District', 'Exam venue', 'Program',
        'Guardian', 'Guardian email', 'Guardian phone', 'Status', 'Payment',
        'Amount (BDT)', 'Tran ID', 'Submitted',
      ];
      const rows = res.rows.map((r) => [
        r.student_full_name, r.student_class_name, r.student_gender, r.student_school,
        r.student_district, r.preferred_venue || '', r.program_label,
        r.guardian_full_name, r.guardian_email, r.guardian_phone,
        r.status, r.payment_status || '', r.payment_amount ?? '',
        r.payment_tran_id || '', r.created_at,
      ]);
      downloadCsv(`bdmso-registrations-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div class="page-header">
        <h1>Registrations</h1>
        <p class="sub">All student registrations. Newest first.</p>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total"     value={data.summary.total} />
          <Stat label="Paid"      value={data.summary.paid}      tone="ok" />
          <Stat label="Pending"   value={data.summary.pending}   tone="warn" />
          <Stat label="Cancelled" value={data.summary.cancelled} tone="muted" />
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
            <option value="submitted">Submitted (pending payment)</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label style="flex:1;min-width:240px;">
          <span>Search</span>
          <input
            type="search"
            placeholder="student, guardian, email, phone, school…"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            style="min-width:100%;"
          />
        </label>
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
          <p>No registrations match the current filter.</p>
          <p class="muted">
            Tip: open <code>/registration</code> on the public site and submit a
            test entry to see this list come alive.
          </p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>School / District</th>
                <th>Program</th>
                <th>Guardian</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr class="row-link" onClick={() => navigate(`/registrations/${r.id}`)}>
                  <td>
                    <div class="cell-strong">{r.student_full_name}</div>
                    <div class="cell-sub">{r.student_gender}</div>
                  </td>
                  <td>{r.student_class_name}</td>
                  <td>
                    <div class="cell-strong">{r.student_school}</div>
                    <div class="cell-sub">{r.student_district}</div>
                  </td>
                  <td>{r.program_label}</td>
                  <td>
                    <div class="cell-strong">{r.guardian_full_name}</div>
                    <div class="cell-sub">{r.guardian_email}</div>
                  </td>
                  <td><StatusBadge value={r.status} /></td>
                  <td>
                    <PaymentCell status={r.payment_status} amount={r.payment_amount} />
                  </td>
                  <td class="cell-sub">{formatDate(r.created_at)}</td>
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

function StatusBadge({ value }: { value: Row['status'] }) {
  const tone = value === 'paid' ? 'ok' : value === 'cancelled' ? 'muted' : 'warn';
  return <span class={`badge badge-${tone}`}>{value}</span>;
}

function PaymentCell({ status, amount }: { status: Row['payment_status']; amount: number | null }) {
  if (!status) return <span class="muted">-</span>;
  const tone = status === 'paid' ? 'ok' : status === 'failed' ? 'bad' : 'warn';
  return (
    <div>
      <span class={`badge badge-${tone}`}>{status}</span>
      <div class="cell-sub">{formatBdt(amount)}</div>
    </div>
  );
}
