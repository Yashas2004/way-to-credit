import { useId, type ReactNode } from "react";

export interface LoadState {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}

/** A titled rail section: a muted heading with an optional link on the right. */
export function RailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="text-h3 font-medium text-muted">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One quiet line when a section's data fails: the rest of the page carries on. */
export function LoadFailed({ what, query }: { what: string; query: LoadState }) {
  return (
    <p className="text-small text-muted">
      Couldn&apos;t load {what}.{" "}
      <button
        type="button"
        className="text-brand-ink underline"
        onClick={() => void query.refetch()}
      >
        Retry
      </button>
    </p>
  );
}
