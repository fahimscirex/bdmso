// Change-selection modal. Lets a guardian swap the option(s) on a
// program-with-options registration (Prep Course subjects, Mock Test
// sessions). Drives three different commit paths depending on the diff:
//
//  - Same price (or any change on an unpaid registration)
//      -> PATCH /api/me/registrations/:id/options
//  - Upgrade on a paid registration (new total > paid)
//      -> POST  /api/me/registrations/:id/options/upgrade  -> shurjoPay
//  - Downgrade on a paid registration (new total < paid)
//      -> PATCH /api/me/registrations/:id/options with acknowledge_no_refund:true
//
// Catalog data (kind, items, prices) and the editability flag come down
// inline on the /api/me registration row, so this component never has
// to fetch the catalog separately.

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
  config: OptionsConfig;
  currentIds: string[];
  // Option ids already held by OTHER registrations on the same account
  // for the same program (e.g., a guardian who booked Mock Test 1 - Math
  // on one registration shouldn't be able to pick that same slot on a
  // separate Mock Test booking - it would duplicate the session).
  // Items in this set are still rendered, but disabled with a hint.
  unavailableIds?: string[];
  onClose: () => void;
  onChanged: () => void;
};

function formatBdt(n: number): string {
  return `৳ ${Number(n).toLocaleString('en-BD')}`;
}

export default function ChangeSelectionModal({
  registrationId, programLabel, paid, config, currentIds, unavailableIds = [], onClose, onChanged,
}: Props) {
  const [selected, setSelected]   = useState<string[]>(currentIds);
  const [ack, setAck]             = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  // Items held by OTHER registrations on the same account. Excludes
  // ids the current row already owns so the guardian can keep their
  // existing pick even if it's "taken" (by themselves).
  const unavailable = new Set(unavailableIds.filter((id) => !currentIds.includes(id)));

  // Prices come from the inline config so the preview number updates
  // instantly. The server still re-validates on submit, so this is just
  // a UX affordance, not a trust boundary.
  const fromPrice = useMemo(() => sumPrice(config, currentIds), [config, currentIds]);
  const toPrice   = useMemo(() => sumPrice(config, selected),   [config, selected]);
  const delta     = toPrice - fromPrice;
  const action: 'same' | 'upgrade' | 'downgrade' =
    delta === 0 ? 'same' : delta > 0 ? 'upgrade' : 'downgrade';
  const empty = selected.length === 0
    || (config.kind === 'radio' && selected.length !== 1);
  // "Same total price" (action === 'same') and "same exact selection"
  // are different. Swapping Math for Science keeps the total at 500
  // but the ids differ. We compare ids here so the Save button
  // disables only when there's literally nothing to commit.
  const unchanged = selected.length === currentIds.length
    && selected.every((id) => currentIds.includes(id));

  function toggle(id: string) {
    if (unavailable.has(id)) return;
    if (config.kind === 'radio') {
      setSelected([id]);
      return;
    }
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  async function submit() {
    if (submitting || empty) return;
    if (paid && action === 'downgrade' && !ack) {
      setError('Please confirm you understand the no-refund policy.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (paid && action === 'upgrade') {
        const res = await api.post<{ ok: true; checkoutURL?: string; delta: number }>(
          `/api/me/registrations/${registrationId}/options/upgrade`,
          { options: selected },
        );
        if (res.checkoutURL) {
          location.href = res.checkoutURL;
          return;
        }
        // Shouldn't happen (upgrade endpoint always returns a checkout
        // URL for non-zero deltas), but if amount somehow rounded to 0
        // we treat it as a same-price change.
        await api.patch(`/api/me/registrations/${registrationId}/options`, { options: selected });
      } else {
        await api.patch(`/api/me/registrations/${registrationId}/options`, {
          options: selected,
          ...(paid && action === 'downgrade' ? { acknowledge_no_refund: true } : {}),
        });
      }
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  // Esc to close - same affordance as the rest of the SPA.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ctaLabel =
    submitting ? 'Saving…' :
    unchanged                      ? 'No changes' :
    paid && action === 'upgrade'   ? `Pay ${formatBdt(delta)} more & continue` :
    paid && action === 'downgrade' ? `Save (no refund of ${formatBdt(-delta)})` :
                                     'Save';

  return (
    <div class="cs-modal" role="dialog" aria-modal="true" aria-label="Change selection">
      <div class="cs-backdrop" onClick={onClose} />
      <div class="cs-dialog">
        <header class="cs-head">
          <div>
            <p class="cs-eyebrow">{programLabel}</p>
            <h2 class="cs-title">Change selection</h2>
          </div>
          <button type="button" class="cs-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div class="cs-body">
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
            <div class="cs-summary-row">
              <span>Current</span>
              <span>{formatBdt(fromPrice)}</span>
            </div>
            <div class="cs-summary-row">
              <span>New</span>
              <span>{formatBdt(toPrice)}</span>
            </div>
            <div class={`cs-summary-row cs-summary-delta ${action}`}>
              <span>{action === 'upgrade' ? 'You pay' : action === 'downgrade' ? 'Difference' : 'No change'}</span>
              <span>{action === 'same' ? '-' : formatBdt(Math.abs(delta))}</span>
            </div>
          </div>

          {paid && action === 'downgrade' && (
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
            class={`cs-submit cs-submit-${action}`}
            onClick={submit}
            disabled={submitting || empty || unchanged || (paid && action === 'downgrade' && !ack)}
          >
            {ctaLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function sumPrice(config: OptionsConfig, ids: string[]): number {
  const set = new Set(ids);
  let total = 0;
  for (const it of config.items) if (set.has(it.id)) total += it.price;
  return total;
}
