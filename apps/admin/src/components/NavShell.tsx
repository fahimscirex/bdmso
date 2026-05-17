// Sidebar + header layout for the signed-in admin UI. Pages render in the
// main content area via children.

import type { ComponentChildren } from 'preact';
import { navigate } from '../router';

type Section = { label: string; href: string; soon?: boolean };

const NAV: Section[] = [
  { label: 'Dashboard',     href: '/' },
  { label: 'Registrations', href: '/registrations' },
  { label: 'Payments',      href: '/payments' },
  { label: 'Sponsorships',  href: '/sponsorships' },
  { label: 'Posts',         href: '/posts' },
  { label: 'Programs',      href: '/programs' },
  { label: 'Users',         href: '/users' },
  { label: 'Audit log',     href: '/audit' },
  { label: 'Settings',      href: '/settings', soon: true },
];

type Props = {
  currentRoute: string;
  userEmail: string;
  onSignOut: () => void;
  children: ComponentChildren;
};

export function NavShell({ currentRoute, userEmail, onSignOut, children }: Props) {
  function go(e: Event, href: string, soon: boolean | undefined) {
    e.preventDefault();
    if (soon) return;
    navigate(href);
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
            // Exact match for /, prefix match for /registrations vs /registrations/abc.
            const active = s.href === '/'
              ? currentRoute === '/'
              : currentRoute === s.href || currentRoute.startsWith(`${s.href}/`);
            return (
              <a
                href={`/admin${s.href === '/' ? '' : s.href}`}
                class={`nav-item${active ? ' active' : ''}${s.soon ? ' soon' : ''}`}
                onClick={(e) => go(e, s.href, s.soon)}
              >
                <span>{s.label}</span>
                {s.soon && <span class="badge">soon</span>}
              </a>
            );
          })}
        </nav>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="topbar-user">
            <span class="topbar-email">{userEmail}</span>
            <span class="topbar-role">admin</span>
          </div>
          <button type="button" class="link" onClick={onSignOut}>Sign out</button>
        </header>
        <div class="content">
          {children}
        </div>
      </div>
    </div>
  );
}
