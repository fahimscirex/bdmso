// Notification bell + dropdown for the dashboard subnav. A bell button
// (with an unread count badge) opens a popover listing notifications
// derived from the guardian's registrations. Read state is persisted
// in localStorage since there is no server-side notifications table.

import { useEffect, useRef, useState } from 'preact/hooks';

export type Notice = {
  id: string;
  kind: 'info' | 'warn' | 'ok' | 'danger';
  title: string;
  text: string;
  href?: string;
  at?: string;        // ISO timestamp, when known
};

type Registration = {
  id: string;
  registration_type: string;
  program_label: string;       // catalog-derived, from /api/me
  student_full_name: string;
  status: 'submitted' | 'paid' | 'cancelled';
  member_id: string | null;
  payment_status: 'pending' | 'paid' | 'failed' | null;
  payment_date: string | null;
  created_at: string;
  // registration_ends drives the per-program edit/pay window. Used
  // by the "Payment due by" and "Edit deadline approaching" notices
  // - one date per program, surfaced in two different voices.
  registration_ends: string | null;
  edit_window_open: boolean;
};

type MeResponse = {
  ok: true;
  account: { email: string; emailVerified: boolean };
  registrations: Registration[];
};

const READ_KEY = 'bdmso_notif_read';

// Read state lives in sessionStorage, not localStorage - so dismissing
// a notification only hides it for the current browser session. Next
// session it surfaces again (e.g. an unpaid registration keeps
// reminding the guardian every time they come back).
export function loadReadIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(READ_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
export function saveReadIds(ids: Set<string>) {
  try { sessionStorage.setItem(READ_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

// Whole days from today to an ISO yyyy-mm-dd date. Negative when the
// date is already in the past; null when the input is missing or
// unparseable.
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso + 'T23:59:59');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < 60_000)   return 'Just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < day)       return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * day)   return `${Math.round(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function buildNotices(data: MeResponse): Notice[] {
  const out: Notice[] = [];

  if (!data.account.emailVerified) {
    out.push({
      id: 'verify-email',
      kind: 'warn',
      title: 'Action needed',
      text: `Verify ${data.account.email} to receive receipts and admit cards.`,
    });
  }

  for (const r of data.registrations) {
    if (r.status === 'cancelled') continue;
    const short = r.program_label;
    const who = r.student_full_name.split(' ')[0];

    if (r.payment_status === 'paid') {
      out.push({
        id: `paid-${r.id}`,
        kind: 'ok',
        title: 'Payment confirmed',
        text: `${short} for ${who} is paid - your receipt is ready to download.`,
        at: r.payment_date || undefined,
      });
      if (r.member_id) {
        out.push({
          id: `id-${r.id}`,
          kind: 'info',
          title: 'BdMSO ID issued',
          text: `${who}'s BdMSO ID is ${r.member_id}. Use it across every program.`,
          at: r.payment_date || undefined,
        });
      }
      // Edit deadline approaching: fire within the last 7 days of
      // the program's registrationEnds window since that's also the
      // edit window. Surfaces details a guardian can still change
      // (subject preference, exam region, options) before it locks.
      if (r.edit_window_open && r.registration_ends) {
        const days = daysUntil(r.registration_ends);
        if (days != null && days <= 7) {
          out.push({
            id: `edit-deadline-${r.id}`,
            kind: 'warn',
            title: days <= 0 ? 'Edit deadline today' : 'Edit deadline approaching',
            text: `${days <= 0 ? 'Today is' : `${days} day${days === 1 ? '' : 's'} left to`} update ${who}'s ${short} details (subject, exam region${r.registration_type === 'national-quiz-competition' ? '' : ', options'}).`,
            at: r.registration_ends,
          });
        }
      }
    } else if (r.payment_status === 'failed') {
      out.push({
        id: `failed-${r.id}`,
        kind: 'danger',
        title: 'Payment failed',
        text: `Payment for ${short} didn't go through - try again from the dashboard.`,
        at: r.created_at,
      });
    } else if (r.status === 'submitted') {
      // Surface the deadline in the body so guardians know how long
      // they have. Falls back to the original generic sentence when
      // a program has no registrationEnds.
      const deadlineText = r.registration_ends
        ? ` Closes ${formatDate(r.registration_ends)}.`
        : '';
      out.push({
        id: `due-${r.id}`,
        kind: 'warn',
        title: 'Payment due',
        text: `${short} for ${who} isn't complete until payment is made.${deadlineText}`,
        at: r.created_at,
      });
    }
  }

  out.push({
    id: 'admit-soon',
    kind: 'info',
    title: 'Reminder',
    text: 'Admit cards open about a week before each program date.',
  });

  return out;
}

export function NotificationTicker() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen]       = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/me', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setNotices(buildNotices(d)); })
      .catch(() => { /* leave empty */ });
  }, []);

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Only unread notices are shown - dismissing one (or "Mark all read")
  // removes it from the box. State-derived notices (e.g. "Payment due")
  // also drop off on their own once the underlying issue is resolved.
  const visible = notices.filter((n) => !readIds.has(n.id));
  const unread = visible.length;

  function markAllRead() {
    const all = new Set(notices.map((n) => n.id));
    setReadIds(all);
    saveReadIds(all);
  }

  function dismiss(id: string) {
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    saveReadIds(next);
  }

  return (
    <div class="notif" ref={ref}>
      <button
        type="button"
        class={`notif-bell-btn${open ? ' is-open' : ''}`}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 && <span class="notif-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div class="notif-panel" role="dialog" aria-label="Notifications">
          <div class="notif-panel-head">
            <span class="notif-panel-title">Notifications</span>
            {unread > 0 && (
              <button type="button" class="notif-panel-action" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div class="notif-panel-list">
            {visible.length === 0 ? (
              <div class="notif-empty">You're all caught up.</div>
            ) : (
              visible.map((n) => (
                <NotifRow key={n.id} n={n} onDismiss={() => dismiss(n.id)} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifRow({ n, onDismiss }: { n: Notice; onDismiss: () => void }) {
  const inner = (
    <>
      <span class={`notif-row-dot tone-${n.kind}`} aria-hidden="true" />
      <div class="notif-row-body">
        <div class="notif-row-top">
          <span class="notif-row-title">{n.title}</span>
          {n.at && <span class="notif-row-time">{relativeTime(n.at)}</span>}
        </div>
        <p class="notif-row-text">{n.text}</p>
      </div>
      <button
        type="button"
        class="notif-row-dismiss"
        aria-label="Dismiss notification"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
      >
        ×
      </button>
    </>
  );
  return n.href
    ? <a class="notif-row is-unread" href={n.href}>{inner}</a>
    : <div class="notif-row is-unread">{inner}</div>;
}

function getToken(): string {
  try {
    const raw = localStorage.getItem('bdmso_user');
    return raw ? (JSON.parse(raw)?.token || '') : '';
  } catch { return ''; }
}
