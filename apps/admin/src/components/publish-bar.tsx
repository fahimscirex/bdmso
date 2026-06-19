import { useCallback, useEffect, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import type { PendingPublish } from '@/lib/api';
import { api } from '@/lib/api';
import { useRouter } from '@/router';
import { run } from '@/lib/run';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type Change = PendingPublish['changes'][number];

const actionLabel: Record<Change['action'], string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
};
const actionVariant: Record<Change['action'], 'default' | 'secondary' | 'destructive'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
};
const entityLabel = (t: string) => t.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Staged-publish control for the app shell header. Shows a count badge when
// there are unpublished content changes, and opens a review panel to commit
// (publish) or discard them. Polls the pending count on mount and every 30s.
export function PublishBar() {
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState<PendingPublish | null>(null);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  const { path } = useRouter();

  const refreshCount = useCallback(() => {
    api.getPendingPublish().then((p) => setCount(p.count)).catch(() => {});
  }, []);

  // Re-check the pending count on mount, on every navigation, every 30s, and
  // immediately after any admin mutation (so the bar appears as soon as a
  // content edit stages a change, on whatever page you are on - not only on the
  // content page where the edit happened).
  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 30_000);
    window.addEventListener('admin:mutated', refreshCount);
    return () => { clearInterval(id); window.removeEventListener('admin:mutated', refreshCount); };
  }, [refreshCount, path]);

  const openPanel = () => {
    api.getPendingPublish().then((p) => {
      setPending(p);
      setCount(p.count);
      setMessage(p.suggestedMessage);
      setOpen(true);
    }).catch(() => {});
  };

  const afterAction = () => {
    setOpen(false);
    setPending(null);
    refreshCount();
  };

  if (count <= 0) return null;

  const grouped = (pending?.changes ?? []).reduce<Record<string, Change[]>>((acc, c) => {
    (acc[c.entity_type] ??= []).push(c);
    return acc;
  }, {});

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-2" onClick={openPanel}>
        <UploadCloud className="size-3.5" />
        <span className="hidden md:inline">Publish</span>
        <Badge variant="default" className="px-1.5 tabular-nums">{count}</Badge>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Review &amp; publish</SheetTitle>
            <SheetDescription>
              {count} pending {count === 1 ? 'change' : 'changes'} will be committed to the live site.
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1 px-4">
            <div className="space-y-4 pb-4">
              {Object.entries(grouped).map(([type, items]) => (
                <div key={type} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{entityLabel(type)}</div>
                  <ul className="space-y-1.5">
                    {items.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <Badge variant={actionVariant[c.action]} className="shrink-0">{actionLabel[c.action]}</Badge>
                        <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>

          <SheetFooter>
            <div className="space-y-1.5">
              <label htmlFor="publish-message" className="text-xs font-medium text-muted-foreground">Commit message</label>
              <Textarea
                id="publish-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="flex-1"
                onClick={() => run(api.publishChanges(message), 'Published', afterAction)}
              >
                Publish
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Discard all</Button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Discard all pending changes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This reverts the {count} staged {count === 1 ? 'change' : 'changes'} back to the last published version. It cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => run(api.discardPending(), 'Changes reverted', () => window.location.reload())}
                    >
                      Discard all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
