import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

// Compact error state for a failed (non-401) list fetch: shows the message and
// a Retry button instead of leaving the page on an infinite skeleton.
export function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent>
        <Empty className="py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="bg-red-500/15 text-red-600 dark:text-red-400"><TriangleAlert /></EmptyMedia>
            <EmptyTitle>Couldn't load this page</EmptyTitle>
            <EmptyDescription>{message}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  );
}
