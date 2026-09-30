import {
  createContext,
  forwardRef,
  useContext,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** `sm` is for actions inside table rows, where the button, not the text, sets the row height. */
  size?: "md" | "sm";
  loading?: boolean;
}

/**
 * Two looks, chosen by where the button renders, so no call site changes:
 * - "classic" (the default, with no provider): exactly the button as it was
 *   before the design-system pass. The login page is the design reference
 *   and is excluded from the pass, so its Sign in button must not move. Its
 *   radius is pinned to a literal 4px so later token changes can't reach it.
 * - "app": what the admin and user shells provide. Solid cyan primary with
 *   ink text like the login's (5.52:1), the control radius, a semibold
 *   label, and a white raised secondary. The gradient is never a primary
 *   action: it's for small accents only.
 */
export type ButtonStyle = "classic" | "app";
const ButtonStyleContext = createContext<ButtonStyle>("classic");

export function ButtonStyleProvider({
  style,
  children,
}: {
  style: ButtonStyle;
  children: ReactNode;
}) {
  return <ButtonStyleContext.Provider value={style}>{children}</ButtonStyleContext.Provider>;
}

const APP_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-ink shadow-card hover:bg-brand/90 disabled:bg-brand/50 disabled:text-ink/60 disabled:shadow-none",
  secondary:
    "border border-muted/25 bg-white text-ink shadow-card hover:bg-canvas disabled:opacity-50 disabled:shadow-none",
  ghost: "text-ink bg-transparent hover:bg-ink/5 disabled:opacity-50",
  danger: "bg-negative text-white hover:bg-negative/90 disabled:bg-negative/50",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-ink hover:bg-brand/90 disabled:bg-brand/50 disabled:text-ink/60",
  secondary: "border border-ink text-ink bg-transparent hover:bg-ink/5 disabled:opacity-50",
  ghost: "text-ink bg-transparent hover:bg-ink/5 disabled:opacity-50",
  danger: "bg-negative text-white hover:bg-negative/90 disabled:bg-negative/50",
};

/** Loading state keeps the button's width/label slot occupied (an invisible copy of the label) rather than collapsing around the spinner. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const style = useContext(ButtonStyleContext);
  const shape =
    style === "app"
      ? `rounded-control ${size === "sm" ? "px-3 py-1" : "px-4 py-2"} font-semibold ${APP_VARIANT_CLASSES[variant]}`
      : `rounded-[4px] ${size === "sm" ? "px-2.5 py-1" : "px-4 py-2"} font-medium ${VARIANT_CLASSES[variant]}`;
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex items-center justify-center gap-2 text-body transition-colors disabled:cursor-not-allowed motion-reduce:transition-none ${shape} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" tone={variant === "danger" ? "light" : "ink"} />
        </span>
      )}
      <span className={loading ? "invisible" : "contents"}>{children}</span>
    </button>
  );
});
