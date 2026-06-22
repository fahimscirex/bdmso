import { useEffect, useState } from 'react';
import { navGroups } from '@/lib/nav';
import { api } from '@/lib/api';
import { Link, useRouter } from '@/router';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { NavUser } from './nav-user';

export function AppSidebar() {
  const { path } = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => { api.getNavCounts().then(setCounts).catch((e) => console.warn('Failed to load nav counts', e)); }, []);
  const isActive = (url: string) =>
    url === '/' ? path === '/' : path === url || path.startsWith(`${url}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="BdMSO Admin">
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-xs font-extrabold text-white">
                  Bd
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">BdMSO</span>
                  <span className="truncate text-xs text-muted-foreground">Admin console</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = counts[item.url] ?? 0;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="[&>svg]:text-muted-foreground hover:[&>svg]:text-primary data-[active=true]:bg-primary/10 data-[active=true]:font-medium data-[active=true]:text-primary data-[active=true]:[&>svg]:text-primary"
                    >
                      <Link href={item.url}>
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {count > 0 ? (
                      <SidebarMenuBadge
                        title={item.badgeHint}
                        className="top-1/2 -translate-y-1/2 bg-sidebar-primary/15 font-semibold text-sidebar-primary peer-data-[size=default]/menu-button:top-1/2"
                      >
                        {count}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
