import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { run } from '@/lib/run';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// The single "they paid offline" action. Records a cash/bank/bKash payment
// against a registration: completes its pending payment, or creates a paid one
// if there is none - then confirms the reg, mints the BdMSO ID, sends the
// receipt, and counts as Cash collection. Controlled (caller owns open state),
// so it works from a dropdown item or a button without the menu-trigger clash.
export function RecordPaymentDialog({
  open, onOpenChange, regId, defaultAmount, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  regId: string;
  defaultAmount?: number | null;
  onDone: () => void;
}) {
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset fields each time the dialog opens; prefill the amount when the caller
  // knows the pending payment's value.
  useEffect(() => {
    if (open) {
      setMethod('cash');
      setAmount(defaultAmount != null ? String(defaultAmount) : '');
      setReference('');
    }
  }, [open, defaultAmount]);

  const submit = async () => {
    setBusy(true);
    await run(
      api.recordPayment(regId, {
        method,
        amount: amount.trim() ? Number(amount) : undefined,
        accountNumber: reference.trim() || undefined,
      }),
      'Payment recorded - receipt sent',
      () => { onOpenChange(false); onDone(); },
    );
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Records an offline payment, confirms the registration, assigns the BdMSO ID, and emails the receipt. Counts as Cash collection.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rp-method">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="rp-method" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="bKash">bKash</SelectItem>
                  <SelectItem value="Nagad">Nagad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rp-amount">Amount (BDT)</Label>
              <Input
                id="rp-amount" type="number" min={0} value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="Program fee"
              />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            Leave the amount blank to use the program fee - only needed when the registration has no pending payment.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="rp-ref">Reference <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="rp-ref" value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Slip / txn no., wallet number"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Record payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
