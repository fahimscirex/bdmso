import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type { PaymentStatus } from '@/lib/types';
import { api } from '@/lib/api';
import { run } from '@/lib/run';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Per-payment management menu: re-check with the gateway, resend the receipt,
// or manually override the status (offline/reconciled payments). Mutations
// refetch via onDone so the caller's view reflects the new state. Shared by the
// payments list and the registration detail page.
export function PaymentActions({ payment, onDone }: { payment: { id: string; status: PaymentStatus }; onDone: () => void }) {
  const setStatus = (status: 'paid' | 'pending' | 'failed', label: string) =>
    run(api.paymentSetStatus(payment.id, status), `${payment.id} marked ${label}`, onDone);

  // Reconcile reflects the GATEWAY's verdict, not just "request succeeded": a
  // payment the customer abandoned comes back still 'pending' (e.g. gateway
  // "Initiated"), so a flat success toast would falsely imply it was collected.
  const onReconcile = async () => {
    try {
      const r = await api.paymentReconcile(payment.id);
      if (r.status === 'paid') toast.success('Gateway confirmed paid - member ID issued, receipt sent');
      else if (r.status === 'failed') toast.error('Gateway reports payment failed', { description: r.error });
      else toast.warning('Gateway has not collected this payment', { description: `Still pending${r.error ? ` (${r.error})` : ''}. Customer likely didn't finish checkout.` });
      onDone();
    } catch (e) {
      toast.error('Action failed', { description: (e as Error).message });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for payment ${payment.id}`}><MoreHorizontal className="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onReconcile}>
          Reconcile with gateway
        </DropdownMenuItem>
        {payment.status === 'paid' && (
          <DropdownMenuItem onClick={() => run(api.paymentResendReceipt(payment.id), 'Receipt resent')}>
            Resend receipt
          </DropdownMenuItem>
        )}
        {payment.status !== 'paid' && (
          <DropdownMenuItem onClick={() => run(api.paymentComplete(payment.id, 'cash'), `${payment.id} recorded as cash`, onDone)}>
            Record cash payment
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {/* Status-only corrections (re-open a wrongly-settled payment). "Paid" is
            intentionally not here - use "Record cash payment" so the receipt,
            member id, and Cash-collection tally all happen. */}
        {payment.status !== 'pending' && <DropdownMenuItem onClick={() => setStatus('pending', 'pending')}>Mark as pending</DropdownMenuItem>}
        {payment.status !== 'failed' && <DropdownMenuItem onClick={() => setStatus('failed', 'failed')}>Mark as failed</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
