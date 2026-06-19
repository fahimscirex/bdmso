import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/http';

// Load a list (or any record) once on mount with a real error path. A non-401
// failure leaves `error` set so the page can show an error card + Retry instead
// of an infinite skeleton; 401 is handled globally by the auth context, so we
// don't surface it as a page error (the app drops to the login screen).
export function useList<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    return fetcher()
      .then((d) => setData(d))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) return;
        setError((e as Error).message || 'Failed to load.');
      });
    // fetcher is expected to be stable (a top-level api method); callers that
    // close over props should wrap it in their own useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { data, error, reload, setData };
}
