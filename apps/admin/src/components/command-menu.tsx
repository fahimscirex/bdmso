import { CreditCard, Megaphone, Ticket } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator,
} from '@/components/ui/command';
import { allNavItems } from '@/lib/nav';
import { useRouter } from '@/router';

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { navigate } = useRouter();
  const go = (url: string) => { onOpenChange(false); navigate(url); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {allNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.url} value={item.title} onSelect={() => go(item.url)}>
                <Icon />
                {item.title}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="reconcile payments" onSelect={() => go('/payments')}>
            <CreditCard />
            Reconcile pending payments
          </CommandItem>
          <CommandItem value="new coupon" onSelect={() => go('/coupons')}>
            <Ticket />
            Create coupon
          </CommandItem>
          <CommandItem value="send broadcast" onSelect={() => go('/broadcast')}>
            <Megaphone />
            Send broadcast
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
