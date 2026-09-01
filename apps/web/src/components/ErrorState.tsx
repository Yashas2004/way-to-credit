import type { ReactNode } from "react";

export interface ErrorStateProps {
  title?: string;
  message: string;
  action?: ReactNode;
}

export function ErrorState({ title = "Something went wrong", message, action }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-md border border-alert/30 bg-alert/5 px-6 py-12 text-center"
    >
      <p className="text-h2 font-serif text-ink">{title}</p>
      <p className="max-w-sm text-body text-slate">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
