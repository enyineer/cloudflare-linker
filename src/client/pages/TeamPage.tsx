import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { can } from "../../shared/roles.ts";
import { USER_ROLES, type Role } from "../../shared/types.ts";
import { asRole } from "../lib/enums.ts";
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
const ROLE_HELP: Record<Role, string> = {
  admin: "Full access, including team management.",
  editor: "Can manage links and campaigns.",
  viewer: "Can view everything, but not change it.",
};
const ROLE_OPTIONS = USER_ROLES.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }));

export function TeamPage() {
  const me = useMe();
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const users = useQuery(orpc.users.list.queryOptions({ enabled: can(me.role, "manageUsers") }));
  const [adding, setAdding] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  // A one-time temporary password to hand to a person (after add or reset).
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  if (!can(me.role, "manageUsers")) {
    return (
      <div className="card card--pad">
        <EmptyState icon="🔒" title="Admins only" text="Only administrators can manage team members." />
      </div>
    );
  }

  const update = useMutation(
    orpc.users.update.mutationOptions({
      onSuccess: async () => {
        await invalidate(orpc.users.key());
        notify("Role updated.");
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );
  const remove = useMutation(
    orpc.users.delete.mutationOptions({
      onSuccess: async () => {
        await invalidate(orpc.users.key());
        notify("Team member removed.");
        setConfirmEmail(null);
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );
  const reset = useMutation(
    orpc.users.resetPassword.mutationOptions({
      onSuccess: (res, vars) => setCredential({ email: vars.email, password: res.tempPassword }),
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  return (
    <div className="stack">
      <div className="page__header">
        <div>
          <h1 className="page__title">Team</h1>
          <p className="page__subtitle">Who can sign in, and what they are allowed to do.</p>
        </div>
        <div className="page__actions">
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add person
          </Button>
        </div>
      </div>

      {users.isPending ? (
        <LoadingScreen />
      ) : users.isError ? (
        <ErrorBanner message={toMessage(users.error)} />
      ) : users.data.length === 0 ? (
        <div className="card card--pad">
          <EmptyState icon="👥" title="No team members yet" text="Add someone by their email address to give them access." />
        </div>
      ) : (
        <div className="card">
          <div className="rows">
            {users.data.map((u) => {
              const isSelf = u.email === me.email;
              return (
                <div className="row" key={u.email}>
                  <div className="row__main">
                    <div className="row__title">
                      {u.email} {isSelf && <Badge tone="accent">you</Badge>}
                    </div>
                    <div className="row__sub">Added {formatDate(u.createdAt)}</div>
                  </div>
                  <div className="row__role">
                    <Select
                      value={u.role}
                      disabled={isSelf || update.isPending}
                      onValueChange={(v) => update.mutate({ email: u.email, role: asRole(v) })}
                      ariaLabel={`Role for ${u.email}`}
                      options={ROLE_OPTIONS}
                    />
                  </div>
                  <div className="row__actions">
                    {!isSelf && (
                      <Button
                        size="sm"
                        disabled={reset.isPending && reset.variables?.email === u.email}
                        onClick={() => reset.mutate({ email: u.email })}
                      >
                        {reset.isPending && reset.variables?.email === u.email ? "..." : "Reset password"}
                      </Button>
                    )}
                    <Button size="sm" variant="danger" disabled={isSelf} onClick={() => setConfirmEmail(u.email)}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {adding && (
        <AddUserModal onClose={() => setAdding(false)} onCreated={(email, password) => setCredential({ email, password })} />
      )}
      {credential && (
        <CredentialModal email={credential.email} password={credential.password} onClose={() => setCredential(null)} />
      )}
      {confirmEmail !== null && (
        <ConfirmDialog
          title="Remove this person?"
          message="They will lose access to the dashboard. You can add them again later."
          confirmLabel="Remove"
          busy={remove.isPending}
          onConfirm={() => remove.mutate({ email: confirmEmail })}
          onCancel={() => setConfirmEmail(null)}
        />
      )}
    </div>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string, password: string) => void }) {
  const invalidate = useInvalidate();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  const create = useMutation(
    orpc.users.create.mutationOptions({
      onSuccess: async (res) => {
        await invalidate(orpc.users.key());
        onClose();
        onCreated(res.email, res.tempPassword);
      },
      onError: (err) => setErrors(toFormErrors(err)),
    }),
  );

  return (
    <Modal
      title="Add a person"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => create.mutate({ email, role })} disabled={create.isPending}>
            {create.isPending ? "Adding..." : "Add"}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ email, role });
        }}
      >
        {errors.message && <ErrorBanner message={errors.message} />}
        <Field label="Email address" htmlFor="email" error={errors.fields.email}>
          <Input id="email" type="email" value={email} invalid={Boolean(errors.fields.email)} autoFocus onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role" htmlFor="role" hint={ROLE_HELP[role]} error={errors.fields.role}>
          <Select id="role" value={role} onValueChange={(v) => setRole(asRole(v))} options={ROLE_OPTIONS} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CredentialModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const { notify } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      notify("Copied.");
    } catch {
      notify("Could not copy. Select the password and copy it manually.", "error");
    }
  };
  return (
    <Modal
      title="Temporary password"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="stack">
        <p className="muted">
          Share this one-time password with <strong>{email}</strong>. They sign in with their email and this password,
          then set their own. It is shown only once.
        </p>
        <div className="credential">
          <code className="credential__value mono">{password}</code>
          <Button size="sm" onClick={copy}>
            Copy
          </Button>
        </div>
      </div>
    </Modal>
  );
}
