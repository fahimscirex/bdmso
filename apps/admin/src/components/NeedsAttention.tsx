// Needs-attention widget for the dashboard. Renders a compact list of
// counts/actions that need an operator look. Each item links to a
// pre-filtered list view so a click takes them straight to the work.
//
// Server fills `attention` via /api/admin/analytics. Zero-count items
// are hidden; if ALL are zero we render a friendly "all clear" state.

import { navigate } from '../router';
import { Icon } from './Icon';

type Coupon = { code: string; expires_at: string; used_count: number; max_uses: number | null };

type Attention = {
  stuck_unpaid: number;
  recent_failed: number;
  unread_sponsorships: number;
  expiring_coupons: number;
  expiring_list: Coupon[];
};

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function NeedsAttention({ data }: { data: Attention }) {
  const items: {
    key: string;
    count: number;
    label: string;
    tone: 'amber' | 'red' | 'navy';
    href: string;
    hint?: string;
  }[] = [];

  if (data.recent_failed > 0) {
    items.push({
      key: 'failed',
      count: data.recent_failed,
      label: 'Failed payments',
      tone: 'red',
      href: '/payments',
      hint: 'in the last 7 days',
    });
  }
  if (data.stuck_unpaid > 0) {
    items.push({
      key: 'stuck',
      count: data.stuck_unpaid,
      label: 'Registrations stuck >72h',
      tone: 'amber',
      href: '/registrations',
      hint: 'submitted, never paid',
    });
  }
  if (data.unread_sponsorships > 0) {
    items.push({
      key: 'sponsor',
      count: data.unread_sponsorships,
      label: 'New sponsorship enquiries',
      tone: 'amber',
      href: '/sponsorships',
      hint: 'unread',
    });
  }
  if (data.expiring_coupons > 0) {
    items.push({
      key: 'coupon',
      count: data.expiring_coupons,
      label: 'Coupons expiring this week',
      tone: 'amber',
      href: '/coupons',
      hint: data.expiring_list.map((c) => `${c.code} · ${fmtDate(c.expires_at)}`).join(', '),
    });
  }

  if (items.length === 0) {
    return (
      <section class="card needs-attention needs-attention-empty">
        <div class="needs-attention-head">
          <Icon name="sparkle" size={18} />
          <h2>All clear</h2>
        </div>
        <p class="muted" style="margin:0;">
          No stuck payments, no unread sponsorships, no expiring coupons. Nothing to action right now.
        </p>
      </section>
    );
  }

  return (
    <section class="card needs-attention">
      <div class="needs-attention-head">
        <Icon name="alert" size={18} />
        <h2>Needs your attention</h2>
      </div>
      <ul class="needs-attention-list">
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              class={`attention-item attention-${it.tone}`}
              onClick={() => navigate(it.href)}
            >
              <span class="attention-count">{it.count}</span>
              <span class="attention-body">
                <span class="attention-label">{it.label}</span>
                {it.hint && <span class="attention-hint">{it.hint}</span>}
              </span>
              <Icon name="chevron-right" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
