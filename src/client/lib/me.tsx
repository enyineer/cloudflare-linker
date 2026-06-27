import { createContext, useContext, type ReactNode } from "react";
import type { MeDto } from "../../shared/contract.ts";

const MeContext = createContext<MeDto | null>(null);

export function MeProvider({ value, children }: { value: MeDto; children: ReactNode }) {
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

/** The current signed-in admin (email + role). Guaranteed present inside the app. */
export function useMe(): MeDto {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used within a MeProvider");
  return me;
}
