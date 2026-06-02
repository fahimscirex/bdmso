// Registrations list - the most-used screen. Pagination + sortable
// columns + multi-filter chip row + bulk select with bulk reminder
// emails + stuck-payment indicator + per-row notes count. The 1000-row
// hard cap server-side is replaced with offset/limit pagination here.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DateField } from '../components/DateField';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { toCsv, downloadCsv } from '../csv';
import { SkRoot, SkTable } from '../components/Skeleton';
import { Icon } from '../components/Icon';

type Row = {
  id: string;
  registration_type: string;
  program_label: string;
  bdmso_id: string | null;
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
  stuck: boolean;
  notes_count: number;
  payment_status: 'pending' | 'paid' | 'failed' | null;
  payment_amount: number | null;
  payment_tran_id: string | null;
  payment_coupon: string | null;
  payment_updated_at: string | null;
};

type Summary = { total: number; paid: number; pending: number; cancelled: number };
type Facets  = { classes: string[]; venues: string[]; districts: string[] };

type Response = {
  ok: true;
  rows: Row[];
  total: number;
  summary: Summary;
  facets: Facets;
  filter: Record<string, unknown>;
};

const PAGE_SIZE = 50;

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
  const [status, setStatus] = useState<string>(() => new URLSearchParams(location.search).get('status') ?? '');
  const [stuckOnly, setStuckOnly] = useState(false);
  const [hasCoupon, setHasCoupon] = useState(false);
  const [venue, setVenue] = useState('');
  const [klass, setKlass] = useState('');
  const [district, setDistrict] = useState('');
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'created'|'student'|'school'|'class'|'payment'|'amount'>('created');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Build the API query string from current filter state.
  const queryString = useMemo(() => {
    const qs: string[] = [`limit=${PAGE_SIZE}`, `offset=${offset}`, `sort=${sortKey}`, `dir=${sortDir}`];
    if (status)       qs.push(`status=${encodeURIComponent(status)}`);
    if (stuckOnly)    qs.push('stuck=1');
    if (hasCoupon)    qs.push('hasCoupon=1');
    if (venue)        qs.push(`venue=${encodeURIComponent(venue)}`);
    if (klass)        qs.push(`class=${encodeURIComponent(klass)}`);
    if (district)     qs.push(`district=${encodeURIComponent(district)}`);
    if (from)         qs.push(`from=${encodeURIComponent(from)}`);
    if (to)           qs.push(`to=${encodeURIComponent(to)}`);
    if (query.trim()) qs.push(`q=${encodeURIComponent(query.trim())}`);
    return qs.join('&');
  }, [status, stuckOnly, hasCoupon, venue, klass, district, from, to, query, sortKey, sortDir, offset]);

  // Debounce search; everything else applies instantly.
  const debounceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const ms = query ? 300 : 0;
    debounceRef.current = window.setTimeout(() => {
      setError(null);
      setData(null);
      api.get<Response>(`/api/admin/registrations?${queryString}`)
        .then(setData)
        .catch((err: ApiError) => setError(err.message));
    }, ms);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [queryString]);

  function reload() {
    setData(null);
    api.get<Response>(`/api/admin/registrations?${queryString}`).then(setData).catch((err: ApiError) => setError(err.message));
  }

  function resetFilters() {
    setStatus(''); setStuckOnly(false); setHasCoupon(false);
    setVenue(''); setKlass(''); setDistrict(''); setFrom(''); setTo('');
    setQuery(''); setOffset(0); setSelected(new Set());
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setOffset(0);
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }
  function selectAllOnPage() {
    if (!data) return;
    const pageIds = data.rows.map((r) => r.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else             pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function bulkRemind() {
    if (selected.size === 0) return;
    const unpaidIds = Array.from(selected).filter((id) =>
      data?.rows.find((r) => r.id === id)?.status === 'submitted',
    );
    if (unpaidIds.length === 0) {
      alert('No unpaid registrations selected. Reminders only go to status=submitted rows.');
      return;
    }
    if (!confirm(`Send a payment-reminder email to ${unpaidIds.length} guardians?`)) return;
    setBulkBusy(true);
    try {
      const r = await api.post<{ sent: number; failed: number }>('/api/admin/registrations/bulk/remind', { ids: unpaidIds });
      alert(`Sent ${r.sent}, failed ${r.failed}.`);
      setSelected(new Set());
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkCancel() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (!confirm(`Cancel ${ids.length} registrations? Only status=submitted rows will change. This can't be undone.`)) return;
    setBulkBusy(true);
    try {
      const r = await api.post<{ cancelled: number }>('/api/admin/registrations/bulk/cancel', { ids });
      alert(`Cancelled ${r.cancelled} registrations.`);
      setSelected(new Set());
      reload();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      // Pull a wider slice for the export, matching current filters.
      const exportQs = queryString.replace(/limit=\d+/, 'limit=1000').replace(/offset=\d+/, 'offset=0');
      const res = await api.get<Response>(`/api/admin/registrations?${exportQs}`);
      const headers = [
        'Student','Class','Gender','School','District','Exam venue','Program',
        'Guardian','Guardian email','Guardian phone','Status','Payment',
        'Amount (BDT)','Tran ID','Coupon','Submitted',
      ];
      const rows = res.rows.map((r) => [
        r.student_full_name, r.student_class_name, r.student_gender, r.student_school,
        r.student_district, r.preferred_venue || '', r.program_label,
        r.guardian_full_name, r.guardian_email, r.guardian_phone,
        r.status, r.payment_status || '', r.payment_amount ?? '',
        r.payment_tran_id || '', r.payment_coupon || '', r.created_at,
      ]);
      downloadCsv(`bdmso-registrations-${new Date().toISOString().slice(0,10)}.csv`, toCsv(headers, rows));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const activeFilterCount = (status?1:0)+(stuckOnly?1:0)+(hasCoupon?1:0)+(venue?1:0)+(klass?1:0)+(district?1:0)+(from?1:0)+(to?1:0)+(query?1:0);
  const allPageSelected = !!data && data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));

  return (
    <>
      <div class="page-header">
        <h1>Registrations</h1>
        <p class="sub">All student registrations. Click a row to open the detail view.</p>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total"     value={data.summary.total} />
          <Stat label="Paid"      value={data.summary.paid}      tone="ok" />
          <Stat label="Pending"   value={data.summary.pending}   tone="warn" />
          <Stat label="Cancelled" value={data.summary.cancelled} tone="muted" />
        </div>
      )}

      {/* Toolbar row 1: half-width search + date range, export pinned right */}
      <div class="toolbar">
        <label style="flex:0 1 50%;min-width:240px;">
          <span>Search</span>
          <input
            type="search"
            placeholder="student, guardian, email, phone, school…"
            value={query}
            onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setOffset(0); }}
            style="min-width:100%;"
          />
        </label>
        <DateRange from={from} to={to} onFrom={(v) => { setFrom(v); setOffset(0); }} onTo={(v) => { setTo(v); setOffset(0); }} />
        <button type="button" class="btn-secondary" style="margin-left:auto;" disabled={exporting || !data} onClick={exportCsv}>
          <Icon name="download" size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
        {activeFilterCount > 0 && (
          <button type="button" class="btn-secondary" onClick={resetFilters}>
            <Icon name="x" size={14} /> Reset filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Chip row: scrollable, compact toggles */}
      <div class="chip-row">
        <ChipSelect
          label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }}
          options={[['','All'], ['submitted','Pending'], ['paid','Paid'], ['cancelled','Cancelled']]}
        />
        <ChipToggle label="Stuck >72h" active={stuckOnly} onClick={() => { setStuckOnly(!stuckOnly); setOffset(0); }} />
        <ChipToggle label="Has coupon" active={hasCoupon} onClick={() => { setHasCoupon(!hasCoupon); setOffset(0); }} />
        {data?.facets.classes && data.facets.classes.length > 0 && (
          <ChipSelect
            label="Class" value={klass} onChange={(v) => { setKlass(v); setOffset(0); }}
            options={[['', 'All'], ...data.facets.classes.map<[string,string]>((c) => [c, c])]}
          />
        )}
        {data?.facets.venues && data.facets.venues.length > 0 && (
          <ChipSelect
            label="Venue" value={venue} onChange={(v) => { setVenue(v); setOffset(0); }}
            options={[['', 'All'], ...data.facets.venues.map<[string,string]>((v) => [v, v])]}
          />
        )}
        {data?.facets.districts && data.facets.districts.length > 0 && (
          <ChipSelect
            label="District" value={district} onChange={(v) => { setDistrict(v); setOffset(0); }}
            options={[['', 'All'], ...data.facets.districts.map<[string,string]>((d) => [d, d])]}
          />
        )}
      </div>

      {/* Bulk action bar - only shows when something is selected */}
      {selected.size > 0 && (
        <div class="bulk-bar">
          <span class="bulk-count">{selected.size} selected</span>
          <button type="button" class="btn-secondary" onClick={() => setSelected(new Set())}>
            <Icon name="x" size={14} /> Clear
          </button>
          <button type="button" class="btn-primary" disabled={bulkBusy} onClick={bulkRemind}>
            <Icon name="mail" size={14} /> Send reminder
          </button>
          <button type="button" class="btn-danger" disabled={bulkBusy} onClick={bulkCancel}>
            <Icon name="x" size={14} /> Cancel
          </button>
        </div>
      )}

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot>
          <SkTable
            headers={['', 'Student', 'Class', 'School / District', 'Program', 'Guardian', 'Status', 'Payment', 'Submitted']}
            rows={6}
          />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No registrations match the current filter.</p>
          {activeFilterCount > 0 && (
            <p class="muted">Try <button type="button" class="link" onClick={resetFilters}>resetting filters</button>.</p>
          )}
        </div>
      )}

      {data && data.rows.length > 0 && (
        <>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:32px;">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={selectAllOnPage}
                      aria-label="Select page"
                    />
                  </th>
                  <Th label="Student" sortKey="student" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="Class"   sortKey="class"   current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th>School / District</th>
                  <th>Program</th>
                  <th>Guardian</th>
                  <th>Status</th>
                  <Th label="Payment" sortKey="payment" current={sortKey} dir={sortDir} onSort={toggleSort} />
                  <Th label="Submitted" sortKey="created" current={sortKey} dir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.id}
                    class={`row-link${selected.has(r.id) ? ' row-selected' : ''}`}
                    onClick={(e) => {
                      // Ignore clicks on the checkbox cell - those toggle selection.
                      const tag = (e.target as HTMLElement).tagName.toLowerCase();
                      if (tag === 'input' || tag === 'label') return;
                      navigate(`/registrations/${r.id}`);
                    }}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Select ${r.student_full_name}`}
                      />
                    </td>
                    <td>
                      <div class="cell-strong">
                        {r.student_full_name}
                        {r.notes_count > 0 && (
                          <span class="notes-badge" title={`${r.notes_count} note${r.notes_count === 1 ? '' : 's'}`}>
                            <Icon name="file-text" size={11} /> {r.notes_count}
                          </span>
                        )}
                      </div>
                      {r.bdmso_id
                        ? <div class="cell-sub cell-id">{r.bdmso_id}</div>
                        : <div class="cell-sub">No BdMSO ID yet</div>}
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
                      <PaymentCell status={r.payment_status} amount={r.payment_amount} coupon={r.payment_coupon} />
                    </td>
                    <td class="cell-sub">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pager
            offset={offset}
            limit={PAGE_SIZE}
            total={data.total}
            onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            onNext={() => setOffset(offset + PAGE_SIZE)}
          />
        </>
      )}
    </>
  );
}

function Th({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: string; current: string; dir: 'asc'|'desc'; onSort: (k: any) => void;
}) {
  const active = current === sortKey;
  return (
    <th class="th-sortable" onClick={() => onSort(sortKey)}>
      <span style="display:inline-flex;align-items:center;gap:4px;">
        {label}
        {active && <span class="th-arrow">{dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );
}

function Pager({ offset, limit, total, onPrev, onNext }: {
  offset: number; limit: number; total: number; onPrev: () => void; onNext: () => void;
}) {
  const start = total === 0 ? 0 : offset + 1;
  const end   = Math.min(offset + limit, total);
  return (
    <div class="pager">
      <span class="muted">{start.toLocaleString()}-{end.toLocaleString()} of {total.toLocaleString()}</span>
      <button type="button" class="btn-secondary" disabled={offset === 0} onClick={onPrev}>← Prev</button>
      <button type="button" class="btn-secondary" disabled={end >= total} onClick={onNext}>Next →</button>
    </div>
  );
}

function ChipSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string,string][];
}) {
  return (
    <label class={`chip${value ? ' chip-active' : ''}`}>
      <span class="chip-label">{label}</span>
      <select value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function ChipToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" class={`chip chip-toggle${active ? ' chip-active' : ''}`} onClick={onClick}>
      <span class="chip-label">{label}</span>
    </button>
  );
}

function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <label class={`chip${from || to ? ' chip-active' : ''}`}>
      <span class="chip-label">Date</span>
      <span style="display:flex;gap:4px;align-items:center;">
        <DateField value={from} onChange={onFrom} ariaLabel="From" />
        <span class="muted">→</span>
        <DateField value={to} onChange={onTo} ariaLabel="To" />
      </span>
    </label>
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

function PaymentCell({ status, amount, coupon }: { status: Row['payment_status']; amount: number | null; coupon: string | null }) {
  if (!status) return <span class="muted">-</span>;
  const tone = status === 'paid' ? 'ok' : status === 'failed' ? 'bad' : 'warn';
  return (
    <div>
      <span class={`badge badge-${tone}`}>{status}</span>
      <div class="cell-sub">{formatBdt(amount)}{coupon ? ` · ${coupon}` : ''}</div>
    </div>
  );
}
