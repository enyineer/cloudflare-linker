import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/** Passkey (WebAuthn) ceremonies: fetch options from the Worker, run the browser
 *  prompt, then send the result back. Same-origin so the session cookie flows. */

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong. Please try again.");
  return data as T;
}

export const passkeyApi = {
  /** Register a new passkey for the signed-in user. */
  register: async (): Promise<void> => {
    const optionsJSON = await post<PublicKeyCredentialCreationOptionsJSON>("/api/auth/passkey/register/options");
    const response = await startRegistration({ optionsJSON });
    await post("/api/auth/passkey/register", { response });
  },
  /** Sign in with a passkey. */
  login: async (email: string): Promise<void> => {
    const optionsJSON = await post<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkey/login/options", { email });
    const response = await startAuthentication({ optionsJSON });
    await post("/api/auth/passkey/login", { email, response });
  },
  /** Reset a forgotten password by confirming with a passkey. */
  reset: async (email: string, newPassword: string): Promise<void> => {
    const optionsJSON = await post<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkey/reset/options", { email });
    const response = await startAuthentication({ optionsJSON });
    await post("/api/auth/passkey/reset", { email, response, newPassword });
  },
};
