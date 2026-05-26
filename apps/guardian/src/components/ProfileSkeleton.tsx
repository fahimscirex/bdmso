// Skeleton shown while /api/me/profile is loading. Mirrors the 2-col,
// 4-card profile layout so the page doesn't flash "Loading…" then
// snap to four cards in a new position.
//
// Reuses the shared .sk-bar shimmer + tokens from Home's skeleton -
// see index.css ".sk-*" rules. Only the layout shells (.sk-profile-*)
// are profile-specific.

export default function ProfileSkeleton() {
  return (
    <div class="sk-root sk-profile" aria-hidden="true">
      <div class="sk-profile-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} class="sk-profile-card">
            <div class="sk-profile-card-head">
              <span class="sk-bar sk-bar-h3" />
              <span class="sk-bar sk-bar-btn-sm" />
            </div>
            <div class="sk-profile-card-body">
              <div class="sk-profile-row">
                <span class="sk-bar sk-bar-label" />
                <span class="sk-bar sk-bar-line sk-w-3x4" />
              </div>
              <div class="sk-profile-row">
                <span class="sk-bar sk-bar-label" />
                <span class="sk-bar sk-bar-line sk-w-1x2" />
              </div>
              <div class="sk-profile-row">
                <span class="sk-bar sk-bar-label" />
                <span class="sk-bar sk-bar-line sk-w-2x3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Single-card skeleton for the StudentsCard's nested load (it hits
// /api/me independently of the outer profile fetch, so it can still
// be in flight after the outer page renders).
export function StudentsCardSkeleton() {
  return (
    <div class="sk-root" aria-hidden="true">
      <div class="sk-profile-row sk-profile-row-tall">
        <span class="sk-bar sk-bar-name" />
        <span class="sk-bar sk-bar-btn-sm" />
      </div>
      <div class="sk-profile-row">
        <span class="sk-bar sk-bar-line sk-w-1x2" />
      </div>
      <div class="sk-profile-row">
        <span class="sk-bar sk-bar-line sk-w-3x4" />
      </div>
    </div>
  );
}
