import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-slate/30 px-6 py-12 text-center">
      <p className="text-h2 font-serif text-ink">{title}</p>
      {description && <p className="max-w-sm text-body text-slate">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
