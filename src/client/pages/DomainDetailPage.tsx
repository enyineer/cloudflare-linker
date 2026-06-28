import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "../components/Badge.tsx";
import { BreakdownCard } from "../components/BreakdownCard.tsx";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { ClicksOverTimeChart } from "../components/charts.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { RangeTabs } from "../components/RangeTabs.tsx";
import { Stat } from "../components/Stat.tsx";
import { useToast } from "../components/Toast.tsx";
import { can } from "../../shared/roles.ts";
import { toMessage } from "../lib/errors.ts";
import { useMe } from "../lib/me.tsx";
import { useInvalidate } from "../lib/mutations.ts";
import { useDateRange } from "../lib/range.ts";
import { orpc } from "../orpc.ts";

export function DomainDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const { days, setDays, range } = useDateRange(30);
  const me = useMe();
  const canManage = can(me.role, "writeDomains");
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const [confirmClear, setConfirmClear] = useState(false);

  const clearClicks = useMutation(
    orpc.domains.clearClicks.mutationOptions({
      onSuccess: async (res) => {
        setConfirmClear(false);
        await invalidate(orpc.analytics.key());
        notify(`Removed ${res.deleted} ${res.deleted === 1 ? "click" : "clicks"} for this web address.`);
      },
      onError: (err) => {
        setConfirmClear(false);
        notify(toMessage(err), "error");
      },
    }),
  );

  const domains = useQuery(orpc.domains.list.queryOptions());
  const stats = useQuery(
    orpc.analytics.domain.queryOptions({ input: { id, ...range }, enabled: valid, placeholderData: keepPreviousData }),
  );

  if (domains.isPending) return <LoadingScreen />;
  if (domains.isError) return <ErrorBanner message={toMessage(domains.error)} />;

  const domain = domains.data.find((d) => d.id === id);
  if (!valid || !domain) {
    return (
      <div className="card card--pad">
        <EmptyState
          icon="🌐"
          title="Web address not found"
          text="This web address may have been deleted."
          action={
            <Link href="/domains" className="btn btn--primary">
              Back to web addresses
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <Link href="/domains" className="muted">
        ‹ Web addresses
      </Link>
      <div className="page__header">
        <div>
          <h1 className="page__title mono">{domain.hostname}</h1>
          <p className="page__subtitle">{domain.kind === "custom" ? "Custom domain" : "Subdomain"}</p>
        </div>
        <div className="page__actions">
          {canManage && (
            <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={clearClicks.isPending}>
              Delete click history
            </Button>
          )}
          <RangeTabs days={days} onChange={setDays} />
        </div>
      </div>

      <div className="cluster">
        {domain.status === "active" ? (
          <Badge tone="ok">Active</Badge>
        ) : domain.status === "pending" ? (
          <Badge tone="warn">Awaiting setup</Badge>
        ) : (
          <Badge tone="muted">Off</Badge>
        )}
        <Link href="/domains" className="btn btn--ghost btn--sm">
          Manage web addresses
        </Link>
      </div>

      {stats.isPending || !stats.data ? (
        <LoadingScreen />
      ) : stats.isError ? (
        <ErrorBanner message={toMessage(stats.error)} />
      ) : (
        <>
          <div className="summary-grid">
            <Stat
              label={`Clicks (last ${days} days)`}
              value={stats.data.totalClicks}
              previous={stats.data.previousClicks}
            />
          </div>
          {stats.data.totalClicks === 0 ? (
            <div className="card card--pad">
              <EmptyState icon="📊" title="No clicks in this period" text="Try a wider date range above." />
            </div>
          ) : (
            <>
              <Card title="Clicks over time">
                <ClicksOverTimeChart data={stats.data.overTime} />
              </Card>
              <div className="two-col">
                <BreakdownCard title="Top links" data={stats.data.byLink} />
                <BreakdownCard title="Top sources" data={stats.data.topSources} empty="No utm_source seen yet." />
              </div>
              <div className="two-col">
                <BreakdownCard title="Top countries" data={stats.data.topCountries} empty="No location data yet." />
                <BreakdownCard title="Devices" data={stats.data.byDevice} />
              </div>
            </>
          )}
        </>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Delete click history"
          message={`Permanently delete ALL recorded clicks for ${domain.hostname} - every link and path on it, including bot and scanner hits. The web address and its links keep working; only the analytics history is removed. This cannot be undone.`}
          confirmLabel="Delete history"
          busy={clearClicks.isPending}
          onConfirm={() => clearClicks.mutate({ id })}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
