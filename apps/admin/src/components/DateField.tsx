import { useRef, useEffect } from 'preact/hooks';
import flatpickr from 'flatpickr';

// A flatpickr-backed date input that ALWAYS displays dd/mm/yyyy regardless of
// the browser locale (a native <input type="date"> follows the browser locale,
// which we can't control). The component speaks ISO yyyy-mm-dd to its parent
// via `value` / `onChange`, exactly like the native inputs it replaces.
interface Props {
  value: string;                 // ISO yyyy-mm-dd, or '' when empty
  onChange: (iso: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  min?: string;                  // ISO bound, optional
  max?: string;
  required?: boolean;
  class?: string;
}

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// dateFormat is d/m/Y, which flatpickr also uses to parse minDate/maxDate/defaultDate
// strings - so ISO bounds/values must be passed as Date objects, not strings.
const parseIso = (iso?: string): Date | undefined => (iso ? new Date(iso + 'T00:00:00') : undefined);

export function DateField({ value, onChange, placeholder = 'dd/mm/yyyy', ariaLabel, min, max, required, class: className }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const fp = useRef<flatpickr.Instance | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    fp.current = flatpickr(el, {
      dateFormat: 'd/m/Y',         // what the user sees + types
      allowInput: true,
      minDate: parseIso(min),
      maxDate: parseIso(max),
      defaultDate: parseIso(value),
      onChange: (dates) => cb.current(dates[0] ? toIso(dates[0]) : ''),
    });
    // Commit a fully-typed dd/mm/yyyy immediately (no need to blur/Enter first).
    const onInput = () => {
      const v = el.value.trim();
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
        const d = fp.current?.parseDate(v, 'd/m/Y');
        if (d) fp.current?.setDate(d, true);
      }
    };
    el.addEventListener('input', onInput);
    return () => { el.removeEventListener('input', onInput); fp.current?.destroy(); fp.current = null; };
  }, []);

  // Reflect external value changes (form load / reset) without re-firing onChange.
  useEffect(() => {
    const inst = fp.current;
    if (!inst) return;
    const cur = inst.selectedDates[0] ? toIso(inst.selectedDates[0]) : '';
    if (value !== cur) inst.setDate(value || '', false, 'Y-m-d');
  }, [value]);

  useEffect(() => { fp.current?.set('minDate', parseIso(min) ?? null); }, [min]);
  useEffect(() => { fp.current?.set('maxDate', parseIso(max) ?? null); }, [max]);

  return (
    <input
      ref={ref}
      type="text"
      class={`date-input${className ? ' ' + className : ''}`}
      placeholder={placeholder}
      aria-label={ariaLabel}
      required={required}
    />
  );
}
