import { MoreHorizontal } from 'lucide-react';
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for payment ${payment.id}`}><MoreHorizontal className="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => run(api.paymentReconcile(payment.id), `${payment.id} reconciled with gateway`, onDone)}>
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
