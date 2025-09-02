// src/components/vendedor/probabilidade/components/ProbChart.jsx
import React, { useRef, useEffect, useState, useMemo } from "react";
import dayjs from "../utils/dayjs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";

const PALETTE = { emerald: { line: "#10b981" }, sky: { line: "#0ea5e9" } };

export default function ProbChart({
      probs = [],
      periodo = "dia",
      cor = "emerald",
      showHighlights = false,     // 👈 novo
      highlightWeekdays = [],     // 👈 novo (ex.: [2,4])
    }) {
  const C = PALETTE[cor] || PALETTE.emerald;
  const ref = useRef(null);
  const [w, setW] = useState(800);

  useEffect(() => {
    const update = () => setW(ref.current ? ref.current.offsetWidth : 800);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const data = useMemo(() => {
    const fmt = periodo === "mes" ? "MMM/YYYY" : periodo === "semana" ? "DD/MM (sem)" : "DD/MM";
    return (probs || []).map(p => ({
      data: p.data,
      dataLabel: dayjs(p.data).format(fmt),
      prob: p.prob
    }));
  }, [probs, periodo]);
  // Dot customizado: bolinha só nos dias de semana destacados e somente após análise
  const Dot = (props) => {
    const { cx, cy, payload } = props;
    if (!showHighlights || !highlightWeekdays?.length) return null;
    const wd = dayjs(payload?.data).day(); // 0=Dom..6=Sáb
    if (!highlightWeekdays.includes(wd)) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="none" stroke="#f59e0b" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={2.5} fill="#f59e0b" />
      </g>
    );
  };



  return (
    <div ref={ref} className="h-80 w-full rounded-2xl border border-zinc-800 p-2">
      <LineChart width={w} height={305} data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
        <XAxis dataKey="dataLabel" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 1]}
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => `${Math.round(v * 100)}%`}
          width={60}
        />
        <Tooltip
          formatter={(value, name) => [`${Math.round(value * 100)}%`, "Probabilidade"]}
          labelFormatter={(l, payload) =>
            payload?.[0]?.payload?.data ? dayjs(payload[0].payload.data).format("DD/MM/YYYY") : l
          }
          contentStyle={{
            background: "#0a0a0a", border: "1px solid #262626", borderRadius: 12, color: "#ffffff",
          }}
        />
        <Legend />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="prob"
          name="Probabilidade"
          stroke={C.line}
          strokeWidth={2}
          dot={<Dot />}
        />
      </LineChart>
    </div>
  );
}
