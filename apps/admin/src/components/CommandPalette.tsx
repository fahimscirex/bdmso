// Global command palette (Cmd+K / Ctrl+K). Quick nav across pages,
// search recent registrations by name, and run a few common actions
// without leaving the keyboard.
//
// Items come from three sources:
//   1. Static nav entries (the same list NavShell uses)
//   2. Static action shortcuts (New post, New coupon, Open Triage, etc.)
//   3. Live registration search (debounced) - only fires when the query
//      is 2+ characters so an empty palette doesn't hammer the API.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { navigate } from '../router';
import { api } from '../api';
import { Icon, type IconName } from './Icon';

type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  action: () => void;
  group: 'nav' | 'action' | 'reg';
};

const NAV_ITEMS: Item[] = [
  { id: 'nav-/',              label: 'Dashboard',     icon: 'dashboard',   group: 'nav', action: () => navigate('/') },
  { id: 'nav-/triage',        label: 'Triage',        icon: 'inbox',       group: 'nav', action: () => navigate('/triage') },
  { id: 'nav-/registrations', label: 'Registrations', icon: 'list-checks', group: 'nav', action: () => navigate('/registrations') },
  { id: 'nav-/payments',      label: 'Payments',      icon: 'wallet',      group: 'nav', action: () => navigate('/payments') },
  { id: 'nav-/payments/reports', label: 'Payment reports', icon: 'dashboard', group: 'nav', action: () => navigate('/payments/reports') },
  { id: 'nav-/sponsorships',  label: 'Sponsorships',  icon: 'megaphone',   group: 'nav', action: () => navigate('/sponsorships') },
  { id: 'nav-/broadcast',     label: 'Broadcast',     icon: 'send',        group: 'nav', action: () => navigate('/broadcast') },
  { id: 'nav-/events',        label: 'Events (event day)', icon: 'sparkle', group: 'nav', action: () => navigate('/events') },
  { id: 'nav-/posts',         label: 'Posts',         icon: 'file-text',   group: 'nav', action: () => navigate('/posts') },
  { id: 'nav-/coupons',       label: 'Coupons',       icon: 'tag',         group: 'nav', action: () => navigate('/coupons') },
  { id: 'nav-/users',         label: 'Users',         icon: 'users',       group: 'nav', action: () => navigate('/users') },
  { id: 'nav-/audit',         label: 'Audit log',     icon: 'history',     group: 'nav', action: () => navigate('/audit') },
  { id: 'nav-/settings',      label: 'Settings',      icon: 'settings',    group: 'nav', action: () => navigate('/settings') },
];

const ACTION_ITEMS: Item[] = [
  { id: 'act-new-post',   label: 'New post',   hint: 'Create a draft', icon: 'plus', group: 'action', action: () => navigate('/posts/new') },
  { id: 'act-new-coupon', label: 'New coupon', hint: 'Single-code create on Coupons',   icon: 'plus', group: 'action', action: () => navigate('/coupons') },
  { id: 'act-bulk-remind', label: 'Send reminders to unpaid', hint: 'Open Registrations with stuck filter', icon: 'mail', group: 'action', action: () => navigate('/registrations?stuck=1') },
];

type RegHit = { id: string; student_full_name: string; guardian_email: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [regs,  setRegs]  = useState<RegHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus + reset state on open.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    setRegs([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Debounced registration search.
  useEffect(() => {
    if (!open || query.trim().length < 2) { setRegs([]); return; }
    const t = setTimeout(() => {
      api.get<{ rows: RegHit[] }>(`/api/admin/registrations?limit=8&q=${encodeURIComponent(query.trim())}`)
        .then((d) => setRegs(d.rows))
        .catch(() => setRegs([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  // Filter static items by query; registration items always come through.
  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...NAV_ITEMS, ...ACTION_ITEMS];
    const filtered = q ? base.filter((it) => it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q)) : base;
    const regItems: Item[] = regs.map((r) => ({
      id: `reg-${r.id}`,
      label: r.student_full_name,
      hint: r.guardian_email,
      icon: 'list-checks',
      group: 'reg',
      action: () => navigate(`/registrations/${r.id}`),
    }));
    return [...filtered, ...regItems];
  }, [query, regs]);

  // Clamp active index.
  useEffect(() => { if (activeIdx >= items.length) setActiveIdx(Math.max(0, items.length - 1)); }, [items.length]);

  function runActive() {
    const it = items[activeIdx];
    if (!it) return;
    it.action();
    onClose();
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape')      { onClose(); return; }
    if (e.key === 'ArrowDown')   { e.preventDefault(); setActiveIdx((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter')  { e.preventDefault(); runActive(); }
  }

  if (!open) return null;

  // Group headers - render based on the first item in each group.
  const groupedRanges: { from: number; to: number; group: Item['group'] }[] = [];
  for (let i = 0; i < items.length; i++) {
    const g = items[i].group;
    const last = groupedRanges[groupedRanges.length - 1];
    if (last && last.group === g) last.to = i;
    else groupedRanges.push({ from: i, to: i, group: g });
  }
  const groupLabel: Record<Item['group'], string> = {
    nav: 'Pages',
    action: 'Actions',
    reg: 'Registrations',
  };

  return (
    <div class="cmdk-backdrop" onClick={onClose}>
      <div class="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div class="cmdk-input-row">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Jump to page, search registrations, run an action…"
            value={query}
            onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setActiveIdx(0); }}
            onKeyDown={handleKey}
          />
          <kbd class="cmdk-kbd">esc</kbd>
        </div>
        <div class="cmdk-results">
          {items.length === 0 ? (
            <div class="cmdk-empty">No matches.</div>
          ) : (
            groupedRanges.map((range) => (
              <div key={`${range.from}-${range.group}`}>
                <div class="cmdk-group">{groupLabel[range.group]}</div>
                {items.slice(range.from, range.to + 1).map((it, idx) => {
                  const realIdx = range.from + idx;
                  const active = realIdx === activeIdx;
                  return (
                    <button
                      type="button"
                      key={it.id}
                      class={`cmdk-item${active ? ' cmdk-item-active' : ''}`}
                      onMouseEnter={() => setActiveIdx(realIdx)}
                      onClick={() => { it.action(); onClose(); }}
                    >
                      <Icon name={it.icon} size={15} />
                      <span class="cmdk-item-label">{it.label}</span>
                      {it.hint && <span class="cmdk-item-hint">{it.hint}</span>}
                      {active && <kbd class="cmdk-kbd cmdk-kbd-sm">↵</kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div class="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
