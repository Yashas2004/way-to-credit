import { forwardRef, useId, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, id, className = "", rows = 4, ...rest },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textareaId} className="text-body font-medium text-ink">
        {label}
      </label>
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={`resize-y rounded-sm border bg-white px-3 py-2 text-body text-ink placeholder:text-slate/60 disabled:cursor-not-allowed disabled:opacity-60 ${error ? "border-alert" : "border-slate/40"} ${className}`}
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
