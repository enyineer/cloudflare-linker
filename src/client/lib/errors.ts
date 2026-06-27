import { ORPCError } from "@orpc/client";

/** Form-friendly view of an API error: a top-level message plus per-field messages. */
export interface FormErrors {
  message: string | null;
  fields: Record<string, string>;
}

function hasKey<K extends string>(o: unknown, key: K): o is Record<K, unknown> {
  return typeof o === "object" && o !== null && key in o;
}

/** Map an oRPC error (incl. zod validation issues in `data.issues`) to friendly,
 *  per-field messages the forms can render inline. */
export function toFormErrors(err: unknown): FormErrors {
  if (err instanceof ORPCError) {
    const fields = extractFieldErrors(err.data);
    const hasFields = Object.keys(fields).length > 0;
    return { message: hasFields ? null : err.message || "Something went wrong.", fields };
  }
  return { message: err instanceof Error ? err.message : "Something went wrong.", fields: {} };
}

function extractFieldErrors(data: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (hasKey(data, "issues") && Array.isArray(data.issues)) {
    for (const issue of data.issues) {
      if (hasKey(issue, "path") && hasKey(issue, "message") && typeof issue.message === "string") {
        const field = Array.isArray(issue.path) && issue.path.length > 0 ? String(issue.path[0]) : "_";
        if (!(field in fields)) fields[field] = issue.message;
      }
    }
  }
  return fields;
}

/** The oRPC error code (e.g. "UNAUTHORIZED", "FORBIDDEN"), or null. */
export function errorCode(err: unknown): string | null {
  return err instanceof ORPCError ? err.code : null;
}

/** A single human-readable message for toasts/banners. */
export function toMessage(err: unknown): string {
  const { message, fields } = toFormErrors(err);
  if (message) return message;
  const first = Object.values(fields)[0];
  return first ?? "Something went wrong.";
}
