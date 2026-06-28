import { useState } from "react";
import type { FacetsDto } from "../../shared/contract.ts";
import { COMMON_FILTER_FIELDS, FILTER_FIELDS, FILTER_FIELD_LABELS, type FilterField } from "../../shared/types.ts";
import type { ActiveFilter } from "../lib/filters.ts";
import { Button } from "./Button.tsx";
import { Select } from "./Select.tsx";

interface FilterBarProps {
  active: ActiveFilter[];
  facets?: FacetsDto;
  onAdd: (field: FilterField, value: string, label: string) => void;
  onRemove: (field: FilterField, value: string) => void;
  onClear: () => void;
}

// Common fields first, then the rest - only fields that actually have data.
function orderFields(present: FilterField[]): FilterField[] {
  const set = new Set(present);
  const common = COMMON_FILTER_FIELDS.filter((f) => set.has(f));
  const rest = FILTER_FIELDS.filter((f) => set.has(f) && !COMMON_FILTER_FIELDS.includes(f));
  return [...common, ...rest];
}

export function FilterBar({ active, facets, onAdd, onRemove, onClear }: FilterBarProps) {
  const [adding, setAdding] = useState(false);
  const [field, setField] = useState<FilterField | "">("");

  const present = (facets?.fields ?? []).map((f) => f.field);
  const fieldOptions = orderFields(present).map((f) => ({ value: f, label: FILTER_FIELD_LABELS[f] }));
  const fieldFacet = field ? facets?.fields.find((f) => f.field === field) : undefined;
  const valueOptions = (fieldFacet?.values ?? [])
    .filter((v) => !active.some((a) => a.field === field && a.value === v.value))
    .map((v) => ({ value: v.value, label: `${v.label} (${v.clicks})` }));

  const reset = () => {
    setAdding(false);
    setField("");
  };

  const pickValue = (value: string) => {
    if (!field) return;
    const match = fieldFacet?.values.find((v) => v.value === value);
    onAdd(field, value, match?.label ?? value);
    reset();
  };

  return (
    <div className="filterbar">
      {active.length > 0 && <span className="filterbar__label">Showing:</span>}
      {active.map((a) => (
        <span className="chip" key={`${a.field}:${a.value}`}>
          <span className="chip__text">
            {FILTER_FIELD_LABELS[a.field]}: {a.label}
          </span>
          <button
            type="button"
            className="chip__x"
            aria-label={`Remove ${FILTER_FIELD_LABELS[a.field]} ${a.label}`}
            onClick={() => onRemove(a.field, a.value)}
          >
            &times;
          </button>
        </span>
      ))}

      {adding ? (
        <span className="filterbar__add">
          <Select
            value={field}
            onValueChange={(v) => setField(v as FilterField)}
            options={fieldOptions}
            placeholder="Field"
            ariaLabel="Filter by field"
          />
          {field && (
            <Select
              value=""
              onValueChange={pickValue}
              options={valueOptions}
              placeholder={valueOptions.length ? "Value" : "No values"}
              disabled={valueOptions.length === 0}
              ariaLabel="Filter value"
            />
          )}
          <button type="button" className="chip__x" aria-label="Cancel" onClick={reset}>
            &times;
          </button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={fieldOptions.length === 0}>
          + Add filter
        </Button>
      )}

      {active.length > 0 && (
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear all
        </Button>
      )}
    </div>
  );
}
