import type { Breakdown } from "../../shared/contract.ts";
import type { FilterField } from "../../shared/types.ts";
import { Badge } from "./Badge.tsx";
import { Card } from "./Card.tsx";
import { HorizontalBars } from "./charts.tsx";

interface BreakdownCardProps {
  title: string;
  data: Breakdown;
  empty?: string;
  /** When set together with onPick, rows become clickable filters for this field. */
  field?: FilterField;
  onPick?: (field: FilterField, value: string, label: string) => void;
  /** Values already filtered for this field (rendered non-clickable). */
  activeValues?: string[];
}

export function BreakdownCard({ title, data, empty, field, onPick, activeValues }: BreakdownCardProps) {
  if (data.length === 0) {
    return (
      <Card title={title}>
        <p className="muted">{empty ?? "No data yet."}</p>
      </Card>
    );
  }
  // Without a filter field, keep the original bar chart (look unchanged).
  if (field === undefined || onPick === undefined) {
    return (
      <Card title={title}>
        <HorizontalBars data={data} />
      </Card>
    );
  }

  const max = Math.max(...data.map((d) => d.clicks), 1);
  return (
    <Card title={title}>
      <div className="breakdown-rows">
        {data.map((d) => {
          const pct = Math.round((d.clicks / max) * 100);
          const fill = <span className="breakdown-row__fill" style={{ width: `${pct}%` }} aria-hidden="true" />;
          const body = (
            <>
              <span className="breakdown-row__label">{d.label}</span>
              <Badge tone="accent">{d.clicks}</Badge>
            </>
          );
          if (d.value !== undefined && !activeValues?.includes(d.value)) {
            const value = d.value;
            return (
              <button
                type="button"
                className="breakdown-row breakdown-row--clickable"
                key={d.label}
                title={`Show only ${d.label}`}
                onClick={() => onPick(field, value, d.label)}
              >
                {fill}
                {body}
              </button>
            );
          }
          return (
            <div className="breakdown-row" key={d.label}>
              {fill}
              {body}
            </div>
          );
        })}
      </div>
      <p className="breakdown-hint">Tap a row to filter.</p>
    </Card>
  );
}
