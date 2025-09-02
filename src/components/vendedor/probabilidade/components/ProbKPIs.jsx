import React from "react";
import { TrendingUp, Rocket, BarChart2 } from "lucide-react";
// Sem alias: partindo de .../probabilidade/components -> até src/utils/format
import { brl, ticketMedio } from "../utils/format";

function KPI({ title, value, icon }) {
  return (
    <div className="rounded-2xl border border-zinc-800 p-3 flex items-center gap-3">
      <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white">
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-xs opacity-70">{title}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}

/**
 * Props suportadas:
 * - periodo: "dia" | "semana" | "mes"
 * - esperadoQtd: número de vendas esperadas (preferencial)
 * - esperadoValor: valor esperado já calculado (opcional)
 * - probAlguma: 0..1
 * - classificacao
 * - esperado: (LEGADO) quantidade esperada
 */
export default function ProbKPIs({
  periodo,
  esperadoQtd,
  esperadoValor,
  probAlguma = 0,
  classificacao,
  // legado:
  esperado,
}) {
  // quantidade esperada (robusto)
  const qtdNum = Number.isFinite(Number(esperadoQtd))
    ? Number(esperadoQtd)
    : Number.isFinite(Number(esperado))
    ? Number(esperado)
    : 0;

  // valor esperado: prioriza o que veio pronto; senão estima pelo ticket médio
  const tkt = Number(ticketMedio?.(classificacao)) || 0;
  const valorNum = Number.isFinite(Number(esperadoValor))
    ? Number(esperadoValor)
    : qtdNum * tkt;

  const probPct = Math.round((Number(probAlguma) || 0) * 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <KPI
        title={
          periodo === "dia"
            ? "Vendas esperadas (amanhã)"
            : periodo === "semana"
            ? "Vendas esperadas (próx. semana)"
            : "Vendas esperadas (próx. mês)"
        }
        value={Number(qtdNum).toFixed(1)}
        icon={<Rocket className="w-4 h-4" />}
      />

      <KPI
        title={
          periodo === "dia"
            ? "Prob. ≥ 1 venda (amanhã)"
            : periodo === "semana"
            ? "Prob. ≥ 1 venda (semana)"
            : "Prob. ≥ 1 venda (mês)"
        }
        value={`${probPct}%`}
        icon={<TrendingUp className="w-4 h-4" />}
      />

      <KPI
        title={`Valor esperado (${classificacao || "class."})`}
        value={brl?.(valorNum) ?? String(valorNum)}
        icon={<BarChart2 className="w-4 h-4" />}
      />
    </div>
  );
}
