// Recoverable error state for the signed-in dashboard. A failed /api/me
// or /api/me/profile call used to collapse the whole page to a bare line
// of red text with no way forward but a manual refresh. This panel gives
// a 'Try again' button (transient blips, 500s) and, for an expired
// session (401), a 'Sign in again' link instead.

import { ApiError } from '../api';

export function ErrorPanel({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const isAuth = error.status === 401;
  return (
    <div class="error-panel" role="alert">
      <h2 class="error-panel-title">{isAuth ? 'Your session expired' : "Couldn't load your dashboard"}</h2>
      <p class="error-panel-msg">
        {isAuth
          ? 'Please sign in again to continue.'
          : 'This is usually a temporary network issue.'}
      </p>
      {!isAuth && <p class="error-panel-detail">{error.message}</p>}
      <div class="error-panel-actions">
        {isAuth ? (
          <a class="btn-primary" href="/login">Sign in again</a>
        ) : (
          <>
            <button type="button" class="btn-primary" onClick={onRetry}>Try again</button>
            <a class="btn-secondary" href="/login">Sign in again</a>
          </>
        )}
      </div>
    </div>
  );
}
