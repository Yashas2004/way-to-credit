import { forwardRef, useId, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className = "", ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-body font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={`rounded-sm border bg-white px-3 py-2 text-body text-ink placeholder:text-slate/60 disabled:cursor-not-allowed disabled:opacity-60 ${error ? "border-alert" : "border-slate/40"} ${className}`}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-small text-slate">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-small text-alert">
          {error}
        </p>
      )}
    </div>
  );
});
