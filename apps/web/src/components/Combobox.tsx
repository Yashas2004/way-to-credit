import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { normalizeForMatch } from "../lib/normalizeForMatch";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  label: string;
  options: ComboboxOption[];
  /** The selected option's value, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  /** How many matches to render at once; the rest are reached by typing more. */
  maxResults?: number;
}

/**
 * A typeahead select: the WAI-ARIA 1.2 combobox pattern (editable input,
 * list autocomplete, listbox popup), hand-built so every behaviour is ours
 * to test.
 *
 * - Substring match, not just prefix: "home" finds "HDFC Home Loan".
 * - Keyboard: Down/Up move through matches (Down opens the list), Enter
 *   picks the highlighted match, Escape closes the list or, when already
 *   closed, clears the choice. Tab keeps the current choice. Home/End are
 *   left to the text field, as the pattern specifies for an editable
 *   combobox. With the list closed, Enter is not intercepted, so inside a
 *   form it submits.
 * - Scale: renders at most `maxResults` matches (50) plus a line saying how
 *   many there are, so a thousand options never means a thousand DOM rows.
 *   A polite live region announces the match count.
 * - Labels render as text only (the matched part in <mark>), never HTML.
 */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  hint,
  maxResults = 50,
}: ComboboxProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const hintId = hint ? `${id}-hint` : undefined;
  const optionId = (index: number) => `${id}-option-${String(index)}`;

  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [editing, setEditing] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Outside edits (a parent clearing or changing the value) show through.
  useEffect(() => {
    if (!editing) setQuery(selected?.label ?? "");
  }, [selected, editing]);

  const matches = useMemo(() => {
    const needle = editing ? normalizeForMatch(query) : "";
    return needle ? options.filter((o) => normalizeForMatch(o.label).includes(needle)) : options;
  }, [options, query, editing]);
  const shown = matches.slice(0, maxResults);

  useEffect(() => {
    if (!open || active < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[id="${optionId(active)}"]`);
    // The DOM types say scrollIntoView always exists; jsdom (tests) lacks it.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    el?.scrollIntoView?.({ block: "nearest" });
  });

  function openList() {
    setOpen(true);
    setActive((current) => (current >= 0 ? current : shown.length > 0 ? 0 : -1));
  }

  function close(restore = true) {
    setOpen(false);
    setActive(-1);
    setEditing(false);
    if (restore) setQuery(selected?.label ?? "");
  }

  function choose(option: ComboboxOption) {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
    setActive(-1);
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.min(i + 1, shown.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) setActive((i) => Math.max(i - 1, 0));
        break;
      case "Enter": {
        const option = open && active >= 0 ? shown[active] : undefined;
        if (option) {
          event.preventDefault(); // picking an option isn't submitting the form
          choose(option);
        }
        break;
      }
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
        } else if (value || query) {
          event.preventDefault();
          onChange("");
          setQuery("");
        }
        break;
      case "Tab":
        if (open) close();
        break;
    }
  }

  const describedBy = [hintId, `${id}-count`].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-body font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setEditing(true);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => {
            // Select the text so typing replaces the current choice.
            inputRef.current?.select();
          }}
          onClick={openList}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            close();
          }}
          className="w-full rounded-sm border border-muted/40 bg-white px-3 py-2 pr-8 text-body text-ink placeholder:text-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-small text-muted"
        >
          ▾
        </span>

        <div
          className={`${open ? "" : "hidden"} absolute z-20 mt-1 w-full rounded-sm border border-muted/30 bg-white shadow-elevated`}
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-72 overflow-y-auto py-1"
          >
            {shown.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={option.value === value}
                // Keep focus in the input so the list doesn't close before the click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  choose(option);
                }}
                onMouseEnter={() => {
                  setActive(index);
                }}
                className={`cursor-pointer px-3 py-2 text-body ${
                  index === active ? "bg-brand/15 text-ink" : "text-ink"
                } ${option.value === value ? "font-medium" : ""}`}
              >
                <Highlighted label={option.label} query={editing ? query : ""} />
              </li>
            ))}
          </ul>
          {matches.length === 0 && <p className="px-3 py-2 text-small text-muted">No matches.</p>}
          {matches.length > shown.length && (
            <p className="border-t border-muted/15 px-3 py-2 text-small text-muted">
              Showing {shown.length} of {matches.length}: keep typing to narrow.
            </p>
          )}
        </div>
      </div>
      {hint && (
        <p id={hintId} className="text-small text-muted">
          {hint}
        </p>
      )}
      <p id={`${id}-count`} className="sr-only" aria-live="polite">
        {open ? `${String(matches.length)} match${matches.length === 1 ? "" : "es"}` : ""}
      </p>
    </div>
  );
}

/** The first case-insensitive occurrence of the typed text, wrapped in <mark>. Text only. */
function Highlighted({ label, query }: { label: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const at = needle ? label.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, at)}
      <mark className="rounded-sm bg-attention/15 text-ink">
        {label.slice(at, at + needle.length)}
      </mark>
      {label.slice(at + needle.length)}
    </>
  );
}
