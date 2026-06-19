// Navigation IA - the grouped sidebar structure. Count badges are injected
// live by the sidebar (see app-sidebar.tsx + api.getNavCounts), keyed by url.

import {
  LayoutDashboard, Inbox, ChartLine, ClipboardList, Wallet, Ticket, CalendarDays,
  Handshake, Send, Mails, FileText, BookOpen, Megaphone, Trophy, Users, UsersRound,
  ScrollText, Activity, type LucideIcon,
} from 'lucide-react';

export type NavItem = { title: string; url: string; icon: LucideIcon; badgeHint?: string };
export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { title: 'Dashboard', url: '/', icon: LayoutDashboard },
      { title: 'Triage', url: '/triage', icon: Inbox, badgeHint: 'Items in the triage queue' },
      { title: 'Reports', url: '/reports', icon: ChartLine },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Registrations', url: '/registrations', icon: ClipboardList, badgeHint: 'Registrations awaiting payment' },
      { title: 'Payments', url: '/payments', icon: Wallet, badgeHint: 'Failed payments' },
      { title: 'Coupons', url: '/coupons', icon: Ticket },
      { title: 'Events', url: '/events', icon: CalendarDays },
    ],
  },
  {
    label: 'Outreach',
    items: [
      { title: 'Sponsorships', url: '/sponsorships', icon: Handshake, badgeHint: 'Unread sponsorship enquiries' },
      { title: 'Broadcast', url: '/broadcast', icon: Send },
      { title: 'Email Templates', url: '/broadcast/templates', icon: Mails },
    ],
  },
  {
    label: 'Content',
    items: [
      { title: 'Posts', url: '/posts', icon: FileText },
      { title: 'Programs', url: '/programs', icon: BookOpen },
      { title: 'Press Mentions', url: '/press', icon: Megaphone },
      { title: 'Hall of Fame', url: '/hall-of-fame', icon: Trophy },
      { title: 'Team', url: '/team', icon: UsersRound },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Users', url: '/users', icon: Users },
      { title: 'Audit Log', url: '/audit', icon: ScrollText },
      { title: 'System Health', url: '/system', icon: Activity },
    ],
  },
];

// Flat list for the command palette + breadcrumb lookup.
export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);
