import { forwardRef, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "./Button";

export interface EditableCellProps {
  value: string;
  disabled?: boolean;
  disabledHint?: string;
  onSave: (newValue: string) => Promise<void>;
  /** Arrow Up/Down while this cell is focused and not editing. */
  onNavigate: (direction: "up" | "down") => void;
  /** Called once a Ctrl/Cmd+Enter save succeeds, so the grid can advance focus to the next cell — "work straight down the grid." */
  onSavedAdvance: () => void;
  /** Reports whether this cell currently has an unsaved diff, so the page can arm/disarm its beforeunload guard. */
  onUnsavedChange: (hasUnsaved: boolean) => void;
}

const NA = "NA";

/**
 * Click-to-edit description cell. Keyboard: Tab/Shift+Tab move between
 * cells for free (the display state is a real `<button>`, a native Tab
 * stop); Enter opens it; arrow keys move between cells when not editing
 * (`onNavigate`); Ctrl/Cmd+Enter saves and advances to the next cell;
 * Escape cancels and discards the draft.
 *
 * Unsaved protection: blurring with a genuine diff from the last-saved
 * value keeps the cell open rather than silently discarding it, and shows
 * a visible "Unsaved" marker — never a silent revert.
 */
export const EditableCell = forwardRef<HTMLButtonElement, EditableCellProps>(function EditableCell(
  { value, disabled, disabledHint, onSave, onNavigate, onSavedAdvance, onUnsavedChange },
  triggerRef,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isNA = value === NA;
  const hasUnsavedDiff = editing && draft.trim() !== value;

  // Derived, not imperative: `hasUnsavedDiff` already reflects every state
  // transition below (open/type/cancel/save/blur-with-diff) correctly on
  // its own, so this is the one place that reports it upward — no call-site
  // needs to remember to do it, and the parent's callback identity must
  // stay stable (a `useCallback`) or this would re-fire every render.
  useEffect(() => {
    onUnsavedChange(hasUnsavedDiff);
  }, [hasUnsavedDiff, onUnsavedChange]);

  function startEditing() {
    if (disabled) return;
    setDraft(value === NA ? "" : value);
    setError(null);
    setEditing(true);
  }

  function focusTrigger() {
    if (triggerRef && "current" in triggerRef) {
      triggerRef.current?.focus();
    }
  }

  function cancel() {
    setDraft(value);
    setError(null);
    setEditing(false);
    focusTrigger();
  }

  async function save(advanceAfter: boolean) {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      setError("A description can't be empty — write something, or Escape to cancel.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
      if (advanceAfter) {
        onSavedAdvance();
      } else {
        focusTrigger();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save(true);
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    const movingTo = event.relatedTarget as Node | null;
    if (movingTo && containerRef.current?.contains(movingTo)) {
      // Focus is moving to our own Save/Cancel button — let its click
      // handler run; don't fight it by deciding anything here.
      return;
    }
    if (draft.trim() !== value) {
      // Genuine unsaved change and focus is leaving the cell entirely —
      // never silently discard it. Stay open; `hasUnsavedDiff` (and the
      // effect above) already keeps the "Unsaved" marker and the parent
      // in sync — nothing further to do here.
      return;
    }
    setEditing(false);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onNavigate("up");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onNavigate("down");
    }
  }

  if (!editing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={startEditing}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        className={`block w-full rounded-sm px-2 py-1.5 text-left text-body ${
          disabled
            ? "cursor-not-allowed text-slate/60"
            : "text-ink hover:bg-ink/5 focus-visible:bg-ink/5"
        }`}
      >
        {isNA ? (
          <span className="italic text-slate">NA — click to add a description</span>
        ) : (
          <span className="whitespace-pre-wrap">{value}</span>
        )}
      </button>
    );
  }

  return (
    <div ref={containerRef} onBlur={handleBlur} className="flex flex-col gap-1.5">
      {/* Opening this cell is itself the user's request to edit it — autofocus is the point. */}
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={handleTextareaKeyDown}
        rows={3}
        maxLength={5000}
        disabled={saving}
        aria-label="Description"
        className="w-full resize-y rounded-sm border border-slate/40 bg-white px-2 py-1.5 text-body text-ink disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" loading={saving} onClick={() => void save(false)}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
        </div>
        {hasUnsavedDiff && !saving && (
          <span className="text-small font-medium text-brass">
            Unsaved — Ctrl/Cmd+Enter or Save
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-small text-alert">
          {error}
        </p>
      )}
    </div>
  );
});
