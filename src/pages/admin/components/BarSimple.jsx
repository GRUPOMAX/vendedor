// src/components/BarSimple.jsx
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useId, useMemo } from "react";
import { useUI } from "../../../state/ThemeContext";

// helpers
const truncate = (s, n = 12) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : s);
const fmtNumber = (v, locale = "pt-BR") =>
  Number(v).toLocaleString(locale, { maximumFractionDigits: 2 });
const fmtCurrency = (v, locale = "pt-BR", currency = "BRL") =>
  Number(v).toLocaleString(locale, { style: "currency", currency });

export default function BarSimple({
  data = [],
  dataKey = "value",
  xKey = "name",
  height = 288,                   // 72 * 4
  format = "number",              // "number" | "currency"
  locale = "pt-BR",
  currency = "BRL",
  sort = "desc",                  // "none" | "asc" | "desc"
  maxBars,                        // ex.: 8 (top 8)
  yTicks = 5,
  yDomain = ["auto", "auto"],     // pode passar [0, "auto"] p/ sempre começar no zero
  onBarClick,                     // (entry) => void
  className = "",
}) {
  const UI = useUI();
  const gradId = useId(); // garante id único por componente

  const series = useMemo(() => {
    let arr = Array.isArray(data) ? [...data] : [];
    // ordenação
    if (sort !== "none") {
      const dir = sort === "asc" ? 1 : -1;
      arr.sort((a, b) => (Number(a?.[dataKey] || 0) - Number(b?.[dataKey] || 0)) * dir);
    }
    // top-N
    if (maxBars && maxBars > 0) arr = arr.slice(0, maxBars);
    return arr;
  }, [data, dataKey, sort, maxBars]);

  const valueFmt =
    format === "currency"
      ? (v) => fmtCurrency(v, locale, currency)
      : (v) => fmtNumber(v, locale);

  if (!series.length) {
    return (
      <div className={`h-72 grid place-items-center rounded-2xl border p-3 bg-white border-zinc-200 dark:bg-zinc-950/40 dark:border-zinc-800 ${className}`}>
        <div className="text-sm opacity-60">Sem dados</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-3 bg-white border-zinc-200 dark:bg-zinc-950/40 dark:border-zinc-800 ${className}`} style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 8 }} barCategoryGap={12}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={UI.emerald.soft} />
              <stop offset="100%" stopColor={UI.emerald.strong} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke={UI.grid} />

          <XAxis
            dataKey={xKey}
            tick={{ fill: UI.text, fontSize: 12 }}
            tickFormatter={(v) => truncate(v, 14)}
            interval="preserveStartEnd"
            height={28}
          />

          <YAxis
            tick={{ fill: UI.text, fontSize: 12 }}
            tickFormatter={valueFmt}
            domain={yDomain}
            minTickGap={8}
            ticks={yTicks ? undefined : undefined}
          />

          <Tooltip
            cursor={{ fill: UI.cursor }}
            contentStyle={{
              background: UI.tooltipBg,
              border: `1px solid ${UI.tooltipBr}`,
              color: UI.text,
              borderRadius: "0.5rem",
              boxShadow: "0 8px 24px rgba(0,0,0,.1)",
            }}
            formatter={(value, key, item) => [valueFmt(value), item?.payload?.[xKey]]}
            labelFormatter={(label) => label}
          />

          <Bar
            dataKey={dataKey}
            radius={[6, 6, 0, 0]}
            fill={`url(#${gradId})`}
            onClick={onBarClick ? (_, i) => onBarClick(series[i]) : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
