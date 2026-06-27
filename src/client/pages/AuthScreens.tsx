import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/controls.tsx";
import { ErrorBanner, LoadingScreen } from "../components/Feedback.tsx";
import { Field } from "../components/Field.tsx";
import { authApi } from "../lib/authApi.ts";
import { passkeyApi } from "../lib/passkeyApi.ts";

/** Shown when there's no valid session: first-run "create admin password" on a
 *  fresh install, otherwise the sign-in form. */
export function AuthScreens({ onAuthed }: { onAuthed: () => void }) {
  const status = useQuery({ queryKey: ["auth-status"], queryFn: authApi.status, retry: false });

  if (status.isPending) return <LoadingScreen />;
  if (status.data?.needsSetup) return <FirstRun email={status.data.bootstrapEmail ?? ""} onAuthed={onAuthed} />;
  return <LoginForm onAuthed={onAuthed} />;
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="center-screen">
      <div className="card card--pad auth-card">
        <div className="auth-card__brand">
          <span className="brand__logo" aria-hidden="true" /> Cloudflare Linker
        </div>
        <h1 className="auth-card__title">{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function LoginForm({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"password" | "reset">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  if (mode === "reset") {
    const valid = email.trim() !== "" && newPassword.length >= 12;
    return (
      <Shell title="Reset your password" subtitle="Confirm with a passkey, then choose a new password.">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) run(() => passkeyApi.reset(email.trim(), newPassword));
          }}
        >
          {error && <ErrorBanner message={error} />}
          <Field label="Email" htmlFor="r-email">
            <Input id="r-email" type="email" autoComplete="username" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="r-pw" hint="At least 12 characters.">
            <Input id="r-pw" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <Button
            variant="primary"
            className="btn--block"
            onClick={() => run(() => passkeyApi.reset(email.trim(), newPassword))}
            disabled={busy || !valid}
          >
            {busy ? "Waiting for your device..." : "Reset with a passkey"}
          </Button>
          <button type="button" className="auth-link" onClick={() => setMode("password")}>
            Back to sign in
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title="Sign in">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim() && password) run(() => authApi.login(email.trim(), password));
        }}
      >
        {error && <ErrorBanner message={error} />}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="auth-actions">
          <Button
            variant="primary"
            onClick={() => run(() => authApi.login(email.trim(), password))}
            disabled={busy || !email.trim() || !password}
          >
            {busy ? "Signing in..." : "Sign in"}
          </Button>
          <Button onClick={() => run(() => passkeyApi.login(email.trim()))} disabled={busy || !email.trim()}>
            Use a passkey
          </Button>
        </div>
        <button type="button" className="auth-link" onClick={() => setMode("reset")}>
          Forgot your password?
        </button>
        <button type="submit" hidden />
      </form>
    </Shell>
  );
}

function FirstRun({ email: fixedEmail, onAuthed }: { email: string; onAuthed: () => void }) {
  const needEmail = !fixedEmail;
  const [email, setEmail] = useState(fixedEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (needEmail && !email.trim()) return setError("Enter the administrator's email.");
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    try {
      await authApi.setPassword(password, needEmail ? email.trim() : undefined);
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the password.");
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Create your admin account"
      subtitle={needEmail ? "Set up the first administrator." : `Sets up ${fixedEmail} as the administrator.`}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && <ErrorBanner message={error} />}
        {needEmail && (
          <Field label="Your email" htmlFor="adminEmail">
            <Input id="adminEmail" type="email" autoComplete="username" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} />
          </Field>
        )}
        <Field label="New password" htmlFor="new" hint="At least 12 characters.">
          <Input id="new" type="password" autoComplete="new-password" value={password} autoFocus={!needEmail} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div>
          <Button variant="primary" onClick={submit} disabled={busy || !password}>
            {busy ? "Saving..." : "Create account"}
          </Button>
        </div>
        <button type="submit" hidden />
      </form>
    </Shell>
  );
}
