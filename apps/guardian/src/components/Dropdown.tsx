// Custom dropdown - replaces native <select>, whose OS-rendered open
// list can't have its hovered-option colours styled reliably. Reuses
// the shared .bdsel styles from /css/styles.css.

import { useState, useRef, useEffect } from 'preact/hooks';

type Opt = { value: string; label: string };

export function Dropdown({ value, onChange, options, placeholder, ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  options: Opt[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen]     = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(-1);
  const ref     = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected   = options.find((o) => o.value === value);
  const showFilter = options.length > 10;
  const q          = filter.trim().toLowerCase();
  const shown      = showFilter && q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  // When the panel opens, seed the active option to the current value so
  // arrow keys start from the right place. Clamp when the filtered list
  // changes so the index never points past the end.
  useEffect(() => {
    if (!open) { setActive(-1); return; }
    const i = shown.findIndex((o) => o.value === value);
    setActive(i);
  }, [open]);
  useEffect(() => {
    if (open && active >= shown.length) setActive(shown.length - 1);
  }, [shown.length]);

  // Move the DOM focus to the active option for a roving-focus pattern,
  // so screen readers announce the option as it changes.
  useEffect(() => {
    if (!open || active < 0) return;
    const node = listRef.current?.children[active] as HTMLElement | undefined;
    node?.focus();
  }, [active, open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setFilter('');
  }

  function move(delta: number) {
    if (shown.length === 0) return;
    setActive((i) => {
      const next = i < 0 ? (delta > 0 ? 0 : shown.length - 1) : i + delta;
      return Math.max(0, Math.min(shown.length - 1, next));
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (!open) { setOpen(true); } else { move(1); } break;
      case 'ArrowUp':   e.preventDefault(); if (!open) { setOpen(true); } else { move(-1); } break;
      case 'Home':      if (open) { e.preventDefault(); setActive(0); } break;
      case 'End':       if (open) { e.preventDefault(); setActive(shown.length - 1); } break;
      case 'Enter':
      case ' ':
        if (!open) { e.preventDefault(); setOpen(true); break; }
        if (active >= 0 && shown[active]) { e.preventDefault(); choose(shown[active].value); }
        break;
    }
  }

  return (
    <div class={`bdsel${open ? ' is-open' : ''}`} ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        class={`bdsel-trigger${value ? '' : ' is-placeholder'}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? selected.label : (placeholder || 'Select…')}
      </button>
      {open && (
        <div class="bdsel-panel">
          {showFilter && (
            <input
              type="text" class="bdsel-search" placeholder="Type to filter…"
              autofocus value={filter}
              onInput={(e) => { setFilter((e.target as HTMLInputElement).value); setActive(-1); }}
            />
          )}
          <div class="bdsel-list" role="listbox" aria-label={ariaLabel} ref={listRef}>
            {shown.length === 0 && <div class="bdsel-empty">No matches</div>}
            {shown.map((o, i) => (
              <button
                type="button" key={o.value}
                role="option"
                aria-selected={o.value === value}
                tabIndex={i === active ? 0 : -1}
                class={`bdsel-opt${o.value === value ? ' is-selected' : ''}${i === active ? ' is-active' : ''}`}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setActive(i)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
