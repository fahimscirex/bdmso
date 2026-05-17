// Landing page after sign-in. Will grow into a real metrics overview once
// the data endpoints exist. For now: identity + system check.

import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from '../api';

type Health = {
  ok: true;
  accountId: string;
  email: string;
  role: string;
  serverTime: string;
};

export function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    api.get<Health>('/api/admin/health')
      .then(setHealth)
      .catch((err: ApiError) => setError(err.message));
  }, []);

  return (
    <>
      <div class="page-header">
        <h1>Dashboard</h1>
        <p class="sub">Welcome back. Real metrics ship in the next sprint — for now, a connection check.</p>
      </div>

      {error && <div class="error">{error}</div>}
      {health && (
        <section class="card">
          <h2>Session</h2>
          <dl class="kv">
            <dt>Email</dt><dd>{health.email}</dd>
            <dt>Role</dt><dd>{health.role}</dd>
            <dt>Account ID</dt><dd><code>{health.accountId}</code></dd>
            <dt>Server time</dt><dd>{new Date(health.serverTime).toLocaleString()}</dd>
          </dl>
        </section>
      )}
    </>
  );
}
