import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AuditEntryDto } from "../../shared/contract.ts";
import { can } from "../../shared/roles.ts";
import { Badge } from "../components/Badge.tsx";
import { Button } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { toMessage } from "../lib/errors.ts";
import { useMe } from "../lib/me.tsx";
import { orpc, queryClient } from "../orpc.ts";

const PAGE = 100;

export function AuditLogPage() {
  const me = useMe();
  const isAdmin = can(me.role, "manageUsers");
  const [before, setBefore] = useState<number | undefined>(undefined);
  const [items, setItems] = useState<AuditEntryDto[]>([]);
  const page = useQuery(
    orpc.audit.list.queryOptions({ input: { limit: PAGE, before }, enabled: isAdmin, refetchOnWindowFocus: false }),
  );

  useEffect(() => {
    if (!page.data) return;
    setItems((prev) => {
      if (!before) return page.data;
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...page.data.filter((e) => !seen.has(e.id))];
    });
  }, [page.data, before]);

  if (!isAdmin) {
    return (
      <div className="card card--pad">
        <EmptyState icon="🔒" title="Admins only" text="Only administrators can view the audit log." />
      </div>
    );
  }

  const hasMore = (page.data?.length ?? 0) === PAGE;
  const refresh = () => {
    setItems([]);
    setBefore(undefined);
    queryClient.invalidateQueries({ queryKey: orpc.audit.key() });
  };

  return (
    <div className="stack">
      <div className="page__header">
        <div>
          <h1 className="page__title">Audit log</h1>
          <p className="page__subtitle">Every change and sign-in, newest first.</p>
        </div>
        <div className="page__actions">
          <Button onClick={refresh} disabled={page.isFetching}>
            {page.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {page.isPending && items.length === 0 ? (
        <LoadingScreen />
      ) : page.isError ? (
        <ErrorBanner message={toMessage(page.error)} />
      ) : items.length === 0 ? (
        <div className="card card--pad">
          <EmptyState icon="🧾" title="Nothing yet" text="Admin actions will show up here as they happen." />
        </div>
      ) : (
        <>
          <div className="card">
            <div className="rows">
              {items.map((e) => (
                <div className="row" key={e.id}>
                  <div className="row__main">
                    <div className="row__title">{e.summary}</div>
                    <div className="row__sub">
                      {e.actor} · {formatWhen(e.ts)}
                    </div>
                  </div>
                  <Badge tone="muted">{e.action}</Badge>
                </div>
              ))}
            </div>
          </div>
          {hasMore && (
            <div style={{ textAlign: "center" }}>
              <Button
                disabled={page.isFetching}
                onClick={() => {
                  const last = items[items.length - 1];
                  if (last) setBefore(last.id);
                }}
              >
                {page.isFetching ? "Loading..." : "Load older"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
