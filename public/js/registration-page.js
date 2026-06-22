// Registration page client logic. Ported verbatim from the inline module
// script in the legacy public/registration.html during the Astro cutover.
import { postJson } from './api.js';
import { PROGRAM_OPTIONS, programHasOptions, computeOptionsTotal, initProgramOptions } from './program-options.js';
import { loadCatalog, programMaps } from './program-catalog.js';
// Program names come from the (admin-edited) catalog, so escape before any
// innerHTML interpolation to prevent stored XSS via a crafted program title.
import { escHtml } from './md.js';

// Program names + prices come from the catalog (programs-detail.json),
// the single source of truth. Populated by loadCatalogMaps() before
// the quick-enroll panel needs them.
let PROGRAM_NAMES = {};
let PROGRAM_PRICES = {};
let CATALOG_BY_SLUG = {};
async function loadCatalogMaps() {
  const { names, prices } = await programMaps();
  PROGRAM_NAMES = names;
  PROGRAM_PRICES = prices;
  const catalog = await loadCatalog();
  CATALOG_BY_SLUG = Object.fromEntries(catalog.map((p) => [p.slug, p]));
  // Populate PROGRAM_OPTIONS from the same catalog before the form reads it.
  await initProgramOptions();
}

// Mirrors the worker's registrationOpenFor(). Returns the enrollability
// state: 'open', 'upcoming' (registration window hasn't started yet),
// or 'closed' (hidden, registration: false, or the window has ended).
function registrationState(slug) {
  const p = CATALOG_BY_SLUG[slug];
  if (!p || p.hidden || p.registration === false) return 'closed';
  const today = new Date().toISOString().slice(0, 10);
  if (p.registrationStarts && today < p.registrationStarts) return 'upcoming';
  if (p.registrationEnds && today > p.registrationEnds) return 'closed';
  return 'open';
}

