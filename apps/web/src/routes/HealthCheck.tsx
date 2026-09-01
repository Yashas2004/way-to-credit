import { useQuery } from "@tanstack/react-query";
import { HealthResponseSchema } from "@way-to-credit/shared";

async function fetchHealth() {
  // The backend mounts this one route bare (no /api prefix) — every other
  // real route is mounted AT /api/... itself. See vite.config.ts's proxy comment.
  const res = await fetch("/health");
  if (!res.ok) {
    throw new Error(`Health check failed with status ${String(res.status)}`);
  }
  return HealthResponseSchema.parse(await res.json());
}

export function HealthCheck() {
  const { data, error, isPending } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  // Dev/ops utility, not one of this stage's screens — not mounted in the
  // real router (see App.tsx). Kept working and tested, styled with the
  // real design tokens so nothing in the app references stale classes.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper p-8 text-ink">
      <h1 className="font-serif text-h1 font-semibold">Way To Credit</h1>
      <p className="text-small text-slate">
        Health check via /health (proxied to the Express server)
      </p>

      {isPending && <p className="rounded-sm bg-white px-4 py-2">Checking API health…</p>}

      {error && (
        <p className="rounded-sm bg-alert/10 px-4 py-2 text-alert">
          Could not reach the API: {error.message}
        </p>
      )}

      {data && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-sm bg-white px-6 py-4 font-sans text-body">
          <dt className="text-slate">status</dt>
          <dd>{data.status}</dd>
          <dt className="text-slate">uptime</dt>
          <dd>{data.uptime.toFixed(2)}s</dd>
          <dt className="text-slate">version</dt>
          <dd>{data.version}</dd>
        </dl>
      )}
    </main>
  );
}
