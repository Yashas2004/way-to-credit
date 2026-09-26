import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../lib/useFocusTrap";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** @default "md" — "lg" is for content with several sections at once (e.g. the knowledge base's catalog drawer). */
  size?: "md" | "lg";
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-lg",
  lg: "max-w-3xl",
};

/**
 * The one way every dialog in the app closes: an X button top right,
 * Escape, and a backdrop click — all three call `onClose`, so a form that
 * must not close mid-submit guards that in its own handler, once. Traps
 * focus while open and returns it to the trigger on close. Rendered via a
 * portal so it's never clipped by an ancestor's overflow/z-index.
 */
export function Modal({ isOpen, onClose, title, children, size = "md" }: ModalProps) {
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
        className={`relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-md bg-white p-6 shadow-elevated ${SIZE_CLASSES[size]}`}
      >
        <h2 id={titleId} className="mb-4 pr-10 font-serif text-h2 text-ink">
          {title}
        </h2>
        {children}
        {/* Last in DOM order (positioned top right) so opening a form still
            focuses its first field, not the close button. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-sm p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5 5 15"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}
