// src/components/vendedor/probabilidade/components/HistoricoResumo.jsx
import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import dayjs from "../utils/dayjs";

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-zinc-800 p-4 bg-transparent">
      <div className="text-sm font-medium mb-3 opacity-80">{title}</div>
      {children}
    </div>
  );
}

export default function HistoricoResumo({
  topDias = [],
  weekdayResumo = [],
  periodo,
  onAnaliseCompleta,      // <- NOVO
  loadingAnalise = false, // <- opcional
  showAnaliseCompleta = false,
}) {
  const weekdayData = useMemo(
    () => weekdayResumo.map(r => ({ nome: r.nome, total: r.total, media: Number(r.media.toFixed(2)) })),
    [weekdayResumo]
  );

  return (
    <>
      {/* Toolbar do resumo + botão de análise completa */}
      <div className="mt-4 mb-2 flex items-center justify-between">
        <div className="text-sm opacity-70">Resumo do período</div>
        {showAnaliseCompleta && onAnaliseCompleta && (
          <button
            onClick={onAnaliseCompleta}
            disabled={loadingAnalise}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm"
          >
            {loadingAnalise ? (
              <span className="animate-spin h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full" />
            ) : null}
            Analisar histórico completo
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top dias com mais vendas (último período analisado)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="p-2">Data</th>
                  <th className="p-2">Vendas</th>
                </tr>
              </thead>
              <tbody>
                {topDias.length ? topDias.map((d) => (
                  <tr key={d.iso} className="border-t border-zinc-800">
                    <td className="p-2">{d.label}</td>
                    <td className="p-2">{d.vendas}</td>
                  </tr>
                )) : (
                  <tr><td className="p-2 opacity-70" colSpan={2}>Sem dados</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {periodo?.inicio && (
            <div className="mt-2 text-xs opacity-60">
              Janela: {dayjs(periodo.inicio).format("DD/MM/YYYY")} — {dayjs(periodo.fim).format("DD/MM/YYYY")} ({periodo.diasTotais} dias)
            </div>
          )}
        </Card>

        <Card title="Dia da semana mais vendido (total e média por ocorrência)">
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="p-2">Dia</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Média/dia</th>
                </tr>
              </thead>
              <tbody>
                {weekdayResumo.length ? weekdayResumo.map((r) => (
                  <tr key={r.wd} className="border-t border-zinc-800">
                    <td className="p-2">{r.nome}</td>
                    <td className="p-2">{r.total}</td>
                    <td className="p-2">{r.media.toFixed(2)}</td>
                  </tr>
                )) : (
                  <tr><td className="p-2 opacity-70" colSpan={3}>Sem dados</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="nome" tick={{ fill: '#a1a1aa' }} />
                <YAxis tick={{ fill: '#a1a1aa' }} />
                <Tooltip
                  wrapperStyle={{ zIndex: 50 }}
                  cursor={{ fill: 'rgba(16,185,129,0.15)' }}
                  contentStyle={{ background: '#0b0b0c', border: '1px solid #27272a', borderRadius: 12, color: '#e5e7eb', boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}
                  labelStyle={{ color: '#9ca3af', marginBottom: 4 }}
                  itemStyle={{ color: '#e5e7eb' }}
                  formatter={(value, name) => [value, name === 'total' ? 'Total' : name]}
                />
                <Bar dataKey="total" name="Total" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}
