// components/analise/GraficoAnaliseModal.jsx
import React, { useMemo, useRef, useState } from "react"; // + useRef
import { createPortal } from "react-dom";
import {
  X as XIcon,
  LineChart as LineChartIcon,
  Info,
  BarChart3,
  AreaChart,
  TrendingUp,
  Calculator,
  EyeOff,
  Eye
} from "lucide-react";
import dayjs from "../../../../utils/dayjs";
import { parseAnyDate } from "@/utils/dateRange";
import { useUI } from "../../../../state/ThemeContext";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import HelpLegendModal, { HelpFab } from "./HelpLegendModal"; // ajuste o path se preciso


// ------------------------ helpers ------------------------
const getData = (v) =>
  parseAnyDate(v?.dataHora || v?.data || v?.createdAt || v?.updatedAt);

function monthsBetween(start, end) {
  const out = [];
  let cur = start.startOf("month");
  const last = end.startOf("month");
  while (cur.isSameOrBefore(last)) {
    out.push(cur);
    cur = cur.add(1, "month");
  }
  return out;
}

function linearRegression(ySeries = []) {
  const n = ySeries.length;
  if (!n) return { a: 0, b: 0 };
  let sumT = 0, sumY = 0, sumTT = 0, sumTY = 0;
  for (let t = 0; t < n; t++) {
    const y = Number(ySeries[t]) || 0;
    sumT += t; sumY += y; sumTT += t * t; sumTY += t * y;
  }
  const denom = n * sumTT - sumT * sumT;
  if (denom === 0) return { a: sumY / n, b: 0 };
  const b = (n * sumTY - sumT * sumY) / denom;
  const a = (sumY - b * sumT) / n;
  return { a, b };
}

