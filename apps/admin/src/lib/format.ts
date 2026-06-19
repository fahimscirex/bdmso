// Formatting helpers. BDT currency uses Indian-style lakh grouping (matches
// Bangladesh convention). Dates are dd Mon yyyy / dd/mm/yyyy - never American.

export function bdt(amount: number): string {
  return '৳ ' + new Intl.NumberFormat('en-IN').format(amount);
}

export function compactBdt(amount: number): string {
  if (amount >= 100000) return '৳ ' + (amount / 100000).toFixed(1) + 'L';
  if (amount >= 1000) return '৳ ' + (amount / 1000).toFixed(1) + 'k';
  return '৳ ' + amount;
}

export function num(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n);
}

export function dateUK(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka',
  });
}

// Pinned to Bangladesh time (GMT+6) so timestamps read the same regardless of
// where the admin is viewing from.
export function dateBD(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka',
  });
}

export function timeBD(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka',
  }).toLowerCase();
}

export function dateTimeUK(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka',
  });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return dateUK(iso);
}
