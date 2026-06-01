// Sidebar + header layout for the signed-in admin UI. Pages render in the
// main content area via children. Iconography is inline SVG (see Icon.tsx)
// to keep the bundle lean. Theme toggle persists to localStorage and the
// preference is applied via <html data-theme="dark"> so CSS tokens flip
// without a re-render.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../router';
import { Icon, type IconName } from './Icon';
import { NotificationBell } from './NotificationBell';

type Section = { label: string; href: string; icon: IconName; soon?: boolean };

const NAV: Section[] = [
  { label: 'Dashboard',     href: '/',              icon: 'dashboard' },
  { label: 'Triage',        href: '/triage',        icon: 'inbox' },
  { label: 'Registrations', href: '/registrations', icon: 'list-checks' },
  { label: 'Payments',      href: '/payments',      icon: 'wallet' },
  { label: 'Sponsorships',  href: '/sponsorships',  icon: 'megaphone' },
  { label: 'Broadcast',     href: '/broadcast',     icon: 'send' },
  { label: 'Events',        href: '/events',        icon: 'sparkle' },
  { label: 'Posts',         href: '/posts',         icon: 'file-text' },
  { label: 'Programs',      href: '/programs',      icon: 'book' },
  { label: 'Coupons',       href: '/coupons',       icon: 'tag' },
  { label: 'Users',         href: '/users',         icon: 'users' },
  { label: 'Audit log',     href: '/audit',         icon: 'history' },
  { label: 'Settings',      href: '/settings',      icon: 'settings' },
];

type Props = {
  currentRoute: string;
  userEmail: string;
  onSignOut: () => void;
  children: ComponentChildren;
};

// Reads / sets the saved theme. Defaults to "system" so the first paint
// matches the user's OS preference, then flips to whatever they picked.
function readTheme(): 'light' | 'dark' | 'system' {
  if (typeof localStorage === 'undefined') return 'system';
  const raw = localStorage.getItem('bdmso-admin-theme');
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

function applyTheme(t: 'light' | 'dark' | 'system') {
  const resolved = t === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function NavShell({ currentRoute, userEmail, onSignOut, children }: Props) {
  const [theme, setTheme] = useState(readTheme);

  // Apply on mount + whenever the choice changes. Listen to OS changes
  // only while in "system" mode so toggling between light/dark in the
  // OS settings flips the admin live.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  function go(e: Event, href: string, soon: boolean | undefined) {
    e.preventDefault();
    if (soon) return;
    navigate(href);
  }

  function cycleTheme() {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    if (next === 'system') localStorage.removeItem('bdmso-admin-theme');
    else                   localStorage.setItem('bdmso-admin-theme', next);
    setTheme(next);
  }

  return (
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">Bd</div>
          <div>
            <div class="brand-name">BdMSO</div>
            <div class="brand-sub">Admin</div>
          </div>
        </div>
        <nav>
          {NAV.map((s) => {
            const active = s.href === '/'
              ? currentRoute === '/'
              : currentRoute === s.href || currentRoute.startsWith(`${s.href}/`);
            return (
              <a
                key={s.href}
                href={`/admin${s.href === '/' ? '' : s.href}`}
                class={`nav-item${active ? ' active' : ''}${s.soon ? ' soon' : ''}`}
                onClick={(e) => go(e, s.href, s.soon)}
              >
                <Icon name={s.icon} size={17} />
                <span>{s.label}</span>
                {s.soon && <span class="badge">soon</span>}
              </a>
            );
          })}
        </nav>
        <div class="sidebar-footer">
          <button
            type="button"
            class="theme-toggle"
            onClick={cycleTheme}
            title={`Theme: ${theme} (click to cycle)`}
          >
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} />
            <span class="theme-toggle-label">{theme === 'system' ? 'auto' : theme}</span>
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <button
            type="button" class="topbar-search"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            aria-label="Open command palette"
          >
            <Icon name="search" size={15} />
            <span class="topbar-search-text">Search registrations, posts, actions…</span>
            <kbd>⌘K</kbd>
          </button>
          <div class="topbar-right">
            <NotificationBell />
            <button type="button" class="topbar-iconbtn" onClick={onSignOut} title="Sign out" aria-label="Sign out">
              <Icon name="log-out" size={15} />
            </button>
            <div class="topbar-user" title={userEmail}>
              <div class="topbar-avatar" aria-hidden="true">
                {(userEmail[0] || 'A').toUpperCase()}
              </div>
              <div class="topbar-user-text">
                <span class="topbar-email">{userEmail}</span>
                <span class="topbar-role">Admin</span>
              </div>
            </div>
          </div>
        </header>
        <div class="content">
          {children}
        </div>
      </div>
    </div>
  );
}
