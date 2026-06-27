import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const ACCENT = "#f6821f";
const GRID = "#e2e8f0";
const MUTED = "#64748b";

function shortDate(value: string): string {
  const dt = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ClicksOverTimeChart({ data }: { data: { date: string; clicks: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => shortDate(String(value))}
          tick={{ fontSize: 11, fill: MUTED }}
          stroke={GRID}
          minTickGap={24}
        />
        <YAxis allowDecimals={false} width={34} tick={{ fontSize: 11, fill: MUTED }} stroke={GRID} />
        <Tooltip labelFormatter={(label) => shortDate(String(label))} />
        <Area type="monotone" dataKey="clicks" name="Clicks" stroke={ACCENT} strokeWidth={2} fill="url(#clicksFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({ data }: { data: { label: string; clicks: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 12, fill: MUTED }} stroke={GRID} />
        <Tooltip />
        <Bar dataKey="clicks" name="Clicks" fill={ACCENT} radius={[0, 6, 6, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
