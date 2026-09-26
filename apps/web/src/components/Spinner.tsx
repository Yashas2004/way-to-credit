export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** `dark` is the default on light surfaces; `ink` sits on a brand-cyan fill; `light` on dark or `negative` fills. */
  tone?: "light" | "dark" | "ink";
  label?: string;
}

const SIZE_CLASSES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

const TONE_CLASSES: Record<NonNullable<SpinnerProps["tone"]>, string> = {
  light: "text-white",
  dark: "text-brand-ink",
  ink: "text-ink",
};

/** Spins normally; under prefers-reduced-motion it pulses in place instead of rotating. */
export function Spinner({ size = "md", tone = "dark", label = "Loading" }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label}
      className={`motion-safe:animate-spin motion-reduce:animate-pulse ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
