/**
 * The soft filled field, shared by Input, Select, Textarea and Combobox: a
 * well in the `field` tone (white on the canvas, canvas inside a white card),
 * the control radius, and a faint border so the field is still findable
 * where the fill is subtle. Focus uses the global :focus-visible ring.
 */
export const FIELD_CLASSES =
  "w-full rounded-control border bg-field px-3 py-2 text-body text-ink placeholder:text-muted/70 transition-colors hover:border-muted/40 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none";

export const FIELD_BORDER = "border-muted/20";
export const FIELD_BORDER_ERROR = "border-negative";
