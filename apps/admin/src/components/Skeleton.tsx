// Skeleton primitives for loading states. Same shimmer style as the
// guardian app's .sk-bar so the two surfaces look related. Each variant
// matches a rendered shape one-to-one so when data lands the layout
// doesn't snap visibly.

import type { JSX } from 'preact';

/** Plain shimmer bar. Width/height come from props or class overrides. */
export function SkBar({ class: cls, style }: { class?: string; style?: string }) {
  return <span class={`sk-bar${cls ? ` ${cls}` : ''}`} style={style} />;
}

/** KPI tile placeholder (matches .stat dimensions). */
export function SkTile() {
  return (
    <div class="stat">
      <SkBar class="sk-bar-num" />
      <SkBar class="sk-bar-label" />
    </div>
  );
}

/** Four KPI tiles in a row. Default skeleton for the Dashboard tile bands. */
export function SkStatRow({ count = 4 }: { count?: number }) {
  return (
    <div class="stat-row">
      {Array.from({ length: count }).map((_, i) => <SkTile key={i} />)}
    </div>
  );
}

/** Table-row placeholder. `cols` is the column count - we render one bar per cell. */
export function SkRow({ cols }: { cols: number }) {
  return (
    <tr class="sk-row">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}>
          <SkBar class={i === 0 ? 'sk-bar-title' : 'sk-bar-line'} />
          {i === 0 && <SkBar class="sk-bar-meta sk-w-1x2" />}
        </td>
      ))}
    </tr>
  );
}

/** Full table skeleton wrapped in the same .table-wrap shell as real lists. */
export function SkTable({ headers, rows = 6 }: { headers: string[]; rows?: number }) {
  return (
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkRow key={i} cols={headers.length} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Card placeholder for the dashboard "Latest activity", "Conversion funnel" etc. */
export function SkCard({ title, lines = 4 }: { title?: string; lines?: number }) {
  return (
    <section class="card">
      {title ? <h2>{title}</h2> : <SkBar class="sk-bar-h3" />}
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style="display:flex;align-items:center;gap:12px;padding:10px 0;">
          <SkBar class="sk-bar-meta" style="width:30%;" />
          <SkBar class="sk-bar-line" style="flex:1;" />
        </div>
      ))}
    </section>
  );
}

/** Wraps the skeleton tree in a div that fades in on first render. */
export function SkRoot({ children }: { children: JSX.Element | JSX.Element[] }) {
  return <div class="sk-root" aria-hidden="true">{children}</div>;
}
