import { toast } from "sonner";

/** Temporary "event deleted" toast with an undo action. */
export function showUndoToast(message: string, undoLabel: string, onUndo: () => void) {
  toast(message, {
    duration: 6000,
    action: {
      label: undoLabel,
      onClick: onUndo,
    },
  });
}

/** Temporary toast for time / layer edits so a mis-drag can be reverted. */
export function showChangeUndoToast(message: string, undoLabel: string, onUndo: () => void) {
  toast(message, {
    duration: 6000,
    action: {
      label: undoLabel,
      onClick: onUndo,
    },
  });
}
