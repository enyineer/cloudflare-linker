import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { EmptyState } from "./components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "./components/Feedback.tsx";
import { Layout } from "./components/Layout.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { toFormErrors } from "./lib/errors.ts";
import { MeProvider } from "./lib/me.tsx";
import { orpc, queryClient } from "./orpc.ts";
import { CampaignDetailPage } from "./pages/CampaignDetailPage.tsx";
import { CampaignsPage } from "./pages/CampaignsPage.tsx";
import { DomainDetailPage } from "./pages/DomainDetailPage.tsx";
import { DomainsPage } from "./pages/DomainsPage.tsx";
import { Home } from "./pages/Home.tsx";
import { LinkDetailPage } from "./pages/LinkDetailPage.tsx";
import { LinksPage } from "./pages/LinksPage.tsx";
import { TeamPage } from "./pages/TeamPage.tsx";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Resolve the signed-in identity before rendering the app. */
function Gate() {
  const me = useQuery(orpc.me.queryOptions({ retry: false }));

  if (me.isPending) return <LoadingScreen />;
  if (me.isError) {
    const { message } = toFormErrors(me.error);
    return (
      <div className="center-screen">
        <div className="card card--pad" style={{ maxWidth: 440 }}>
          <EmptyState
            icon="🔒"
            title="No access yet"
            text={message ?? "Your account is not set up to use this dashboard."}
          />
        </div>
      </div>
    );
  }

  return (
    <MeProvider value={me.data}>
      <Layout>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/links" component={LinksPage} />
          <Route path="/links/:id" component={LinkDetailPage} />
          <Route path="/domains" component={DomainsPage} />
          <Route path="/domains/:id" component={DomainDetailPage} />
          <Route path="/campaigns" component={CampaignsPage} />
          <Route path="/campaigns/:id" component={CampaignDetailPage} />
          <Route path="/team" component={TeamPage} />
          <Route>
            <NotFound />
          </Route>
        </Switch>
      </Layout>
    </MeProvider>
  );
}

function NotFound() {
  return <ErrorBanner message="That page does not exist." />;
}
