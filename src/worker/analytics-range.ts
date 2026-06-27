/** Pure date-range resolution for analytics (no DB, no Env) - unit-testable. */

export interface ResolvedRange {
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  fromDate: Date;
  toDate: Date;
}

const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolve an optional from/to (YYYY-MM-DD) into an inclusive UTC range,
 *  defaulting to the last 30 days ending at `now`. */
export function resolveRange(from: string | undefined, to: string | undefined, now: Date): ResolvedRange {
  const toDay = to ?? isoDay(now);
  const fromDay = from ?? isoDay(new Date(now.getTime() - 29 * DAY_MS));
  return {
    from: fromDay,
    to: toDay,
    fromDate: new Date(`${fromDay}T00:00:00.000Z`),
    toDate: new Date(`${toDay}T23:59:59.999Z`),
  };
}
