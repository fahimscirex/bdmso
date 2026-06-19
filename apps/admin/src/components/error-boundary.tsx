import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

type Props = { children: ReactNode };
type State = { error: Error | null };

// Top-level boundary so a render throw shows a recoverable fallback instead of
// blanking the whole admin. Resets when the route key changes (see App.tsx).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[admin] render error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Card>
        <CardContent>
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-red-500/15 text-red-600 dark:text-red-400"><TriangleAlert /></EmptyMedia>
              <EmptyTitle>Something went wrong</EmptyTitle>
              <EmptyDescription>{this.state.error.message || 'An unexpected error occurred.'}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Reload</Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    );
  }
}
