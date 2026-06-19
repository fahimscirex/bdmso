import { toast } from 'sonner';

// Run a mutation promise with consistent success/error toasts. Optionally
// refetch after success (after) and roll back an optimistic UI change on
// failure (onError). Returns the promise so callers can await if needed.
export async function run(
  p: Promise<unknown>,
  ok: string,
  after?: () => void,
  onError?: () => void,
) {
  try {
    await p;
    toast.success(ok);
    after?.();
  } catch (e) {
    onError?.();
    toast.error('Action failed', { description: (e as Error).message });
  }
}
