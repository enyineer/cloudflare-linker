import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { Button } from "./components/Button.tsx";
import { EmptyState } from "./components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "./components/Feedback.tsx";
import { Layout } from "./components/Layout.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { authApi } from "./lib/authApi.ts";
import { errorCode, toFormErrors } from "./lib/errors.ts";
import { MeProvider } from "./lib/me.tsx";
import { orpc, queryClient } from "./orpc.ts";
import { AccountPage } from "./pages/AccountPage.tsx";
import { AuditLogPage } from "./pages/AuditLogPage.tsx";
import { AuthScreens } from "./pages/AuthScreens.tsx";
import { CampaignDetailPage } from "./pages/CampaignDetailPage.tsx";
import { CampaignsPage } from "./pages/CampaignsPage.tsx";
import { DomainDetailPage } from "./pages/DomainDetailPage.tsx";
import { DomainsPage } from "./pages/DomainsPage.tsx";
import { Home } from "./pages/Home.tsx";
import { LinkDetailPage } from "./pages/LinkDetailPage.tsx";
import { LinksPage } from "./pages/LinksPage.tsx";
import { SetupPage } from "./pages/SetupPage.tsx";
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
  const reloadMe = () => queryClient.invalidateQueries({ queryKey: orpc.me.key() });

  if (me.isPending) return <LoadingScreen />;
  if (me.isError) {
    // Signed in but no role -> a clear "no access" screen with a way out.
    if (errorCode(me.error) === "FORBIDDEN") {
      const { message } = toFormErrors(me.error);
      return (
        <div className="center-screen">
          <div className="card card--pad auth-card">
            <EmptyState icon="🔒" title="No access yet" text={message ?? "Your account is not set up to use this dashboard."} />
            <div style={{ textAlign: "center" }}>
              <Button
                onClick={async () => {
                  await authApi.logout();
                  reloadMe();
                }}
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      );
    }
    // Not signed in (or first run) -> login / create-password.
    return <AuthScreens onAuthed={reloadMe} />;
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
          <Route path="/setup" component={SetupPage} />
          <Route path="/audit" component={AuditLogPage} />
          <Route path="/account" component={AccountPage} />
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
