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

// Enhancement only: the slides + dots + first caption are server-rendered by
// index.astro from the halloffame collection (crawlable). This just wires the
// slider behaviour. Captions are read from each slide's <img alt>, so no fetch.
function renderResults() {
  const track = document.getElementById('fame-slide-track');
  const dotsEl = document.getElementById('fame-dots');
  const captionEl = document.getElementById('fame-caption');
  if (!track || !dotsEl) return;

  const slides = track.querySelectorAll('.fame-slide');
  const dots = dotsEl.querySelectorAll('.fame-dot');
  if (!slides.length || slides.length !== dots.length) return;
  const captions = Array.from(slides).map((s) => {
    const img = s.querySelector('img');
    return img ? img.alt : '';
  });

  let cur = 0;
  function go(n) {
    slides[cur].classList.remove('active');
    dots[cur].classList.remove('active');
    cur = (n + slides.length) % slides.length;
    slides[cur].classList.add('active');
    dots[cur].classList.add('active');
    if (captionEl) captionEl.textContent = captions[cur];
  }

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
  // Skip when server-rendered (Astro fills these from the programs .md
  // collection). Legacy pages ship empty lists and render client-side.
  const g = document.getElementById('guide-beginner');
  if (g && g.children.length) return;
  const details = await fetch('/api/catalog', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
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
  // Skip when the cards are already server-rendered (Astro index.astro renders
  // them from the programs .md collection). Legacy pages ship an empty grid.
  const grid = document.getElementById('prog-grid');
  if (grid && grid.children.length) return;
  const details = await fetch('/api/catalog', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const items = details
    .filter((p) => p.home_order && !p.hidden)
    .sort((a, b) => a.home_order.localeCompare(b.home_order));

  const todayISO = new Date().toISOString().slice(0, 10);
  const cardState = (p) => {
    if (p.registration === false) return 'closed';
    if (p.registrationStarts && todayISO < p.registrationStarts) return 'upcoming';
    if (p.registrationEnds && todayISO > p.registrationEnds) return 'closed';
    return 'open';
  };

  set('prog-grid', items.map((p) => {
    const state = cardState(p);
    const open = state === 'open';
    const upcoming = state === 'upcoming';
    return `<a class="prog-card${open ? ' open' : ''}" href="/programs/${p.slug}">
      <div class="prog-top">
        <span class="num">${p.home_order}</span>
        ${open ? '<span class="open-badge"><span class="open-dot"></span>Open</span>' : ''}
        ${upcoming ? '<span class="upcoming-badge">Upcoming</span>' : ''}
      </div>
      </div>
      <h4>${p.title}</h4>
      <p>${p.tagline}</p>
    </a>`;
  }).join(''));
}

async function renderNews() {
  // Skip when the cards are already server-rendered (Astro index.astro renders
  // them from the blog collection). Legacy pages ship an empty grid, so this is
  // a no-op there and they render client-side as before.
  const grid = document.getElementById('updates-grid');
  if (grid && grid.children.length) return;
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

try { renderResults(); } catch {}
renderPrograms().catch(() => {});
renderGuide().catch(() => {});
renderNews().catch(() => {});

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
