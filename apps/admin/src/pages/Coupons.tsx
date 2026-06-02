// Coupons admin. List + create + inline edit. Coupons with redemptions
// can't be hard-deleted (would orphan payments.coupon_code history) -
// expire them instead by setting expires_at to a past date.

import { useEffect, useState } from 'preact/hooks';
import { DateField } from '../components/DateField';
import { api, ApiError } from '../api';
import { SkRoot, SkTable } from '../components/Skeleton';

type Row = {
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  applies_to: string | null;
  expires_at: string | null;
  created_at: string;
};

type Summary = {
  total: number;
  active: number;
  expired: number;
  exhausted: number;
  total_redemptions: number;
};

type Response = {
  ok: true;
  rows: Row[];
  summary: Summary;
  filter: { q: string | null; limit: number };
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function discountLabel(r: Row): string {
  return r.discount_type === 'percent'
    ? `${r.discount_value}% off`
    : `৳${Number(r.discount_value).toLocaleString('en-BD')} off`;
}

function isExpired(r: Row): boolean {
  return !!(r.expires_at && new Date(r.expires_at) <= new Date());
}

function isExhausted(r: Row): boolean {
  return r.max_uses != null && r.used_count >= r.max_uses;
}

export function Coupons() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [editing,  setEditing]  = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  function load() {
    setError(null);
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    api.get<Response>(`/api/admin/coupons${qs}`)
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }

  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query]);

  async function expireNow(code: string) {
    if (!confirm(`Expire coupon "${code}" right now?`)) return;
    setBusy(true);
    try {
      await api.patch<{ ok: true }>(`/api/admin/coupons/${code}`, {
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      });
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally { setBusy(false); }
  }

  async function destroy(code: string, usedCount: number) {
    if (usedCount > 0) {
      alert(`Coupon "${code}" has been used ${usedCount} time(s). Expire it instead.`);
      return;
    }
    if (!confirm(`Delete coupon "${code}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/coupons/${code}`);
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally { setBusy(false); }
  }

  // Bulk-mint N codes of shape `<PREFIX>-XXXXX` with the same discount.
  // Prompt-driven because the form would dwarf the rest of the page; the
  // generated CSV is downloaded immediately so the admin can hand it to a
  // partner without touching the database.
  async function bulkGenerate() {
    const prefix = prompt('Prefix for the batch (uppercase letters/digits, e.g. PARTNER):', 'PARTNER');
    if (!prefix) return;
    const count = Number(prompt('How many codes? (max 500)', '50') || '0');
    if (!Number.isFinite(count) || count <= 0) return;
    const type = prompt('Discount type — "percent" or "fixed":', 'percent');
    if (type !== 'percent' && type !== 'fixed') { alert('Type must be "percent" or "fixed".'); return; }
    const value = Number(prompt(`Discount ${type === 'percent' ? 'percent (1-100)' : 'amount (BDT)'}:`, type === 'percent' ? '20' : '500') || '0');
    if (!Number.isFinite(value) || value <= 0) return;
    const maxUsesRaw = prompt('Max uses per code (blank for unlimited):', '1');
    const max_uses_per_code = maxUsesRaw == null || maxUsesRaw.trim() === '' ? null : Math.max(1, Math.floor(Number(maxUsesRaw)));
    const expires = prompt('Expires YYYY-MM-DD (blank for no expiry):', '');
    const applies_to = prompt('Applies to (comma-separated program slugs, blank for all):', '');

    setBusy(true);
    try {
      const r = await api.post<{ codes: string[]; generated: number; requested: number }>(
        '/api/admin/coupons/bulk-generate',
        { prefix, count, discount_type: type, discount_value: value,
          max_uses_per_code, expires_at: expires?.trim() || null,
          applies_to: applies_to?.trim() || null,
        },
      );
      // Download CSV with the generated codes.
      const blob = new Blob([
        ['Code', 'Discount', 'Max uses'].join(',') + '\n' +
        r.codes.map((c) => [c, `${value} ${type}`, max_uses_per_code ?? 'unlimited'].join(',')).join('\n'),
      ], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `bdmso-coupons-${prefix}-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      alert(`Generated ${r.generated} of ${r.requested} codes. CSV downloaded.`);
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
        <div>
          <h1>Coupons</h1>
          <p class="sub">Partner discounts and scholarship codes. Codes are case-insensitive.</p>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn-secondary" onClick={bulkGenerate}>
            Bulk generate…
          </button>
          <button type="button" class="btn-primary" onClick={() => { setCreating(true); setEditing(null); }}>
            New coupon
          </button>
        </div>
      </div>

      {data && (
        <div class="stat-row">
          <Stat label="Total"        value={data.summary.total} />
          <Stat label="Active"       value={data.summary.active}            tone="ok" />
          <Stat label="Expired"      value={data.summary.expired}           tone="muted" />
          <Stat label="Redemptions"  value={data.summary.total_redemptions} />
        </div>
      )}

      <div class="toolbar">
        <label style="flex:1;min-width:240px;">
          <span>Search</span>
          <input
            type="search"
            placeholder="code, applies-to slug…"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            style="min-width:100%;"
          />
        </label>
      </div>

      {creating && (
        <CouponForm
          coupon={null}
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot>
          <SkTable headers={['Code', 'Discount', 'Used', 'Applies to', 'Expires', 'Status']} rows={5} />
        </SkRoot>
      )}

      {data && data.rows.length === 0 && (
        <div class="empty">
          <p>No coupons yet.</p>
          <p class="muted">Create one to start offering partner discounts.</p>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Used</th>
                <th>Applies to</th>
                <th>Expires</th>
                <th>Status</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <>
                  <tr>
                    <td><code>{r.code}</code></td>
                    <td><strong>{discountLabel(r)}</strong></td>
                    <td>
                      {r.used_count}
                      {r.max_uses != null && <span class="cell-sub"> / {r.max_uses}</span>}
                    </td>
                    <td>
                      {r.applies_to
                        ? <span class="cell-sub">{r.applies_to}</span>
                        : <span class="muted">All programs</span>}
                    </td>
                    <td class="cell-sub">{formatDate(r.expires_at)}</td>
                    <td>
                      {isExpired(r)   ? <span class="badge badge-muted">expired</span>
                      : isExhausted(r) ? <span class="badge badge-muted">exhausted</span>
                      : <span class="badge badge-ok">active</span>}
                    </td>
                    <td style="text-align:right;white-space:nowrap;">
                      <button type="button" class="btn-secondary" disabled={busy}
                              onClick={() => setEditing(editing === r.code ? null : r.code)}>
                        {editing === r.code ? 'Cancel' : 'Edit'}
                      </button>{' '}
                      {!isExpired(r) && (
                        <button type="button" class="btn-secondary" disabled={busy} onClick={() => expireNow(r.code)}>
                          Expire
                        </button>
                      )}{' '}
                      <button type="button" class="btn-danger" disabled={busy} onClick={() => destroy(r.code, r.used_count)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  {editing === r.code && (
                    <tr>
                      <td colspan={7} style="padding:0;background:var(--bg-alt);">
                        <CouponForm
                          coupon={r}
                          onCancel={() => setEditing(null)}
                          onSaved={() => { setEditing(null); load(); }}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CouponForm({ coupon, onCancel, onSaved }: {
  coupon: Row | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isNew = coupon === null;
  const [code,          setCode]          = useState<string>(coupon?.code || '');
  const [discountType,  setDiscountType]  = useState<'percent' | 'fixed'>(coupon?.discount_type || 'percent');
  const [discountValue, setDiscountValue] = useState<string>(coupon ? String(coupon.discount_value) : '');
  const [maxUses,       setMaxUses]       = useState<string>(coupon?.max_uses != null ? String(coupon.max_uses) : '');
  const [appliesTo,     setAppliesTo]     = useState<string>(coupon?.applies_to || '');
  const [expiresAt,     setExpiresAt]     = useState<string>(coupon?.expires_at ? coupon.expires_at.slice(0, 10) : '');
  const [busy,          setBusy]          = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        discount_type: discountType,
        discount_value: Number(discountValue),
        max_uses: maxUses === '' ? null : Number(maxUses),
        applies_to: appliesTo.trim() || null,
        // Treat date input as end-of-day UTC so a coupon dated "today" doesn't expire mid-morning.
        expires_at: expiresAt ? `${expiresAt}T23:59:59Z` : null,
      };
      if (isNew) {
        await api.post<{ ok: true }>('/api/admin/coupons', { code: code.trim().toUpperCase(), ...payload });
      } else {
        await api.patch<{ ok: true }>(`/api/admin/coupons/${coupon!.code}`, payload);
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={isNew ? "margin-bottom:18px;" : ""}>
      <div class="form-grid">
        <Field label="Code">
          <input type="text" required disabled={!isNew} value={code}
                 onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} />
        </Field>
        <Field label="Discount type">
          <select value={discountType}
                  onChange={(e) => setDiscountType((e.target as HTMLSelectElement).value as 'percent' | 'fixed')}>
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed BDT off</option>
          </select>
        </Field>
        <Field label={discountType === 'percent' ? 'Percent (1–100)' : 'BDT off'}>
          <input type="number" required min={1} step="0.01" value={discountValue}
                 onInput={(e) => setDiscountValue((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Max uses" hint="Leave blank for unlimited.">
          <input type="number" min={0} value={maxUses}
                 onInput={(e) => setMaxUses((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Applies to" full hint="Comma-separated program slugs. Blank = all programs.">
          <input type="text" value={appliesTo} placeholder="e.g. stem-foundation,lab-day"
                 onInput={(e) => setAppliesTo((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Expires" hint="Blank = never. Otherwise the coupon stops working at end of this day.">
          <DateField value={expiresAt} onChange={setExpiresAt} />
        </Field>
      </div>

      {error && <div class="error" style="margin-top:12px;">{error}</div>}

      <div class="action-row" style="margin-top:14px;">
        <button type="submit" class="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : isNew ? 'Create coupon' : 'Save changes'}
        </button>
        <button type="button" class="btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: any }) {
  return (
    <div class={`field${full ? ' field-full' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <p class="field-hint">{hint}</p>}
    </div>
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
