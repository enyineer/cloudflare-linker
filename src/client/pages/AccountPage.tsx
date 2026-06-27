import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../components/Button.tsx";
import { Card } from "../components/Card.tsx";
import { Input } from "../components/controls.tsx";
import { ErrorBanner } from "../components/Feedback.tsx";
import { Field } from "../components/Field.tsx";
import { useToast } from "../components/Toast.tsx";
import { authApi } from "../lib/authApi.ts";
import { toMessage } from "../lib/errors.ts";
import { useMe } from "../lib/me.tsx";
import { useInvalidate } from "../lib/mutations.ts";
import { passkeyApi } from "../lib/passkeyApi.ts";
import { orpc } from "../orpc.ts";

export function AccountPage() {
  const me = useMe();
  const { notify } = useToast();
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (newPassword.length < 12) return setError("Use at least 12 characters.");
    if (newPassword !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      notify("Password changed.");
      setOld("");
      setNew("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page__header">
        <div>
          <h1 className="page__title">Account</h1>
          <p className="page__subtitle">Signed in as {me.email}</p>
        </div>
      </div>

      <Card title="Change password">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {error && <ErrorBanner message={error} />}
          <Field label="Current password" htmlFor="cur">
            <Input id="cur" type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="newpw" hint="At least 12 characters.">
            <Input id="newpw" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="cfpw">
            <Input id="cfpw" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div>
            <Button variant="primary" onClick={submit} disabled={busy || !newPassword}>
              {busy ? "Saving..." : "Change password"}
            </Button>
          </div>
          <button type="submit" hidden />
        </form>
      </Card>

      <PasskeysCard />
    </div>
  );
}

function PasskeysCard() {
  const invalidate = useInvalidate();
  const { notify } = useToast();
  const passkeys = useQuery(orpc.passkeys.list.queryOptions());
  const [adding, setAdding] = useState(false);

  const remove = useMutation(
    orpc.passkeys.delete.mutationOptions({
      onSuccess: async () => {
        await invalidate(orpc.passkeys.key());
        notify("Passkey removed.");
      },
      onError: (err) => notify(toMessage(err), "error"),
    }),
  );

  const add = async () => {
    setAdding(true);
    try {
      await passkeyApi.register();
      await invalidate(orpc.passkeys.key());
      notify("Passkey added.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not add a passkey.", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card title="Passkeys">
      <p className="muted">
        Sign in with Touch ID, Windows Hello, or your phone instead of a password. You can also use a passkey to reset a
        forgotten password.
      </p>
      {passkeys.data && passkeys.data.length > 0 && (
        <div className="rows" style={{ marginTop: 12 }}>
          {passkeys.data.map((p) => (
            <div className="row" key={p.id}>
              <div className="row__main">
                <div className="row__title">{p.label || "Passkey"}</div>
                <div className="row__sub">Added {new Date(p.createdAt).toLocaleDateString()}</div>
              </div>
              <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate({ id: p.id })}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" disabled={adding} onClick={add}>
          {adding ? "Waiting for your device..." : "Add a passkey"}
        </Button>
      </div>
    </Card>
  );
}
