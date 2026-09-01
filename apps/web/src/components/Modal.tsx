import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../lib/useFocusTrap";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Traps focus while open, closes on Escape or a backdrop click, and
 * returns focus to whatever triggered it on close. Rendered via a portal
 * so it's never clipped by an ancestor's overflow/z-index.
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
  const titleId = useId();

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Escape handling is on the dialog itself (see useFocusTrap) — this is purely a pointer-dismiss backdrop. */}
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 w-full max-w-lg rounded-md bg-white p-6 shadow-elevated"
      >
        <h2 id={titleId} className="mb-4 font-serif text-h2 text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
