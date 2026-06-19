// BdMSO shared header + footer + small helpers
(function () {
  const CURRENT = document.body.dataset.page || '';

  const NAV_LINKS = [
    { href: '/', label: 'Home', key: 'home' },
    { href: '/about', label: 'About', key: 'about' },
    { href: '/programs', label: 'Programs', key: 'programs' },
    { href: '/resources', label: 'Resources', key: 'resources' },
    { href: '/results', label: 'Results', key: 'results' },
    { href: '/team', label: 'Team', key: 'team' },
    { href: '/blog', label: 'Blog', key: 'blog' },
    { href: '/media', label: 'Media', key: 'media' },
  ];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('bdmso_user') || 'null'); } catch { return null; }
  }

  function renderHeader() {
    const host = document.getElementById('site-header');
    if (!host) return;

    const session = getSession();
    // Header shows the registered student's name; falls back to the
    // guardian's name (e.g. right after login, before the dashboard
    // has populated studentName).
    const firstName = session
      ? escapeHtml(((session.studentName || session.fullName) || '').split(' ')[0])
      : '';

    const mobileLoginHtml = session ? '' : '<a class="mobile-login" href="/login">Log in</a>';
    const ctaHtml = session
      ? `<span class="nav-user">${firstName}</span><a class="btn btn-ghost" href="/dashboard">Dashboard</a><button class="btn btn-ghost nav-logout">Log out</button>`
      : `<a class="login" href="/login">Log in</a><a class="btn btn-primary" href="/registration">Register Now</a>`;

    host.innerHTML = `
      <header class="site-header">
        <div class="container">
          <nav class="nav" aria-label="Primary">
            <a class="brand" href="/" aria-label="BdMSO home">
              <img class="brand-logo" src="/images/logo.webp" alt="BdMSO 2026 logo" width="120" height="84" />
            </a>
            ${mobileLoginHtml}
            <button class="menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="nav-menu">
              <span class="menu-bars" aria-hidden="true">
                <span class="bar bar-top"></span>
                <span class="bar bar-mid"></span>
                <span class="bar bar-bot"></span>
              </span>
            </button>
            <div class="nav-drawer" id="nav-drawer">
              <div class="nav-menu" id="nav-menu">
                ${NAV_LINKS.map(l => `<a href="${l.href}" ${l.key === CURRENT ? 'class="active"' : ''}>${l.label}</a>`).join('')}
              </div>
              <div class="nav-cta" id="nav-cta">
                ${ctaHtml}
              </div>
            </div>
          </nav>
        </div>
      </header>
    `;

    const logoutBtn = host.querySelector('.nav-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        const s = getSession();
        const headers = s?.token ? { Authorization: `Bearer ${s.token}` } : {};
        try { await fetch('/api/logout', { method: 'POST', headers, credentials: 'same-origin' }); } catch {}
        localStorage.removeItem('bdmso_user');
        window.location.href = '/login';
      });
    }

    const tog = host.querySelector('.menu-toggle');
    const drawer = host.querySelector('#nav-drawer');
    const setMenu = (open) => {
      drawer.classList.toggle('open', open);
      tog.classList.toggle('is-open', open);
      tog.setAttribute('aria-expanded', String(open));
      tog.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    tog.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(!drawer.classList.contains('open'));
    });
    // Escape key dismisses the menu.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) setMenu(false);
    });
    // Click outside the header closes the menu. Clicks on menu links
    // also close it - mobile users expect "tap link -> navigate -> menu away".
    document.addEventListener('click', (e) => {
      if (!drawer.classList.contains('open')) return;
      const inHeader = e.target.closest && e.target.closest('.site-header');
      const isLink = e.target.closest && e.target.closest('.nav-menu a, .nav-cta a, .nav-cta .nav-logout');
      if (!inHeader || isLink) setMenu(false);
    });
  }

  function renderFooter() {
    const host = document.getElementById('site-footer');
    if (!host) return;
    host.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <div class="footer-brand">
                <img class="footer-logo" src="/images/logo.webp" alt="BdMSO 2026 logo" width="160" height="112" loading="lazy" />
              </div>
              <p>A platform dedicated to identifying and nurturing early age STEM talent across Bangladesh.</p>
              <div class="partner-logos">
                <span class="ph">BdOSN</span>
                <span class="ph">SPSB</span>
                <span class="ph">IMSO</span>
              </div>
            </div>
            <div>
              <h4>Quick Links</h4>
              <ul>
                <li><a href="/registration">Registration</a></li>
                <li><a href="/resources#syllabus">Syllabus</a></li>
                <li><a href="/resources#regulations">Regulations</a></li>
                <li><a href="/resources#faq">FAQ</a></li>
                <li><a href="/terms">Terms &amp; Conditions</a></li>
                <li><a href="/media">Media</a></li>
              </ul>
            </div>
            <div>
              <h4>Explore</h4>
              <ul>
                <li><a href="/programs">Programs</a></li>
                <li><a href="/results">Results</a></li>
                <li><a href="/team">Our Team</a></li>
                <li><a href="/sponsorship">Sponsorship</a></li>
                <li><a href="/blog">Announcements</a></li>
              </ul>
            </div>
            <div>
              <h4>Contact Us</h4>
              <div class="contact-line">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>Level 12, Building #758, Green City Center,<br>Sat Masjid Road, Dhanmondi, Dhaka 1209</span>
              </div>
              <div class="contact-line">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                <a href="mailto:support@bdmso.org">support@bdmso.org</a>
              </div>
              <div class="socials" aria-label="Social links">
                <a href="https://facebook.com/imsobd" aria-label="Facebook"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.6-1.5h1.4V4.3c-.7-.1-1.6-.2-2.6-.2-2.6 0-4.4 1.6-4.4 4.4v2H7v3h2.5V21h4z"/></svg></a>
                <a href="https://www.youtube.com/@BdMSO25" aria-label="YouTube"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.7-1.7C18.4 5 12 5 12 5s-6.4 0-7.9.5A2.5 2.5 0 0 0 2.4 7.2C2 8.7 2 12 2 12s0 3.3.4 4.8c.2.9.9 1.5 1.7 1.7C5.6 19 12 19 12 19s6.4 0 7.9-.5a2.5 2.5 0 0 0 1.7-1.7c.4-1.5.4-4.8.4-4.8s0-3.3-.4-4.8zM10 15V9l5 3-5 3z"/></svg></a>
                <a href="https://www.instagram.com/bdmso_/" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg></a>
              </div>
            </div>
          </div>
          <div class="copyright">
            <span>© 2026 Bangladesh Mathematics and Science Olympiad. All Rights Reserved.</span>
            <span>Designed with care for young scientists &amp; mathematicians.</span>
          </div>
          <div style="text-align:center; padding:12px 0 0; font-size:12px; color:var(--ink-3);">
            Payments powered by <strong>Shurjopay</strong>
          </div>
        </div>
      </footer>
    `;
  }

  // Marketing pages load this inline near the end of <body>, so DOM is
  // still 'loading' and the listener fires after parse completes. The
  // dashboard SPA appends this script dynamically AFTER React mounts -
  // by then DOMContentLoaded has already fired and the listener would
  // be dead. Branch on readyState so both entry points work.
  function bootstrap() { renderHeader(); renderFooter(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // Toggle a `data-page-hidden` attribute on <html> while the tab is
  // backgrounded. CSS uses it to pause infinite ambient animations
  // (e.g. the registration-open ping) - they're decorative and burn
  // GPU cycles no one is looking at.
  const syncVisibility = () => {
    if (document.visibilityState === 'hidden') {
      document.documentElement.setAttribute('data-page-hidden', '');
    } else {
      document.documentElement.removeAttribute('data-page-hidden');
    }
  };
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();

  // Custom-dropdown enhancer - loaded once here so every marketing page
  // gets it without a per-page <script> tag. (It self-skips the SPA.)
  if (!document.querySelector('script[data-bdsel-loader]')) {
    const s = document.createElement('script');
    s.src = '/js/select-enhance.js';
    s.defer = true;
    s.setAttribute('data-bdsel-loader', '1');
    document.head.appendChild(s);
  }
})();
