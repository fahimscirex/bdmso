// Triage inbox - consolidated queue of items needing admin attention.
// Pulls from /api/admin/triage which merges stuck regs + failed payments
// + unread sponsorships + expiring coupons into one urgency-sorted list.
//
// Per-admin snooze/dismiss state lives in the triage_state D1 table so a
// dismissal sticks across reloads. Each item links to the relevant
// list/detail view so the admin can act from there.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';
import { navigate } from '../router';
import { SkRoot, SkCard } from '../components/Skeleton';
import { Icon } from '../components/Icon';

type Urgency = 'high' | 'medium' | 'low';
type Item = {
  kind: 'failed_payment' | 'stuck_reg' | 'sponsorship' | 'expiring_coupon';
  id: string;
  urgency: Urgency;
  title: string;
  detail: string;
  timestamp: string | null;
  link: string;
};
type Response = {
  ok: true;
  items: Item[];
  counts: { total: number; high: number; medium: number; low: number };
};

export function Triage() {
  const [data,  setData]  = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    setData(null);
    api.get<Response>('/api/admin/triage')
      .then(setData)
      .catch((err: ApiError) => setError(err.message));
  }
  useEffect(load, []);

  async function snooze(it: Item, hours: number) {
    try {
      await api.post<{ ok: true }>('/api/admin/triage/snooze', { kind: it.kind, id: it.id, hours });
      load();
    } catch (err) { alert((err as Error).message); }
  }
  async function dismiss(it: Item) {
    if (!confirm(`Dismiss "${it.title}"? It won't reappear in your triage view.`)) return;
    try {
      await api.post<{ ok: true }>('/api/admin/triage/dismiss', { kind: it.kind, id: it.id });
      load();
    } catch (err) { alert((err as Error).message); }
  }

  return (
    <>
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;">
        <div>
          <h1>Triage</h1>
          <p class="sub">Items that need admin action - failed payments, stuck registrations, new sponsorships, expiring coupons. Snooze or dismiss each row when handled.</p>
        </div>
        <button type="button" class="btn-secondary" onClick={load}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      {error && <div class="error">{error}</div>}
      {!data && !error && (
        <SkRoot>
          <SkCard lines={6} />
        </SkRoot>
      )}

      {data && (
        <>
          <div class="triage-counts">
            <span class="triage-count-dot triage-count-high">{data.counts.high} high</span>
            <span class="triage-count-dot triage-count-medium">{data.counts.medium} medium</span>
            <span class="triage-count-dot triage-count-low">{data.counts.low} low</span>
            <span style="margin-left:auto;color:var(--ink-3);">{data.counts.total} total</span>
          </div>

          {data.items.length === 0 ? (
            <div class="card" style="text-align:center;padding:36px;">
              <Icon name="sparkle" size={28} class="muted" />
              <h2 style="margin:12px 0 6px;">All clear</h2>
              <p class="muted" style="margin:0;">Nothing in the queue right now. Check back later or come back when something needs attention.</p>
            </div>
          ) : (
            <div class="triage-list">
              {data.items.map((it) => (
                <div key={`${it.kind}:${it.id}`} class="triage-item">
                  <div class={`triage-urgency ${it.urgency}`} />
                  <div class="triage-body" onClick={() => navigate(it.link)}>
                    <p class="triage-title">{it.title}</p>
                    <div class="triage-detail">{it.detail}</div>
                  </div>
                  <div class="triage-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" class="btn-secondary" onClick={() => snooze(it, 24)} title="Snooze 24h">
                      24h
                    </button>
                    <button type="button" class="btn-secondary" onClick={() => snooze(it, 168)} title="Snooze 7d">
                      7d
                    </button>
                    <button type="button" class="btn-secondary" onClick={() => dismiss(it)} title="Dismiss">
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
