import { RANGE_PRESETS } from "../lib/range.ts";
import { Button } from "./Button.tsx";

export function RangeTabs({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="cluster">
      {RANGE_PRESETS.map((r) => (
        <Button key={r.days} size="sm" variant={r.days === days ? "primary" : "ghost"} onClick={() => onChange(r.days)}>
          {r.label}
        </Button>
      ))}
    </div>
  );
}
