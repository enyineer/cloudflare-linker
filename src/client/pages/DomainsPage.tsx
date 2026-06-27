import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import type { DomainKind } from "../../shared/types.ts";
import { can } from "../../shared/roles.ts";
import { Badge } from "../components/Badge.tsx";
import { Button } from "../components/Button.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { Field } from "../components/Field.tsx";
import { Input } from "../components/controls.tsx";
import { Modal } from "../components/Modal.tsx";
import { Select } from "../components/Select.tsx";
import { useToast } from "../components/Toast.tsx";
import { toFormErrors, toMessage, type FormErrors } from "../lib/errors.ts";
import { formatDate } from "../lib/format.ts";
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
                  <div className="row__sub">
                    {d.kind === "custom" ? "Custom domain" : "Subdomain"} · added {formatDate(d.createdAt)}
                  </div>
                </div>
                <StatusBadge status={d.status} />
                {editable && (
                  <div className="row__actions">
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

      {adding && <AddDomainModal onClose={() => setAdding(false)} />}
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

function StatusBadge({ status }: { status: "active" | "disabled" | "pending" }) {
  if (status === "active") return <Badge tone="ok">Active</Badge>;
  if (status === "pending") return <Badge tone="warn">Awaiting setup</Badge>;
  return <Badge tone="muted">Off</Badge>;
}

function AddDomainModal({ onClose }: { onClose: () => void }) {
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const [hostname, setHostname] = useState("");
  const [kind, setKind] = useState<DomainKind>("subdomain");
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const create = useMutation(
    orpc.domains.create.mutationOptions({
      onSuccess: async () => {
        await invalidate(orpc.domains.key());
        notify("Web address added.");
        onClose();
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
          <Button variant="primary" onClick={() => create.mutate({ hostname, kind })} disabled={create.isPending}>
            {create.isPending ? "Adding..." : "Add"}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ hostname, kind });
        }}
      >
        {errors.message && <ErrorBanner message={errors.message} />}
        <Field label="Web address" htmlFor="hostname" hint="For example: go.your-app.com" error={errors.fields.hostname}>
          <Input
            id="hostname"
            value={hostname}
            invalid={Boolean(errors.fields.hostname)}
            placeholder="go.example.com"
            autoFocus
            onChange={(e) => setHostname(e.target.value)}
          />
        </Field>
        <Field
          label="Type"
          htmlFor="kind"
          hint="A subdomain of your app works right away. A custom domain needs extra setup."
          error={errors.fields.kind}
        >
          <Select
            id="kind"
            value={kind}
            onValueChange={(v) => setKind(v === "custom" ? "custom" : "subdomain")}
            options={[
              { value: "subdomain", label: "Subdomain (works immediately)" },
              { value: "custom", label: "Custom domain (advanced)" },
            ]}
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
