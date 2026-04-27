const DATA = '/data';

async function load(file) {
  const r = await fetch(`${DATA}/${file}`);
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
  const { featured, stats } = await load('results.json');
  set('fame-grid', featured.map(p =>
    `<div class="fame-card">
      <div class="photo">
        <div class="ph${p.photoClass ? ' ' + p.photoClass : ''}">[ Student portrait ]</div>
        <span class="medal ${p.medal}">${p.medalLabel}</span>
      </div>
      <h4>${p.name}</h4>
      <div class="meta">${p.subject} · ${p.class} · ${p.event}</div>
      <p class="quote">"${p.quote}"</p>
    </div>`
  ).join(''));
  set('fame-stats', stats.map(({ value, label }) =>
    `<div class="stat">
      <div class="n">${value}</div>
      <div class="t">${label}</div>
    </div>`
  ).join(''));
}

async function renderPrograms() {
  const items = await load('programs.json');
  set('prog-grid', items.map(({ id, title, description }) =>
    `<a class="prog-card" href="programs.html">
      <span class="num">${id}</span>
      <h4>${title}</h4>
      <p>${description}</p>
    </a>`
  ).join(''));
}

async function renderNews() {
  const items = await load('news.json');
  set('updates-grid', items.map(({ category, date, title, excerpt, featured, imageClass }) =>
    `<article class="update-card${featured ? ' main' : ''}">
      <div class="cover"><div class="ph${imageClass ? ' ' + imageClass : ''}">[ ${category} cover ]</div></div>
      <div class="body">
        <div class="tag-row"><span class="cat">${category}</span><span>${date}</span></div>
        <h3>${title}</h3>
        ${excerpt ? `<p>${excerpt}</p>` : ''}
      </div>
    </article>`
  ).join(''));
}

renderStats().catch(() => {});
renderSteps().catch(() => {});
renderResults().catch(() => {});
renderPrograms().catch(() => {});
renderNews().catch(() => {});
