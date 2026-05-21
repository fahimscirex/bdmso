// Layout wrapper for the signed-in guardian UI. The header + footer
// come from the marketing site's /js/site.js (loaded once below), so
// the dashboard sits inside the exact same chrome a parent sees on
// /programs, /blog, etc. Don't render brand/logo/nav here - site.js
// fills #site-header and #site-footer based on body[data-page] and
// localStorage.bdmso_user.
//
// Between header and footer we render a thin "dashboard sub-nav" (Home,
// Profile) and the page content. The sub-nav is scoped enough not to
// duplicate the marketing primary nav.

import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { navigate, href } from '../router';
import { NotificationTicker } from './NotificationTicker';
import { PaymentBanner } from './PaymentBanner';

type Section = { label: string; href: string };

const NAV: Section[] = [
  { label: 'Home',    href: '/' },
  { label: 'Profile', href: '/profile' },
];

// Loaded once per mount. Doing this in a layout effect (vs <script> in
// index.html) keeps the SPA bundle free of marketing assumptions and
// lets us re-render the chrome after sign-in without a hard reload.
let sitejsLoaded = false;
function loadSiteJs() {
  if (sitejsLoaded) {
    // Re-trigger render - site.js binds on DOMContentLoaded which has
    // already fired by now in a SPA navigation, so we need to nudge it.
    document.dispatchEvent(new Event('DOMContentLoaded'));
    return;
  }
  const s = document.createElement('script');
  s.src = '/js/site.js';
  s.async = false;
  document.head.appendChild(s);
  sitejsLoaded = true;
}

type Props = {
  currentRoute: string;
  children: ComponentChildren;
};

export function Shell({ currentRoute, children }: Props) {
  // The marketing nav highlights based on body[data-page]. "dashboard"
  // isn't in its primary NAV list so nothing lights up, which is the
  // intended behaviour - the Dashboard CTA in the header acts as the
  // visual marker that you're signed in.
  useEffect(() => {
    document.body.dataset.page = 'dashboard';
    loadSiteJs();
  }, []);

  return (
    <>
      <PaymentBanner />
      <div id="site-header"></div>

      <main class="gd-content">
        <div class="container gd-subnav">
          <nav class="gd-tabs" aria-label="Dashboard sections">
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
          <NotificationTicker />
        </div>

        <div class="container gd-page">{children}</div>
      </main>

      <div id="site-footer"></div>
    </>
  );
}
