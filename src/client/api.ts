import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { contract } from "../shared/contract.ts";

/**
 * Typed admin API client. Typed PURELY from the shared contract - it never
 * imports Worker code, so the SPA bundle stays free of server/Env types.
 * Auth rides the `cl_session` cookie, sent automatically on same-origin calls.
 */
const link = new RPCLink({
  url: `${window.location.origin}/api`,
  fetch: (request, init) => fetch(request, { ...init, credentials: "same-origin" }),
});

export const api: ContractRouterClient<typeof contract> = createORPCClient(link);
