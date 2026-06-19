import { lazy, Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { ErrorBoundary } from '@/components/error-boundary';
import { LoginScreen } from '@/components/login-screen';
import { Placeholder } from '@/components/placeholder';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from '@/router';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy routes - each page is its own chunk, so heavy deps (recharts, TanStack
// Table) load only when that page is first visited. Named exports are mapped to
// default for React.lazy.
const named = <T extends Record<string, unknown>, K extends keyof T>(p: Promise<T>, key: K) =>
  p.then((m) => ({ default: m[key] as React.ComponentType<Record<string, unknown>> }));

const DashboardPage = lazy(() => named(import('@/pages/dashboard'), 'DashboardPage'));
const TriagePage = lazy(() => named(import('@/pages/triage'), 'TriagePage'));
const ReportsPage = lazy(() => named(import('@/pages/reports'), 'ReportsPage'));
const RegistrationsPage = lazy(() => named(import('@/pages/registrations'), 'RegistrationsPage'));
const RegistrationDetailPage = lazy(() => named(import('@/pages/registration-detail'), 'RegistrationDetailPage'));
const PaymentsPage = lazy(() => named(import('@/pages/payments'), 'PaymentsPage'));
const ProgramsPage = lazy(() => named(import('@/pages/programs'), 'ProgramsPage'));
const CouponsPage = lazy(() => named(import('@/pages/coupons'), 'CouponsPage'));
const EventsPage = lazy(() => named(import('@/pages/events'), 'EventsPage'));
const SponsorshipsPage = lazy(() => named(import('@/pages/sponsorships'), 'SponsorshipsPage'));
const BroadcastPage = lazy(() => named(import('@/pages/broadcast'), 'BroadcastPage'));
const EmailTemplatesPage = lazy(() => named(import('@/pages/email-templates'), 'EmailTemplatesPage'));
const PostsPage = lazy(() => named(import('@/pages/posts'), 'PostsPage'));
const PressPage = lazy(() => named(import('@/pages/press'), 'PressPage'));
const HallOfFamePage = lazy(() => named(import('@/pages/hall-of-fame'), 'HallOfFamePage'));
const TeamPage = lazy(() => named(import('@/pages/team'), 'TeamPage'));
const UsersPage = lazy(() => named(import('@/pages/users'), 'UsersPage'));
const AuditPage = lazy(() => named(import('@/pages/audit'), 'AuditPage'));
const SystemHealthPage = lazy(() => named(import('@/pages/system-health'), 'SystemHealthPage'));

export function App() {
  const { path } = useRouter();
  const { status } = useAuth();
  if (status === 'loading') return <div className="grid min-h-dvh place-items-center text-sm text-muted-foreground">Loading…</div>;
  if (status !== 'authed') return <LoginScreen />;
  return (
    <AppShell>
      <ErrorBoundary key={path}>
        <Suspense fallback={<PageFallback />}>{renderPage(path)}</Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

function renderPage(path: string) {
  if (path.startsWith('/registrations/')) return <RegistrationDetailPage id={decodeURIComponent(path.slice('/registrations/'.length))} />;
  switch (path) {
    case '/': return <DashboardPage />;
    case '/triage': return <TriagePage />;
    case '/reports': return <ReportsPage />;
    case '/registrations': return <RegistrationsPage />;
    case '/programs': return <ProgramsPage />;
    case '/coupons': return <CouponsPage />;
    case '/events': return <EventsPage />;
    case '/sponsorships': return <SponsorshipsPage />;
    case '/broadcast': return <BroadcastPage />;
    case '/broadcast/templates': return <EmailTemplatesPage />;
    case '/posts': return <PostsPage />;
    case '/press': return <PressPage />;
    case '/hall-of-fame': return <HallOfFamePage />;
    case '/team': return <TeamPage />;
    case '/users': return <UsersPage />;
    case '/audit': return <AuditPage />;
    case '/system': return <SystemHealthPage />;
    default:
      if (path.startsWith('/payments')) return <PaymentsPage />;
      return <Placeholder />;
  }
}

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-4 w-72" />
      <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
