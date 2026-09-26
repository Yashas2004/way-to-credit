import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared by Modal and the admin shell's mobile drawer — anything that
 * needs to trap focus while open, close on Escape, and return focus to
 * whatever triggered it. Returns a ref to attach to the trapping container.
 *
 * The effect depends on `isActive` only. `onEscape` is read through a ref:
 * callers pass a close handler defined in their own render body, so it's a
 * new function every render, and when it was an effect dependency every
 * keystroke in a modal form re-ran the effect — which restored focus to the
 * trigger and then re-focused the dialog's first field, yanking the cursor
 * out of whatever the user was typing in.
 *
 * Keys are handled on the container, not `document`, so with two dialogs
 * open (e.g. a ConfirmDialog over the catalog drawer) Escape closes only
 * the one that has focus.
 */
export function useFocusTrap<T extends HTMLElement>(isActive: boolean, onEscape: () => void) {
  const containerRef = useRef<T | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const initialFocusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (initialFocusable[0] ?? container).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) {
        return;
      }
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (nodes.length === 0) {
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [isActive]);

  return containerRef;
}
