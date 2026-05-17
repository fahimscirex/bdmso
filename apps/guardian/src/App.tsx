// Skeleton shell for the guardian dashboard. Real routes (home, registrations,
// payments, profile) ship in Sprint 1. This file's only job for 0d.1 is to
// prove the build pipeline + Worker serve path works end-to-end.

export function App() {
  return (
    <main class="shell">
      <div class="card">
        <div class="eyebrow">Guardian dashboard</div>
        <h1>BdMSO dashboard</h1>
        <p>
          Hello from <code>apps/guardian</code> at <code>/dashboard</code>. This is
          the Preact + Vite shell. Real screens land in Sprint 1.
        </p>
        <p class="meta">Built with Preact {/* preact version pulled from import.meta if needed */}.</p>
      </div>
    </main>
  );
}
