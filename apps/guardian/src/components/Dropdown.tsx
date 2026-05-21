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
  const ref = useRef<HTMLDivElement>(null);

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

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setFilter('');
  }

  return (
    <div class={`bdsel${open ? ' is-open' : ''}`} ref={ref}>
      <button
        type="button"
        class={`bdsel-trigger${value ? '' : ' is-placeholder'}`}
        aria-label={ariaLabel}
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
              onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            />
          )}
          <div class="bdsel-list">
            {shown.length === 0 && <div class="bdsel-empty">No matches</div>}
            {shown.map((o) => (
              <button
                type="button" key={o.value}
                class={`bdsel-opt${o.value === value ? ' is-selected' : ''}`}
                onClick={() => choose(o.value)}
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
