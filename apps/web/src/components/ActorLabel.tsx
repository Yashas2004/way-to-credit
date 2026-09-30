import type { ActorName } from "../lib/useActorNames";

/** "Ramesh Kumar · user1": the name, then the login ID in muted small text. */
export function ActorLabel({ actor }: { actor: ActorName }) {
  return (
    <span>
      {actor.name}
      {actor.handle && <span className="text-small text-muted"> · {actor.handle}</span>}
    </span>
  );
}
