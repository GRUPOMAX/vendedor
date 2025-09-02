// KpiCard.jsx
export default function KpiCard({ title, value, hint }) {
  return (
    <div className="rounded-2xl border p-4 bg-white border-zinc-200 dark:bg-zinc-950/40 dark:border-zinc-800">
      <div className="text-sm opacity-75">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-xs opacity-60 mt-1">{hint}</div>}
    </div>
  );
}
