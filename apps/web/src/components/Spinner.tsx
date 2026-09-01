export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  tone?: "light" | "dark";
  label?: string;
}

const SIZE_CLASSES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

/** Spins normally; under prefers-reduced-motion it pulses in place instead of rotating. */
export function Spinner({ size = "md", tone = "dark", label = "Loading" }: SpinnerProps) {
  const strokeColor = tone === "light" ? "white" : "#6E2A2A";

  return (
    <svg
      role="status"
      aria-label={label}
      className={`motion-safe:animate-spin motion-reduce:animate-pulse ${SIZE_CLASSES[size]}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke={strokeColor} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
