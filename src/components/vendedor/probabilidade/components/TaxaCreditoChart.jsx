import React, { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { BarChart3, PieChart as PieIcon } from "lucide-react";
import { useTheme } from "../../../../state/ThemeContext";
/* ---------- palette (emerald + neutros) ---------- */
const EMERALD = {
  main:   "#10B981", // emerald-500
  soft:   "#34D399", // emerald-400
  strong: "#059669", // emerald-600
};
const ZINC   = "#71717A"; // zinc-500
const SLATE  = "#94A3B8"; // slate-400
const GRID   = "rgba(148,163,184,0.25)"; // grade discreta no dark



/* --------------- helpers --------------- */
function normStr(v) { return (v ?? "").toString().trim(); }
function yes(v){ if(typeof v==="boolean")return v===true; if(typeof v==="number")return v===1; const s=normStr(v).toLowerCase(); return ["sim","yes","true","1"].includes(s); }
function no(v){  if(typeof v==="boolean")return v===false; if(typeof v==="number")return v===0; const s=normStr(v).toLowerCase(); return ["nao","não","no","false","0"].includes(s); }
function guessCPF(r){ return String(r?.cpf||r?.CPF||r?.documento||r?.cpfCliente||r?.cpf_cliente).replace(/\D/g,""); }

// pega "Pagou Taxa" em qualquer formato/nível
function pickPagouTaxaFrom(obj){
  if(!obj || typeof obj!=="object") return undefined;
  const direct = obj["Pagou Taxa"] ?? obj["pagou taxa"] ?? obj.pagouTaxa ?? obj.pagou_taxa ?? obj.pagoTaxa ?? obj.pago_taxa ?? obj.taxa ?? obj.pagou;
  if(direct !== undefined) return direct;
  for (const k of ["bruto","status","dados","meta"]) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const found = pickPagouTaxaFrom(v);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/* --------------- core --------------- */
function resumirTaxa({ vendas = [], mapaClientes = {}, debug = false }) {
  let comTaxa = 0, semTaxa = 0, desconhecido = 0;
  const bySource = { venda: 0, mapa: 0, desconhecido: 0 };

  for (const raw of vendas) {
    const v = raw?.bruto ?? raw;
    const cpf = guessCPF(v);

    const fromVenda = pickPagouTaxaFrom(v);
    const fromMapa  = pickPagouTaxaFrom(mapaClientes?.[cpf] || mapaClientes?.[String(cpf)]);
    const flag = (fromVenda !== undefined) ? fromVenda : fromMapa;

    if (fromVenda !== undefined) bySource.venda++;
    else if (fromMapa !== undefined) bySource.mapa++;
    else bySource.desconhecido++;

    if (yes(flag)) comTaxa++;
    else if (no(flag)) semTaxa++;
    else desconhecido++;
  }

  if (debug) {
    /*console.groupCollapsed("%c[TAXA] resumo", "color:#34D399");
    console.log({ total: vendas.length, comTaxa, semTaxa, desconhecido, bySource });
    console.log("sample(3):", vendas.slice(0,3));
    console.groupEnd();*/
  }
  return { comTaxa, semTaxa, desconhecido };
}

export default function TaxaCreditoChart({
  vendas = [],
  mapaClientes = {},
  prefer = "bar",           // 'bar' | 'pie'
  showDesconhecido = false, // exibir 3º grupo
  height = 420,
  debug = false,
  palette = { emerald: EMERALD, zinc: ZINC, slate: SLATE }, // opcional
}) {

    const { theme } = useTheme();
    const isDarkTheme = theme === "dark";

    const UI = useMemo(() => ({
    text:       isDarkTheme ? "#E4E4E7" : "#0A0A0A",
    grid:       isDarkTheme ? "rgba(148,163,184,0.25)" : "rgba(17,24,39,0.08)",
    tooltipBg:  isDarkTheme ? "#18181B" : "#FFFFFF",
    tooltipBrd: isDarkTheme ? "#27272A" : "#E5E7EB",
    tooltipTxt: isDarkTheme ? "#F4F4F5" : "#111827",
    tooltipItm: isDarkTheme ? "#E4E4E7" : "#1F2937",
    cursor:     isDarkTheme ? "rgba(255,255,255,0.06)" : "rgba(17,24,39,0.06)",
    }), [isDarkTheme]);

  const [tipo, setTipo] = useState(prefer);
  const resumo = useMemo(() => resumirTaxa({ vendas, mapaClientes, debug }), [vendas, mapaClientes, debug]);


  const legendFormatter = (value) => (
<span style={{ color: UI.text }}>{value}</span>
);

const data = useMemo(() => {
  const base = [
    { key: "com", name: "Com taxa", value: resumo.comTaxa },
    { key: "sem", name: "Sem taxa", value: resumo.semTaxa },
  ];
  if (showDesconhecido) base.push({ key: "unk", name: "Desconhecido", value: resumo.desconhecido });
  return base;
}, [resumo, showDesconhecido]);

  const gradId = useMemo(() => `grad-emerald-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className="w-full select-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm opacity-80">
          Total vendas: <span className="font-medium">{vendas?.length || 0}</span> ·{" "}
          Com taxa: <span className="font-medium">{resumo.comTaxa}</span> ·{" "}
          Sem taxa: <span className="font-medium">{resumo.semTaxa}</span>
          {showDesconhecido && <> · Desconhecido: <span className="font-medium">{resumo.desconhecido}</span></>}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTipo("bar")}
            className={`px-3 py-1.5 rounded-xl border ${tipo === "bar" ? "border-zinc-300" : "border-zinc-700"} hover:border-zinc-500 flex items-center gap-1`}
            title="Barras"
          >
            <BarChart3 className="w-4 h-4" /> Barra
          </button>
          <button
            onClick={() => setTipo("pie")}
            className={`px-3 py-1.5 rounded-xl border ${tipo === "pie" ? "border-zinc-300" : "border-zinc-700"} hover:border-zinc-500 flex items-center gap-1`}
            title="Pizza"
          >
            <PieIcon className="w-4 h-4" /> Pizza
          </button>
        </div>
      </div>

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          {tipo === "bar" ? (
            <BarChart key={theme} data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={palette.emerald.soft} />
                <stop offset="100%" stopColor={palette.emerald.strong} />
                </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={UI.grid} />
            <XAxis
            dataKey="name"
            tick={{ fill: UI.text, fontWeight: 400 }}
            tickLine={{ stroke: UI.grid }}
            axisLine={{ stroke: UI.grid }}
            />
            <YAxis
            allowDecimals={false}
            tick={{ fill: UI.text }}
            tickLine={{ stroke: UI.grid }}
            axisLine={{ stroke: UI.grid }}
            />

            <Tooltip
                cursor={{ fill: UI.cursor }}
                contentStyle={{
                backgroundColor: UI.tooltipBg,
                border: `1px solid ${UI.tooltipBrd}`,
                borderRadius: "0.5rem",
                color: UI.tooltipTxt,
                fontSize: "0.85rem",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                }}
                labelStyle={{ color: UI.tooltipTxt }}
                itemStyle={{ color: UI.tooltipItm }}
            />

            <Legend formatter={legendFormatter} />

            <Bar
                dataKey="value"
                name="Quantidade"
                fill={`url(#${gradId})`}
                stroke={palette.emerald.main}
                strokeWidth={1.5}
                radius={[8, 8, 0, 0]}
            />
            </BarChart>
          ) : (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={130}
                label
              >
                {data.map((d, idx) => {
                  const fill =
                    d.key === "com" ? palette.emerald.main :
                    d.key === "sem" ? palette.zinc :
                    palette.slate;
                  const stroke =
                    d.key === "com" ? palette.emerald.strong :
                    d.key === "sem" ? "#52525B" : "#64748B"; // bordas mais escuras
                  return <Cell key={idx} fill={fill} stroke={stroke} strokeWidth={1.2} />;
                })}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}