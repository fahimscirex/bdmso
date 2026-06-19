import { useState, type ReactNode } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

// A destructive dropdown item that confirms before running. Lives inside a
// DropdownMenu; onSelect preventDefault keeps the menu from closing the dialog.
export function ConfirmDeleteItem({
  name, onConfirm, children = 'Delete',
}: { name: string; onConfirm: () => void; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenuItem variant="destructive" onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
        {children}
      </DropdownMenuItem>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes it and cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
