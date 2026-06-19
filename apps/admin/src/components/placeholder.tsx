import { FileQuestion } from 'lucide-react';
import { Link } from '@/router';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

// Shown only on a genuine 404 (the App router's switch default). Every mapped
// route renders a real page, so this is purely a not-found state.
export function Placeholder() {
  return (
    <>
      <PageHeader title="Page not found" description="This page doesn't exist." />
      <Card>
        <CardContent>
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon"><FileQuestion /></EmptyMedia>
              <EmptyTitle>Page not found</EmptyTitle>
              <EmptyDescription>The page you're looking for doesn't exist or has moved.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" asChild><Link href="/">Back to dashboard</Link></Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </>
  );
}
