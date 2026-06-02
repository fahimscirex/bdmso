// Payment reports - revenue + count grouped by day/week/month, plus
// lifetime breakdowns by payment method and coupon usage. CSV export
// of each table for finance ops.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { DateField } from '../components/DateField';
import { api, ApiError } from '../api';
import { navigate, href } from '../router';
import { SkRoot, SkCard } from '../components/Skeleton';
import { Sparkline } from '../components/Sparkline';
import { toCsv, downloadCsv } from '../csv';
import { Icon } from '../components/Icon';

type Bucket = { bucket: string; count: number; revenue: number };
type ByMethod = { method: string; count: number; revenue: number };
type ByCoupon = { coupon: string; count: number; revenue: number };

type Response = {
  ok: true;
  period: 'day' | 'week' | 'month';
  from: string | null; to: string | null;
  buckets: Bucket[];
  byMethod: ByMethod[];
  byCoupon: ByCoupon[];
};

function formatBdt(n: number): string {
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

export function PaymentReports() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setData(null);
    const qs = [`period=${period}`];
    if (from) qs.push(`from=${encodeURIComponent(from)}`);
    if (to)   qs.push(`to=${encodeURIComponent(to)}`);
    api.get<Response>(`/api/admin/payments/reports?${qs.join('&')}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }, [period, from, to]);

  const totals = useMemo(() => {
    if (!data) return null;
    return data.buckets.reduce((acc, b) => ({
      count: acc.count + b.count, revenue: acc.revenue + b.revenue,
    }), { count: 0, revenue: 0 });
  }, [data]);

  function exportBuckets() {
    if (!data) return;
    downloadCsv(
      `bdmso-revenue-${period}-${new Date().toISOString().slice(0,10)}.csv`,
      toCsv(['Bucket', 'Count', 'Revenue (BDT)'], data.buckets.map((b) => [b.bucket, b.count, b.revenue])),
    );
  }

  return (
    <>
      <a class="back-link" href={href('/payments')} onClick={(e) => { e.preventDefault(); navigate('/payments'); }}>← Payments</a>

      <div class="page-header">
        <h1>Payment reports</h1>
        <p class="sub">Revenue + transaction counts grouped by period, plus lifetime breakdowns.</p>
      </div>

      <div class="chip-row">
        <label class={`chip${period !== 'day' ? '' : ' chip-active'}`}>
          <span class="chip-label">Period</span>
          <select value={period} onChange={(e) => setPeriod((e.target as HTMLSelectElement).value as any)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <label class={`chip${from || to ? ' chip-active' : ''}`}>
          <span class="chip-label">Range</span>
          <span style="display:flex;gap:4px;align-items:center;">
            <DateField value={from} onChange={setFrom} ariaLabel="From" />
            <span class="muted">→</span>
            <DateField value={to} onChange={setTo} ariaLabel="To" />
          </span>
        </label>
        <button type="button" class="btn-secondary" disabled={!data} onClick={exportBuckets}>
          <Icon name="download" size={14} /> Export CSV
        </button>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot>
          <SkCard title="Revenue by period" lines={6} />
          <div class="detail-grid">
            <SkCard title="By payment method" lines={4} />
            <SkCard title="By coupon" lines={4} />
          </div>
        </SkRoot>
      )}

      {data && (
        <>
          {totals && (
            <div class="stat-row">
              <div class="stat stat-ok">
                <div class="stat-value">{formatBdt(totals.revenue)}</div>
                <div class="stat-label">Total revenue (in range)</div>
              </div>
              <div class="stat">
                <div class="stat-value">{totals.count}</div>
                <div class="stat-label">Paid transactions</div>
              </div>
              <div class="stat">
                <div class="stat-value">{data.buckets.length}</div>
                <div class="stat-label">{period === 'day' ? 'Days' : period === 'week' ? 'Weeks' : 'Months'} with revenue</div>
              </div>
              <div class="stat">
                <div class="stat-value">{formatBdt(totals.count > 0 ? Math.round(totals.revenue / totals.count) : 0)}</div>
                <div class="stat-label">Avg per transaction</div>
              </div>
            </div>
          )}

          <section class="card">
            <h2>Revenue by {period}</h2>
            {data.buckets.length === 0 ? (
              <p class="muted">No paid payments in this range.</p>
            ) : (
              <>
                <Sparkline data={data.buckets.map((b) => b.revenue)} tone="green" height={56} />
                <div class="table-wrap" style="margin-top:14px;">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>{period === 'day' ? 'Date' : period === 'week' ? 'Week' : 'Month'}</th>
                        <th>Count</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.buckets.slice().reverse().map((b) => (
                        <tr key={b.bucket}>
                          <td>{b.bucket}</td>
                          <td>{b.count}</td>
                          <td><strong>{formatBdt(b.revenue)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <div class="detail-grid">
            <section class="card">
              <h2>By payment method (lifetime)</h2>
              {data.byMethod.length === 0
                ? <p class="muted" style="margin:0;">No paid payments yet.</p>
                : <Breakdown rows={data.byMethod.map((m) => ({ label: m.method, count: m.count, revenue: m.revenue }))} />}
            </section>
            <section class="card">
              <h2>By coupon (lifetime)</h2>
              {data.byCoupon.length === 0
                ? <p class="muted" style="margin:0;">No paid payments yet.</p>
                : <Breakdown rows={data.byCoupon.map((c) => ({ label: c.coupon, count: c.count, revenue: c.revenue }))} />}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Breakdown({ rows }: { rows: { label: string; count: number; revenue: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line-2);">
          <div class="cell-strong" style="flex:0 0 40%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{r.label}</div>
          <div style="flex:1;background:var(--line);border-radius:999px;height:8px;">
            <div style={`background:var(--green);height:8px;border-radius:999px;width:${Math.round((r.revenue / max) * 100)}%;`} />
          </div>
          <div style="flex:0 0 auto;white-space:nowrap;font-size:13px;">
            <strong>{formatBdt(r.revenue)}</strong> <span class="cell-sub">· {r.count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
