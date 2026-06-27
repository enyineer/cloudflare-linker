import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "../components/Badge.tsx";
import { BreakdownCard } from "../components/BreakdownCard.tsx";
import { Card } from "../components/Card.tsx";
import { ClicksOverTimeChart } from "../components/charts.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { RangeTabs } from "../components/RangeTabs.tsx";
import { Stat } from "../components/Stat.tsx";
import { toMessage } from "../lib/errors.ts";
import { useDateRange } from "../lib/range.ts";
import { orpc } from "../orpc.ts";

export function LinkDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const { days, setDays, range } = useDateRange(30);

  const links = useQuery(orpc.links.list.queryOptions({ input: {} }));
  const domains = useQuery(orpc.domains.list.queryOptions());
  const campaigns = useQuery(orpc.campaigns.list.queryOptions());
  const stats = useQuery(
    orpc.analytics.link.queryOptions({ input: { id, ...range }, enabled: valid, placeholderData: keepPreviousData }),
  );

  if (links.isPending || domains.isPending) return <LoadingScreen />;
  if (links.isError) return <ErrorBanner message={toMessage(links.error)} />;
  if (domains.isError) return <ErrorBanner message={toMessage(domains.error)} />;

  const link = links.data.find((l) => l.id === id);
  if (!valid || !link) {
    return (
      <div className="card card--pad">
        <EmptyState
          icon="🔗"
          title="Link not found"
          text="This link may have been deleted."
          action={
            <Link href="/links" className="btn btn--primary">
              Back to links
            </Link>
          }
        />
      </div>
    );
  }

  const host = domains.data.find((d) => d.id === link.domainId)?.hostname ?? "(unknown)";
  const shortUrl = `${host}${link.path === "/" ? "" : link.path}`;
  const campaign = link.campaignId ? (campaigns.data ?? []).find((c) => c.id === link.campaignId) : undefined;

  return (
    <div className="stack">
      <Link href="/links" className="muted">
        ‹ Links
      </Link>
      <div className="page__header">
        <div>
          <h1 className="page__title mono">{shortUrl}</h1>
          <p className="page__subtitle">Sends visitors to {link.targetUrl}</p>
        </div>
        <div className="page__actions">
          <RangeTabs days={days} onChange={setDays} />
        </div>
      </div>

      <div className="cluster">
        {link.enabled ? <Badge tone="ok">On</Badge> : <Badge tone="muted">Off</Badge>}
        <Badge tone="muted">{link.redirectType}</Badge>
        {campaign && <Badge tone="accent">{campaign.name}</Badge>}
        {link.forwardQuery && <Badge tone="muted">Forwards query</Badge>}
        <Link href="/links" className="btn btn--ghost btn--sm">
          Manage link
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
                <BreakdownCard title="Top countries" data={stats.data.topCountries} empty="No location data yet." />
                <BreakdownCard title="Top sources" data={stats.data.topSources} empty="No utm_source seen yet." />
              </div>
              <div className="two-col">
                <BreakdownCard title="Devices" data={stats.data.byDevice} />
                <BreakdownCard title="Browsers" data={stats.data.byBrowser} />
              </div>
              <BreakdownCard title="Top referrers" data={stats.data.topReferrers} empty="No referrers recorded." />
            </>
          )}
        </>
      )}
    </div>
  );
}