// Per-program hero + step instructions. When `?program=` is present we
// swap the generic "pick one of two competitions" copy for content that
// matches the specific program the user came from. Step 1 in particular
// changes meaning - for a non-competition program the user isn't choosing
// between Olympiad/Quiz, they're confirming enrollment in that program.
const PROGRAM_CONTENT = {
  'national-olympiad': {
    eyebrow:  'Olympiad Registration',
    title:    'Register for the BdMSO National Olympiad 2026.',
    intro:    'A single combined exam in Mathematics &amp; Science (60 minutes per subject) for students Class 6 or below. Create your BdMSO ID once and use it across every stage.',
    step1Title: 'Confirm Olympiad entry',
    step1Body:  'You\'re registering for the <strong>BdMSO National Olympiad</strong> (Class 6 or below). Each student may register for either the Olympiad or the Quiz - not both.',
  },
  'national-quiz-competition': {
    eyebrow:  'Quiz Registration',
    title:    'Register for the BdMSO Quiz Competition 2026.',
    intro:    'General-knowledge quiz for Class 3 or below - open to both National and International curricula. Create your BdMSO ID once and use it across every stage.',
    step1Title: 'Confirm Quiz entry',
    step1Body:  'You\'re registering for the <strong>BdMSO Quiz Competition</strong> (Class 3 or below). Each student may register for either the Olympiad or the Quiz - not both.',
  },
  'stem-foundation': {
    eyebrow:  'STEM Foundation Program',
    title:    'Enroll in the STEM Foundation Program.',
    intro:    'A 24-class foundation course building early Math &amp; Science fundamentals for students starting their olympiad journey.',
    step1Title: 'Confirm enrollment',
    step1Body:  'You\'re enrolling in the <strong>STEM Foundation Program</strong>. We\'ll save the student details and reserve a seat in the next intake.',
  },
  'bdmso-preparatory': {
    eyebrow:  'BdMSO Preparatory Course',
    title:    'Enroll in the BdMSO Preparatory Course.',
    intro:    'Basic level online preparatory course for BdMSO Olympiad - 10 live sessions and 2 mock tests for Class 6 or below.',
    step1Title: 'Confirm enrollment',
    step1Body:  'You\'re enrolling in the <strong>BdMSO Preparatory Course</strong>. We\'ll save the student details and reserve a seat in the next batch.',
  },
  'bdmso-preparatory-camp': {
    eyebrow:  'BdMSO Preparatory Camp',
    title:    'Enroll in the BdMSO Preparatory Camp.',
    intro:    'Advanced level on-site preparatory camp for BdMSO Aspirants - 10 offline sessions and 2 mock tests for grade 4-5-6.',
    step1Title: 'Confirm enrollment',
    step1Body:  'You\'re enrolling in the <strong>BdMSO Preparatory Camp</strong>. We\'ll save the student details and reserve a seat in the next batch.',
  },
  'stem-masterclass': {
    eyebrow:  'STEM Masterclass Series',
    title:    'Enroll in the STEM Masterclass Series.',
    intro:    'Advanced topical masterclasses for students preparing for higher olympiad rounds.',
    step1Title: 'Confirm enrollment',
    step1Body:  'You\'re enrolling in the <strong>STEM Masterclass Series</strong>. We\'ll save the student details and confirm your seat.',
  },
  'mock-test': {
    eyebrow:  'BdMSO Mock Test',
    title:    'Register for the BdMSO Mock Test.',
    intro:    'Full-length mock examinations on 6 and 20 June 2026 - the closest practice to the real Olympiad paper.',
    step1Title: 'Confirm mock-test entry',
    step1Body:  'You\'re registering for the <strong>BdMSO Mock Test</strong>. Pick the sessions you want below - you can come back and add more later.',
  },
  'lab-day': {
    eyebrow:  'Lab Day Workshop',
    title:    'Register for a BdMSO Lab Day.',
    intro:    'A 6-hour hands-on laboratory day in Physics, Chemistry and Biology - apparatus, demonstrations and guided experiments.',
    step1Title: 'Confirm workshop seat',
    step1Body:  'You\'re registering for the <strong>BdMSO Lab Day Workshop</strong>. Seats are limited per session.',
  },
  'kids-ai-ml': {
    eyebrow:  'Kids AI &amp; ML',
    title:    'Enroll in the Kids AI / Machine Learning Course.',
    intro:    'A foundation course in Robotics, AI and Machine Learning - project-based, age-appropriate, hands-on.',
    step1Title: 'Confirm enrollment',
    step1Body:  'You\'re enrolling in the <strong>Kids AI and Machine Learning Course</strong>. We\'ll save the student details and reserve a seat.',
  },
  'summer-camp': {
    eyebrow:  'SPSB Nature Camp',
    title:    'Register for the SPSB Nature Camp.',
    intro:    'A residential nature-and-science camp run with the Society for the Popularisation of Science Bangladesh.',
    step1Title: 'Confirm camp seat',
    step1Body:  'You\'re registering for the <strong>SPSB Nature Camp</strong>. Residential seats are allocated on a first-confirmed basis.',
  },
  'winter-camp': {
    eyebrow:  'International Winter Camp',
    title:    'Register for the International Winter Camp.',
    intro:    'An activity-based international residential camp with mentorship from global olympiad coaches.',
    step1Title: 'Confirm camp seat',
    step1Body:  'You\'re registering for the <strong>International Winter Camp</strong>. Seats are limited and allocated on confirmation.',
  },
  'exchange-program': {
    eyebrow:  'BdMSO Exchange Program',
    title:    'Apply for the BdMSO Exchange Program.',
    intro:    'A 30-day international exchange program for top BdMSO students - selection and logistics managed centrally.',
    step1Title: 'Confirm application',
    step1Body:  'You\'re applying for the <strong>BdMSO Exchange Program</strong>. Final selection is subject to BdMSO eligibility criteria.',
  },
};
const params  = new URLSearchParams(location.search);
const program = params.get('program');

