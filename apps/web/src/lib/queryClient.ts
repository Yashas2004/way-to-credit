import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // No refetch-on-window-focus, as required. This is a query-level
      // option — `useMutation` has no refetch-on-focus behavior to begin
      // with (mutations are one-shot, not cached/refetched), so disabling
      // it here is what satisfies "no refetch-on-window-focus for
      // mutations" in practice: nothing a mutation touches gets anxiously
      // re-fetched just because the tab regained focus.
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
