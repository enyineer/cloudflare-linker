import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { CfDiagnosticsDto } from "../../shared/contract.ts";
import { cloudflareTokenUrl, MANAGE_TOKEN_PERMS } from "../../shared/cloudflare-link.ts";
import { can } from "../../shared/roles.ts";
import { Badge } from "../components/Badge.tsx";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { Field } from "../components/Field.tsx";
import { Input } from "../components/controls.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { useToast } from "../components/Toast.tsx";
import { toMessage } from "../lib/errors.ts";
import { useMe } from "../lib/me.tsx";
import { useInvalidate } from "../lib/mutations.ts";
import { orpc } from "../orpc.ts";

const TOKEN_SOURCE_LABEL = {
  secret: "deploy-time secret",
  saved: "saved in this app (encrypted)",
  none: "not connected",
} as const;

export function SetupPage() {
  const me = useMe();
  const isAdmin = can(me.role, "manageUsers");
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const diag = useQuery(orpc.setup.diagnostics.queryOptions({ enabled: isAdmin }));

  const selectAccount = useMutation(
    orpc.setup.selectAccount.mutationOptions({
      onSuccess: async (res) => {
        if (res.ok) {
          await invalidate(orpc.setup.key());
          notify(res.message);
        } else {
          notify(res.message, "error");
        }
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  const enable = useMutation(
    orpc.setup.setupHostname.mutationOptions({
      onSuccess: async (res) => {
        if (res.ok) {
          await invalidate(orpc.setup.key());
          notify(res.message);
        } else {
          notify(res.message, "error");
        }
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  if (!isAdmin) {
    return (
      <div className="card card--pad">
        <EmptyState icon="🔒" title="Admins only" text="Only administrators can view setup diagnostics." />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page__header">
        <div>
          <h1 className="page__title">Setup</h1>
          <p className="page__subtitle">Connect Cloudflare to check your configuration for problems.</p>
        </div>
        <div className="page__actions">
          <Button onClick={() => diag.refetch()} disabled={diag.isFetching}>
            {diag.isFetching ? "Checking..." : "Re-check"}
          </Button>
        </div>
      </div>

      {diag.isPending || !diag.data ? (
        <LoadingScreen />
      ) : diag.isError ? (
        <ErrorBanner message={toMessage(diag.error)} />
      ) : !diag.data.configured ? (
        <Card title="Connect Cloudflare">
          <p className="muted">
            Connecting Cloudflare lets this app check your setup and set up subdomains for you (so addresses like
            go.your-domain open your links). It is optional - the app still works without it.
          </p>
          <div style={{ marginTop: 14 }}>
            <TokenConnect canSave={diag.data.canSaveToken} />
          </div>
        </Card>
      ) : (
        <>
          <Card title="Cloudflare connection">
            <CheckRow ok={diag.data.token.ok} label="API token" message={diag.data.token.message} />
            <p className="check__detail" style={{ marginLeft: 36 }}>
              Source: {TOKEN_SOURCE_LABEL[diag.data.tokenSource]}
            </p>
          </Card>

          <AccountCard
            account={diag.data.account}
            onSelect={(id) => selectAccount.mutate({ accountId: id })}
            pending={selectAccount.isPending}
          />

          <Card title="Catch-all subdomains (advanced)">
            {!diag.data.routing.checked ? (
              <p className="muted">{diag.data.routing.message}</p>
            ) : (
              <>
                <p className="muted">
                  Normally you add each web address on the <strong>Web addresses</strong> page. As a shortcut, you can
                  make <em>every</em> subdomain of a domain open your links at once.
                </p>
                <p className="field__hint" style={{ marginTop: 0 }}>
                  Heads up: this routes <strong>all</strong> subdomains - including existing ones like www or mail - to
                  this app, which can interfere with them. Prefer adding specific web addresses unless you really want a
                  catch-all.
                </p>
                <div className="rows">
                  {diag.data.routing.zones.map((z) => {
                    const hostname = `*.${z.zone}`;
                    const busy = enable.isPending && enable.variables?.hostname === hostname;
                    return (
                      <div className="row" key={z.id}>
                        <div className="row__main">
                          <div className="row__title mono">{hostname}</div>
                          <div className="row__sub">
                            {z.ok ? `All subdomains of ${z.zone} open your links.` : `Catch every subdomain of ${z.zone}.`}
                          </div>
                        </div>
                        {z.ok ? (
                          <Badge tone="ok">On</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={enable.isPending}
                            onClick={() => enable.mutate({ hostname })}
                          >
                            {busy ? "Setting up..." : "Catch all subdomains"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {diag.data.routing.truncated && (
                  <p className="field__hint">Showing the first {diag.data.routing.zones.length} domains.</p>
                )}
              </>
            )}
          </Card>

          <Card title="Custom domains">
            {diag.data.customDomains.length === 0 ? (
              <p className="muted">No custom domains added yet.</p>
            ) : (
              <div className="rows">
                {diag.data.customDomains.map((d) => (
                  <div className="row" key={d.hostname}>
                    <div className="row__main">
                      <div className="row__title mono">{d.hostname}</div>
                      <div className="row__sub">{d.message}</div>
                    </div>
                    <div className="cluster">
                      <Badge tone={d.zoneOnAccount ? "ok" : "muted"}>{d.zoneOnAccount ? "Zone found" : "No zone"}</Badge>
                      <Badge tone={d.attached ? "ok" : "warn"}>{d.attached ? "Attached" : "Not attached"}</Badge>
                      {d.attached && (
                        <Badge tone={d.certProvisioned ? "ok" : "warn"}>
                          {d.certProvisioned ? "Cert ready" : "Cert pending"}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {diag.data.canSaveToken && (
            <Card title="Replace token">
              <TokenConnect canSave />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function AccountCard({
  account,
  onSelect,
  pending,
}: {
  account: CfDiagnosticsDto["account"];
  onSelect: (id: string) => void;
  pending: boolean;
}) {
  const multiple = account.options.length > 1;
  return (
    <Card title="Cloudflare account">
      {multiple ? (
        <>
          {!account.id && account.message && <p className="muted">{account.message}</p>}
          <div className="rows">
            {account.options.map((o) => {
              const current = o.id === account.id;
              return (
                <div className="row" key={o.id}>
                  <div className="row__main">
                    <div className="row__title">{o.name || o.id}</div>
                    <div className="row__sub mono">{o.id}</div>
                  </div>
                  {current ? (
                    <Badge tone="ok">Current</Badge>
                  ) : (
                    <Button variant="primary" disabled={pending} onClick={() => onSelect(o.id)}>
                      Use this account
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : account.id ? (
        <div className="row">
          <div className="row__main">
            <div className="row__title">{account.name || account.id}</div>
            {account.name && <div className="row__sub mono">{account.id}</div>}
          </div>
          <Badge tone="ok">Connected</Badge>
        </div>
      ) : (
        <p className="muted">{account.message || "Could not determine your account."}</p>
      )}
    </Card>
  );
}

function TokenConnect({ canSave }: { canSave: boolean }) {
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const [token, setToken] = useState("");

  const save = useMutation(
    orpc.setup.saveToken.mutationOptions({
      onSuccess: async (res) => {
        if (res.ok) {
          await invalidate(orpc.setup.key());
          notify(res.message);
          setToken("");
        } else {
          notify(res.message, "error");
        }
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  const url = cloudflareTokenUrl(MANAGE_TOKEN_PERMS, "Cloudflare Linker");

  return (
    <div className="stack">
      <div>
        <a className="btn btn--primary" href={url} target="_blank" rel="noreferrer">
          Create a Cloudflare token
        </a>
      </div>
      {canSave ? (
        <>
          <Field
            label="Paste the token"
            hint="We verify it with Cloudflare, then store it encrypted in this app's database. This token can set up subdomains for you (change DNS and routing on the domains you choose), so keep it private - you can delete it in Cloudflare any time. A deploy-time CLOUDFLARE_API_TOKEN secret takes precedence if set."
          >
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Cloudflare API token"
              autoComplete="off"
            />
          </Field>
          <div>
            <Button variant="primary" disabled={save.isPending || !token.trim()} onClick={() => save.mutate({ token })}>
              {save.isPending ? "Saving..." : "Save token"}
            </Button>
          </div>
        </>
      ) : (
        <p className="field__hint">
          Token storage is unavailable. Set the <code className="mono">CLOUDFLARE_API_TOKEN</code> secret and redeploy.
        </p>
      )}
    </div>
  );
}

function CheckRow({ ok, label, message, detail }: { ok: boolean; label: string; message: string; detail?: string }) {
  return (
    <div className="check">
      <span className={`check__icon check__icon--${ok ? "ok" : "bad"}`} aria-hidden="true">
        {ok ? "✓" : "!"}
      </span>
      <div>
        <div className="check__label">{label}</div>
        <div className="check__msg">{message}</div>
        {detail && <div className="check__detail mono">{detail}</div>}
      </div>
    </div>
  );
}