// Swap hero + 3-step instructions to match the program in the URL.
// Skipped when the user lands on /registration with no program param -
// in that case the default "pick one of two competitions" copy stays.
function applyProgramContent(slug) {
  const content = PROGRAM_CONTENT[slug];
  if (!content) return;

  const head = document.querySelector('.page-head');
  if (head) {
    const eyebrow = head.querySelector('.eyebrow');
    const h1      = head.querySelector('h1');
    const p       = head.querySelector('p');
    if (eyebrow) eyebrow.innerHTML = content.eyebrow;
    if (h1)      h1.textContent    = content.title;
    if (p)       p.innerHTML       = content.intro;
  }

  // Step 1 changes from "choose between Olympiad/Quiz" to a
  // program-specific confirmation. Steps 2 and 3 stay generic
  // (form + verify/pay) since those parts of the flow don't differ.
  const step1 = document.querySelector('.instructions .step:nth-child(1)');
  if (step1) {
    const h3 = step1.querySelector('h3');
    const p  = step1.querySelector('p');
    if (h3) h3.textContent = content.step1Title;
    if (p)  p.innerHTML    = content.step1Body;
  }
}
applyProgramContent(program);

let session = null;
try { session = JSON.parse(localStorage.getItem('bdmso_user')); } catch {}

// Renders the option picker inside the logged-in quick-enroll panel
// (Mock Test sessions, Prep subjects). Without this, add-enrollment
// for an option-priced program is rejected by the worker.
// Returns true when the picker rendered, false when every option is
// already taken (repeatable programs - the guardian booked them all).
function renderQuickEnrollOptions(slug, onChange, takenIds) {
  const panel = document.getElementById('qe-options-panel');
  if (!panel) return true;
  const cfg = PROGRAM_OPTIONS[slug];
  if (!cfg) { panel.hidden = true; return true; }
  const taken = takenIds || new Set();
  const items = cfg.items.filter((it) => !taken.has(it.id));
  if (items.length === 0) { panel.hidden = true; return false; }
  const inputType = cfg.kind === 'radio' ? 'radio' : 'checkbox';
  panel.innerHTML = `
    <div class="opt-head"><div class="opt-title">${cfg.label || 'Choose an option'}</div></div>
    ${cfg.help ? `<p class="opt-help">${cfg.help}</p>` : ''}
    <div class="opt-list">${items.map((it) => `
      <label class="opt-item">
        <input type="${inputType}" name="qe-program-option" value="${it.id}">
        <div class="opt-text">
          <div class="opt-label-row">
            <span class="opt-label">${it.label}</span>
            <span class="opt-price">৳ ${it.price.toLocaleString('en-BD')}</span>
          </div>
          ${it.sub ? `<div class="opt-sub">${it.sub}</div>` : ''}
        </div>
      </label>`).join('')}</div>`;
  panel.hidden = false;
  panel.querySelectorAll('input[name="qe-program-option"]').forEach((el) => {
    el.addEventListener('change', () => {
      panel.querySelectorAll('.opt-item').forEach((label) => {
        const input = label.querySelector('input');
        label.classList.toggle('is-checked', !!(input && input.checked));
      });
      if (onChange) onChange();
    });
  });
  return true;
}

function getQuickEnrollOptions() {
  return Array.from(
    document.querySelectorAll('#qe-options-panel input[name="qe-program-option"]:checked'),
  ).map((el) => el.value);
}

