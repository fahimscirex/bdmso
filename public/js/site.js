// BdMSO shared header + footer + small helpers
(function () {
  const CURRENT = document.body.dataset.page || '';

  const NAV_LINKS = [
    { href: 'index.html', label: 'Home', key: 'home' },
    { href: 'about.html', label: 'About', key: 'about' },
    { href: 'programs.html', label: 'Programs', key: 'programs' },
    { href: 'resources.html', label: 'Resources', key: 'resources' },
    { href: 'results.html', label: 'Results', key: 'results' },
    { href: 'team.html', label: 'Team', key: 'team' },
    { href: 'blog.html', label: 'Blog', key: 'blog' },
    { href: 'media.html', label: 'Media', key: 'media' },
  ];

  function renderHeader() {
    const host = document.getElementById('site-header');
    if (!host) return;
    host.innerHTML = `
      <header class="site-header">
        <div class="container">
          <nav class="nav" aria-label="Primary">
            <a class="brand" href="index.html" aria-label="BdMSO home">
              <img class="brand-logo" src="images/logo.png" alt="BdMSO 2026 logo" />
            </a>
            <button class="menu-toggle" aria-label="Open menu" aria-expanded="false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
            </button>
            <div class="nav-menu" id="nav-menu">
              ${NAV_LINKS.map(l => `<a href="${l.href}" ${l.key === CURRENT ? 'class="active"' : ''}>${l.label}</a>`).join('')}
            </div>
            <div class="nav-cta" id="nav-cta">
              <a class="login" href="registration.html">Log in</a>
              <a class="btn btn-primary" href="registration.html">Register Now</a>
            </div>
          </nav>
        </div>
      </header>
    `;

    const tog = host.querySelector('.menu-toggle');
    const menu = host.querySelector('#nav-menu');
    const cta = host.querySelector('#nav-cta');
    tog.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      cta.classList.toggle('open', open);
      tog.setAttribute('aria-expanded', String(open));
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
                <img class="footer-logo" src="images/logo.png" alt="BdMSO 2026 logo" />
              </div>
              <p>Bangladesh's official qualifying platform to select primary school students to represent the country at the International Mathematics and Science Olympiad (IMSO).</p>
              <div class="partner-logos">
                <span class="ph">BdOSN</span>
                <span class="ph">SPSB</span>
                <span class="ph">IMSO</span>
              </div>
            </div>
            <div>
              <h4>Quick Links</h4>
              <ul>
                <li><a href="registration.html">Registration</a></li>
                <li><a href="resources.html">Syllabus</a></li>
                <li><a href="resources.html">Regulations</a></li>
                <li><a href="resources.html#faq">FAQ</a></li>
                <li><a href="media.html">Media</a></li>
              </ul>
            </div>
            <div>
              <h4>Explore</h4>
              <ul>
                <li><a href="programs.html">Programs</a></li>
                <li><a href="results.html">Results</a></li>
                <li><a href="team.html">Our Team</a></li>
                <li><a href="sponsorship.html">Sponsorship</a></li>
                <li><a href="blog.html">Announcements</a></li>
              </ul>
            </div>
            <div>
              <h4>Contact Us</h4>
              <div class="contact-line">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 7-8 12-8 12s-8-5-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>Building #758, Green City Centre,<br>Sat Masjid Road, Dhanmondi, Dhaka 1209</span>
              </div>
              <div class="contact-line">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                <a href="mailto:info.bdmso@gmail.com">info.bdmso@gmail.com</a>
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
        </div>
      </footer>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderFooter();
  });
})();
