// Replaces every native <select> with a fully CSS-controlled dropdown.
// Native <select> open-lists are OS-rendered and their hovered-option
// colours can't be styled (white-on-white under OS dark mode). The
// native element is kept - hidden - as the form value + submission
// source, so all existing code that reads `select.value` or listens
// for `change` keeps working untouched.
//
// Skipped inside the dashboard SPA (#app), which uses a Preact dropdown.

(function () {
  if (document.getElementById('app')) return;

  function enhance(select) {
    if (select.dataset.bdsel || select.closest('.bdsel')) return;
    // Leave flatpickr's internal month dropdown alone - wrapping it in a .bdsel
    // breaks the calendar header layout (and hides the year input).
    if (select.classList.contains('flatpickr-monthDropdown-months') || select.closest('.flatpickr-calendar')) return;
    select.dataset.bdsel = '1';

    const wrap = document.createElement('div');
    wrap.className = 'bdsel';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'bdsel-trigger';

    const panel = document.createElement('div');
    panel.className = 'bdsel-panel';
    panel.hidden = true;

    wrap.append(trigger, panel);

    let filterInput = null;

    function buildPanel() {
      panel.textContent = '';
      const opts = Array.from(select.options);
      // A type-to-filter box for long lists (e.g. 64 districts).
      if (opts.length > 10) {
        filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.className = 'bdsel-search';
        filterInput.placeholder = 'Type to filter…';
        filterInput.addEventListener('input', applyFilter);
        filterInput.addEventListener('click', (e) => e.stopPropagation());
        panel.appendChild(filterInput);
      } else {
        filterInput = null;
      }
      const list = document.createElement('div');
      list.className = 'bdsel-list';
      opts.forEach((opt) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'bdsel-opt';
        item.textContent = opt.textContent;
        item.dataset.value = opt.value;
        if (opt.disabled) item.disabled = true;
        if (opt.value && opt.value === select.value) item.classList.add('is-selected');
        item.addEventListener('click', () => choose(opt.value));
        list.appendChild(item);
      });
      panel.appendChild(list);
    }

    function applyFilter() {
      const q = (filterInput.value || '').trim().toLowerCase();
      let shown = 0;
      panel.querySelectorAll('.bdsel-opt').forEach((el) => {
        const hit = !q || el.textContent.toLowerCase().includes(q);
        el.hidden = !hit;
        if (hit) shown += 1;
      });
      let empty = panel.querySelector('.bdsel-empty');
      if (!shown) {
        if (!empty) {
          empty = document.createElement('div');
          empty.className = 'bdsel-empty';
          empty.textContent = 'No matches';
          panel.querySelector('.bdsel-list').appendChild(empty);
        }
      } else if (empty) {
        empty.remove();
      }
    }

    function choose(value) {
      select.value = value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncTrigger();
      close();
    }

    function syncTrigger() {
      const sel = select.options[select.selectedIndex];
      trigger.textContent = sel ? sel.textContent : '';
      trigger.classList.toggle('is-placeholder', !select.value);
      panel.querySelectorAll('.bdsel-opt').forEach((el) => {
        el.classList.toggle('is-selected', !!el.dataset.value && el.dataset.value === select.value);
      });
    }

    function open() {
      buildPanel();
      syncTrigger();
      panel.hidden = false;
      wrap.classList.add('is-open');
      if (filterInput) { filterInput.value = ''; filterInput.focus(); }
      const cur = panel.querySelector('.bdsel-opt.is-selected');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
    function close() {
      panel.hidden = true;
      wrap.classList.remove('is-open');
    }

    trigger.addEventListener('click', () => { if (panel.hidden) open(); else close(); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    // Other scripts change the native select (programmatic .value, or
    // re-populating district / month / class options) - stay in sync.
    select.addEventListener('change', syncTrigger);
    new MutationObserver(() => {
      if (!panel.hidden) buildPanel();
      syncTrigger();
    }).observe(select, { childList: true });

    syncTrigger();
  }

  function run() {
    document.querySelectorAll('select:not([data-bdsel])').forEach(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  // Catch selects populated or inserted by other scripts after load.
  setTimeout(run, 400);
})();