// ------------------------ componente ------------------------
export default function GraficoAnaliseModal({
  open,
  onClose,
  vendas = [],
}) {
  const UI = useUI();
  const isDark = UI.theme === "dark";
  const [tipo, setTipo] = useState("barras"); // barras | area | linha
  const [showCalc, setShowCalc] = useState(false);
  const [openHelp, setOpenHelp] = useState(false);


  const calcRef = useRef(null);

  function handleToggleCalc() {
  setShowCalc((prev) => {
    const next = !prev;
    // se vamos abrir, rola até a seção após o próximo paint
    if (!prev) {
      requestAnimationFrame(() => {
        calcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    return next;
  });
}

  // Série mensal histórica a partir de TODAS as vendas
  const serieMensal = useMemo(() => {
    if (!Array.isArray(vendas) || !vendas.length) return [];
    let minD = null, maxD = null;
    const monthMap = new Map(); // 'YYYY-MM' -> count

    for (const v of vendas) {
      const d = getData(v);
      if (!d?.isValid?.()) continue;
      if (!minD || d.isBefore(minD)) minD = d;
      if (!maxD || d.isAfter(maxD)) maxD = d;
    }
    if (!minD || !maxD) return [];

    const months = monthsBetween(minD, maxD);
    months.forEach((m) => monthMap.set(m.format("YYYY-MM"), 0));

    for (const v of vendas) {
      const d = getData(v);
      if (!d?.isValid?.()) continue;
      const key = d.format("YYYY-MM");
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }

    const data = months.map((m, idx) => ({
      key: m.format("YYYY-MM"),
      label: m.format("MMM/YY"),
      vendas: monthMap.get(m.format("YYYY-MM")) || 0,
      t: idx,
    }));

    // injeta linha de tendência
    const y = data.map(d => d.vendas);
    const { a, b } = linearRegression(y);
    return data.map(d => ({ ...d, tendencia: Math.max(0, a + b * d.t) }));
  }, [vendas]);

  const forecast = useMemo(() => {
    const y = serieMensal.map(d => d.vendas);
    const { a, b } = linearRegression(y);
    const tNext = y.length;
    const yhat = Math.max(0, a + b * tNext);
    return { a, b, tNext, yhat, prev: Math.round(yhat) };
  }, [serieMensal]);

  const kpis = useMemo(() => {
    const n = serieMensal.length;
    const last = n ? serieMensal[n - 1].vendas : 0;
    const prev1 = n > 1 ? serieMensal[n - 2].vendas : 0;
    const prev2 = n > 2 ? serieMensal[n - 3].vendas : 0;
    const varMoM = prev1 ? ((last - prev1) / prev1) * 100 : 0;
    const media3m = (last + prev1 + prev2) / Math.max(1, Math.min(3, n));
    const lastLabel = n ? serieMensal[n - 1].label : "—";
    return { last, prev1, prev2, varMoM, media3m, lastLabel };
  }, [serieMensal]);

  if (!open) return null;

  const gridColor = UI.grid;
  const textMuted = UI.muted;

  const Modal = (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-6xl max-h-[92vh] overflow-hidden rounded-3xl shadow-2xl m-0 sm:m-4"
        style={{ background: UI.cardBg, color: UI.text }}
      >

        
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 sm:p-6"
          style={{ borderBottom: `1px solid ${UI.border}` }}
        >
          <div className="flex items-center gap-2">
            <LineChartIcon className="w-5 h-5" />
            <h2 className="text-xl sm:text-2xl font-semibold">Análise Mensal & Previsão</h2>
          </div>

          

          <div className="flex items-center gap-2">
            <ChartTypeToggle tipo={tipo} setTipo={setTipo} />
            <button
              onClick={() => setShowCalc(s => !s)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl transition"
              style={{ border: `1px solid ${UI.border}` }}
              title="Mostrar cálculo"
            >
              <Calculator className="w-4 h-4" />
              {showCalc ? "Ocultar cálculo" : "Mostrar cálculo"}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl transition"
              style={{ border: `1px solid ${UI.border}` }}
            >
              <XIcon className="w-5 h-5" />
            </button>
            
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[78vh]">


          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Kpi title={`Último mês (${kpis.lastLabel})`} value={kpis.last} UI={UI} />
            <Kpi title="Mês anterior" value={kpis.prev1} UI={UI} />
            <Kpi title="Média (3 meses)" value={Math.round(kpis.media3m)} UI={UI} />
            <Kpi title="Variação M/M" value={`${kpis.varMoM >= 0 ? "+" : ""}${kpis.varMoM.toFixed(1)}%`} UI={UI} />
          </div>

          {/* Gráfico principal */}
          <div className="rounded-2xl p-3" style={{ border: `1px solid ${UI.border}` }}>
            <div className="text-sm mb-2" style={{ color: textMuted }}>
              Vendas por mês + tendência e previsão do próximo mês.
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={serieMensal}
                  margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={UI.emerald.soft} stopOpacity={0.35}/>
                      <stop offset="100%" stopColor={UI.emerald.soft} stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<PtbrTooltip UI={UI} />}
                    cursor={{ fill: UI.cursor }}
                  />
                  <Legend />

                  {/* Série vendas com troca de tipo (sempre esmeralda) */}
                  {tipo === "barras" && (
                    <Bar
                      dataKey="vendas"
                      name="Vendas"
                      barSize={28}
                      isAnimationActive
                      fill={UI.emerald.soft}
                    />
                  )}
                  {tipo === "area" && (
                    <Area
                      dataKey="vendas"
                      name="Vendas"
                      type="monotone"
                      fill="url(#gradVendas)"
                      stroke={UI.emerald.strong}
                      strokeWidth={2}
                      isAnimationActive
                    />
                  )}
                  {tipo === "linha" && (
                    <Line
                      dataKey="vendas"
                      name="Vendas"
                      type="monotone"
                      stroke={UI.emerald.strong}
                      strokeWidth={3}
                      dot={{ r: 3, stroke: UI.emerald.strong }}
                      isAnimationActive
                    />
                  )}

                  {/* Tendência sempre visível (tom neutro) */}
                  <Line
                    dataKey="tendencia"
                    name="Tendência"
                    type="monotone"
                    stroke={UI.slate4}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive
                  />
                </ComposedChart>
              </ResponsiveContainer>
              
            </div>
          </div>

            {/* Previsão */}
            <div className="rounded-2xl p-4" style={{ border: `1px solid ${UI.border}` }}>
              <div className="flex items-center gap-2 text-sm mb-2">
                <TrendingUp className="w-4 h-4" />
                <span>Previsão do próximo mês (regressão linear simples)</span>
              </div>

              {/* Linha com valor + botão olho */}
              <div className="flex items-center justify-between gap-3">
                <div className="text-2xl font-semibold">
                  Próximo mês: {forecast.prev} vendas
                </div>
                <button
                  onClick={handleToggleCalc}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ border: `1px solid ${UI.border}` }}
                  aria-label={showCalc ? "Ocultar cálculo" : "Ver cálculo (ŷ = a + b·t)"}
                  title={showCalc ? "Ocultar cálculo" : "Ver cálculo (ŷ = a + b·t)"}
                >
                  {showCalc ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showCalc ? "Ocultar cálculo" : "Ver cálculo"}
                </button>
              </div>

              {/* Fórmula só aparece quando showCalc = true */}
              {showCalc && (
                <div className="text-xs mt-2" style={{ color: textMuted }}>
                  ŷ = a + b·t &nbsp;|&nbsp; a = {forecast.a.toFixed(2)} &nbsp; b = {forecast.b.toFixed(3)} &nbsp; (t = índice do mês)
                </div>
              )}
            </div>




          {/* Painel de cálculo (colapsável) */}
          <div
                ref={calcRef}   // <<<<<< AQUI entra o ref
                className={`transition-all duration-300 ${
                  showCalc ? "opacity-100 max-h-[600px]" : "opacity-0 max-h-0"
                } overflow-hidden`}
              >
            <div className="rounded-2xl p-4" style={{ border: `1px solid ${UI.border}` }}>
              <div className="flex items-center gap-2 text-sm mb-3">
                <Info className="w-4 h-4" />
                <span>Detalhes do cálculo</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <SmallStat label="Observações (meses)" value={serieMensal.length} UI={UI} />
                <SmallStat label="Intercepto (a)" value={forecast.a.toFixed(2)} UI={UI} />
                <SmallStat label="Inclinação (b)" value={forecast.b.toFixed(3)} UI={UI} />
              </div>

              <div className="overflow-auto rounded-xl" style={{ border: `1px dashed ${UI.border}` }}>
                <table className="w-full text-sm">
                  <thead style={{ background: isDark ? "rgba(24,24,27,0.4)" : "#f6f6f7", color: textMuted }}>
                    <tr>
                      <th className="px-3 py-2 text-left">Mês</th>
                      <th className="px-3 py-2 text-left">Vendas</th>
                      <th className="px-3 py-2 text-left">T (índice)</th>
                      <th className="px-3 py-2 text-left">Tendência (ŷ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serieMensal.map((r) => (
                      <tr key={r.key} style={{ borderTop: `1px solid ${UI.border}` }}>
                        <td className="px-3 py-2">{r.label}</td>
                        <td className="px-3 py-2">{r.vendas}</td>
                        <td className="px-3 py-2">{r.t}</td>
                        <td className="px-3 py-2">{Math.round(r.tendencia)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `1px solid ${UI.border}`, background: isDark ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.12)" }}>
                      <td className="px-3 py-2">Próx. mês</td>
                      <td className="px-3 py-2">—</td>
                      <td className="px-3 py-2">{serieMensal.length}</td>
                      <td className="px-3 py-2">{Math.round(forecast.yhat)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/*<p className="text-xs mt-3" style={{ color: textMuted }}>
                Se quiser, dá pra mudar o modelo para média móvel com ajuste sazonal, Naive sazonal ou Holt-Winters.
                Também posso limitar a regressão aos últimos N meses para priorizar dados recentes.
              </p>*/}
            </div>
          </div>
        </div>

         <HelpFab inside onClick={() => setOpenHelp(true)} />
      </div>
      <HelpLegendModal
        open={openHelp}
        onClose={() => setOpenHelp(false)}
        a={forecast.a}
        b={forecast.b}
        obs={serieMensal.length}
        proximoT={serieMensal.length}
        previsao={forecast.prev}
        serieMensal={serieMensal}   // <<< NOVO
      />
    </div>
  );

  return createPortal(Modal, document.body);
}

// ------------------------ UI auxiliares ------------------------
function Kpi({ title, value, UI }) {
  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ border: `1px solid ${UI.border}` }}>
      <div className="text-sm" style={{ color: UI.muted }}>{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SmallStat({ label, value, UI }) {
  return (
    <div className="rounded-xl p-3" style={{ border: `1px solid ${UI.border}` }}>
      <div className="text-xs" style={{ color: UI.muted }}>{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function ChartTypeToggle({ tipo, setTipo }) {
  return (
    <div className="flex items-center gap-2">
      <ToggleBtn active={tipo==="barras"} onClick={() => setTipo("barras")} label="Barras" icon={BarChart3} />
      <ToggleBtn active={tipo==="area"} onClick={() => setTipo("area")} label="Área" icon={AreaChart} />
      <ToggleBtn active={tipo==="linha"} onClick={() => setTipo("linha")} label="Linha" icon={TrendingUp} />
    </div>
  );
}

function ToggleBtn({ active, onClick, label, icon: Icon }) {
  const UI = useUI();
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl transition"
      style={{
        border: `1px solid ${active ? UI.emerald.soft : UI.border}`,
        background: active ? "rgba(34,197,94,0.10)" : "transparent",
      }}
      title={label}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

// Tooltip PT-BR (usa paleta do ThemeContext)
function PtbrTooltip({ active, payload, label, UI }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-sm shadow-lg"
      style={{
        background: UI.tooltipBg,
        color: UI.tooltipText,
        border: `1px solid ${UI.tooltipBr}`,
      }}
    >
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
