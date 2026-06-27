import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "./Button.tsx";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Destructive-action confirmation built on Radix AlertDialog. The confirm
 *  button stays under our control (not AlertDialog.Action) so the dialog can
 *  show a busy state and stay open until the parent unmounts it on success. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal__overlay" />
        <AlertDialog.Content className="modal modal--sm">
          <div className="modal__header">
            <AlertDialog.Title className="modal__title">{title}</AlertDialog.Title>
          </div>
          <div className="modal__body">
            <AlertDialog.Description className="muted">{message}</AlertDialog.Description>
          </div>
          <div className="modal__footer">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" disabled={busy}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button variant="danger" disabled={busy} onClick={onConfirm}>
              {busy ? "Working..." : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
