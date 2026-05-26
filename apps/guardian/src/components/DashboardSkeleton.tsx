// Skeleton placeholder shown while /api/me is in flight. Mirrors the
// real dashboard layout (hero + stats + section head + 2 registration
// rows + sidebar) so when data lands the eye doesn't have to retrack -
// shapes stay roughly where they were, content just sharpens.
//
// Plain spans with .sk-bar do the work; a shimmer keyframe on the
// container gives the whole grid a soft sweep so it doesn't read as
// "frozen UI".

export default function DashboardSkeleton() {
  return (
    <div class="sk-root" aria-hidden="true">
      {/* Hero band: greeting copy left, ID card right */}
      <section class="sk-hero">
        <div class="sk-hero-text">
          <span class="sk-bar sk-bar-pill" />
          <span class="sk-bar sk-bar-h1" />
          <span class="sk-bar sk-bar-line" />
          <span class="sk-bar sk-bar-line sk-w-2x3" />
        </div>
        <div class="sk-id-card">
          <span class="sk-bar sk-bar-eyebrow" />
          <span class="sk-bar sk-bar-name" />
          <span class="sk-bar sk-bar-eyebrow sk-mt" />
          <span class="sk-bar sk-bar-mono" />
        </div>
      </section>

      {/* Stat row: 4 KPI tiles */}
      <div class="sk-stat-row">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} class="sk-stat">
            <span class="sk-bar sk-bar-num" />
            <span class="sk-bar sk-bar-label" />
          </div>
        ))}
      </div>

      <div class="sk-grid">
        <div class="sk-main">
          {/* "Your registrations" section head */}
          <span class="sk-bar sk-bar-h2" />
          {/* Two registration rows */}
          {[0, 1].map((i) => (
            <div key={i} class="sk-reg">
              <div class="sk-reg-main">
                <span class="sk-bar sk-bar-title" />
                <span class="sk-bar sk-bar-meta" />
                <span class="sk-bar sk-bar-meta sk-w-1x2" />
              </div>
              <div class="sk-reg-side">
                <span class="sk-bar sk-bar-pill sk-center" />
                <span class="sk-bar sk-bar-amount sk-center" />
              </div>
              <div class="sk-reg-action">
                <span class="sk-bar sk-bar-btn" />
              </div>
            </div>
          ))}
        </div>
        <aside class="sk-side">
          {/* Checklist card */}
          <div class="sk-side-card">
            <span class="sk-bar sk-bar-h3" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} class="sk-side-row">
                <span class="sk-bar sk-bar-dot" />
                <span class="sk-bar sk-bar-line sk-w-3x4" />
              </div>
            ))}
          </div>
          {/* Key dates card */}
          <div class="sk-side-card">
            <span class="sk-bar sk-bar-h3" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} class="sk-side-row">
                <span class="sk-bar sk-bar-line sk-w-3x4" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
