import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { Badge } from "../components/Badge.tsx";
import { BreakdownCard } from "../components/BreakdownCard.tsx";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { ClicksOverTimeChart } from "../components/charts.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { RangeTabs } from "../components/RangeTabs.tsx";
import { Stat } from "../components/Stat.tsx";
import { toMessage } from "../lib/errors.ts";
import { useMe } from "../lib/me.tsx";
import { useDateRange } from "../lib/range.ts";
import { orpc } from "../orpc.ts";

export function Home() {
  const me = useMe();
  const { days, setDays, range } = useDateRange(30);

  const domains = useQuery(orpc.domains.list.queryOptions());
  const links = useQuery(orpc.links.list.queryOptions({ input: {} }));
  const campaigns = useQuery(orpc.campaigns.list.queryOptions());
  const overview = useQuery(orpc.analytics.overview.queryOptions({ input: range, placeholderData: keepPreviousData }));

  const linkIdByLabel = useMemo(() => {
    const hostById = new Map((domains.data ?? []).map((d) => [d.id, d.hostname]));
    const map = new Map<string, number>();
    for (const l of links.data ?? []) {
      const host = hostById.get(l.domainId);
      if (host) map.set(`${host}${l.path === "/" ? "" : l.path}`, l.id);
    }
    return map;
  }, [domains.data, links.data]);

  if (domains.isPending || links.isPending || campaigns.isPending) return <LoadingScreen />;
  if (domains.isError) return <ErrorBanner message={toMessage(domains.error)} />;
  if (links.isError) return <ErrorBanner message={toMessage(links.error)} />;
  if (campaigns.isError) return <ErrorBanner message={toMessage(campaigns.error)} />;

  if (domains.data.length === 0 || links.data.length === 0) {
    const firstName = me.email.split("@")[0] ?? me.email;
    return <FirstRun hasDomain={domains.data.length > 0} greeting={firstName} />;
  }

  return (
    <div className="stack">
      <div className="page__header">
        <div>
          <h1 className="page__title">Dashboard</h1>
          <p className="page__subtitle">How your links are performing.</p>
        </div>
        <div className="page__actions">
          <RangeTabs days={days} onChange={setDays} />
        </div>
      </div>

      <div className="summary-grid">
        <Stat
          label={`Clicks (last ${days} days)`}
          value={overview.data?.totalClicks ?? 0}
          previous={overview.data?.previousClicks}
        />
        <Stat label="Links" value={links.data.length} href="/links" />
        <Stat label="Web addresses" value={domains.data.length} href="/domains" />
        <Stat label="Campaigns" value={campaigns.data.length} href="/campaigns" />
      </div>

      {overview.isPending || !overview.data ? (
        <LoadingScreen />
      ) : overview.isError ? (
        <ErrorBanner message={toMessage(overview.error)} />
      ) : overview.data.totalClicks === 0 ? (
        <div className="card card--pad">
          <EmptyState
            icon="📊"
            title="No clicks in this period yet"
            text="Share your links and the clicks will show up here. Try a wider date range above."
          />
        </div>
      ) : (
        <>
          <Card title="Clicks over time">
            <ClicksOverTimeChart data={overview.data.overTime} />
          </Card>

          <div className="two-col">
            <BreakdownCard title="Clicks per campaign" data={overview.data.byCampaign} />
            <BreakdownCard
              title="Top sources"
              data={overview.data.topSources}
              empty="No incoming campaign tags (utm_source) seen yet."
            />
          </div>

          <div className="two-col">
            <BreakdownCard title="Devices" data={overview.data.byDevice} />
            <BreakdownCard title="Top referrers" data={overview.data.topReferrers} empty="No referrers recorded." />
          </div>

          <div className="two-col">
            <BreakdownCard title="Top countries" data={overview.data.topCountries} empty="No location data yet." />
            <Card title="Top links">
              <div className="rows">
                {overview.data.topLinks.map((l) => {
                  const linkId = linkIdByLabel.get(l.label);
                  return (
                    <div className="row" key={l.label}>
                      <div className="row__main">
                        {linkId ? (
                          <Link href={`/links/${linkId}`} className="row__link mono">
                            {l.label}
                          </Link>
                        ) : (
                          <span className="row__title mono">{l.label}</span>
                        )}
                      </div>
                      <Badge tone="accent">{l.clicks} clicks</Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function FirstRun({ hasDomain, greeting }: { hasDomain: boolean; greeting: string }) {
  return (
    <div className="stack">
      <div>
        <h1 className="page__title">Welcome, {greeting}</h1>
        <p className="page__subtitle">Two quick steps to get your first link working.</p>
      </div>

      <Step
        n={1}
        done={hasDomain}
        active={!hasDomain}
        title="Add a web address"
        text="This is the hostname your links live on. A subdomain of your app works straight away."
        cta={
          <Link href="/domains" className="btn btn--primary">
            Add a web address
          </Link>
        }
      />

      <Step
        n={2}
        done={false}
        active={hasDomain}
        title="Create your first link"
        text="Pick a path and where it should send visitors. That's it."
        cta={
          hasDomain ? (
            <Link href="/links" className="btn btn--primary">
              Create your first link
            </Link>
          ) : (
            <Button variant="primary" disabled>
              Create your first link
            </Button>
          )
        }
      />
    </div>
  );
}

function Step({
  n,
  done,
  active,
  title,
  text,
  cta,
}: {
  n: number;
  done: boolean;
  active: boolean;
  title: string;
  text: string;
  cta: ReactNode;
}) {
  return (
    <div className="card card--pad">
      <div className="cluster step">
        <div className={`step__num ${done ? "step__num--done" : ""}`.trim()}>{done ? "✓" : n}</div>
        <div className="row__main">
          <div className="row__title">{title}</div>
          <p className="row__sub step__text">{text}</p>
          {active && <div className="step__cta">{cta}</div>}
          {done && <div className="muted step__cta">Done</div>}
        </div>
      </div>
    </div>
  );
}
