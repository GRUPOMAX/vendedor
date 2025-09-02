import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell, Legend } from "recharts";
import { useUI } from "../../../state/ThemeContext";

// Tooltip totalmente controlado (garante contraste no dark)
function CustomTooltip({ active, payload, label, UI }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]; // Pie simples, um item por vez
  return (
    <div
      style={{
        background: UI.tooltipBg,
        color: UI.tooltipText || UI.text,
        border: `1px solid ${UI.tooltipBr}`,
        borderRadius: "8px",
        padding: "8px 10px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p?.name ?? label}</div>
      <div>
        {p?.value}
      </div>
    </div>
  );
}

// Legend custom para respeitar o UI.text em qualquer tema
function CustomLegend({ payload = [], UI }) {
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "center", marginTop: 8 }}>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              display: "inline-block",
              background: entry.color, // cor do slice
            }}
          />
          <span style={{ color: UI.text, fontSize: "0.92rem" }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function PieSimple({ data, dataKey = "value", nameKey = "name" }) {
  const UI = useUI();
  const series = (data || []).filter((d) => Number(d?.[dataKey]) > 0);

  return (
    <div className="h-72 rounded-2xl border p-3 bg-white border-zinc-200 dark:bg-zinc-950/40 dark:border-zinc-800">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={series}
            dataKey={dataKey}
            nameKey={nameKey}
            outerRadius={95}
            // deixa o stroke combinando com o cartão (fica bonito no dark)
            stroke={UI.cardBg}
            strokeWidth={2}
          >
            {series.map((_, i) => (
              <Cell key={i} fill={UI.chartPieColors[i % UI.chartPieColors.length]} />
            ))}
          </Pie>

          <Tooltip
            // contentStyle do Recharts é limitado — usamos um componente próprio:
            content={<CustomTooltip UI={UI} />}
            cursor={{ fill: UI.cursor }}
          />

          <Legend
            // render completamente controlado (ignora wrapperStyle)
            content={<CustomLegend UI={UI} />}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
