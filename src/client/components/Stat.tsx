import { Link } from "wouter";

function trend(current: number, previous: number): { text: string; tone: "up" | "down" | "flat" } | null {
  if (previous <= 0) return current > 0 ? { text: "New", tone: "up" } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  return { text: `${arrow} ${Math.abs(pct)}% vs previous`, tone };
}

export function Stat({
  label,
  value,
  href,
  previous,
}: {
  label: string;
  value: number;
  href?: string;
  previous?: number;
}) {
  const t = previous === undefined ? null : trend(value, previous);
  const inner = (
    <>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {t && <div className={`stat__delta stat__delta--${t.tone}`}>{t.text}</div>}
    </>
  );
  if (!href) return <div className="card stat">{inner}</div>;
  return (
    <Link href={href} className="card stat stat--link">
      {inner}
    </Link>
  );
}
