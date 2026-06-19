import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { allNavItems } from '@/lib/nav';
import { Link, useRouter } from '@/router';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { CommandMenu } from './command-menu';
import { PublishBar } from './publish-bar';
import { ThemeToggle } from './theme-toggle';

export function AppShell({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = allNavItems.find((i) =>
    i.url === '/' ? path === '/' : path === i.url || path.startsWith(`${i.url}/`),
  );
  const title = current?.title ?? 'Not found';

  return (
    <SidebarProvider style={{ '--sidebar-width': '12.5rem' } as CSSProperties}>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex w-full items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden sm:block">
                  <BreadcrumbLink asChild>
                    <Link href="/">Admin</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-1.5">
              <PublishBar />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 text-muted-foreground"
                onClick={() => setCmdOpen(true)}
              >
                <Search className="size-3.5" />
                <span className="hidden md:inline">Search</span>
                <kbd className="ml-1 hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium md:inline-flex">
                  <span>⌘</span><span>K</span>
                </kbd>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-6 bg-muted/40 p-4 md:p-6 dark:bg-background">{children}</main>
      </SidebarInset>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </SidebarProvider>
  );
}
