const DATA = '/data';

async function load(file) {
  const r = await fetch(`${DATA}/${file}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

function set(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

async function renderStats() {
  const items = await load('stats.json');
  set('stats-grid', items.map(({ value, unit, label }) =>
    `<div class="trust-item">
      <div class="big">${value}<span class="unit">${unit}</span></div>
      <div class="lbl">${label}</div>
    </div>`
  ).join(''));
}

async function renderSteps() {
  const steps = await load('steps.json');
  set('steps-list', steps.map(({ name, date }, i) =>
    `<div class="step">
      <div class="step-num">${i + 1}</div>
      <div class="step-name">${name}</div>
      <div class="step-date">${date}</div>
    </div>`
  ).join(''));
}

async function renderResults() {
  const { photos } = await load('results.json');
  if (!photos || !photos.length) return;

  const track = document.getElementById('fame-slide-track');
  const dotsEl = document.getElementById('fame-dots');
  const captionEl = document.getElementById('fame-caption');
  if (!track) return;

  track.innerHTML = photos.map((p, i) =>
    `<div class="fame-slide${i === 0 ? ' active' : ''}">
      <img src="${p.src}" alt="${p.caption}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
    </div>`
  ).join('');

  dotsEl.innerHTML = photos.map((_, i) =>
    `<button class="fame-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`
  ).join('');

  let cur = 0;
  const slides = track.querySelectorAll('.fame-slide');
  const dots = dotsEl.querySelectorAll('.fame-dot');

  function go(n) {
    slides[cur].classList.remove('active');
    dots[cur].classList.remove('active');
    cur = (n + slides.length) % slides.length;
    slides[cur].classList.add('active');
    dots[cur].classList.add('active');
    captionEl.textContent = photos[cur].caption;
  }

  captionEl.textContent = photos[0].caption;
  document.getElementById('fame-prev').addEventListener('click', () => { clearInterval(autoTimer); go(cur - 1); });
  document.getElementById('fame-next').addEventListener('click', () => { clearInterval(autoTimer); go(cur + 1); });
  dots.forEach(d => d.addEventListener('click', () => { clearInterval(autoTimer); go(Number(d.dataset.i)); }));
  const autoTimer = setInterval(() => go(cur + 1), 4000);
}

// "Start Guide" section. The slugs per tier are hand-curated (a single
// program can legitimately appear in two tiers - e.g. STEM Masterclass
// makes sense for both curious beginners and serious BdMSO preppers),
// but the displayed titles come straight from programs-detail.json so
// the home grid and Start Guide can never drift from the per-program
// pages.
const GUIDE = {
  beginner: ['stem-foundation', 'lab-day', 'stem-masterclass'],
  advance:  ['bdmso-preparatory', 'stem-masterclass', 'mock-test'],
  open:     ['summer-camp', 'winter-camp', 'exchange-program'],
};

async function renderGuide() {
  const details = await load('programs-detail.json');
  const titleBySlug = new Map(details.map((d) => [d.slug, d.title]));
  for (const [tier, slugs] of Object.entries(GUIDE)) {
    set(`guide-${tier}`, slugs.map((slug) => {
      const title = titleBySlug.get(slug) || slug;
      return `<li><a href="/programs/${slug}">${title}</a></li>`;
    }).join(''));
  }
}

async function renderPrograms() {
  // Single source of truth: programs-detail.json drives both the
  // per-program detail pages AND this home-page grid. Programs with a
  // `home_order` field appear here; the field also dictates the order.
  const details = await load('programs-detail.json');
  const items = details
    .filter((p) => p.home_order && !p.hidden)
    .sort((a, b) => a.home_order.localeCompare(b.home_order));

  const todayISO = new Date().toISOString().slice(0, 10);
  const isOpen = ({ registrationStarts, registrationEnds }) =>
    registrationStarts && registrationEnds &&
    todayISO >= registrationStarts && todayISO <= registrationEnds;

  set('prog-grid', items.map((p) => {
    const open = isOpen(p);
    return `<a class="prog-card${open ? ' open' : ''}" href="/programs/${p.slug}">
      <div class="prog-top">
        <span class="num">${p.home_order}</span>
        ${open ? '<span class="open-badge"><span class="open-dot"></span>Open</span>' : ''}
      </div>
      <h4>${p.title}</h4>
      <p>${p.tagline}</p>
    </a>`;
  }).join(''));
}

async function renderNews() {
  const items = await load('../posts/index.json');
  set('updates-grid', items.slice(0, 4).map(({ slug, category, date, title, excerpt, featured, image }) => {
    const url = `/posts/${slug}`;
    const formattedDate = date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    return `<a href="${url}" class="update-card${featured ? ' main' : ''}">
      <div class="cover">
        ${image
          ? `<img src="${image}" alt="${title}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">`
          : `<div class="ph">[ ${category} cover ]</div>`}
      </div>
      <div class="body">
        <div class="tag-row">
          <span class="cat">${category}</span>
          <span>${formattedDate}</span>
        </div>
        <h3>${title}</h3>
        ${excerpt ? `<p>${excerpt}</p>` : ''}
        <span style="font-size:13px;color:var(--navy-700);font-weight:600;margin-top:auto;">Read post →</span>
      </div>
    </a>`;
  }).join(''));
}

async function renderMedia() {
  const items = await load('media.json');
  set('media-grid', items.map(({ date, title, src, url, outlet, favicon }) =>
    `<a class="collage-card" href="${url}" target="_blank" rel="noopener">
      ${src ? `<img class="collage-img" src="${src}" alt="${title}">` : ''}
      <div class="collage-source">
        ${favicon ? `<img src="${favicon}" alt="">` : ''}
        <span>${outlet}</span>
      </div>
      <div class="collage-body">
        <div class="collage-date">${date}</div>
        <div class="collage-headline">${title}</div>
      </div>
    </a>`
  ).join(''));
}

renderStats().catch(() => {});
renderSteps().catch(() => {});
renderResults().catch(() => {});
renderPrograms().catch(() => {});
renderGuide().catch(() => {});
renderNews().catch(() => {});
renderMedia().catch(() => {});

async function adaptRegisterCta() {
  let session = null;
  try { session = JSON.parse(localStorage.getItem('bdmso_user') || 'null'); } catch {}
  if (!session?.token) return;

  let regs = [];
  try {
    const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${session.token}` } });
    if (!res.ok) return;
    const data = await res.json();
    regs = data.registrations || [];
  } catch { return; }

  const hasNqr = regs.some(r => (r.registration_type || '').startsWith('national-qualifying'));
  if (!hasNqr) return;

  document.querySelectorAll('a[href="/registration"]').forEach(a => {
    a.href = '/dashboard';
    if (a.classList.contains('btn')) a.textContent = 'Open Dashboard';
    else {
      const h4 = a.querySelector('h4');
      if (h4) h4.textContent = 'Open Dashboard';
    }
  });
}
adaptRegisterCta();
