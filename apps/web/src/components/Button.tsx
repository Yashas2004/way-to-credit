import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brass text-white hover:bg-brass/90 disabled:bg-brass/50",
  secondary:
    "border border-maroon text-maroon bg-transparent hover:bg-maroon/5 disabled:opacity-50",
  ghost: "text-ink bg-transparent hover:bg-ink/5 disabled:opacity-50",
  danger: "bg-alert text-white hover:bg-alert/90 disabled:bg-alert/50",
};

/** Loading state keeps the button's width/label slot occupied (an invisible copy of the label) rather than collapsing around the spinner. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, disabled, className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-body font-medium transition-colors disabled:cursor-not-allowed motion-reduce:transition-none ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner
            size="sm"
            tone={variant === "secondary" || variant === "ghost" ? "dark" : "light"}
          />
        </span>
      )}
      <span className={loading ? "invisible" : "contents"}>{children}</span>
    </button>
  );
});
