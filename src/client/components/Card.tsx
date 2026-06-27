import type { ReactNode } from "react";

export function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card card--pad">
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
