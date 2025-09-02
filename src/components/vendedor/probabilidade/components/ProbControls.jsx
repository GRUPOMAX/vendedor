// src/components/vendedor/probabilidade/components/ProbControls.jsx
import React from "react";
import { Calendar, TrendingUp, LineChart } from "lucide-react";

export default function ProbControls({ periodo, setPeriodo, mostrarProb, setMostrarProb }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        onClick={() => setPeriodo("dia")}
        className={`px-3 py-1.5 rounded-xl border ${
          periodo === "dia" ? "border-zinc-300" : "border-zinc-700"
        } hover:border-zinc-500 flex items-center gap-1`}
      >
        <Calendar className="w-4 h-4" />
        Dia
      </button>

      <button
        onClick={() => setPeriodo("semana")}
        className={`px-3 py-1.5 rounded-xl border ${
          periodo === "semana" ? "border-zinc-300" : "border-zinc-700"
        } hover:border-zinc-500`}
      >
        Semana
      </button>

      <button
        onClick={() => setPeriodo("mes")}
        className={`px-3 py-1.5 rounded-xl border ${
          periodo === "mes" ? "border-zinc-300" : "border-zinc-700"
        } hover:border-zinc-500`}
      >
        Mês
      </button>

      {/* Toggle Probabilidade/Gráfico */}
      <button
        onClick={() => setMostrarProb((v) => !v)}
        className="px-3 py-1.5 rounded-xl border border-emerald-500 text-emerald-400 flex items-center gap-1 transition-colors"
        title={mostrarProb ? "Ver Histórico" : "Ver Probabilidade"}
      >
        {mostrarProb ? (
          <>
            <TrendingUp className="w-4 h-4" />
            Analise
          </>
        ) : (
          <>
            <LineChart className="w-4 h-4" />
            Gráfico
          </>
        )}
      </button>
    </div>
  );
}
