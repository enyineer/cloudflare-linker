import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

/** Returns a function that invalidates one or more query keys (refetches lists). */
export function useInvalidate(): (...keys: QueryKey[]) => Promise<void> {
  const qc = useQueryClient();
  return async (...keys: QueryKey[]) => {
    await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
  };
}