// Renders a not-enrollable screen: hero swapped, full form and
// instructions hidden, and the panel repurposed with browse/dashboard
// links. `state` is 'upcoming' (window not started) or 'closed'
// (registration: false, hidden, or window ended).
function showRegistrationClosed(programName, state, prog) {
  const upcoming = state === 'upcoming';
  let opensOn = '';
  if (upcoming && prog?.registrationStarts) {
    opensOn = new Date(prog.registrationStarts).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  const head = document.querySelector('.page-head');
  if (head) {
    const eyebrow = head.querySelector('.eyebrow');
    const h1      = head.querySelector('h1');
    const p       = head.querySelector('p');
    if (eyebrow) eyebrow.textContent = upcoming ? 'Opening soon' : 'Registration closed';
    if (h1)      h1.textContent      = upcoming
      ? `Registration for ${programName} hasn't opened yet.`
      : `Registration for ${programName} is closed.`;
    if (p)       p.textContent       = upcoming
      ? (opensOn
          ? `Registration opens on ${opensOn}. Browse our other programs in the meantime.`
          : 'Registration for this program hasn\'t opened yet. Browse our other programs in the meantime.')
      : 'This program is not open for enrollment right now. Browse our other programs or check back later.';
  }

  document.querySelector('.instructions')?.style.setProperty('display', 'none');
  document.getElementById('full-reg-section')?.setAttribute('hidden', '');
  document.getElementById('form')?.setAttribute('hidden', '');

  const panel = document.getElementById('quick-enroll');
  if (panel) {
    panel.hidden = false;
    document.getElementById('qe-program-tag').textContent  = upcoming ? 'Opening soon' : 'Registration closed';
    document.getElementById('qe-program-name').textContent = programName;
    const body = document.querySelector('.qe-body');
    if (body) {
      body.innerHTML = upcoming
        ? `<p style="color:var(--ink-2); margin:0;">Registration for <strong>${escHtml(programName)}</strong> ${opensOn ? `opens on <strong>${escHtml(opensOn)}</strong>` : 'hasn\'t opened yet'}. You can browse other open programs or return to your dashboard.</p>`
        : `<p style="color:var(--ink-2); margin:0;">Registration for <strong>${escHtml(programName)}</strong> is currently closed. You can browse other open programs or return to your dashboard.</p>`;
    }
    const foot = document.querySelector('.qe-foot');
    if (foot) {
      foot.innerHTML = `<div></div><div style="display:flex; gap:10px; flex-wrap:wrap;"><a class="btn btn-ghost" href="/programs">Browse programs</a><a class="btn btn-gold" href="/dashboard">Go to dashboard →</a></div>`;
    }
  }
}

async function initQuickEnroll() {
  const panel     = document.getElementById('quick-enroll');
  const fullReg   = document.getElementById('full-reg-section');
  const formShell = document.getElementById('form');

  // Only enter quick-enroll when the URL actually carried a ?program= param.
  // Without one, fall through to the program-choice cards (#full-reg-section)
  // so signed-in guardians explicitly pick Olympiad vs Quiz instead of being
  // silently funneled into the Olympiad flow.
  const effectiveProgram = program;
  if (!effectiveProgram) return;

  await loadCatalogMaps();

  const programName = PROGRAM_NAMES[effectiveProgram] || effectiveProgram;

  // Closed, hidden, or not-yet-open programs are not enrollable here,
  // regardless of which button linked in. Show a clear screen instead
  // of an enroll panel the worker would reject on submit anyway.
  const regState = registrationState(effectiveProgram);
  if (regState !== 'open') {
    showRegistrationClosed(programName, regState, CATALOG_BY_SLUG[effectiveProgram]);
    return;
  }

  document.getElementById('qe-program-name').textContent = programName;
  document.getElementById('qe-program-tag').textContent  = 'Enrolling in';

  const priceEl = document.getElementById('qe-price');
  const basePrice = PROGRAM_PRICES[effectiveProgram];
  priceEl.textContent = basePrice ? `৳ ${basePrice.toLocaleString()}` : 'On enquiry';

  if (session) {
    // Logged-in: show quick enroll, hide full form
    panel.hidden = false;
    fullReg.hidden = true;
    formShell.hidden = true;

    // First-time-only instructions don't apply to returning users
    document.querySelector('.instructions')?.style.setProperty('display', 'none');

    // Load existing student info
    let allRegs = [];
    try {
      const headers = session.token ? { Authorization: `Bearer ${session.token}` } : {};
      const res = await fetch('/api/me', { headers, credentials: 'same-origin' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          // Session expired - clear stale localStorage and redirect to login
          // so the user can re-authenticate and come back to this page.
          localStorage.removeItem('bdmso_user');
          window.location.href = '/login?redirect=' + encodeURIComponent(window.location.href);
          return;
        }
        // Other server error - fall back to full form
        panel.hidden = true;
        fullReg.hidden = false;
        formShell.hidden = false;
        return;
      }
      const data = await res.json();
      allRegs = data.registrations || [];
      const reg  = allRegs[0];
      if (reg) {
        document.getElementById('qe-student-name').textContent   = reg.student_full_name;
        document.getElementById('qe-student-detail').textContent = `${reg.student_class_name} · ${reg.student_school}`;

        // Tailor the page hero for returning guardians
        const head = document.querySelector('.page-head');
        if (head) {
          const eyebrow = head.querySelector('.eyebrow');
          const h1      = head.querySelector('h1');
          const p       = head.querySelector('p');
          if (eyebrow) eyebrow.textContent = 'Welcome back';
          if (h1)      h1.textContent      = `Add another enrollment for ${reg.student_full_name}.`;
          if (p)       p.innerHTML         = `Your BdMSO ID and student details are already on file - just confirm the program below and head to payment.`;
        }
      } else {
        // No existing registration - fall back to full form
        panel.hidden = true;
        fullReg.hidden = false;
        formShell.hidden = false;
        document.querySelector('.instructions')?.style.removeProperty('display');
        return;
      }
    } catch {
      panel.hidden = true;
      fullReg.hidden = true; // program is set, never show the chooser grid
      formShell.hidden = false;
      return;
    }

    // Block re-registration if already enrolled in this exact program,
    // OR if trying to register for the other competition (Olympiad ↔ Quiz are mutually exclusive).
    // Cancelled rows don't count - a guardian who cancelled a program
    // must be able to register for it again.
    const COMPETITION_PROGRAMS = ['national-olympiad', 'national-quiz-competition'];
    const activeRegs = allRegs.filter(r => r.status !== 'cancelled');
    // Repeatable programs (BdMSO Mock Test) can be enrolled in more than
    // once, so the "already enrolled" block doesn't apply to them.
    const isRepeatable = CATALOG_BY_SLUG[effectiveProgram]?.repeatable === true;
    const alreadyEnrolled = !isRepeatable && activeRegs.some(r => r.registration_type === effectiveProgram);
    const otherCompetition = COMPETITION_PROGRAMS.includes(effectiveProgram)
      && activeRegs.some(r => COMPETITION_PROGRAMS.includes(r.registration_type) && r.registration_type !== effectiveProgram);
    if (otherCompetition) {
      const head = document.querySelector('.page-head');
      if (head) {
        head.querySelector('.eyebrow').textContent = 'One competition only';
        head.querySelector('h1').textContent = `Already registered for the other competition.`;
        head.querySelector('p').textContent  = 'Each student may register for either the Olympiad or the Quiz - not both. Visit your dashboard for the existing registration.';
      }
      document.querySelector('.qe-body').innerHTML = `
        <p style="color:var(--ink-2); margin:0 0 10px;">Each student can take part in <strong>either the National Olympiad or the Quiz Competition - not both</strong>. This student is already registered for the other competition, so this one is not available for enrollment.</p>
        <p style="color:var(--ink-2); margin:0;">Manage the existing registration from your dashboard. If you need to switch competitions, please contact <a href="mailto:support@bdmso.org" style="color:var(--navy-700);text-decoration:underline;">support@bdmso.org</a>.</p>`;
      const foot = document.querySelector('.qe-foot');
      if (foot) foot.innerHTML = `<div></div><div style="display:flex;gap:10px;flex-wrap:wrap;"><a class="btn btn-ghost" href="/programs">Browse other programs</a><a class="btn btn-gold" href="/dashboard">Go to dashboard →</a></div>`;
      return;
    }
    if (alreadyEnrolled) {
      const head = document.querySelector('.page-head');
      if (head) {
        head.querySelector('.eyebrow').textContent = 'Already registered';
        head.querySelector('h1').textContent = `You're already registered for ${programName}.`;
        head.querySelector('p').textContent  = 'Head to your dashboard to view your BdMSO ID, complete payment, or browse other programs.';
      }
      document.querySelector('.qe-body').innerHTML = `
        <p style="color:var(--ink-2); margin:0;">Your enrollment for ${escHtml(programName)} is already on file.
        You can manage it - and add more programs - from your dashboard.</p>`;
      const foot = document.querySelector('.qe-foot');
      if (foot) foot.innerHTML = `<div></div><div style="display:flex;gap:10px;flex-wrap:wrap;"><a class="btn btn-ghost" href="/programs">Browse other programs</a><a class="btn btn-gold" href="/dashboard">Go to dashboard →</a></div>`;
      return;
    }

    // Option-priced programs (Mock Test, Prep Course) need their
    // picker shown here too - the live total drives the qe-price.
    // For repeatable programs, sessions the guardian has already booked
    // are excluded so they can't pay for the same seat twice.
    const takenIds = new Set();
    if (isRepeatable) {
      for (const r of activeRegs) {
        if (r.registration_type !== effectiveProgram) continue;
        try {
          JSON.parse(r.program_options || '[]').forEach((id) => takenIds.add(id));
        } catch { /* ignore malformed */ }
      }
    }

    const hasOpts = programHasOptions(effectiveProgram);
    if (hasOpts) {
      const rendered = renderQuickEnrollOptions(effectiveProgram, () => {
        const total = computeOptionsTotal(effectiveProgram, getQuickEnrollOptions());
        priceEl.textContent = total > 0 ? `৳ ${total.toLocaleString('en-BD')}` : 'Select an option';
      }, takenIds);
      if (!rendered) {
        // Repeatable program with every session already booked.
        const head = document.querySelector('.page-head');
        if (head) {
          head.querySelector('.eyebrow').textContent = 'All sessions booked';
          head.querySelector('h1').textContent = `You're enrolled in every ${programName} session.`;
          head.querySelector('p').textContent  = 'There are no more sessions left to add right now.';
        }
        document.querySelector('.qe-body').innerHTML = `
          <p style="color:var(--ink-2); margin:0 0 10px;">All ${escHtml(programName)} sessions are already on your child's account, so there's nothing left to add here.</p>
          <p style="color:var(--ink-3); margin:0; font-size:13px;">Didn't book them yourself? The BdMSO Preparatory Course includes free Mock Tests, which are added automatically. You can see every session on your dashboard.</p>`;
        const foot = document.querySelector('.qe-foot');
        if (foot) foot.innerHTML = `<div></div><div style="display:flex;gap:10px;flex-wrap:wrap;"><a class="btn btn-ghost" href="/programs">Browse other programs</a><a class="btn btn-gold" href="/dashboard">Go to dashboard →</a></div>`;
        return;
      }
      priceEl.textContent = 'Select an option';
    }

    document.getElementById('qe-confirm-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const errEl = document.getElementById('qe-error');
      errEl.style.display = 'none';

      let programOptions;
      if (hasOpts) {
        programOptions = getQuickEnrollOptions();
        if (programOptions.length === 0) {
          errEl.textContent = 'Please pick at least one option above.';
          errEl.style.display = 'block';
          return;
        }
      }

      btn.disabled = true;
      btn.textContent = 'Adding enrollment…';
      try {
        const res = await postJson('add-enrollment', {
          registrationType: effectiveProgram,
          ...(programOptions ? { programOptions } : {}),
        }, session?.token);
        // Carry the new registration id so the dashboard can scroll
        // straight to its Pay Now card instead of dumping the guardian
        // at the top of a long list.
        const focus = res?.applicationId ? `?focus=${encodeURIComponent(res.applicationId)}` : '?enrolled=1';
        window.location.href = `/dashboard${focus}`;
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Confirm enrollment →';
      }
    });

  } else if (program) {
    // Not logged in + program param → skip the hero/instructions/cards
    // entirely and put the form at the top of the viewport. The user
    // got here from a per-program "Register" button, so the program
    // intent is already confirmed and the 3-step instructions just add
    // scroll-cost without information value.
    fullReg.hidden = true;
    formShell.hidden = false;
    formShell.style.marginTop = '0';
    document.querySelector('.page-head')?.setAttribute('hidden', '');
    document.querySelector('.instructions')?.setAttribute('hidden', '');
    document.querySelector('.reg-wrap')?.style.setProperty('margin-top', '24px');

    // Update form header to show the actual program being enrolled in
    const formContextLabel = formShell.querySelector('.form-head div > div:first-child');
    if (formContextLabel) formContextLabel.textContent = programName;

    // Add a slim back link + program label above the form. Built with
    // DOM methods (not innerHTML) since `programName` is catalog text
    // but defense-in-depth: never trust strings into innerHTML.
    // Stacked: back link on top (left), program name centered on its own line
    // below with breathing room above and between. Top margin separates it from
    // the site nav.
    const backBar = document.createElement('div');
    backBar.style.cssText = 'margin:18px 0 18px;';
    const backLink = document.createElement('a');
    backLink.href = '/programs';
    backLink.style.cssText = 'display:inline-block;font-size:14px;line-height:1.2;color:var(--navy-700);font-weight:600;text-decoration:none;';
    backLink.textContent = '← Back to programs';
    // Program being enrolled in: a centered navy pill below the back link.
    const tag = document.createElement('div');
    tag.style.cssText = 'width:fit-content;max-width:100%;margin:12px auto 0;font-size:12px;line-height:1.2;color:var(--navy-800,#1e3a8a);font-weight:700;letter-spacing:0.04em;text-transform:uppercase;background:var(--navy-50,#f0f4ff);border:1px solid var(--navy-200,#c7d5f5);padding:7px 16px;border-radius:999px;text-align:center;';
    tag.textContent = programName;
    backBar.append(backLink, tag);
    formShell.parentElement.insertBefore(backBar, formShell);

    // Returning user prompt: if someone already has a BdMSO account,
    // logging in skips this form entirely and uses their saved details.
    const loginBanner = document.createElement('div');
    loginBanner.style.cssText = 'margin-bottom:20px;padding:12px 16px;background:var(--navy-50,#f0f4ff);border:1px solid var(--navy-200,#c7d5f5);border-radius:8px;font-size:14px;color:var(--ink-2);';
    const loginBannerLink = document.createElement('a');
    loginBannerLink.href = '/login?redirect=' + encodeURIComponent(window.location.href);
    loginBannerLink.style.cssText = 'color:var(--navy-700);font-weight:600;text-decoration:underline;';
    loginBannerLink.textContent = 'Log in';
    loginBanner.append('Already have a BdMSO account? ', loginBannerLink, ' to use your saved student details - no need to fill this form again.');
    formShell.parentElement.insertBefore(loginBanner, formShell);
  }
}

