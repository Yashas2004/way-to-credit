import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { fetchUsers } from "./adminApi";
import { useAuth } from "./auth";

export interface ActorName {
  /** "Ramesh Kumar", or "You" / "Admin" for an admin. */
  name: string;
  /** The login ID ("user1"), because two people can share a display name. */
  handle?: string;
}

/**
 * Names people on admin screens. Ids used to be shown as `id.slice(0, 8)`,
 * but ids are UUID v7, whose leading characters are a timestamp: everyone
 * created around the same time showed the same "01a0f18c", so an admin
 * couldn't tell who raised a query. Users resolve through the users list
 * (archived included, labelled), on the same cache key the Queries and
 * Activity pages already use. There's no endpoint listing admins, so an admin
 * is "You" when it's the viewer and "Admin" otherwise.
 */
export function useActorNames() {
  const { identity } = useAuth();
  const usersQuery = useQuery({
    queryKey: ["admin", "users", "include"],
    queryFn: () => fetchUsers("include"),
  });
  const byId = useMemo(
    () => new Map((usersQuery.data ?? []).map((u) => [u.id, u])),
    [usersQuery.data],
  );

  const nameFor = useCallback(
    (actorType: "admin" | "user", id: string): ActorName => {
      if (actorType === "admin") return { name: identity?.id === id ? "You" : "Admin" };
      const user = byId.get(id);
      if (!user) return { name: usersQuery.isPending ? "…" : "Unknown user" };
      return {
        name: user.archivedAt ? `${user.displayName} (archived)` : user.displayName,
        handle: user.userId,
      };
    },
    [byId, identity?.id, usersQuery.isPending],
  );

  return { nameFor, usersQuery };
}
