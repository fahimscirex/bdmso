// Full-width notification bar above the site header. It fetches
// /api/me itself (so it can live in the Shell, outside the router),
// builds the same notice list as the bell dropdown, and auto-rotates
// through every unread notification. Dismissing one marks it read
// (shared with the bell via localStorage); the bar hides once all
// notifications are read.

import { useEffect, useRef, useState } from 'preact/hooks';
import { navigate } from '../router';
import { buildNotices, loadReadIds, saveReadIds, type Notice } from './NotificationTicker';

const ROTATE_MS = 5000;

export function PaymentBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/me', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setNotices(buildNotices(d)); })
      .catch(() => { /* no banner on failure */ });
  }, []);

  const unread  = notices.filter((n) => !readIds.has(n.id));
  const visible = unread.length > 0;
  const current = visible ? unread[idx % unread.length] : null;

  // The marketing header is position:fixed, so to sit *above* it the
  // banner is also fixed; we then shift the header + body down by the
  // banner's measured height via a body class + CSS custom property.
  useEffect(() => {
    const body = document.body;
    function sync() {
      if (visible && ref.current) {
        document.documentElement.style.setProperty('--pay-banner-h', `${ref.current.offsetHeight}px`);
        body.classList.add('bdmso-pay-banner');
      } else {
        body.classList.remove('bdmso-pay-banner');
      }
    }
    sync();
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      body.classList.remove('bdmso-pay-banner');
    };
  }, [visible, current?.id]);

  // Auto-rotate through the unread notifications.
  useEffect(() => {
    if (unread.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % unread.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [unread.length]);

  if (!current) return null;

  // Dismiss = mark the current notice read (also clears it from the
  // bell), then fall back to the first remaining unread one.
  function dismiss() {
    if (!current) return;
    const next = new Set(readIds);
    next.add(current.id);
    setReadIds(next);
    saveReadIds(next);
    setIdx(0);
  }

  function payNow() {
    navigate('/');
    // Let the route render, then scroll to the registrations section.
    setTimeout(() => {
      document.getElementById('your-registrations')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  const showPay = current.id.startsWith('due-') || current.id.startsWith('failed-');

  return (
    <div class="pay-banner" ref={ref}>
      <div class="pay-banner-inner">
        <span class="pay-banner-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
        </span>
        <span class="pay-banner-text">
          <strong>{current.title}.</strong> {current.text}
        </span>
        {showPay && (
          <button type="button" class="pay-banner-btn" onClick={payNow}>Pay now</button>
        )}
        {unread.length > 1 && (
          <div class="pay-banner-dots" role="tablist" aria-label="Notifications">
            {unread.map((n, i) => (
              <button
                key={n.id}
                type="button"
                class={`pay-banner-dot${i === idx % unread.length ? ' is-active' : ''}`}
                aria-label={`Notification ${i + 1} of ${unread.length}`}
                onClick={() => setIdx(i)}
              />
            ))}
          </div>
        )}
        <button type="button" class="pay-banner-close" aria-label="Dismiss" onClick={dismiss}>×</button>
      </div>
    </div>
  );
}

function getToken(): string {
  try {
    const raw = localStorage.getItem('bdmso_user');
    return raw ? (JSON.parse(raw)?.token || '') : '';
  } catch { return ''; }
}