const NQR_CLASSES = {
  national:      ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'],
  international: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'],
  default:       ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'],
};
const QUIZ_CLASSES = ['Pre-primary', 'Class 1', 'Class 2', 'Class 3'];

// The competition is decided by the ?program= URL parameter. When the
// user visits /registration with no param, registration.js validation
// defaults to the Olympiad, so we mirror that default here too -
// otherwise the inline script would hide the Subject/Venue fields
// while validation still requires them, leading to a "2 required
// fields highlighted" message with nothing actually highlighted.
const effectiveProgram = program || 'national-olympiad';

// Class options now depend only on competition-from-URL + curriculum,
// since the in-form competition dropdown was removed.
function updateClassOptions() {
  const medium = document.getElementById('f-medium').value;
  const classEl = document.getElementById('f-class');
  const isQuiz  = effectiveProgram === 'national-quiz-competition';
  const opts    = isQuiz ? QUIZ_CLASSES : (NQR_CLASSES[medium] || NQR_CLASSES.default);
  const current = classEl.value;
  classEl.innerHTML = opts.map(c => `<option${c === current ? ' selected' : ''}>${c}</option>`).join('');
  if (!opts.includes(classEl.value)) classEl.value = opts[opts.length - 1];
}

// Exam Region shows for Olympiad and Quiz (where students pick a
// regional exam centre). Preferred Subject only shows on the Olympiad
// AND only once the student has picked the "both subjects" program
// option - it's a tiebreaker, meaningless when they've already chosen
// math-only or science-only.
function showVenueField()   { return effectiveProgram === 'national-olympiad' || effectiveProgram === 'national-quiz-competition'; }
function showSubjectField() {
  if (effectiveProgram !== 'national-olympiad') return false;
  const picked = document.querySelector('#program-options-panel input[name="program-option"]:checked');
  return !!picked && picked.value === 'both';
}

function applyConditionalFields() {
  document.getElementById('field-venue').hidden   = !showVenueField();
  document.getElementById('field-subject').hidden = !showSubjectField();
}

document.addEventListener('DOMContentLoaded', () => {
  initQuickEnroll();

  document.getElementById('f-medium').addEventListener('change', () => {
    updateClassOptions();
  });

  updateClassOptions();
  applyConditionalFields();
});
