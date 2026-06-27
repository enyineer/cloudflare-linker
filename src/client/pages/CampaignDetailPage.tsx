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

export function CampaignDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const { days, setDays, range } = useDateRange(30);

  const campaigns = useQuery(orpc.campaigns.list.queryOptions());
  const stats = useQuery(
    orpc.analytics.campaign.queryOptions({ input: { id, ...range }, enabled: valid, placeholderData: keepPreviousData }),
  );

  if (campaigns.isPending) return <LoadingScreen />;
  if (campaigns.isError) return <ErrorBanner message={toMessage(campaigns.error)} />;

  const campaign = campaigns.data.find((c) => c.id === id);
  if (!valid || !campaign) {
    return (
      <div className="card card--pad">
        <EmptyState
          icon="🎯"
          title="Campaign not found"
          text="This campaign may have been deleted."
          action={
            <Link href="/campaigns" className="btn btn--primary">
              Back to campaigns
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <Link href="/campaigns" className="muted">
        ‹ Campaigns
      </Link>
      <div className="page__header">
        <div>
          <h1 className="page__title">{campaign.name}</h1>
          <p className="page__subtitle">
            <span className="mono">{campaign.slug}</span>
          </p>
        </div>
        <div className="page__actions">
          <RangeTabs days={days} onChange={setDays} />
        </div>
      </div>

      <div className="cluster">
        {campaign.utmSource && <Badge tone="muted">source: {campaign.utmSource}</Badge>}
        {campaign.utmMedium && <Badge tone="muted">medium: {campaign.utmMedium}</Badge>}
        <Link href="/campaigns" className="btn btn--ghost btn--sm">
          Manage campaign
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
                <BreakdownCard title="Clicks per link" data={stats.data.byLink} />
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
    </div>
  );
}
