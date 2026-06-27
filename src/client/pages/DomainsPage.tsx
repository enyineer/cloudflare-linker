import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import type { RoutingMode } from "../../shared/types.ts";
import { can } from "../../shared/roles.ts";
import { Badge } from "../components/Badge.tsx";
import { Button } from "../components/Button.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { Field } from "../components/Field.tsx";
import { Input } from "../components/controls.tsx";
import { Modal } from "../components/Modal.tsx";
import { SetupConfirmDialog } from "../components/SetupConfirmDialog.tsx";
import { useToast } from "../components/Toast.tsx";
import { toFormErrors, toMessage, type FormErrors } from "../lib/errors.ts";
import { useMe } from "../lib/me.tsx";
import { useInvalidate } from "../lib/mutations.ts";
import { orpc } from "../orpc.ts";

const NO_ERRORS: FormErrors = { message: null, fields: {} };

export function DomainsPage() {
  const me = useMe();
  const editable = can(me.role, "writeDomains");
  const domains = useQuery(orpc.domains.list.queryOptions());
  const invalidate = useInvalidate();
  const { notify } = useToast();

  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const remove = useMutation(
    orpc.domains.delete.mutationOptions({
      onSuccess: async () => {
        await invalidate(orpc.domains.key());
        notify("Web address removed.");
        setConfirmId(null);
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  const update = useMutation(
    orpc.domains.update.mutationOptions({
      onSuccess: async () => invalidate(orpc.domains.key()),
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  // Set up (or re-check) a web address on Cloudflare - opens a confirm dialog
  // that previews the change before anything happens.
  const [setupHost, setSetupHost] = useState<string | null>(null);

  return (
    <div className="stack">
      <div className="page__header">
        <div>
          <h1 className="page__title">Web addresses</h1>
          <p className="page__subtitle">The hostnames that forward visitors to your links.</p>
        </div>
        {editable && (
          <div className="page__actions">
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add web address
            </Button>
          </div>
        )}
      </div>

      {domains.isPending ? (
        <LoadingScreen />
      ) : domains.isError ? (
        <ErrorBanner message={toMessage(domains.error)} />
      ) : domains.data.length === 0 ? (
        <div className="card card--pad">
          <EmptyState
            icon="🌐"
            title="No web addresses yet"
            text="Add a subdomain of your app and it works straight away. You can attach your own domain later."
            action={
              editable ? (
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Add your first web address
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="card">
          <div className="rows">
            {domains.data.map((d) => (
              <div className="row" key={d.id}>
                <div className="row__main">
                  <Link href={`/domains/${d.id}`} className="row__link mono">
                    {d.hostname}
                  </Link>
                  <div className="row__sub">{routingHint(d.hostname, d.routingMode)}</div>
                </div>
                <RoutingBadge mode={d.routingMode} />
                {editable && (
                  <div className="row__actions">
                    <Button
                      size="sm"
                      variant={d.routingMode === "none" ? "primary" : "ghost"}
                      onClick={() => setSetupHost(d.hostname)}
                    >
                      {d.routingMode === "none" ? "Set up" : "Re-check"}
                    </Button>
                    {d.status !== "pending" && (
                      <Button
                        size="sm"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: d.id, status: d.status === "active" ? "disabled" : "active" })}
                      >
                        {d.status === "active" ? "Turn off" : "Turn on"}
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => setConfirmId(d.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && (
        <AddDomainModal
          onClose={() => setAdding(false)}
          onCreated={(hostname) => {
            if (editable) setSetupHost(hostname);
          }}
        />
      )}
      {setupHost !== null && <SetupConfirmDialog hostname={setupHost} onClose={() => setSetupHost(null)} />}
      {confirmId !== null && (
        <ConfirmDialog
          title="Delete this web address?"
          message="All links on this web address will be removed too. This cannot be undone."
          busy={remove.isPending}
          onConfirm={() => remove.mutate({ id: confirmId })}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}

function RoutingBadge({ mode }: { mode: RoutingMode }) {
  if (mode === "whole") return <Badge tone="ok">Connected</Badge>;
  if (mode === "paths") return <Badge tone="ok">Specific links</Badge>;
  return <Badge tone="warn">Not set up</Badge>;
}

function routingHint(hostname: string, mode: RoutingMode): string {
  if (mode === "whole") return `Set up - the whole address opens your links.`;
  if (mode === "paths") return `Set up - only your link paths open here; the rest of ${hostname} is untouched.`;
  return "Not set up to receive visitors yet.";
}

function AddDomainModal({ onClose, onCreated }: { onClose: () => void; onCreated: (hostname: string) => void }) {
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const [hostname, setHostname] = useState("");
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const create = useMutation(
    orpc.domains.create.mutationOptions({
      onSuccess: async (created) => {
        await invalidate(orpc.domains.key());
        notify("Web address added.");
        onClose();
        onCreated(created.hostname);
      },
      onError: (err) => setErrors(toFormErrors(err)),
    }),
  );

  return (
    <Modal
      title="Add a web address"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => create.mutate({ hostname })} disabled={create.isPending}>
            {create.isPending ? "Adding..." : "Add"}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ hostname });
        }}
      >
        {errors.message && <ErrorBanner message={errors.message} />}
        <Field
          label="Web address"
          htmlFor="hostname"
          hint="A subdomain (go.example.com) or your root domain (example.com). After you add it, we'll show you exactly how it gets set up on Cloudflare."
          error={errors.fields.hostname}
        >
          <Input
            id="hostname"
            value={hostname}
            invalid={Boolean(errors.fields.hostname)}
            placeholder="go.example.com"
            autoFocus
            onChange={(e) => setHostname(e.target.value)}
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
