// components/analise/HelpLegendModal.jsx
import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X as XIcon, HelpCircle, ChevronLeft, ChevronRight, Info, Sigma } from "lucide-react";
import { useUI } from "../../../../state/ThemeContext";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
} from "recharts";

/**
 * Mini-modal de legendas/ajuda (dinâmico) para a análise mensal.
 * Props:
 *  - open, onClose
 *  - a, b: parâmetros da regressão
 *  - obs: número de observações (meses)
 *  - proximoT: índice (t) do próximo mês
 *  - previsao: valor previsto (arredondado)
 *  - serieMensal: [{ key, label, vendas, t, tendencia }]  // <<< NOVO
 */
export default function HelpLegendModal({
  open,
  onClose,
  a,
  b,
  obs,
  proximoT,
  previsao,
  serieMensal = [],
}) {
  const UI = useUI();

  // hooks SEMPRE no topo
  const [tab, setTab] = useState("conceitos"); // conceitos | calculos
  const [idx, setIdx] = useState(Math.max(0, (serieMensal?.length ?? 1) - 1));

  // recalcula tabela (sempre chama o hook; mesmo se for "open=false" ele só não será usado)
  const tabela = useMemo(() => {
    return (serieMensal || []).map((r) => {
      const yhat = Number(a) + Number(b) * Number(r.t);
      return { ...r, yhat, resid: (r.vendas ?? 0) - yhat };
    });
  }, [serieMensal, a, b]);

  // mantém idx dentro do range quando a série muda
  React.useEffect(() => {
    const max = Math.max(0, (serieMensal?.length ?? 1) - 1);
    setIdx((i) => Math.min(Math.max(0, i), max));
  }, [serieMensal]);

  // a partir daqui pode fazer early return
  if (!open) return null;

  const minIdx = 0;
  const maxIdx = Math.max(0, (serieMensal?.length ?? 1) - 1);
  const sel = serieMensal[idx] || { label: "—", vendas: 0, t: 0, tendencia: 0 };
  const yhatSel = Number(a) + Number(b) * Number(sel.t);
  const residSel = (sel?.vendas ?? 0) - yhatSel;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-2xl rounded-2xl m-4 shadow-2xl overflow-hidden"
        style={{ background: UI.cardBg, color: UI.text, border: `1px solid ${UI.border}` }}
      >
        {/* header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${UI.border}` }}>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Ajuda & Legendas</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl"
            style={{ border: `1px solid ${UI.border}` }}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* tabs */}
        <div className="px-4 pt-3">
          <div className="inline-flex gap-2 rounded-xl p-1" style={{ border: `1px solid ${UI.border}` }}>
            <TabButton active={tab==="conceitos"} onClick={()=>setTab("conceitos")} label="Conceitos" />
            <TabButton active={tab==="calculos"}  onClick={()=>setTab("calculos")}  label="Cálculos" />
          </div>
        </div>

        {/* body */}
        <div className="p-4 space-y-4 text-sm">
          {tab === "conceitos" ? (
            <>
              <Card title="Índice (t)" UI={UI}>
                <p>
                  O <strong>índice t</strong> representa a posição do mês na série histórica, começando em <code>t = 0</code> para o primeiro mês observado, <code>t = 1</code> para o segundo, e assim por diante.
                </p>
                <p className="mt-1">No seu caso, temos <strong>{obs}</strong> meses observados.</p>
              </Card>

              <Card title="Regressão linear (ŷ = a + b·t)" UI={UI}>
                <p>Modelo usado:</p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>a</strong> (intercepto): estimativa quando <code>t = 0</code>.</li>
                  <li><strong>b</strong> (inclinação): variação média quando <code>t</code> aumenta 1 (um mês).</li>
                </ul>
                <p className="mt-2">
                  Seus parâmetros atuais: <code>a = {Number(a).toFixed(2)}</code> e <code>b = {Number(b).toFixed(3)}</code>.
                </p>
              </Card>

              <Card title="Leitura da tendência" UI={UI}>
                <p>Para cada mês, a tendência é <code>ŷ = a + b·t</code>. Compare com as vendas reais para entender desvios (resíduos).</p>
              </Card>
            </>
          ) : (
            <>
              {/* seletor de mês + sparkline */}
              <Card title="Cálculo mês a mês" UI={UI}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={()=> setIdx((i)=> Math.max(minIdx, i-1))}
                      className="p-2 rounded-lg"
                      style={{ border: `1px solid ${UI.border}` }}
                      title="Mês anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="font-medium">{sel.label}</div>
                    <button
                      onClick={()=> setIdx((i)=> Math.min(maxIdx, i+1))}
                      className="p-2 rounded-lg"
                      style={{ border: `1px solid ${UI.border}` }}
                      title="Próximo mês"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 max-w-[280px] hidden sm:flex items-center gap-2">
                    <input
                      type="range"
                      min={minIdx}
                      max={maxIdx}
                      value={idx}
                      onChange={(e)=> setIdx(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* sparkline */}
                <div className="h-36 mb-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={serieMensal}>
                      <CartesianGrid stroke={UI.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="label" hide />
                      <YAxis hide />
                      <Tooltip content={<MiniTooltip UI={UI} />} />
                      <Line
                        type="monotone"
                        dataKey="vendas"
                        name="Vendas"
                        stroke={UI.emerald.strong}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="tendencia"
                        name="Tendência"
                        stroke={UI.slate4}
                        strokeWidth={2}
                        dot={false}
                      />
                      {/* destaque do ponto selecionado */}
                      <ReferenceDot
                        x={sel.label}
                        y={sel.vendas}
                        r={5}
                        fill={UI.emerald.soft}
                        stroke={UI.emerald.strong}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* fórmula do mês selecionado */}
                <div className="rounded-lg p-3 text-sm" style={{ border: `1px dashed ${UI.border}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Sigma className="w-4 h-4" />
                    <span className="font-medium">Tendência em {sel.label}</span>
                  </div>
                  <div style={{ color: UI.muted }}>
                    ŷ = a + b·t → <code>ŷ = {Number(a).toFixed(2)} + {Number(b).toFixed(3)} × {sel.t}</code> ={" "}
                    <strong>{Math.round(yhatSel)}</strong>
                    <span className="ml-2">| Vendas reais: <strong>{sel.vendas}</strong></span>
                    <span className="ml-2">| Erro (resíduo): <strong>{(sel.vendas - Math.round(yhatSel))}</strong></span>
                  </div>
                </div>
              </Card>

              {/* tabela completa */}
              <Card title="Tabela de cálculo (histórico)" UI={UI}>
                <div className="overflow-auto rounded-xl" style={{ border: `1px dashed ${UI.border}` }}>
                  <table className="w-full text-sm">
                    <thead style={{ background: "rgba(0,0,0,0.03)" }}>
                      <tr className="text-left" style={{ color: UI.muted }}>
                        <th className="px-3 py-2">Mês</th>
                        <th className="px-3 py-2">Vendas</th>
                        <th className="px-3 py-2">t</th>
                        <th className="px-3 py-2">ŷ = a + b·t</th>
                        <th className="px-3 py-2">Resíduo (Vendas − ŷ)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabela.map((r) => (
                        <tr
                          key={r.key}
                          className="border-t"
                          style={{
                            borderColor: UI.border,
                            background: r.t === sel.t ? "rgba(34,197,94,0.08)" : "transparent",
                          }}
                        >
                          <td className="px-3 py-2">{r.label}</td>
                          <td className="px-3 py-2">{r.vendas}</td>
                          <td className="px-3 py-2">{r.t}</td>
                          <td className="px-3 py-2">{Math.round(r.yhat)}</td>
                          <td className="px-3 py-2">{Math.round(r.resid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs mt-2" style={{ color: UI.muted }}>
                  Dica: resíduo &gt; 0 indica mês acima da tendência; &lt; 0 indica abaixo.
                </p>
              </Card>

              {/* cálculo do próximo mês */}
              <Card title="Próximo mês (previsão)" UI={UI}>
                <p>
                  Próximo mês terá <code>t = {proximoT}</code>. Logo:
                </p>
                <p className="mt-1">
                  <code>ŷ = {Number(a).toFixed(2)} + {Number(b).toFixed(3)} × {proximoT}</code> ={" "}
                  <strong>{previsao}</strong> (aprox.)
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Card({ title, children, UI }) {
  return (
    <div className="rounded-xl p-3" style={{ border: `1px solid ${UI.border}` }}>
      <div className="font-medium mb-1">{title}</div>
      <div className="text-sm" style={{ color: UI.muted }}>{children}</div>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  const UI = useUI();
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm ${active ? "font-semibold" : ""}`}
      style={{
        border: `1px solid ${active ? UI.emerald.soft : "transparent"}`,
        background: active ? "rgba(34,197,94,0.12)" : "transparent",
      }}
    >
      {label}
    </button>
  );
}

function MiniTooltip({ active, payload, label, UI }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-md px-2 py-1 text-xs shadow-lg"
      style={{
        background: UI.tooltipBg,
        color: UI.tooltipText,
        border: `1px solid ${UI.tooltipBr}`,
      }}
    >
      <div className="font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <strong className="ml-1">{Math.round(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

/** Botão flutuante (FAB) para abrir a ajuda.
 * Props: onClick, inside=false (absolute dentro do modal) | fixed
 */
export function HelpFab({ onClick, inside = false }) {
  const UI = useUI();
  const pos = inside ? "absolute bottom-4 right-4" : "fixed bottom-4 right-4";
  return (
    <button
      onClick={onClick}
      className={`${pos} z-[130] shadow-lg px-3 py-2 rounded-full flex items-center gap-2`}
      style={{
        background: UI.primaryGrad,
        color: "white",
        boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
      }}
      title="Ajuda & Legendas"
    >
      <HelpCircle className="w-4 h-4" />
      Ajuda
    </button>
  );
}
