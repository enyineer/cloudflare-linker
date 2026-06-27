import type { ReactNode } from "react";

export function Badge({ tone = "muted", children }: { tone?: "muted" | "ok" | "warn" | "accent"; children: ReactNode }) {
  return <span className={`badge ${tone === "muted" ? "" : `badge--${tone}`}`.trim()}>{children}</span>;
}
