// Single editor for everything a guardian can change on a registration:
//
//   1. Option selection (Prep Course subjects, Mock Test sessions,
//      National Olympiad's Math / Science / Both price tier). Commits
//      via:
//        - Same price / any unpaid edit
//            PATCH /api/me/registrations/:id/options
//        - Paid upgrade
//            POST  /api/me/registrations/:id/options/upgrade  -> shurjoPay
//        - Paid downgrade
//            PATCH /api/me/registrations/:id/options
//            with acknowledge_no_refund: true
//   2. Per-program meta fields (Olympiad's preferred_subject + venue,
//      Quiz's venue). Commits via:
//        - PATCH /api/me/registrations/:id  with preferred_subject /
//          preferred_venue. EDITABLE_REG_FIELDS on the worker side
//          handles validation.
//
// Sections render only when applicable. Save runs the meta PATCH
// first (sync, no redirect), then the options call (which may itself
// redirect to shurjoPay for an upgrade). If only meta changed, only
// the meta PATCH fires. If only options changed, only the options
// call fires.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api';

export type OptionItem = {
  id: string;
  label: string;
  sub?: string;
  price: number;
};

export type OptionsConfig = {
  kind: 'radio' | 'checkbox';
  label: string;
  help?: string;
  items: OptionItem[];
};

type Props = {
  registrationId: string;
  programLabel: string;
  paid: boolean;
  // Options section - omit `config` for programs without options
  // (Olympiad / Quiz meta-only edits).
  config: OptionsConfig | null;
  currentIds: string[];
  // Option ids already held by OTHER registrations on the same account
  // for the same program. Disabled in the picker; server also rejects.
  unavailableIds?: string[];
  // Meta sections - render only when true
  showSubject?: boolean;
  showVenue?: boolean;
  currentSubject?: string | null;
  currentVenue?: string | null;
  onClose: () => void;
  onChanged: () => void;
};

const VENUE_OPTIONS = [
  { value: 'dhaka',      label: 'Dhaka' },
  { value: 'chittagong', label: 'Chittagong' },
  { value: 'rangpur',    label: 'Rangpur' },
  { value: 'sylhet',     label: 'Sylhet' },
];
const SUBJECT_OPTIONS = [
  { value: 'math',    label: 'Math' },
  { value: 'science', label: 'Science' },
  { value: 'both',    label: 'Both' },
];

