// Top-bar layout for the signed-in guardian UI. Parents have just
// two routes (Home, Profile) — a horizontal tabs strip is friendlier
// than a sidebar at this size.

import type { ComponentChildren } from 'preact';
import { navigate, href } from '../router';

type Section = { label: string; href: string };

const NAV: Section[] = [
  { label: 'Home',    href: '/' },
  { label: 'Profile', href: '/profile' },
];

type Props = {
  currentRoute: string;
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  children: ComponentChildren;
};

export function Shell({ currentRoute, userName, userEmail, onSignOut, children }: Props) {
  return (
    <div class="gd-layout">
      <header class="gd-header">
        <a class="gd-brand" href={href('/')} onClick={(e) => { e.preventDefault(); navigate('/'); }}>
          <div class="brand-mark">Bd</div>
          <div>
            <div class="brand-name">BdMSO</div>
            <div class="brand-sub">Guardian dashboard</div>
          </div>
        </a>

        <nav class="gd-tabs">
          {NAV.map((s) => {
            const active = s.href === '/' ? currentRoute === '/' : currentRoute.startsWith(s.href);
            return (
              <a
                href={href(s.href)}
                class={`gd-tab${active ? ' active' : ''}`}
                onClick={(e) => { e.preventDefault(); navigate(s.href); }}
              >{s.label}</a>
            );
          })}
        </nav>

        <div class="gd-user">
          <div class="gd-user-meta">
            <div class="gd-user-name">{userName}</div>
            <div class="gd-user-email">{userEmail}</div>
          </div>
          <button type="button" class="link" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <main class="gd-main">{children}</main>
    </div>
  );
}
