export type BadgeTone = "success" | "attention" | "negative" | "neutral";

export interface BadgePosition {
  index: number;
  total: number;
}

export interface BadgeProps {
  tone: BadgeTone;
  label: string;
  /** Ordinal position in the lifecycle (e.g. Sanctioned = step 4 of 10) — a third, color-independent signal alongside the icon and label. */
  position?: BadgePosition;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-moss/10 text-moss",
  attention: "bg-brass/15 text-brass",
  negative: "bg-alert/10 text-alert",
  neutral: "bg-slate/10 text-slate",
};

/**
 * The one place the four-bucket status system is implemented: color +
 * icon shape + text label + (optionally) ordinal position, never color
 * alone. Icon shape is distinct per tone so it survives grayscale —
 * filled check (success), filled exclamation (attention), filled X
 * (negative), outline circle (neutral/in-progress).
 */
export function Badge({ tone, label, position, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-small font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      <ToneIcon tone={tone} />
      <span>{label}</span>
      {position && (
        <span className="text-slate">
          ({position.index} of {position.total})
        </span>
      )}
    </span>
  );
}

function ToneIcon({ tone }: { tone: BadgeTone }) {
  const common = "h-3 w-3 shrink-0";
  switch (tone) {
    case "success":
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="6" fill="currentColor" />
          <path
            d="M3.5 6.2 5.2 8l3.3-3.6"
            stroke="white"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "attention":
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="6" fill="currentColor" />
          <rect x="5.3" y="2.8" width="1.4" height="4" rx="0.7" fill="white" />
          <rect x="5.3" y="7.4" width="1.4" height="1.4" rx="0.7" fill="white" />
        </svg>
      );
    case "negative":
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="6" fill="currentColor" />
          <path d="M4 4l4 4M8 4l-4 4" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "neutral":
      return (
        <svg viewBox="0 0 12 12" className={common} fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
  }
}
