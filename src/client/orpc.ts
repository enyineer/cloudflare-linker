import { createORPCReactQueryUtils } from "@orpc/react-query";
import { QueryClient } from "@tanstack/react-query";
import { api } from "./api.ts";

/** TanStack Query utilities derived from the typed oRPC client.
 *  Usage: useQuery(orpc.domains.list.queryOptions()),
 *         useMutation(orpc.domains.create.mutationOptions({ onSuccess })),
 *         queryClient.invalidateQueries({ queryKey: orpc.domains.key() }). */
export const orpc = createORPCReactQueryUtils(api);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});
