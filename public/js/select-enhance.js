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

    // Stable per-instance id so the listbox + active option can be wired
    // to the trigger via aria-controls / aria-activedescendant.
    const uid = `bdsel-${Math.random().toString(36).slice(2, 9)}`;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'bdsel-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${uid}-list`);
    // Carry the native label so the replacement is announced like the
    // original control it stands in for.
    const labelId = select.getAttribute('aria-labelledby');
    if (labelId) trigger.setAttribute('aria-labelledby', labelId);
    const ariaLabel = select.getAttribute('aria-label');
    if (ariaLabel) trigger.setAttribute('aria-label', ariaLabel);

    const panel = document.createElement('div');
    panel.className = 'bdsel-panel';
    panel.hidden = true;

    wrap.append(trigger, panel);

    let filterInput = null;
    let list = null;
    // The keyboard-highlighted option element (aria-activedescendant target).
    let activeOpt = null;

    function buildPanel() {
      panel.textContent = '';
      activeOpt = null;
      const opts = Array.from(select.options);
      // A type-to-filter box for long lists (e.g. 64 districts).
      if (opts.length > 10) {
        filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.className = 'bdsel-search';
        filterInput.placeholder = 'Type to filter…';
        filterInput.setAttribute('aria-label', 'Filter options');
        filterInput.addEventListener('input', applyFilter);
        filterInput.addEventListener('click', (e) => e.stopPropagation());
        filterInput.addEventListener('keydown', (e) => onOpenKey(e, true));
        panel.appendChild(filterInput);
      } else {
        filterInput = null;
      }
      list = document.createElement('div');
      list.className = 'bdsel-list';
      list.id = `${uid}-list`;
      list.setAttribute('role', 'listbox');
      if (labelId) list.setAttribute('aria-labelledby', labelId);
      else if (ariaLabel) list.setAttribute('aria-label', ariaLabel);
      opts.forEach((opt, i) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'bdsel-opt';
        item.id = `${uid}-opt-${i}`;
        item.setAttribute('role', 'option');
        item.textContent = opt.textContent;
        item.dataset.value = opt.value;
        const selected = !!opt.value && opt.value === select.value;
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
        if (opt.disabled) { item.disabled = true; item.setAttribute('aria-disabled', 'true'); }
        if (selected) item.classList.add('is-selected');
        item.addEventListener('click', () => choose(opt.value));
        list.appendChild(item);
      });
      panel.appendChild(list);
    }

    // Visible options the keyboard cursor can land on (skips hidden/disabled).
    function navigableOpts() {
      if (!list) return [];
      return Array.from(list.querySelectorAll('.bdsel-opt')).filter(
        (el) => !el.hidden && !el.disabled
      );
    }

    function setActive(el) {
      if (activeOpt) activeOpt.classList.remove('is-active');
      activeOpt = el || null;
      if (activeOpt) {
        activeOpt.classList.add('is-active');
        trigger.setAttribute('aria-activedescendant', activeOpt.id);
        activeOpt.scrollIntoView({ block: 'nearest' });
      } else {
        trigger.removeAttribute('aria-activedescendant');
      }
    }

    function moveActive(delta) {
      const items = navigableOpts();
      if (!items.length) return;
      let idx = activeOpt ? items.indexOf(activeOpt) : -1;
      idx = idx < 0 ? (delta > 0 ? 0 : items.length - 1) : idx + delta;
      idx = Math.max(0, Math.min(items.length - 1, idx));
      setActive(items[idx]);
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
      // If the cursor landed on a now-hidden option, move it to the first match.
      if (activeOpt && activeOpt.hidden) {
        const items = navigableOpts();
        setActive(items[0] || null);
      }
    }

    function choose(value) {
      select.value = value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncTrigger();
      close();
      // Return focus to the trigger so keyboard users keep their place.
      trigger.focus();
    }

    function syncTrigger() {
      const sel = select.options[select.selectedIndex];
      trigger.textContent = sel ? sel.textContent : '';
      trigger.classList.toggle('is-placeholder', !select.value);
      panel.querySelectorAll('.bdsel-opt').forEach((el) => {
        const sel = !!el.dataset.value && el.dataset.value === select.value;
        el.classList.toggle('is-selected', sel);
        el.setAttribute('aria-selected', sel ? 'true' : 'false');
      });
    }

    function open() {
      buildPanel();
      syncTrigger();
      panel.hidden = false;
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      if (filterInput) { filterInput.value = ''; filterInput.focus(); }
      // Start the keyboard cursor on the selected option (or the first one).
      const cur = panel.querySelector('.bdsel-opt.is-selected') || navigableOpts()[0];
      setActive(cur || null);
    }
    function close() {
      if (panel.hidden) return;
      panel.hidden = true;
      wrap.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      activeOpt = null;
    }

    trigger.addEventListener('click', () => { if (panel.hidden) open(); else close(); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });

    // Handles keys while the panel is open. `typing` is true when the event
    // comes from the filter box, where Space/Home/End must edit text and only
    // Arrow/Enter/Escape drive the list.
    function onOpenKey(e, typing) {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); moveActive(1); return;
        case 'ArrowUp':   e.preventDefault(); moveActive(-1); return;
        case 'Home':      if (typing) return; e.preventDefault(); setActive(navigableOpts()[0] || null); return;
        case 'End':       if (typing) return; e.preventDefault(); setActive(navigableOpts().slice(-1)[0] || null); return;
        case 'Enter':     e.preventDefault(); if (activeOpt) choose(activeOpt.dataset.value); return;
        case ' ':         if (typing) return; e.preventDefault(); if (activeOpt) choose(activeOpt.dataset.value); return;
        case 'Escape':    e.preventDefault(); close(); trigger.focus(); return;
        case 'Tab':       close(); return;
        default:          return;
      }
    }

    // Keyboard on the trigger: open with Enter/Space/Arrow/Home/End; when open
    // (and no filter box has focus), drive the list. (APG listbox/combobox.)
    trigger.addEventListener('keydown', (e) => {
      if (panel.hidden) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp' ||
            e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          open();
          if (e.key === 'End') setActive(navigableOpts().slice(-1)[0] || null);
          else if (e.key === 'ArrowUp') moveActive(-1);
        }
        return;
      }
      onOpenKey(e, false);
    });
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
