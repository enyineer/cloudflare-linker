import { useMemo, useState } from "react";
import type { ClickFilter } from "../../shared/contract.ts";
import type { FilterField } from "../../shared/types.ts";

/** One active filter value with its display label (label is client-only; the wire
 *  payload sends just field + value). */
export interface ActiveFilter {
  field: FilterField;
  value: string;
  label: string;
}

/** Local analytics-filter state (matches the range/includeBots local-state pattern).
 *  Multiple values of the same field are OR-ed; different fields are AND-ed. */
export function useFilters() {
  const [active, setActive] = useState<ActiveFilter[]>([]);

  const add = (field: FilterField, value: string, label: string) =>
    setActive((cur) => (cur.some((a) => a.field === field && a.value === value) ? cur : [...cur, { field, value, label }]));

  const remove = (field: FilterField, value: string) =>
    setActive((cur) => cur.filter((a) => !(a.field === field && a.value === value)));

  const clear = () => setActive([]);

  // Group by field into the contract's ClickFilter[] shape for the query input.
  const filters = useMemo<ClickFilter[]>(() => {
    const byField = new Map<FilterField, string[]>();
    for (const a of active) {
      const vals = byField.get(a.field) ?? [];
      vals.push(a.value);
      byField.set(a.field, vals);
    }
    return [...byField].map(([field, values]) => ({ field, values }));
  }, [active]);

  return { active, filters, add, remove, clear };
}
