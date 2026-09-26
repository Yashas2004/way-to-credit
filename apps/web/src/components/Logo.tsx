export interface LogoProps {
  /** Rendered edge length in px. The mark needs >= 28px to stay legible. */
  size: number;
  /**
   * Leave empty (the default) when a visible wordmark sits beside the mark,
   * so screen readers don't hear the name twice; set it when the mark
   * stands alone.
   */
  alt?: string;
  className?: string;
}

/**
 * The company mark. The one place the app references the logo file, which
 * scripts/build-logo.py regenerates from apps/web/brand/ — swapping in the
 * designer's vector changes that folder, not this component.
 */
export function Logo({ size, alt = "", className = "" }: LogoProps) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt={alt}
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
}
