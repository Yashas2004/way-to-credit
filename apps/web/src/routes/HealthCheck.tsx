import { useQuery } from "@tanstack/react-query";
import { HealthResponseSchema } from "@way-to-credit/shared";

async function fetchHealth() {
  const res = await fetch("/api/health");
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-slate-900">
      <h1 className="text-2xl font-semibold">Way To Credit</h1>
      <p className="text-sm text-slate-500">
        API health check via /api/health (proxied to the Express server)
      </p>

      {isPending && <p className="rounded bg-white px-4 py-2 shadow">Checking API health…</p>}

      {error && (
        <p className="rounded bg-red-50 px-4 py-2 text-red-700 shadow">
          Could not reach the API: {error.message}
        </p>
      )}

      {data && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded bg-white px-6 py-4 font-mono text-sm shadow">
          <dt className="text-slate-500">status</dt>
          <dd>{data.status}</dd>
          <dt className="text-slate-500">uptime</dt>
          <dd>{data.uptime.toFixed(2)}s</dd>
          <dt className="text-slate-500">version</dt>
          <dd>{data.version}</dd>
        </dl>
      )}
    </main>
  );
}
