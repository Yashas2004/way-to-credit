export interface SequenceDotsProps {
  /** How many steps are done (or which step you're on): the first `value` dots fill. */
  value: number;
  total: number;
  /** The meaning, as text. Always shown; the dots only illustrate it. */
  label: string;
  /** Above this many steps, dots stop being readable: text only. */
  max?: number;
  className?: string;
}

/**
 * The design plan's sequence grammar: a row of dots, filled for steps done,
 * outlined for steps to go. The dots are decoration (aria-hidden) and never
 * carry meaning alone; the text label next to them does. Past `max` steps
 * (a 50-status lifecycle, say) a row of dots is noise, so only the text shows.
 *
 * Filled dots are `brand-ink`, not `brand`: an 8px dot is a thin indicator
 * under the cyan rule.
 */
export function SequenceDots({ value, total, label, max = 12, className = "" }: SequenceDotsProps) {
  const showDots = total > 0 && total <= max;
  const filled = Math.max(0, Math.min(value, total));
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 ${className}`}>
      {showDots && (
        <span aria-hidden="true" data-testid="sequence-dots" className="flex items-center gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${
                i < filled ? "bg-brand-ink" : "border border-muted/70 bg-transparent"
              }`}
            />
          ))}
        </span>
      )}
      <span className="text-small text-muted">{label}</span>
    </span>
  );
}
