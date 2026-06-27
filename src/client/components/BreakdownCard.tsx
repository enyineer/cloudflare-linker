import type { Breakdown } from "../../shared/contract.ts";
import { Card } from "./Card.tsx";
import { HorizontalBars } from "./charts.tsx";

export function BreakdownCard({ title, data, empty }: { title: string; data: Breakdown; empty?: string }) {
  return (
    <Card title={title}>
      {data.length === 0 ? <p className="muted">{empty ?? "No data yet."}</p> : <HorizontalBars data={data} />}
    </Card>
  );
}
