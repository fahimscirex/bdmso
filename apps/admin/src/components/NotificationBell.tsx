// Notification bell + dropdown for the topbar. Replaces the larger
// "Needs your attention" card that previously sat above the Dashboard
// KPI tiles. Same data, much less screen real estate.
//
// Fetches /api/admin/analytics on mount and every 5 minutes so the
// badge count stays roughly current without a websocket. Clicking the
// bell opens a popover listing the same items the card used to show.
// Clicking outside closes it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api';
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

const REFRESH_MS = 5 * 60 * 1000;

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function NotificationBell() {
  const [data, setData]   = useState<Attention | null>(null);
  const [open, setOpen]   = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  function load() {
    api.get<{ attention?: Attention }>('/api/admin/analytics')
      .then((d) => { if (d.attention) setData(d.attention); })
      .catch(() => { /* swallow - the badge just stays at its previous value */ });
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // Close-on-outside-click. The handler runs on every mousedown only
  // while the popover is open; cheap and avoids an event listener war.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const items: {
    key: string;
    count: number;
    label: string;
    tone: 'amber' | 'red' | 'navy';
    href: string;
    hint?: string;
  }[] = [];

  if (data) {
    if (data.recent_failed > 0) {
      items.push({ key: 'failed', count: data.recent_failed, label: 'Failed payments', tone: 'red', href: '/payments', hint: 'in the last 7 days' });
    }
    if (data.stuck_unpaid > 0) {
      items.push({ key: 'stuck', count: data.stuck_unpaid, label: 'Registrations stuck >72h', tone: 'amber', href: '/registrations', hint: 'submitted, never paid' });
    }
    if (data.unread_sponsorships > 0) {
      items.push({ key: 'sponsor', count: data.unread_sponsorships, label: 'New sponsorship enquiries', tone: 'amber', href: '/sponsorships', hint: 'unread' });
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
  }

  const totalCount = items.reduce((sum, it) => sum + it.count, 0);

  function go(href: string) {
    navigate(href);
    setOpen(false);
  }

  return (
    <div class="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        class={`topbar-iconbtn notif-trigger${totalCount > 0 ? ' notif-has-items' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={totalCount > 0 ? `${totalCount} items need attention` : 'Notifications'}
        aria-expanded={open}
        title={totalCount > 0 ? `${totalCount} item${totalCount === 1 ? '' : 's'} need attention` : 'All clear'}
      >
        <Icon name="bell" size={15} />
        {totalCount > 0 && (
          <span class="notif-badge">{totalCount > 99 ? '99+' : totalCount}</span>
        )}
      </button>

      {open && (
        <div class="notif-popover" role="dialog" aria-label="Notifications">
          <div class="notif-head">
            <h3>{totalCount === 0 ? 'All clear' : 'Needs your attention'}</h3>
            <button type="button" class="link" onClick={() => { load(); }}>
              <Icon name="refresh" size={12} />
            </button>
          </div>
          {items.length === 0 ? (
            <div class="notif-empty">
              <Icon name="sparkle" size={20} />
              <p>Nothing to action right now.</p>
            </div>
          ) : (
            <ul class="notif-list">
              {items.map((it) => (
                <li key={it.key}>
                  <button
                    type="button"
                    class={`notif-item notif-${it.tone}`}
                    onClick={() => go(it.href)}
                  >
                    <span class="notif-item-count">{it.count}</span>
                    <span class="notif-item-body">
                      <span class="notif-item-label">{it.label}</span>
                      {it.hint && <span class="notif-item-hint">{it.hint}</span>}
                    </span>
                    <Icon name="chevron-right" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div class="notif-footer">
            <button type="button" class="link" onClick={() => go('/triage')}>
              Open Triage
              <Icon name="chevron-right" size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
