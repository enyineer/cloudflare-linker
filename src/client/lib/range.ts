import { useMemo, useState } from "react";

export const RANGE_PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function rangeFor(days: number): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

/** A 7/30/90-day window, memoized by `days` so it doesn't refetch every render. */
export function useDateRange(initialDays = 30) {
  const [days, setDays] = useState(initialDays);
  const range = useMemo(() => rangeFor(days), [days]);
  return { days, setDays, range };
}
