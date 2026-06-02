// Sidebar + header layout for the signed-in admin UI. Pages render in the
// main content area via children. Iconography is inline SVG (see Icon.tsx)
// to keep the bundle lean. Theme toggle persists to localStorage and the
// preference is applied via <html data-theme="dark"> so CSS tokens flip
// without a re-render.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../router';
import { Icon, type IconName } from './Icon';

type Section = { label: string; href: string; icon: IconName; soon?: boolean };
type Group = { title?: string; items: Section[] };

// Grouped nav. The Content group (the growing set of site editors) is what was
// pushing the list past a single screen; groups are collapsible so unused
// sections fold away. The first group has no title and never collapses.
const GROUPS: Group[] = [
  { items: [
    { label: 'Dashboard',     href: '/',              icon: 'dashboard' },
    { label: 'Triage',        href: '/triage',        icon: 'inbox' },
  ] },
  { title: 'Operations', items: [
    { label: 'Registrations', href: '/registrations', icon: 'list-checks' },
    { label: 'Payments',      href: '/payments',      icon: 'wallet' },
    { label: 'Events',        href: '/events',        icon: 'sparkle' },
    { label: 'Coupons',       href: '/coupons',       icon: 'tag' },
  ] },
  { title: 'Content', items: [
    { label: 'Posts',         href: '/posts',         icon: 'file-text' },
    { label: 'Programs',      href: '/programs',      icon: 'book' },
    { label: 'Press',         href: '/press',         icon: 'megaphone' },
    { label: 'Hall of Fame',  href: '/hall-of-fame',  icon: 'sparkle' },
    { label: 'Medalists',     href: '/medalists',     icon: 'users' },
    { label: 'Team',          href: '/team',          icon: 'users' },
  ] },
  { title: 'Outreach', items: [
    { label: 'Sponsorships',  href: '/sponsorships',  icon: 'megaphone' },
    { label: 'Broadcast',     href: '/broadcast',     icon: 'send' },
  ] },
  { title: 'System', items: [
    { label: 'Users',         href: '/users',         icon: 'users' },
    { label: 'Audit log',     href: '/audit',         icon: 'history' },
    { label: 'Settings',      href: '/settings',      icon: 'settings' },
  ] },
];

const COLLAPSE_KEY = 'bdmso-admin-nav-collapsed';
function readCollapsed(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); }
  catch { return new Set(); }
}

type Props = {
  currentRoute: string;
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

export function NavShell({ currentRoute, onSignOut, children }: Props) {
  const [theme, setTheme] = useState(readTheme);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  const isItemActive = (href: string) =>
    href === '/' ? currentRoute === '/' : currentRoute === href || currentRoute.startsWith(`${href}/`);

  function toggleGroup(title: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

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
          {GROUPS.map((g) => {
            const hasActive = g.items.some((it) => isItemActive(it.href));
            // A titled group folds when collapsed - unless it holds the active
            // route, so the current page is never hidden. Untitled = always open.
            const folded = !!g.title && collapsed.has(g.title) && !hasActive;
            return (
              <div class="nav-group" key={g.title || 'top'}>
                {g.title && (
                  <button
                    type="button"
                    class="nav-group-header"
                    aria-expanded={!folded}
                    onClick={() => toggleGroup(g.title!)}
                  >
                    <span>{g.title}</span>
                    <Icon name="chevron-down" size={13} />
                  </button>
                )}
                {g.items.map((s) => (
                  <a
                    key={s.href}
                    href={`/admin${s.href === '/' ? '' : s.href}`}
                    class={`nav-item${isItemActive(s.href) ? ' active' : ''}${s.soon ? ' soon' : ''}`}
                    onClick={(e) => go(e, s.href, s.soon)}
                    hidden={folded}
                  >
                    <Icon name={s.icon} size={17} />
                    <span>{s.label}</span>
                    {s.soon && <span class="badge">soon</span>}
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-actions">
            <button
              type="button"
              class="theme-toggle"
              onClick={cycleTheme}
              title={`Theme: ${theme} (click to cycle)`}
            >
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} />
              <span class="theme-toggle-label">{theme === 'system' ? 'auto' : theme}</span>
            </button>
            <button type="button" class="topbar-iconbtn" onClick={onSignOut} title="Sign out" aria-label="Sign out">
              <Icon name="log-out" size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div class="main">
        <div class="content">
          {children}
        </div>
      </div>
    </div>
  );
}