function formatBdt(n: number): string {
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

function sumPrice(config: OptionsConfig | null, ids: string[]): number {
  if (!config) return 0;
  const set = new Set(ids);
  let total = 0;
  for (const it of config.items) if (set.has(it.id)) total += it.price;
  return total;
}

export default function ChangeSelectionModal({
  registrationId, programLabel, paid, config, currentIds,
  unavailableIds = [],
  showSubject = false, showVenue = false,
  currentSubject = null, currentVenue = null,
  onClose, onChanged,
}: Props) {
  const [selected, setSelected] = useState<string[]>(currentIds);
  const [subject,  setSubject]  = useState<string>(currentSubject || '');
  const [venue,    setVenue]    = useState<string>(currentVenue || '');
  const [ack, setAck]           = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Items held by OTHER registrations - excluding ids the current row
  // already owns so the guardian can keep their existing pick.
  const unavailable = new Set(unavailableIds.filter((id) => !currentIds.includes(id)));

  const fromPrice = useMemo(() => sumPrice(config, currentIds), [config, currentIds]);
  const toPrice   = useMemo(() => sumPrice(config, selected),   [config, selected]);
  const delta     = toPrice - fromPrice;
  const action: 'same' | 'upgrade' | 'downgrade' =
    delta === 0 ? 'same' : delta > 0 ? 'upgrade' : 'downgrade';

  const hasOptionsSection = !!config;
  const optionsChanged = hasOptionsSection && (
    selected.length !== currentIds.length || !selected.every((id) => currentIds.includes(id))
  );
  const subjectChanged = showSubject && subject !== (currentSubject || '');
  const venueChanged   = showVenue   && venue   !== (currentVenue || '');
  const metaChanged    = subjectChanged || venueChanged;
  const hasChanges     = optionsChanged || metaChanged;

  const optionsInvalid = hasOptionsSection && (
    selected.length === 0 || (config!.kind === 'radio' && selected.length !== 1)
  );
  const needsAck = paid && optionsChanged && action === 'downgrade';

  function toggle(id: string) {
    if (unavailable.has(id)) return;
    if (!config) return;
    if (config.kind === 'radio') {
      setSelected([id]);
      return;
    }
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function submit() {
    if (submitting || !hasChanges || optionsInvalid) return;
    if (needsAck && !ack) {
      setError('Please confirm you understand the no-refund policy.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Step 1: meta PATCH (subject + venue) if changed. Run first
      // so the meta is saved even when the options call redirects
      // to the gateway.
      if (metaChanged) {
        const body: Record<string, string> = {};
        if (subjectChanged) body.preferred_subject = subject;
        if (venueChanged)   body.preferred_venue   = venue;
        await api.patch(`/api/me/registrations/${registrationId}`, body);
      }

      // Step 2: options. Upgrade -> redirect; same/downgrade -> PATCH.
      if (optionsChanged) {
        if (paid && action === 'upgrade') {
          const res = await api.post<{ ok: true; checkoutURL?: string; delta: number }>(
            `/api/me/registrations/${registrationId}/options/upgrade`,
            { options: selected },
          );
          if (res.checkoutURL) {
            location.href = res.checkoutURL;
            return;
          }
          // Defensive: should never happen for a positive delta.
          await api.patch(`/api/me/registrations/${registrationId}/options`, { options: selected });
        } else {
          await api.patch(`/api/me/registrations/${registrationId}/options`, {
            options: selected,
            ...(paid && action === 'downgrade' ? { acknowledge_no_refund: true } : {}),
          });
        }
      }
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ctaLabel =
    submitting             ? 'Saving…' :
    !hasChanges            ? 'No changes' :
    paid && optionsChanged && action === 'upgrade'   ? `Pay ${formatBdt(delta)} more & continue` :
    paid && optionsChanged && action === 'downgrade' ? `Save (no refund of ${formatBdt(-delta)})` :
                                                       'Save';

  return (
    <div class="cs-modal" role="dialog" aria-modal="true" aria-label="Edit enrollment">
      <div class="cs-backdrop" onClick={onClose} />
      <div class="cs-dialog">
        <header class="cs-head">
          <div>
            <p class="cs-eyebrow">{programLabel}</p>
            <h2 class="cs-title">Edit enrollment</h2>
          </div>
          <button type="button" class="cs-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div class="cs-body">
          {hasOptionsSection && config && (
            <>
              {config.help && <p class="cs-help">{config.help}</p>}
              <ul class="cs-options">
                {config.items.map((it) => {
                  const checked = selected.includes(it.id);
                  const taken   = unavailable.has(it.id);
                  return (
                    <li key={it.id} class={`cs-option ${checked ? 'on' : ''} ${taken ? 'taken' : ''}`}>
                      <label>
                        <input
                          type={config.kind === 'radio' ? 'radio' : 'checkbox'}
                          name={config.kind === 'radio' ? `cs-${registrationId}` : undefined}
                          checked={checked}
                          onChange={() => toggle(it.id)}
                          disabled={submitting || taken}
                        />
                        <span class="cs-option-body">
                          <span class="cs-option-top">
                            <span class="cs-option-label">{it.label}{taken ? ' · Already enrolled' : ''}</span>
                            <span class="cs-option-price">{formatBdt(it.price)}</span>
                          </span>
                          {it.sub && <span class="cs-option-sub">{it.sub}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div class="cs-summary">
                <div class="cs-summary-row"><span>Current</span><span>{formatBdt(fromPrice)}</span></div>
                <div class="cs-summary-row"><span>New</span><span>{formatBdt(toPrice)}</span></div>
                <div class={`cs-summary-row cs-summary-delta ${action}`}>
                  <span>{action === 'upgrade' ? 'You pay' : action === 'downgrade' ? 'Difference' : 'No change'}</span>
                  <span>{action === 'same' ? '-' : formatBdt(Math.abs(delta))}</span>
                </div>
              </div>
            </>
          )}

          {showSubject && (
            <div class="cs-field" style={hasOptionsSection ? 'margin-top:18px;' : ''}>
              <label class="cs-field-label" for={`ed-subj-${registrationId}`}>Preferred subject</label>
              <p class="cs-field-hint">Tiebreaker if your child qualifies in both subjects.</p>
              <select
                id={`ed-subj-${registrationId}`}
                class="cs-select"
                value={subject}
                onChange={(e) => setSubject((e.target as HTMLSelectElement).value)}
                disabled={submitting}
              >
                <option value="">- select -</option>
                {SUBJECT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {showVenue && (
            <div class="cs-field">
              <label class="cs-field-label" for={`ed-venue-${registrationId}`}>Exam region</label>
              <p class="cs-field-hint">Where the student will sit the exam.</p>
              <select
                id={`ed-venue-${registrationId}`}
                class="cs-select"
                value={venue}
                onChange={(e) => setVenue((e.target as HTMLSelectElement).value)}
                disabled={submitting}
              >
                <option value="">- select -</option>
                {VENUE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {needsAck && (
            <label class="cs-ack">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck((e.target as HTMLInputElement).checked)}
                disabled={submitting}
              />
              <span>I understand the {formatBdt(-delta)} difference won't be refunded.</span>
            </label>
          )}

          {error && <p class="cs-error">{error}</p>}
        </div>

        <footer class="cs-foot">
          <button type="button" class="cs-cancel" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            type="button"
            class={`cs-submit cs-submit-${optionsChanged ? action : 'same'}`}
            onClick={submit}
            disabled={submitting || !hasChanges || optionsInvalid || (needsAck && !ack)}
          >
            {ctaLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
