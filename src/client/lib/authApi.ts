/** Thin client for the self-hosted auth routes (cookie-based, so plain fetch
 *  rather than oRPC). Same-origin, so the session cookie is sent/stored. */

export interface AuthStatus {
  needsSetup: boolean;
  bootstrapEmail: string | null;
}

async function post(path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
}

export const authApi = {
  status: async (): Promise<AuthStatus> => {
    const res = await fetch("/api/auth/status", { credentials: "same-origin" });
    return (await res.json()) as AuthStatus;
  },
  login: (email: string, password: string) => post("/api/auth/login", { email, password }),
  logout: () => post("/api/auth/logout"),
  setPassword: (password: string, email?: string) =>
    post("/api/auth/set-password", email ? { password, email } : { password }),
  changePassword: (oldPassword: string, newPassword: string) =>
    post("/api/auth/change-password", { oldPassword, newPassword }),
};
