import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** A Select/dropdown opened inside the modal portals its content to <body>, so
 *  interacting with it (or dismissing it) registers as "outside" the dialog.
 *  Don't let that close the modal. */
function isInsidePopper(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-radix-popper-content-wrapper]") !== null;
}

/** App modal built on Radix Dialog: focus trap, scroll lock, Escape + outside
 *  click to close, and proper ARIA - all handled by the primitive. */
export function Modal({ title, onClose, children, footer }: ModalProps) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal__overlay" />
        <Dialog.Content
          className="modal"
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            if (isInsidePopper(event.detail.originalEvent.target)) event.preventDefault();
          }}
        >
          <div className="modal__header">
            <Dialog.Title className="modal__title">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="modal__close" type="button" aria-label="Close">
                &times;
              </button>
            </Dialog.Close>
          </div>
          <div className="modal__body">{children}</div>
          {footer && <div className="modal__footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
